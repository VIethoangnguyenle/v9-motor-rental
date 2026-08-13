import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Danh tính NGHIỆP VỤ của nhân viên. SuperTokens giữ mật khẩu và session; role,
 * trạng thái duyệt và hồ sơ nằm ở đây, nơi migration làm chủ.
 * Lý do (bốn điểm) ở §2 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * `id` là `text` chứ KHÔNG phải `uuid`: id do SuperTokens sinh, và họ có cơ chế
 * user-id-mapping cho phép id ngoài. Khai `uuid` là đặt cược vào chi tiết triển
 * khai của hệ khác — đổi sang `uuid` sau này là một migration rẻ, chọn sai chiều
 * kia thì hỏng lúc chạy.
 *
 * Dùng `text` + CHECK thay cho `pgEnum`, theo đúng quy ước của `vehicles`: luật
 * thuộc về DB, và thêm giá trị mới không phải chạy ALTER TYPE.
 */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: text("id").primaryKey(),
    /** Bản sao từ SuperTokens. Nguồn sự thật vẫn ở đó — đổi email phải đồng bộ hai nơi. */
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    role: text("role").notNull().default("STAFF"),
    status: text("status").notNull().default("PENDING"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /**
     * Mốc thu hồi session: access token cấp TRƯỚC mốc này không còn giá trị.
     *
     * Tồn tại vì `Session.revokeAllSessionsForUser` KHÔNG đủ. Access token của
     * SuperTokens là JWT tự xác thực cục bộ, nên thu hồi ở core chỉ giết refresh
     * token — token đang cầm vẫn dùng được tới khi hết hạn (mặc định 1 giờ). Đo
     * 2026-08-11 với đúng cookie cũ sau khi đổi mật khẩu: `/auth/session/refresh`
     * → 401, `supertokens.session_info` → 0 hàng, `/staff/me` → **200**.
     *
     * Cột này là công tắc ngắt tức thì, và nó rẻ vì `staff-guard` ĐÃ đọc một hàng
     * `staff_users` ở mỗi request được bảo vệ — không thêm query nào, không phải
     * hỏi core mỗi request (`checkDatabase: true` sẽ làm đúng thế).
     *
     * `null` = chưa từng thu hồi, tức là mọi token đều hợp lệ. Đó là lý do cột
     * nullable thay vì `DEFAULT now()`: một mặc định `now()` sẽ đóng dấu cho MỌI
     * hàng cũ lúc migrate và đá văng toàn bộ nhân viên đang đăng nhập.
     */
    sessionsInvalidBefore: timestamp("sessions_invalid_before", { withTimezone: true }),
    /**
     * FK tự trỏ về chính bảng này. `ON DELETE SET NULL` chứ không phải mặc định:
     * không có action thì xoá một nhân viên từng duyệt người khác sẽ bị chặn, và
     * đó chính là thứ các test dọn dữ liệu `ztest-%` làm. Toàn vẹn tham chiếu giữ
     * được, việc dọn dẹp không thành lỗi.
     */
    approvedBy: text("approved_by").references((): AnyPgColumn => staffUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * KHÔNG có trigger `set_updated_at()` như `vehicles` (xem `0004_real_mantis.sql`).
     * Trigger đó tồn tại vì `vehicles` có HAI đường ghi — Directus ghi thẳng vào
     * Postgres, vòng qua `apps/api` — nên `updatedAt` set ở tầng app bị bỏ qua trên
     * đường ghi kia. `staff_users` chỉ có MỘT đường ghi (`apps/api`), nên service tự
     * set `updatedAt: new Date()` mỗi lần UPDATE là đủ; thêm trigger ở đây là thừa.
     * Đây là lựa chọn có chủ đích, không phải thiếu sót — đừng thêm trigger, và đừng
     * bỏ set `updatedAt` ở service với lý do "đã có cơ chế lo hộ".
     */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("staff_users_role_valid", sql`${t.role} IN ('OWNER', 'STAFF', 'SALES')`),
    check("staff_users_status_valid", sql`${t.status} IN ('PENDING', 'ACTIVE', 'DISABLED')`),
    // Partial index: màn duyệt LUÔN lọc đúng tập này, và tập này gần như luôn rỗng.
    // Cùng lý lẽ với partial index của `vehicles`.
    index("staff_users_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'PENDING'`),
  ],
);

/**
 * Mã 6 số cho luồng quên mật khẩu. KHÔNG lưu token của SuperTokens ở đây —
 * token chỉ được sinh ở bước xác nhận và dùng xong ngay trong cùng lời gọi, nên
 * trong DB của ta không có chuỗi nào tự nó mở được tài khoản (§5.1 design doc).
 */
export const passwordResetCodes = pgTable(
  "password_reset_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    /** Bun.password.hash — mã thô KHÔNG bao giờ chạm đĩa. */
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("password_reset_codes_attempts_nonneg", sql`${t.attempts} >= 0`),
    // Không cần (staff_user_id, created_at DESC) dù truy vấn thật ORDER BY
    // created_at DESC LIMIT 1: `createResetCode` đánh dấu MỌI mã chưa dùng
    // của người đó là đã dùng TRƯỚC KHI chèn mã mới, nên ở trạng thái ổn định
    // mỗi người có TỐI ĐA MỘT hàng `used_at IS NULL` — sắp xếp một hàng là miễn
    // phí, không cần cột `created_at` trong index. Bất biến này nằm ở tầng ứng
    // dụng, không ở DB: nếu sau này ai bỏ bước vô hiệu hoá mã cũ đó, index này
    // lặng lẽ không còn đủ — truy vấn O(1) thành quét nhiều hàng, không có lỗi
    // ở đâu cả.
    index("password_reset_codes_active_idx")
      .on(t.staffUserId)
      .where(sql`${t.usedAt} IS NULL`),
  ],
);
