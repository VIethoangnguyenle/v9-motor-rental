import { and, asc, eq } from "drizzle-orm";
import { schema } from "@v9/db";
import {
  extensionForPhotoType,
  isAllowedPhotoType,
  isPhotoSizeValid,
  photoObjectKey,
  type PhotoKind,
} from "@v9/shared/domain/rental-photo";
import { db } from "../db";
import { checkins } from "../storage";

export interface RentalPhoto {
  readonly id: string;
  readonly rentalId: string;
  readonly kind: PhotoKind;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedBy: string;
  readonly createdAt: Date;
}

/** `object_key` KHÔNG có trong shape công khai — nó là chi tiết lưu trữ. */
const COLUMNS = {
  id: schema.rentalPhotos.id,
  rentalId: schema.rentalPhotos.rentalId,
  kind: schema.rentalPhotos.kind,
  contentType: schema.rentalPhotos.contentType,
  sizeBytes: schema.rentalPhotos.sizeBytes,
  uploadedBy: schema.rentalPhotos.uploadedBy,
  createdAt: schema.rentalPhotos.createdAt,
};

export type AddPhotoResult =
  | { ok: true; photo: RentalPhoto }
  | { ok: false; reason: "RENTAL_NOT_FOUND" | "PHOTO_TYPE_INVALID" | "PHOTO_SIZE_INVALID" };

/**
 * Nhận một tấm ảnh: ghi byte vào MinIO rồi ghi metadata vào Postgres.
 *
 * ⚠️ **Thứ tự hai lần ghi là quyết định, không phải ngẫu nhiên.** Không có
 * transaction nào bao được cả Postgres lẫn object storage, nên một trong hai
 * chiều lệch sẽ xảy ra khi tiến trình chết giữa chừng. Hai chiều đó không đối
 * xứng:
 *
 *  - object có, hàng chưa → **rác vô hình**: không truy vấn nào thấy nó, không
 *    ai xoá nó, mà nó vẫn là ảnh CCCD của một người thật.
 *  - hàng có, object chưa → ảnh hỏng khi mở, thấy ngay, sửa được.
 *
 * Nghe thì phải ghi hàng trước. Nhưng làm vậy tạo ra cửa sổ mà UI hiện một tấm
 * ảnh không mở được — và tệ hơn, `object_key` đã bị chiếm nên lần thử lại sinh
 * key khác, để lại hàng hỏng vĩnh viễn. Nên ta ghi **object trước**, và bù cho
 * chiều lệch còn lại bằng cách dọn object khi ghi hàng thất bại (khối `catch`
 * bên dưới). Rác chỉ còn lại nếu tiến trình chết đúng giữa hai lệnh — hiếm, và
 * là ca duy nhất còn phải dọn tay.
 *
 * ID ảnh sinh Ở ĐÂY chứ không để Postgres `defaultRandom()` sinh: `object_key`
 * cần biết id TRƯỚC khi ghi object, và đảo lại thứ tự đó là quay về ca "hàng
 * trước, object sau" vừa loại ở trên.
 */
export async function addRentalPhoto(input: {
  rentalId: string;
  kind: PhotoKind;
  contentType: string;
  bytes: ArrayBuffer;
  uploadedBy: string;
}): Promise<AddPhotoResult> {
  if (!isAllowedPhotoType(input.contentType)) return { ok: false, reason: "PHOTO_TYPE_INVALID" };
  if (!isPhotoSizeValid(input.bytes.byteLength)) return { ok: false, reason: "PHOTO_SIZE_INVALID" };

  // Đơn phải có thật. FK cũng chặn, nhưng chặn bằng một lỗi Postgres thô ở tầng
  // dưới thì route không dịch được thành 404 — và người dùng nhận 500.
  const [rental] = await db
    .select({ id: schema.rentals.id })
    .from(schema.rentals)
    .where(eq(schema.rentals.id, input.rentalId))
    .limit(1);
  if (!rental) return { ok: false, reason: "RENTAL_NOT_FOUND" };

  const extension = extensionForPhotoType(input.contentType);
  // `isAllowedPhotoType` ở trên đã bảo đảm có đuôi; nhánh này là phòng thủ cho
  // KIỂU, giữ cho `extension` không phải `string | null` ở dòng dưới.
  if (extension === null) return { ok: false, reason: "PHOTO_TYPE_INVALID" };

  const photoId = crypto.randomUUID();
  const objectKey = photoObjectKey(input.rentalId, input.kind, photoId, extension);

  await checkins.write(objectKey, input.bytes, { type: input.contentType });

  try {
    const [row] = await db
      .insert(schema.rentalPhotos)
      .values({
        id: photoId,
        rentalId: input.rentalId,
        kind: input.kind,
        objectKey,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        uploadedBy: input.uploadedBy,
      })
      .returning(COLUMNS);

    if (!row) throw new Error("INSERT rental_photos không trả về hàng nào");
    return { ok: true, photo: { ...row, kind: row.kind as PhotoKind } };
  } catch (e) {
    // Dọn object vừa ghi để không để lại rác vô hình. Lỗi dọn dẹp bị NUỐT có
    // chủ ý: lỗi thật cần nổi lên là lỗi INSERT, không phải lỗi của việc dọn.
    await checkins.delete(objectKey).catch(() => undefined);
    throw e;
  }
}

/** Ảnh của một đơn, cũ trước — ảnh đầu tiên chụp mô tả tình trạng ban đầu. */
export async function listRentalPhotos(rentalId: string): Promise<RentalPhoto[]> {
  const rows = await db
    .select(COLUMNS)
    .from(schema.rentalPhotos)
    .where(eq(schema.rentalPhotos.rentalId, rentalId))
    .orderBy(asc(schema.rentalPhotos.kind), asc(schema.rentalPhotos.createdAt));

  return rows.map((r) => ({ ...r, kind: r.kind as PhotoKind }));
}

export type ReadPhotoResult =
  | { ok: true; stream: ReadableStream; contentType: string; sizeBytes: number }
  | { ok: false; reason: "PHOTO_NOT_FOUND" };

/**
 * Đọc byte của một ảnh để route stream về cho nhân viên.
 *
 * `rentalId` là THAM SỐ chứ không chỉ `photoId`, dù `photoId` đã là khoá chính:
 * nó buộc URL phải nói đúng ảnh này thuộc đơn nào, nên một id đoán được cũng
 * không lấy được ảnh nếu gắn sai đơn. Rẻ, và nó biến một tham chiếu trực tiếp
 * thành một tham chiếu có ngữ cảnh.
 */
export async function readRentalPhoto(rentalId: string, photoId: string): Promise<ReadPhotoResult> {
  const [row] = await db
    .select({
      objectKey: schema.rentalPhotos.objectKey,
      contentType: schema.rentalPhotos.contentType,
      sizeBytes: schema.rentalPhotos.sizeBytes,
    })
    .from(schema.rentalPhotos)
    .where(and(eq(schema.rentalPhotos.id, photoId), eq(schema.rentalPhotos.rentalId, rentalId)))
    .limit(1);

  if (!row) return { ok: false, reason: "PHOTO_NOT_FOUND" };

  return {
    ok: true,
    stream: checkins.file(row.objectKey).stream(),
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
  };
}

export type DeletePhotoResult = { ok: true } | { ok: false; reason: "PHOTO_NOT_FOUND" };

/**
 * Xoá một ảnh.
 *
 * ⚠️ Thứ tự NGƯỢC với lúc ghi, và cùng một lý lẽ: xoá **hàng trước**, object
 * sau. Chết giữa chừng thì để lại object mồ côi (rác, dọn được) chứ không để
 * lại hàng trỏ vào object đã biến mất (ảnh hỏng, người dùng thấy).
 */
export async function deleteRentalPhoto(
  rentalId: string,
  photoId: string,
): Promise<DeletePhotoResult> {
  const [row] = await db
    .delete(schema.rentalPhotos)
    .where(and(eq(schema.rentalPhotos.id, photoId), eq(schema.rentalPhotos.rentalId, rentalId)))
    .returning({ objectKey: schema.rentalPhotos.objectKey });

  if (!row) return { ok: false, reason: "PHOTO_NOT_FOUND" };

  await checkins.delete(row.objectKey).catch(() => undefined);
  return { ok: true };
}
