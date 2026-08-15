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
    // Cùng biểu thức với `normalizePhone` ở @v9/shared. Test của hàm đó khoá
    // sự khớp nhau lại.
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
    depositAmount: integer("deposit_amount").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("rentals_period_valid", sql`${t.endsAt} > ${t.startsAt}`),
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
    // Partial index cho truy vấn doanh thu: đơn chưa giao không bao giờ được đếm,
    // nên chúng không cần nằm trong index.
    index("rentals_revenue_idx")
      .on(t.handedOverAt)
      .where(sql`${t.handedOverAt} IS NOT NULL`),
  ],
);
