import { Elysia, t } from "elysia";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";
import { getClientIp, passwordResetLimiter, type RateLimitResult } from "../plugins/rate-limit";
import { requireRole, staffGuard, type GuardErrorCode } from "../plugins/staff-guard";
import { isEmailConfigured, sendResetCodeEmail } from "../services/email";
import {
  changePassword,
  createResetCode,
  requestPasswordReset,
  resetPasswordWithCode,
  type ChangePasswordResult,
  type PasswordResetDeps,
  type ResetPasswordResult,
} from "../services/password-reset";
import {
  approveStaff,
  changeStaffRole,
  disableStaff,
  listStaff,
  loadStaff,
  type StaffDeps,
  type StaffMutationResult,
  type StaffUser,
} from "../services/staff";
import type { RentalErrorCode } from "./rentals";

/**
 * Route là tầng DUY NHẤT được phép chạm cả `services/` lẫn `supertokens-node`.
 * `services/staff.ts` và `services/password-reset.ts` cố ý nhận các hàm này qua
 * tham số (`StaffDeps` / `PasswordResetDeps`, pattern 2 của repo) thay vì tự
 * import: `supertokens.init()` sống ở `plugins/auth.ts`, mà `services/` bị ESLint
 * cấm import `plugins/`. Không có seam này thì unit test của hai service kia nổ
 * "SuperTokens must be initialized". ĐỪNG "đơn giản hoá" bằng cách chuyển các
 * lời gọi dưới đây vào trong service.
 *
 * `"public"` là tenant mặc định của SuperTokens — hệ này một tenant, và đó là
 * cùng giá trị `plugins/auth.ts` dựng lên.
 */
const revokeSessions = (userId: string) => Session.revokeAllSessionsForUser(userId);

const staffDeps: StaffDeps = { revokeSessions };

const resetDeps: PasswordResetDeps = {
  createResetToken: (userId, email) =>
    EmailPassword.createResetPasswordToken("public", userId, email),
  resetPasswordWithToken: (token, newPassword) =>
    EmailPassword.resetPasswordUsingToken("public", token, newPassword),
  revokeSessions,
  // `verifyCredentials`, KHÔNG PHẢI `signIn` — chỉ so mật khẩu, không tạo thêm
  // session. Dùng cho `changePassword` (xem services/password-reset.ts và route
  // `POST /staff/password/change` bên dưới).
  verifyPassword: (email, password) => EmailPassword.verifyCredentials("public", email, password),
};

/**
 * Union literal thay vì `t.String()`: thân request sai role bị chặn ở tầng schema
 * với 422, trước khi chạm service. Thêm role mới vào `StaffRole` mà quên ở đây thì
 * role đó không gọi được qua API — hỏng theo chiều đóng, không phải chiều mở.
 */
const roleSchema = t.Union([t.Literal("OWNER"), t.Literal("STAFF"), t.Literal("SALES")]);
const statusSchema = t.Union([t.Literal("PENDING"), t.Literal("ACTIVE"), t.Literal("DISABLED")]);

/**
 * `approvedBy` và `createdAt` CỐ Ý không có mặt — chúng là chuyện nội bộ của bảng,
 * không phải thứ mọi màn hình của `apps/staff` cần cầm theo. Hai lớp chặn, không
 * phải một: Elysia cắt field không khai lúc serialize (đã đo), VÀ kiểu của nó ép
 * field thừa thành `never` nên trả thẳng `StaffUser` vào đây là **lỗi biên dịch**.
 * Cái bảo vệ là schema, y như `plate` ở `routes/vehicles.ts` — đừng đổi sang
 * `t.Any()` hay bỏ schema đi.
 */
const staffSchema = t.Object({
  id: t.String(),
  email: t.String(),
  fullName: t.String(),
  phone: t.Nullable(t.String()),
  role: roleSchema,
  status: statusSchema,
});

/** Chỗ DUY NHẤT quyết định field nào của `StaffUser` được ra khỏi API. */
const toPublicProfile = (s: StaffUser) => ({
  id: s.id,
  email: s.email,
  fullName: s.fullName,
  phone: s.phone,
  role: s.role,
  status: s.status,
});

const errorSchema = t.Object({ message: t.String(), code: t.String() });
const okSchema = t.Object({ ok: t.Boolean() });

type PermissionReason = Extract<StaffMutationResult, { ok: false }>["reason"];
type PasswordReason = Extract<ResetPasswordResult, { ok: false }>["reason"];
type ChangePasswordReason = Extract<ChangePasswordResult, { ok: false }>["reason"];
type Reason = PermissionReason | PasswordReason | ChangePasswordReason;

/**
 * MỌI mã lỗi `apps/api` có thể trả — nguồn sự thật cho so sánh `code` ở
 * `apps/staff` (`errorCode()` ở `lib/errors.ts`), thay vì so chuỗi trần.
 *
 * Suy từ ba nguồn đã có, không liệt kê tay lần thứ hai:
 *   • `Reason` — suy thẳng từ kiểu trả về của `services/staff.ts` và
 *     `services/password-reset.ts` (đã có ở trên, dùng cho `MESSAGES` bên dưới).
 *   • `GuardErrorCode` — suy từ `plugins/staff-guard.ts`, nơi guard chạy TRƯỚC
 *     mọi route nên các mã đó không đi qua bất cứ discriminated union nào của
 *     service để mà suy ra.
 *   • `RentalErrorCode` — suy từ `routes/rentals.ts` (chính nó đã suy từ bốn
 *     service của `fleet`/`rentals`/`customers`, xem comment ở đó). Import
 *     TYPE THUẦN nên không kéo runtime của `routes/rentals.ts` vào file này.
 * `"EMAIL_NOT_CONFIGURED"` và `"RATE_LIMITED"` là hai literal tay DUY NHẤT ở
 * đây: route `/staff/password-reset/request` phát chúng thẳng (thiếu SMTP;
 * vượt ngưỡng `plugins/rate-limit.ts`), không có union nào đứng sau để suy
 * ra — hai chỗ liệt kê tay (đây và `GuardErrorCode`) là TOÀN BỘ phần không
 * suy ra được của `ApiErrorCode`.
 */
export type ApiErrorCode =
  Reason | GuardErrorCode | RentalErrorCode | "EMAIL_NOT_CONFIGURED" | "RATE_LIMITED";

/**
 * Domain trả `reason` (pattern 3 của repo — discriminated union, không throw);
 * route dịch sang HTTP. **Mã giữ nguyên cho frontend, thông điệp cho người đọc**:
 * `apps/staff` phân nhánh theo `code`, không theo chuỗi tiếng Việt.
 *
 * `satisfies Record<Reason, string>` không phải trang trí — `Reason` suy thẳng từ kiểu
 * trả về của hai service, nên thêm một reason ở domain mà quên dịch ở đây là **lỗi
 * biên dịch**. Một `switch` có `default` sẽ nuốt reason mới thành "Yêu cầu không
 * hợp lệ" và không ai biết.
 */
const MESSAGES = {
  NOT_OWNER: "Chỉ chủ shop mới làm được việc này",
  CANNOT_APPROVE_SELF: "Không tự duyệt tài khoản của chính mình",
  NOT_PENDING: "Tài khoản này không ở trạng thái chờ duyệt",
  CANNOT_DISABLE_SELF: "Không tự khoá tài khoản của chính mình",
  LAST_OWNER: "Đây là chủ shop cuối cùng — không hạ quyền hoặc khoá được",
  NOT_FOUND: "Không tìm thấy nhân viên",
  WRONG_CODE: "Mã không đúng",
  CODE_EXPIRED: "Mã đã hết hạn hoặc đã dùng — xin chủ shop cấp mã mới",
  WEAK_PASSWORD: "Mật khẩu mới chưa đạt yêu cầu",
  SAME_PASSWORD: "Mật khẩu mới trùng mật khẩu hiện tại",
  WRONG_CURRENT_PASSWORD: "Mật khẩu hiện tại không đúng",
} as const satisfies Record<Reason, string>;

const toError = (reason: Reason) => ({ message: MESSAGES[reason], code: reason });

/**
 * Ba nhóm khác nhau, ba mã khác nhau — gộp tất cả thành 409 (hay 400) làm frontend
 * không phân biệt được "bạn không có quyền" với "luật nghiệp vụ chặn".
 * 403 = thiếu quyền · 409 = xung đột luật · 404 = không có hàng đó.
 */
const HTTP_STATUS = {
  NOT_OWNER: 403,
  CANNOT_APPROVE_SELF: 409,
  NOT_PENDING: 409,
  CANNOT_DISABLE_SELF: 409,
  LAST_OWNER: 409,
  NOT_FOUND: 404,
} as const satisfies Record<PermissionReason, 403 | 404 | 409>;

/** Ba route OWNER dùng chung đúng bộ mã này. */
const adminResponses = {
  200: okSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
};

/**
 * Vế `|| !staff` chỉ để TypeScript thu hẹp kiểu: `requireRole` nhận `staff | null`
 * nên khi nó trả `null` (đủ quyền) TS vẫn chưa biết `staff` khác `null`, mà các
 * handler bên dưới cần `staff.id` làm actor. Về mặt chạy thật nó không bao giờ
 * đúng một mình — `requireRole(null, ...)` luôn từ chối. Viết thế này để không
 * phải rải `!` (non-null assertion) khắp file.
 */
const FORBIDDEN = {
  message: "Không đủ quyền",
  code: "FORBIDDEN" satisfies GuardErrorCode,
} as const;

export const staff = new Elysia({ name: "staff" })
  .use(staffGuard)

  /**
   * `staff` tới từ `resolve` của `staffGuard` — per-request, KHÔNG phải `.state()`
   * dùng chung cho cả tiến trình. Guard đã đọc `staff_users` cho request này rồi,
   * nên ở đây CỐ Ý không gọi `loadStaff` lần nữa: đây là đường nóng nhất của
   * `apps/staff` (mọi lần điều hướng đều hỏi "tôi là ai"), và một query thừa ở đây
   * là một query thừa trên mọi màn hình.
   *
   * `staff === null` mà vẫn qua được guard nghĩa là có session nhưng thiếu hàng —
   * lớp bù trừ của `signUpPOST` đã hỏng. 404 để `apps/staff` hiện được lý do thay
   * vì treo màn trắng.
   */
  .get(
    "/staff/me",
    ({ staff, status }) => {
      if (!staff) return status(404, toError("NOT_FOUND"));
      return status(200, toPublicProfile(staff));
    },
    { response: { 200: staffSchema, 404: errorSchema } },
  )

  .get(
    "/staff/users",
    async ({ query, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);
      return status(200, (await listStaff(query.status)).map(toPublicProfile));
    },
    {
      query: t.Object({ status: t.Optional(statusSchema) }),
      response: { 200: t.Array(staffSchema), 403: errorSchema },
    },
  )

  .post(
    "/staff/users/:id/approve",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied || !staff) return status(403, denied ?? FORBIDDEN);

      const res = await approveStaff(staff.id, params.id, body.role);
      if (!res.ok) return status(HTTP_STATUS[res.reason], toError(res.reason));
      return status(200, { ok: true });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ role: roleSchema }),
      response: adminResponses,
    },
  )

  .post(
    "/staff/users/:id/role",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied || !staff) return status(403, denied ?? FORBIDDEN);

      const res = await changeStaffRole(staff.id, params.id, body.role);
      if (!res.ok) return status(HTTP_STATUS[res.reason], toError(res.reason));
      return status(200, { ok: true });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ role: roleSchema }),
      response: adminResponses,
    },
  )

  /**
   * Thu hồi session đi kèm việc khoá, và nó nằm trong `disableStaff` (sau khi
   * transaction commit) chứ không phải ở đây — khoá mà không thu hồi thì phiên
   * đang mở của người đó vẫn sống tới lúc token hết hạn.
   */
  .post(
    "/staff/users/:id/disable",
    async ({ params, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied || !staff) return status(403, denied ?? FORBIDDEN);

      const res = await disableStaff(staffDeps, staff.id, params.id);
      if (!res.ok) return status(HTTP_STATUS[res.reason], toError(res.reason));
      return status(200, { ok: true });
    },
    { params: t.Object({ id: t.String() }), response: adminResponses },
  )

  /**
   * Đường cứu khi nhân viên không vào được email: OWNER bấm nút, đọc sáu số qua
   * Zalo. KHÔNG cần SMTP — đó là lý do nó tồn tại. Dùng chung đúng bảng và đúng
   * đường xác minh với luồng email, nên không có hai luồng để lệch nhau.
   */
  .post(
    "/staff/users/:id/reset-code",
    async ({ params, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);

      const target = await loadStaff(params.id);
      if (!target) return status(404, toError("NOT_FOUND"));
      return status(200, { code: await createResetCode(target.id) });
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: t.Object({ code: t.String() }), 403: errorSchema, 404: errorSchema },
    },
  )

  .post(
    "/staff/password-reset/request",
    async ({ body, request, server, set, status }) => {
      // Rate limit CHẠY TRƯỚC MỌI THỨ KHÁC, kể cả kiểm tra SMTP — nợ đã đóng
      // (docs/DEBT.md, "Không có rate limit theo IP"): endpoint này băm
      // argon2id (~115ms, xem `requestPasswordReset`) cho mọi email có thật
      // MỘT KHI SMTP đã cấu hình, và đứng SAU check SMTP thì rate limit
      // không có tác dụng gì ở môi trường chưa bật email (đúng môi trường
      // dev hôm nay) — trong khi limiter phải bảo vệ được ngay cả khi test,
      // không phụ thuộc trạng thái SMTP.
      const rateLimit: RateLimitResult = passwordResetLimiter.check(getClientIp(request, server));
      if (!rateLimit.allowed) {
        set.headers["retry-after"] = String(rateLimit.retryAfterSeconds);
        return status(429, {
          message: "Bạn thao tác quá nhanh — thử lại sau ít phút",
          code: "RATE_LIMITED" satisfies ApiErrorCode,
        });
      }

      // Thiếu SMTP là trạng thái mặc định của một prod mới dựng, nên câu trả lời
      // phải chỉ ra lối đi tiếp — không phải một lỗi cụt.
      if (!isEmailConfigured) {
        return status(503, {
          message: "Hệ thống chưa cấu hình email — liên hệ chủ shop để lấy mã",
          code: "EMAIL_NOT_CONFIGURED" satisfies ApiErrorCode,
        });
      }

      // `requestPasswordReset` gộp hai nhánh "có email"/"không có email" và
      // băm argon2id ở CẢ HAI — đúng chỗ xoá timing oracle ~190× (docs/DEBT.md,
      // xem comment đầy đủ ở `services/password-reset.ts`). Đừng tách lại
      // thành `findStaffByEmail` rồi CÓ ĐIỀU KIỆN mới băm — đó chính là hình
      // dạng cũ đã sinh ra oracle.
      const code = await requestPasswordReset(body.email);
      if (code) await sendResetCodeEmail(body.email, code);

      // LUÔN 200, kể cả khi email không tồn tại hoặc chủ nó đang bị khoá. Trả 404
      // cho email lạ là biến endpoint này thành máy dò danh sách nhân viên của
      // shop. §5.1 design doc — đừng "cải thiện" bằng cách phân biệt hai ca.
      return status(200, { ok: true });
    },
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
      response: { 200: okSchema, 429: errorSchema, 503: errorSchema },
    },
  )

  /**
   * MỌI thất bại ở đây là 400, kể cả `NOT_FOUND` — cùng lý do không lộ email
   * như route trên. Ở các route quản trị thì `NOT_FOUND` là 404, vì ở đó
   * người gọi đã là OWNER và đã được phép biết ai có trong bảng.
   */
  .post(
    "/staff/password-reset/confirm",
    async ({ body, status }) => {
      const res = await resetPasswordWithCode(resetDeps, body.email, body.code, body.matKhauMoi);
      if (!res.ok) return status(400, toError(res.reason));
      return status(200, { ok: true });
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        code: t.String({ minLength: 6, maxLength: 6 }),
        // Chính sách mật khẩu thật do SuperTokens giữ (`WEAK_PASSWORD`). 8 ký tự ở
        // đây chỉ để chặn thân request rỗng — KHÔNG nhân bản luật sang tầng này,
        // hai bản luật sẽ lệch nhau ở lần đầu một trong hai được sửa.
        matKhauMoi: t.String({ minLength: 8 }),
      }),
      response: { 200: okSchema, 400: errorSchema },
    },
  )

  /**
   * Route này KHÔNG có mặt ở `PUBLIC_ROUTES` lẫn `SESSION_ONLY_ROUTES` của
   * `staff-guard.ts` — đúng như vậy là cố ý. Guard mặc định CHẶN: route không
   * được khai ở một trong hai danh sách đó thì tự động đòi session hợp lệ VÀ
   * hồ sơ `ACTIVE`, không cần route này tự làm gì thêm để "bật" bảo vệ. Đó là
   * toàn bộ lý do plugin này tồn tại — không ai phải NHỚ bảo vệ một route mới.
   *
   * `staff` lấy từ context guard đã `resolve` sẵn cho request này, CỐ Ý không
   * gọi `loadStaff` lần nữa (xem comment ở `/staff/me` phía trên — cùng lý do,
   * đây vẫn là đường nóng, không phải lý do riêng của route này).
   *
   * ⚠️ Đổi mật khẩu THÀNH CÔNG sẽ ĐĂNG XUẤT người dùng — không phải lựa chọn
   * UX, mà là hệ quả bắt buộc của `revokeAndStamp` bên trong `changePassword`
   * (xem `services/password-reset.ts`): mật khẩu mới có hiệu lực đồng nghĩa
   * mọi session cấp trước đó — kể cả session hiện tại — bị thu hồi ngay ở
   * request kế tiếp. `apps/staff` PHẢI nói rõ điều này trước khi gửi form,
   * không phải để người dùng tự hỏi vì sao vừa đổi xong đã bị đá ra ngoài.
   */
  .post(
    "/staff/password/change",
    async ({ body, staff, status }) => {
      if (!staff) return status(404, toError("NOT_FOUND"));

      const res = await changePassword(resetDeps, staff, body.currentPassword, body.newPassword);
      if (!res.ok) return status(400, toError(res.reason));
      return status(200, { ok: true });
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 8 }),
        // Cùng luật với `matKhauMoi` ở route reset phía trên: chính sách mật khẩu
        // thật do SuperTokens giữ (`WEAK_PASSWORD`). 8 ký tự ở đây chỉ chặn thân
        // request rỗng — KHÔNG nhân bản luật mạnh/yếu sang tầng này.
        newPassword: t.String({ minLength: 8 }),
      }),
      response: { 200: okSchema, 400: errorSchema, 404: errorSchema },
    },
  );
