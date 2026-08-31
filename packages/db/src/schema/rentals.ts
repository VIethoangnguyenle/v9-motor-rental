import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { staffUsers } from "./staff";
import { vehicles } from "./vehicles";

/**
 * Khách thuê xe. Quyết định + lý do ở §3.1 của
 * docs/plans/2026-08-15-staff-home-stats-calendar-design.md.
 *
 * `phone` là danh tính thực tế của khách ở một shop cho thuê xe — không phải
 * email. Nó lưu ĐÃ CHUẨN HOÁ (chỉ chữ số, bắt đầu bằng 0) và `CHECK` dưới đây ép
 * điều đó ở tầng DB, để một hàng chưa chuẩn hoá không lọt vào được bằng bất cứ
 * đường nào — kể cả một câu INSERT viết tay.
 *
 * Không có CHECK này thì `UNIQUE(phone)` không chặn được gì: "+84912345678" và
 * "0912 345 678" là hai chuỗi khác nhau với cùng một người. Đúng lớp lỗi mà
 * docs/DEBT.md đã ghi cho email phân biệt hoa thường.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull().unique(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Cùng biểu thức với `normalizePhone` ở @v9/shared/domain/phone.
    //
    // ⚠️ KHÔNG có gì trong máy ép hai chỗ này khớp nhau. `phone.test.ts` chỉ so
    // `normalizePhone` với một bản sao regex thứ ba nằm trong chính file test —
    // nó không bao giờ chạm `packages/db`. Sửa regex ở đây mà quên `phone.ts`
    // (hoặc ngược lại) thì service ghi được thứ Postgres từ chối, và không có
    // gì đỏ ở đâu cả. Test parity thật nằm ở `rentals-schema.test.ts`.
    check("customers_phone_normalized", sql`${t.phone} ~ '^0[0-9]{8,10}$'`),
  ],
);

/**
 * Một đơn thuê. §3.2 design doc.
 *
 * ⚠️ Cột `period` (tstzrange) và constraint `rentals_no_overlap` KHÔNG khai ở đây
 * — chúng nằm trong migration viết tay `0010`, vì drizzle-kit không sinh được cột
 * GENERATED kiểu range lẫn EXCLUDE constraint. Đừng thêm chúng vào file này: làm
 * vậy thì lần `db:generate` sau sẽ sinh ra một migration cố tạo lại thứ đã có.
 *
 * Tiền là `integer` chứ không `bigint`, cùng lý do đã ghi ở `vehicles`.
 *
 * `created_by` là `text` chứ không `uuid` vì `staff_users.id` là `text` (id do
 * SuperTokens sinh). Đây là FK mà docs/ROADMAP.md đòi: ai chốt đơn.
 */
export const rentals = pgTable(
  "rentals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    /** KẾ HOẠCH. Doanh thu KHÔNG dùng cột này — xem `handedOverAt`. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("BOOKED"),
    /** THỰC TẾ. Mốc ghi nhận doanh thu. */
    handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    totalAmount: integer("total_amount").notNull(),
    /**
     * Mặc định 0 trong khi `totalAmount` không có mặc định — không phải bỏ sót.
     * Đường ghi thật (`POST /rentals`) luôn truyền tường minh cả hai, nên mặc
     * định này chỉ phục vụ một câu INSERT tay quên cột: cọc bằng 0 là một giá
     * trị có nghĩa, còn tổng tiền bằng 0 thì không.
     */
    depositAmount: integer("deposit_amount").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    note: text("note"),
    /**
     * Giấy tờ tùy thân shop đang giữ cho ĐƠN NÀY. Cố ý không lưu số giấy tờ —
     * xem comment trong migration. `document_returned_at` null = còn đang giữ.
     *
     * ⚠️ Chưa có writer cho tới khi luồng bàn giao xe được dựng.
     */
    documentType: text("document_type"),
    documentReturnedAt: timestamp("document_returned_at", { withTimezone: true }),
    /** Địa chỉ giao xe của đơn này. "Lần gần nhất" của một khách là TRUY VẤN, không phải cột. */
    deliveryAddress: text("delivery_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("rentals_period_valid", sql`${t.endsAt} > ${t.startsAt}`),
    // Bốn literal này phải khớp `RentalStatus` ở @v9/shared/domain/rental.
    // Cùng loại hợp đồng ngầm với regex số điện thoại ở bảng trên, và cũng
    // không có gì ép — thêm một trạng thái ở một bên mà quên bên kia thì
    // INSERT chết ở runtime chứ không phải lúc biên dịch.
    check(
      "rentals_status_valid",
      sql`${t.status} IN ('BOOKED', 'ONGOING', 'COMPLETED', 'CANCELLED')`,
    ),
    check("rentals_money_nonneg", sql`${t.totalAmount} >= 0 AND ${t.depositAmount} >= 0`),
    // Hai CHECK dưới đây KHÔNG phải phòng thủ thừa. Doanh thu tính bằng
    // `SUM(total_amount) WHERE handed_over_at ...`, nên một hàng ONGOING mà
    // `handed_over_at IS NULL` sẽ BIẾN MẤT khỏi báo cáo thay vì gây lỗi. Ép ở
    // DB thì hàng đó không tồn tại được.
    check(
      "rentals_ongoing_has_handover",
      sql`${t.status} <> 'ONGOING' OR ${t.handedOverAt} IS NOT NULL`,
    ),
    check(
      "rentals_completed_has_return",
      sql`${t.status} <> 'COMPLETED' OR (${t.handedOverAt} IS NOT NULL AND ${t.returnedAt} IS NOT NULL)`,
    ),
    // Chiều NGƯỢC LẠI của hai CHECK ngay trên, và chiều này nguy hiểm hơn.
    // Truy vấn doanh thu lọc đúng `handed_over_at IS NOT NULL` và KHÔNG kiểm
    // trạng thái, nên một hàng BOOKED hoặc CANCELLED mang dấu giao xe sẽ được
    // ĐẾM VÀO tiền — sai theo hướng thổi phồng doanh thu, và im lặng.
    //
    // `transition()` ở @v9/shared cấm ONGOING → CANCELLED, nhưng đó là luật của
    // ỨNG DỤNG đi bảo vệ một truy vấn ở tầng DATABASE: nó không đứng trước một
    // câu UPDATE sửa tay. Đúng mối đe doạ mà CHECK số điện thoại ở bảng trên đã
    // viện ra, nên nó phải được đối xử như nhau.
    //
    // Cộng với hai CHECK trên, hai cái này làm quan hệ thành HAI CHIỀU:
    //   handed_over_at IS NOT NULL  ⟺  status IN ('ONGOING','COMPLETED')
    //   returned_at    IS NOT NULL  ⟺  status = 'COMPLETED'
    check(
      "rentals_handover_only_when_out",
      sql`${t.handedOverAt} IS NULL OR ${t.status} IN ('ONGOING', 'COMPLETED')`,
    ),
    check(
      "rentals_return_only_when_completed",
      sql`${t.returnedAt} IS NULL OR ${t.status} = 'COMPLETED'`,
    ),
    // Trả xe không xảy ra trước khi giao xe. Không CHECK nào hiện có chặn
    // `returned_at < handed_over_at`, và một hàng như thế làm mọi báo cáo thời
    // gian thuê ra số âm.
    check(
      "rentals_return_after_handover",
      sql`${t.returnedAt} IS NULL OR ${t.handedOverAt} IS NULL OR ${t.returnedAt} >= ${t.handedOverAt}`,
    ),
    check(
      "rentals_document_type_valid",
      sql`${t.documentType} IS NULL OR ${t.documentType} IN ('CCCD', 'PASSPORT')`,
    ),
    check(
      "rentals_document_return_needs_type",
      sql`${t.documentReturnedAt} IS NULL OR ${t.documentType} IS NOT NULL`,
    ),
    // Partial index cho truy vấn doanh thu: đơn chưa giao không bao giờ được đếm,
    // nên chúng không cần nằm trong index.
    index("rentals_revenue_idx")
      .on(t.handedOverAt)
      .where(sql`${t.handedOverAt} IS NOT NULL`),
  ],
);
