import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rentals } from "./rentals";
import { staffUsers } from "./staff";

/**
 * Ảnh bàn giao: METADATA ở Postgres, BYTE ở MinIO (bucket `checkins`).
 *
 * Byte không nằm trong Postgres có chủ ý — một cột `bytea` chứa ảnh 12 MB làm
 * mọi `pg_dump` phình theo số lượt thuê, và backup là thứ chạy hằng ngày trong
 * khi ảnh chỉ được đọc khi có tranh chấp.
 *
 * ⚠️ `object_key` là NGUỒN SỰ THẬT nối hai kho. Hai kho có thể lệch nhau theo
 * đúng hai chiều, và chúng KHÔNG đối xứng:
 *
 *  - hàng còn, object mất → ảnh hỏng khi mở, phát hiện được ngay lúc xem.
 *  - object còn, hàng mất → **rác vô hình**: không truy vấn nào thấy nó, không
 *    ai xoá nó, và nó vẫn là ảnh CCCD của một người thật nằm trong storage.
 *
 * Vì vế thứ hai tệ hơn, thứ tự ghi/xoá ở `services/photos.ts` được chọn để
 * nghiêng về vế thứ nhất: ghi object TRƯỚC rồi mới ghi hàng; xoá hàng TRƯỚC rồi
 * mới xoá object. Đọc comment ở đó trước khi đổi.
 *
 * `ON DELETE CASCADE` từ `rentals`: xoá đơn thì metadata ảnh đi theo. Nhưng
 * CASCADE của Postgres KHÔNG chạm được MinIO — xoá một đơn có ảnh sẽ để lại
 * object mồ côi. Hôm nay không có đường xoá đơn nào trong app nên chưa cắn;
 * ngày thêm đường đó, phải dọn object trước khi xoá hàng.
 */
export const rentalPhotos = pgTable(
  "rental_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    /** Khớp `PHOTO_KINDS` ở @v9/shared/domain/rental-photo. */
    kind: text("kind").notNull(),
    /**
     * Đường dẫn trong bucket, sinh bởi `photoObjectKey` — mọi thành phần là id
     * hoặc hằng, không mảnh nào từ tên file gửi lên. `unique` vì nó là danh tính
     * của object: hai hàng cùng trỏ một object nghĩa là xoá một hàng làm hàng
     * kia hỏng trong im lặng.
     */
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Ai chụp. `text` vì `staff_users.id` là text — cùng lý do `rentals.created_by`. */
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Ba literal phải khớp `PHOTO_KINDS` ở @v9/shared. Cùng hợp đồng ngầm với
    // `rentals_status_valid`, và cũng không có gì ép ngoài test.
    check("rental_photos_kind_valid", sql`${t.kind} IN ('DOCUMENT', 'HANDOVER', 'RETURN')`),
    // Khớp `MAX_PHOTO_BYTES` (12 MB) ở @v9/shared. Ép ở DB vì `size_bytes` là
    // con số API tự đo được từ byte đã nhận — nhưng một câu INSERT tay thì không.
    check(
      "rental_photos_size_range",
      sql`${t.sizeBytes} >= 1 AND ${t.sizeBytes} <= ${sql.raw(String(12 * 1024 * 1024))}`,
    ),
    // Danh sách `image/*` phải khớp `TYPE_EXTENSION`. `svg+xml` bị loại có chủ ý
    // — nó chạy được script, xem comment ở @v9/shared/domain/rental-photo.
    check(
      "rental_photos_content_type_valid",
      sql`${t.contentType} IN ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    // Màn bàn giao đọc "ảnh của đơn này, nhóm theo loại, cũ trước" — ảnh đầu tiên
    // chụp là ảnh mô tả tình trạng ban đầu, nên ASC chứ không DESC như các bảng khác.
    index("rental_photos_rental_idx").on(t.rentalId, t.kind, t.createdAt),
  ],
);
