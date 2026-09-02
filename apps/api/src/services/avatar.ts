import { and, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema } from "@v9/db";
import {
  extensionForAvatarType,
  isAllowedAvatarType,
  isAvatarSizeValid,
  avatarObjectKey,
  parseAvatarObjectKey,
} from "@v9/shared/domain/avatar";
import { db } from "../db";
import { checkins } from "../storage";

/**
 * Ảnh đại diện của nhân viên: byte trong MinIO, khoá trong `staff_users`.
 *
 * ⚠️ **Thứ tự hai lần ghi ở đây là bản sao có chủ ý của `services/photos.ts`** —
 * đọc `addRentalPhoto`/`deleteRentalPhoto` trước khi sửa file này. Tóm tắt lý lẽ
 * ở đó: không transaction nào bao được cả Postgres lẫn object storage, nên phải
 * CHỌN chiều lệch sẽ xảy ra khi tiến trình chết giữa chừng; "object có / hàng
 * chưa" là rác vô hình, còn "hàng có / object chưa" là ảnh hỏng người dùng thấy.
 * Vì vậy: **ghi object trước, hàng sau; xoá hàng trước, object sau.**
 *
 * Dùng CHUNG bucket `checkins` với ảnh bàn giao, không dựng bucket riêng: khoá
 * `API_S3_KEY` chỉ mở đúng bucket đó (`scripts/api-minio-policy.json`), nên một
 * bucket mới kéo theo chính sách mới, compose mới và một biến môi trường mới cho
 * mỗi môi trường. Tiền tố `staff/` của `avatarObjectKey` đã đủ tách hai loại dữ
 * liệu; bucket vẫn RIÊNG TƯ, và avatar cũng không phải thứ đem phơi công khai
 * (nó là ảnh mặt của nhân viên).
 */

export type SetAvatarResult =
  { ok: true } | { ok: false; reason: "AVATAR_TYPE_INVALID" | "AVATAR_SIZE_INVALID" | "NOT_FOUND" };

/**
 * Đặt (hoặc THAY) ảnh đại diện của chính một người.
 *
 * Ca THAY là ca `services/photos.ts` chưa có, và nó là chỗ dễ sai nhất:
 *
 *  1. ghi object MỚI — khoá mới, vì `avatarObjectKey` nhận `avatarId` sinh tại
 *     đây (xem chú thích của nó ở `@v9/shared/domain/avatar`: khoá cố định kiểu
 *     `staff/<id>/avatar.webp` sẽ GHI ĐÈ ảnh cũ trước khi hàng kịp cập nhật, nên
 *     một lần UPDATE hỏng là mất luôn ảnh đang dùng).
 *  2. UPDATE hàng sang khoá mới VÀ lấy khoá CŨ về trong cùng một câu lệnh.
 *  3. xoá object CŨ, nuốt lỗi — nó chỉ còn là rác.
 *
 * ⚠️ Bước 2 KHÔNG làm được bằng `.returning()` trần: `RETURNING` của Postgres trả
 * giá trị SAU update, nên `.returning({ objectKey })` cho về đúng khoá vừa ghi
 * vào — và bước 3 sẽ xoá mất ảnh MỚI. Bản tự nối (`FROM staff_users AS prev`) đọc
 * bảng theo snapshot của câu lệnh nên `prev` giữ hàng TRƯỚC update; một câu lệnh,
 * không có cửa sổ cho hai lần thay ảnh song song chen vào nhau. Đã đo trên DB dev
 * 2026-09-02: cùng một `RETURNING` trả `prev.avatar_object_key = OLD` và
 * `staff_users.avatar_object_key = NEW`.
 *
 * Hỏng ở bước 2 → dọn object vừa ghi rồi ném tiếp; hỏng ở bước 3 → im lặng, vì
 * lỗi đáng nổi lên không phải lỗi dọn rác.
 */
export async function setStaffAvatar(input: {
  staffId: string;
  contentType: string;
  bytes: ArrayBuffer;
}): Promise<SetAvatarResult> {
  if (!isAllowedAvatarType(input.contentType)) return { ok: false, reason: "AVATAR_TYPE_INVALID" };
  if (!isAvatarSizeValid(input.bytes.byteLength))
    return { ok: false, reason: "AVATAR_SIZE_INVALID" };

  const extension = extensionForAvatarType(input.contentType);
  // `isAllowedAvatarType` ở trên đã bảo đảm có đuôi; nhánh này là phòng thủ cho
  // KIỂU, giữ `extension` không phải `string | null` ở dòng dưới. Cùng khuôn
  // `addRentalPhoto`.
  if (extension === null) return { ok: false, reason: "AVATAR_TYPE_INVALID" };

  const objectKey = avatarObjectKey(input.staffId, crypto.randomUUID(), extension);
  await checkins.write(objectKey, input.bytes, { type: input.contentType });

  let previousKey: string | null;
  try {
    const prev = alias(schema.staffUsers, "prev");
    const [row] = await db
      .update(schema.staffUsers)
      // `updatedAt` set ở tầng service, KHÔNG có trigger — quy ước của bảng này,
      // xem chú thích cột ở `packages/db/src/schema/staff.ts`.
      .set({ avatarObjectKey: objectKey, updatedAt: new Date() })
      .from(prev)
      .where(and(eq(schema.staffUsers.id, input.staffId), eq(prev.id, input.staffId)))
      .returning({ previousKey: prev.avatarObjectKey });

    // Không có hàng nào: tài khoản biến mất giữa lúc guard đọc nó và lúc câu
    // lệnh này chạy. Hiếm, nhưng nếu không xử thì object vừa ghi ở trên thành
    // rác vô hình — đúng thứ cả file này tồn tại để tránh.
    if (!row) {
      await checkins.delete(objectKey).catch(() => undefined);
      return { ok: false, reason: "NOT_FOUND" };
    }
    previousKey = row.previousKey;
  } catch (e) {
    await checkins.delete(objectKey).catch(() => undefined);
    throw e;
  }

  // Sau khi hàng đã trỏ đi chỗ khác thì ảnh cũ không còn ai đọc tới. Xoá TRƯỚC
  // khi hàng đổi mới là quay lại đúng ca mà khoá-cố-định gây ra.
  if (previousKey !== null) await checkins.delete(previousKey).catch(() => undefined);
  return { ok: true };
}

export type DeleteAvatarResult = { ok: true } | { ok: false; reason: "AVATAR_NOT_FOUND" };

/**
 * Xoá ảnh đại diện — hàng trước, object sau (ngược chiều lúc ghi, cùng lý lẽ với
 * `deleteRentalPhoto`).
 *
 * `isNotNull` trong `WHERE` làm hai việc bằng một câu lệnh: nó lọc ra ca "đang
 * không có ảnh" để trả `AVATAR_NOT_FOUND` thay vì báo thành công một việc không
 * xảy ra, và nó khiến hai lần bấm Xoá liên tiếp không cùng nhận `ok` — lần thứ
 * hai không khớp hàng nào.
 */
export async function deleteStaffAvatar(staffId: string): Promise<DeleteAvatarResult> {
  const prev = alias(schema.staffUsers, "prev");
  const [row] = await db
    .update(schema.staffUsers)
    .set({ avatarObjectKey: null, updatedAt: new Date() })
    .from(prev)
    .where(
      and(
        eq(schema.staffUsers.id, staffId),
        isNotNull(schema.staffUsers.avatarObjectKey),
        eq(prev.id, staffId),
      ),
    )
    .returning({ previousKey: prev.avatarObjectKey });

  if (!row?.previousKey) return { ok: false, reason: "AVATAR_NOT_FOUND" };

  await checkins.delete(row.previousKey).catch(() => undefined);
  return { ok: true };
}

export type ReadAvatarResult =
  | { ok: true; stream: ReadableStream; contentType: string }
  | { ok: false; reason: "AVATAR_NOT_FOUND" };

/**
 * Đọc byte ảnh để route stream về.
 *
 * KHÔNG trả `sizeBytes` như `readRentalPhoto` — cột kích thước không tồn tại
 * (xem chú thích cột ở `packages/db/src/schema/staff.ts`), nên route không đặt
 * `content-length` và response đi bằng chunked. Cái mất là thanh tiến trình của
 * trình duyệt cho một file cỡ 20 KB; cái tránh được là một cột nữa phải giữ đồng
 * bộ với chính object.
 *
 * Khoá không đọc được cũng trả `AVATAR_NOT_FOUND` chứ không đoán `Content-Type`:
 * một hàng mang khoá sai khuôn là dữ liệu hỏng, và đoán bừa chỉ chuyển nó thành
 * ảnh hỏng ở trình duyệt.
 */
export async function readStaffAvatar(staffId: string): Promise<ReadAvatarResult> {
  const [row] = await db
    .select({ objectKey: schema.staffUsers.avatarObjectKey })
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.id, staffId))
    .limit(1);

  const objectKey = row?.objectKey;
  if (!objectKey) return { ok: false, reason: "AVATAR_NOT_FOUND" };

  const parsed = parseAvatarObjectKey(objectKey);
  if (!parsed) return { ok: false, reason: "AVATAR_NOT_FOUND" };

  return {
    ok: true,
    stream: checkins.file(objectKey).stream(),
    contentType: parsed.contentType,
  };
}
