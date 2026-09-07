import { schema } from "@v9/db";
import {
  extensionForPhotoType,
  isAllowedPhotoType,
  isPhotoSizeValid,
} from "@v9/shared/domain/rental-photo";
import { checkPhotoAlt, type PhotoAltRule } from "@v9/shared/domain/vehicle";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { deleteFile, uploadFile } from "../directus";

/**
 * Ảnh của một chiếc xe trong danh mục.
 *
 * ⚠️ KHÁC ảnh bàn giao (`services/photos.ts`) ở CHỖ LƯU, không ở luật: ảnh bàn
 * giao vào bucket `checkins` riêng tư qua `storage.ts`, còn ảnh xe vào Directus
 * để `apps/web` phục vụ được qua `/assets/<fileId>?key=web`. Lý lẽ đầy đủ ở
 * `directus.ts`.
 *
 * Ràng buộc KIỂU và KÍCH THƯỚC dùng lại `@v9/shared/domain/rental-photo` chứ
 * không dựng bộ thứ hai. Tên module nói "rental", nhưng thứ nó mô tả là "một
 * tấm ảnh chụp từ điện thoại đi qua HTTP" — đúng ràng buộc vật lý ở cả hai
 * đường. Dựng bộ hằng thứ hai là dựng hai con số trôi được khỏi nhau, và câu
 * thông báo cho người dùng sẽ nói hai điều khác nhau về cùng một giới hạn.
 */

export type AddVehiclePhotoResult =
  | { ok: true; photo: { id: string; fileId: string; alt: string; sort: number } }
  | { ok: false; reason: "VEHICLE_NOT_FOUND" }
  | { ok: false; reason: "PHOTO_TYPE_INVALID" }
  | { ok: false; reason: "PHOTO_SIZE_INVALID" }
  | { ok: false; reason: "PHOTO_ALT_INVALID"; rules: readonly PhotoAltRule[] }
  | { ok: false; reason: "DIRECTUS_FAILED" };

export async function addVehiclePhoto(input: {
  vehicleId: string;
  alt: string;
  contentType: string;
  bytes: ArrayBuffer;
  filename: string;
}): Promise<AddVehiclePhotoResult> {
  // Kiểm RẺ trước, tốn kém sau: từ chối một ảnh 12 MB sai kiểu mà không đẩy nó
  // sang Directus trước.
  if (!isAllowedPhotoType(input.contentType)) return { ok: false, reason: "PHOTO_TYPE_INVALID" };
  if (!isPhotoSizeValid(input.bytes.byteLength)) return { ok: false, reason: "PHOTO_SIZE_INVALID" };

  const altRules = checkPhotoAlt(input.alt);
  if (altRules.length > 0) return { ok: false, reason: "PHOTO_ALT_INVALID", rules: altRules };

  // Xe phải có thật. FK cũng chặn, nhưng chặn bằng một lỗi Postgres thô ở tầng
  // dưới thì route không dịch được thành 404 — và người dùng nhận 500. Cùng khuôn
  // `addRentalPhoto`. Ở đây còn quan trọng hơn: kiểm TRƯỚC khi đẩy file lên
  // Directus, nếu không mỗi lần gõ sai id là một file mồ côi nằm lại bên đó.
  const [vehicle] = await db
    .select({ id: schema.vehicles.id })
    .from(schema.vehicles)
    .where(eq(schema.vehicles.id, input.vehicleId))
    .limit(1);
  if (!vehicle) return { ok: false, reason: "VEHICLE_NOT_FOUND" };

  const extension = extensionForPhotoType(input.contentType);
  // `isAllowedPhotoType` ở trên đã bảo đảm có đuôi; nhánh này là phòng thủ cho
  // KIỂU, giữ cho `extension` không phải `string | null` ở dòng dưới.
  if (extension === null) return { ok: false, reason: "PHOTO_TYPE_INVALID" };

  const uploaded = await uploadFile({
    bytes: input.bytes,
    contentType: input.contentType,
    filename: `${input.vehicleId}-${crypto.randomUUID()}.${extension}`,
    // `title` của Directus lấy từ alt: người mở Data Studio thấy mô tả thật thay
    // vì một uuid. Đây cũng là lý do `alt` được kiểm TRƯỚC khi upload.
    title: input.alt,
  });
  if (!uploaded.ok) return { ok: false, reason: "DIRECTUS_FAILED" };

  try {
    const [row] = await db
      .insert(schema.vehiclePhotos)
      .values({
        vehicleId: input.vehicleId,
        fileId: uploaded.value,
        alt: input.alt,
        // Đẩy xuống cuối: ảnh mới không được nhảy lên làm ảnh đại diện của xe
        // (`listPublishedVehicles` lấy ảnh đầu tiên theo `sort`, rồi `id`).
        sort: sql`(SELECT COALESCE(MAX(p.sort), -1) + 1 FROM vehicle_photos p WHERE p.vehicle_id = ${input.vehicleId})`,
      })
      .returning({
        id: schema.vehiclePhotos.id,
        fileId: schema.vehiclePhotos.fileId,
        alt: schema.vehiclePhotos.alt,
        sort: schema.vehiclePhotos.sort,
      });

    if (!row) throw new Error("INSERT vehicle_photos không trả về hàng nào");
    return { ok: true, photo: row };
  } catch (e) {
    // Dọn file vừa đẩy để không để lại rác vô hình bên Directus. Lỗi dọn dẹp bị
    // NUỐT có chủ ý: lỗi thật cần nổi lên là lỗi INSERT. Cùng khuôn
    // `addRentalPhoto` với `checkins.delete(...)`.
    await deleteFile(uploaded.value).catch(() => undefined);
    throw e;
  }
}

export type DeleteVehiclePhotoResult =
  | { ok: true }
  | { ok: false; reason: "PHOTO_NOT_FOUND" }
  | { ok: false; reason: "DIRECTUS_FAILED" };

/**
 * Xoá hàng TRƯỚC, xoá file SAU.
 *
 * Thứ tự này là cố ý và ngược với lúc thêm. Hỏng ở giữa để lại một file mồ côi
 * bên Directus — tốn chỗ, không ai thấy. Thứ tự ngược lại để lại một hàng trỏ
 * tới file đã mất, tức một ảnh vỡ trên trang công khai của khách. Giữa hai loại
 * rác, chọn loại không ai nhìn thấy.
 */
export async function deleteVehiclePhoto(
  vehicleId: string,
  photoId: string,
): Promise<DeleteVehiclePhotoResult> {
  const [row] = await db
    .delete(schema.vehiclePhotos)
    .where(and(eq(schema.vehiclePhotos.id, photoId), eq(schema.vehiclePhotos.vehicleId, vehicleId)))
    .returning({ fileId: schema.vehiclePhotos.fileId });

  if (!row) return { ok: false, reason: "PHOTO_NOT_FOUND" };

  const removed = await deleteFile(row.fileId);
  if (!removed.ok) return { ok: false, reason: "DIRECTUS_FAILED" };
  return { ok: true };
}

export type UpdateVehiclePhotoResult =
  | { ok: true }
  | { ok: false; reason: "PHOTO_NOT_FOUND" }
  | { ok: false; reason: "PHOTO_ALT_INVALID"; rules: readonly PhotoAltRule[] };

/** Sửa mô tả và thứ tự. Không đụng file — đổi ảnh là xoá rồi thêm lại. */
export async function updateVehiclePhoto(
  vehicleId: string,
  photoId: string,
  input: { alt: string; sort: number },
): Promise<UpdateVehiclePhotoResult> {
  const rules = checkPhotoAlt(input.alt);
  if (rules.length > 0) return { ok: false, reason: "PHOTO_ALT_INVALID", rules };

  const updated = await db
    .update(schema.vehiclePhotos)
    .set({ alt: input.alt, sort: input.sort })
    .where(and(eq(schema.vehiclePhotos.id, photoId), eq(schema.vehiclePhotos.vehicleId, vehicleId)))
    .returning({ id: schema.vehiclePhotos.id });

  return updated.length > 0 ? { ok: true } : { ok: false, reason: "PHOTO_NOT_FOUND" };
}
