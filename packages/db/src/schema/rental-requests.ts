import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { staffUsers } from "./staff";
import { vehicles } from "./vehicles";

/**
 * Yêu cầu thuê do KHÁCH gửi từ `apps/web`. Không phải đơn thuê.
 *
 * ⚠️ Bảng này CỐ Ý không đi qua `rentals_no_overlap`, và đó là khác biệt quan
 * trọng nhất giữa nó với `rentals`. `apps/web` không đọc availability thời gian
 * thực (`docs/workspaces/web.md`), nên hai khách gửi yêu cầu cho cùng một xe
 * cùng một khoảng ngày là chuyện BÌNH THƯỜNG và phải ghi nhận được cả hai. Thêm
 * một exclusion constraint ở đây là dạy cho database một điều web không biết,
 * và hệ quả là khách thứ hai bị từ chối bằng một lỗi mà nhân viên không bao giờ
 * nhìn thấy để giải thích.
 *
 * Ràng buộc chống đặt trùng vẫn nguyên vẹn ở nơi nó thuộc về: `rentals`, chạm
 * bởi nhân viên lúc chốt đơn trong `apps/staff`.
 *
 * `starts_at` là `date` chứ KHÔNG phải `timestamptz` như `rentals.starts_at`:
 * khách chỉ chọn NGÀY muốn nhận xe, không chọn giờ, và shop giao tận nơi nên giờ
 * là thứ hai bên hẹn qua điện thoại sau. Lưu `timestamptz` ở đây buộc phải bịa
 * ra một giờ, rồi giờ bịa đó lệch múi khi đọc — bẫy đã cắn thật ở `calendar-layout`.
 */
export const rentalRequests = pgTable(
  "rental_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * `restrict` cùng khuôn `rentals.vehicle_id`: một yêu cầu đã gửi là bằng
     * chứng khách từng quan tâm chiếc xe nào, và xoá xe không được phép xoá mất
     * điều đó trong im lặng.
     */
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    /**
     * Lưu ĐÃ CHUẨN HOÁ, cùng biểu thức `normalizePhone` ở @v9/shared/domain/phone
     * và cùng CHECK với `customers.phone`. KHÔNG `unique` — một người hoàn toàn
     * có thể gửi nhiều yêu cầu, và đây cũng không phải bảng danh tính.
     */
    phone: text("phone").notNull(),
    startDate: date("start_date").notNull(),
    days: integer("days").notNull(),
    /** PRODUCT.md: "giao xe tận nơi" là cơ chế đã xác nhận. Không bắt buộc — khách có thể tự tới. */
    deliveryAddress: text("delivery_address"),
    note: text("note"),
    status: text("status").notNull().default("NEW"),
    /**
     * Ai đã xử lý. `text` chứ không `uuid` vì `staff_users.id` là text (id do
     * SuperTokens sinh) — cùng lý do đã ghi ở `rentals.created_by`.
     */
    handledBy: text("handled_by").references(() => staffUsers.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Cùng biểu thức với `customers_phone_normalized`. Cùng hợp đồng ngầm, cùng
    // cái bẫy: sửa một chỗ mà quên chỗ kia thì service ghi được thứ Postgres từ
    // chối, và không có gì đỏ ở đâu cả.
    check("rental_requests_phone_normalized", sql`${t.phone} ~ '^0[0-9]{8,10}$'`),
    // Ba literal phải khớp `REQUEST_STATUSES` ở @v9/shared/domain/rental-request.
    check("rental_requests_status_valid", sql`${t.status} IN ('NEW', 'CONTACTED', 'CLOSED')`),
    // Trần phải khớp `MAX_REQUEST_DAYS`. Ép ở DB vì `days` chảy thẳng từ form
    // công khai — tầng duy nhất không ai bỏ qua được là tầng này.
    check("rental_requests_days_range", sql`${t.days} >= 1 AND ${t.days} <= 92`),
    // Một yêu cầu rời NEW thì phải biết ai xử lý và lúc nào. Không có CHECK này
    // thì màn nhân viên hiện "đã liên hệ" mà không nói được ai liên hệ.
    check(
      "rental_requests_handled_consistent",
      sql`${t.status} = 'NEW' OR (${t.handledAt} IS NOT NULL)`,
    ),
    // Màn tiếp nhận đọc "chưa xử lý, mới nhất trước". Partial index chỉ chứa
    // hàng NEW nên khoá đánh trên cột dùng để SẮP XẾP, không trên `status` —
    // bên trong index này `status` là hằng số. Cùng lý lẽ
    // `vehicles_published_idx`, gồm cả bẫy `NULLS LAST`: endpoint phải viết
    // `ORDER BY created_at DESC NULLS LAST` nguyên văn, thiếu là mất index.
    index("rental_requests_new_idx")
      .on(t.createdAt.desc())
      .where(sql`${t.status} = 'NEW'`),
    index("rental_requests_vehicle_idx").on(t.vehicleId, t.createdAt.desc()),
  ],
);
