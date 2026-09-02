import { Elysia, t } from "elysia";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";
import {
  AVATAR_CONTENT_TYPES,
  MAX_AVATAR_BYTES,
  parseAvatarObjectKey,
} from "@v9/shared/domain/avatar";
import { getClientIp, passwordResetLimiter, type RateLimitResult } from "../plugins/rate-limit";
import { requireRole, staffGuard, type GuardErrorCode } from "../plugins/staff-guard";
import {
  deleteStaffAvatar,
  readStaffAvatar,
  setStaffAvatar,
  type DeleteAvatarResult,
  type SetAvatarResult,
} from "../services/avatar";
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
import type { HandoverErrorCode } from "./handover";
import type { RequestErrorCode } from "./requests";

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
  /**
   * Số hiệu bản của ảnh đại diện; `null` = chưa có ảnh, UI rơi về chữ cái.
   *
   * ⚠️ KHÔNG phải `object_key`, và KHÔNG phải một `hasAvatar: boolean`. Cả hai
   * lựa chọn kia đều sai theo một chiều:
   *
   *  • `object_key` là chi tiết lưu trữ — cùng lý do `COLUMNS` của
   *    `services/photos.ts` cố ý loại nó khỏi shape công khai.
   *  • một cờ `boolean` KHÔNG phân biệt được "vẫn ảnh cũ" với "vừa đổi ảnh":
   *    URL ảnh (`/staff/users/:id/avatar/content`) không đổi khi người ta thay
   *    ảnh, nên client không có tín hiệu nào để tải lại — nó vẽ ảnh cũ cho tới
   *    lần tải trang sau, và bộ nhớ đệm HTTP còn giữ lâu hơn thế.
   *
   * Chuỗi này đổi mỗi lần ghi ảnh mới (nó là `avatarId` trong khoá), nên nó vừa
   * trả lời "có ảnh không", vừa làm khoá bộ nhớ đệm cho `?v=` ở client.
   */
  avatarVersion: t.Nullable(t.String()),
});

/** Chỗ DUY NHẤT quyết định field nào của `StaffUser` được ra khỏi API. */
const toPublicProfile = (s: StaffUser) => ({
  id: s.id,
  email: s.email,
  fullName: s.fullName,
  phone: s.phone,
  role: s.role,
  status: s.status,
  // Khoá không đọc được → `null`, tức "coi như chưa có ảnh". Đúng chiều: hàng
  // hỏng thì UI rơi về chữ cái, thay vì đòi một tấm ảnh không stream được.
  avatarVersion: s.avatarObjectKey
    ? (parseAvatarObjectKey(s.avatarObjectKey)?.avatarId ?? null)
    : null,
});

const errorSchema = t.Object({ message: t.String(), code: t.String() });
const okSchema = t.Object({ ok: t.Boolean() });

type PermissionReason = Extract<StaffMutationResult, { ok: false }>["reason"];
type PasswordReason = Extract<ResetPasswordResult, { ok: false }>["reason"];
type ChangePasswordReason = Extract<ChangePasswordResult, { ok: false }>["reason"];
/**
 * `Exclude<…, PermissionReason>` KHÔNG phải để cho gọn: `setStaffAvatar` trả
 * `NOT_FOUND` (tài khoản biến mất giữa chừng), mà `PermissionReason` đã mang
 * đúng literal đó — hợp hai cái lại nguyên xi là một union có hằng lặp, và
 * `@typescript-eslint/no-duplicate-type-constituents` bắt đúng ca này (xem
 * `routes/handover.ts`, nơi `PHOTO_NOT_FOUND` vấp cùng luật). Trừ đi phần trùng
 * giữ `Reason` là một tập, và giữ `MESSAGES` bên dưới chỉ có MỘT bản dịch cho
 * "không tìm thấy nhân viên".
 */
type AvatarReason = Exclude<
  | Extract<SetAvatarResult, { ok: false }>["reason"]
  | Extract<DeleteAvatarResult, { ok: false }>["reason"],
  PermissionReason
>;
type Reason = PermissionReason | PasswordReason | ChangePasswordReason | AvatarReason;

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
  | Reason
  | GuardErrorCode
  | RentalErrorCode
  | RequestErrorCode
  | HandoverErrorCode
  | "EMAIL_NOT_CONFIGURED"
  | "RATE_LIMITED";

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
  AVATAR_TYPE_INVALID: "Chỉ nhận ảnh JPEG, PNG hoặc WebP",
  // Nói ĐƠN VỊ người dùng đọc được, và suy từ chính hằng của domain — sửa trần ở
  // `@v9/shared/domain/avatar` mà quên sửa câu này thì câu này nói dối.
  AVATAR_SIZE_INVALID: `Ảnh phải nhỏ hơn ${String(Math.floor(MAX_AVATAR_BYTES / 1024 / 1024))} MB`,
  AVATAR_NOT_FOUND: "Tài khoản này chưa có ảnh đại diện",
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

  /**
   * ─── Ảnh đại diện ──────────────────────────────────────────────────────────
   *
   * Ghi và xoá đi qua `/staff/me`, KHÔNG có `/staff/users/:id` cho hai việc đó:
   * **mỗi người đổi ảnh của chính mình**, kể cả OWNER. Phương án "chủ shop đặt
   * ảnh cho nhân viên" đã bị bác, và không có nó thì cũng không có luật phân
   * quyền mới nào phải viết ở đây — `staff.id` từ guard là chủ thể duy nhất.
   *
   * Đường ĐỌC thì ngược lại, nhận `:id` bất kỳ: bảng nhân viên hiện avatar của
   * người khác. Nó vẫn nằm sau `staffGuard` mặc định chặn, nên "mọi nhân viên
   * ACTIVE" là đúng tập người được thấy — không rộng hơn cái họ đã thấy ở
   * `GET /staff/users` (tên, email, số điện thoại).
   */
  .post(
    "/staff/me/avatar",
    async ({ body, staff, status }) => {
      if (!staff) return status(404, toError("NOT_FOUND"));

      const r = await setStaffAvatar({
        staffId: staff.id,
        contentType: body.file.type,
        bytes: await body.file.arrayBuffer(),
      });

      if (r.ok) return status(200, { ok: true });
      if (r.reason === "NOT_FOUND") return status(404, toError(r.reason));
      return status(400, toError(r.reason));
    },
    {
      // Hàng rào ĐẦU TIÊN, cùng khuôn `POST /rentals/:id/photos`: Elysia từ chối
      // trước khi handler chạy. Hai tham số suy từ `@v9/shared/domain/avatar`
      // chứ không gõ lại — hàng rào thứ hai (`setStaffAvatar`) đọc cùng bảng đó,
      // nên hai tầng không lệch nhau được.
      //
      // Đo 2026-09-02 với `curl`: `t.File({ type })` của Elysia so theo NỘI DUNG
      // chứ không theo `Content-Type` người gửi khai — một PDF khai là
      // `image/png` vẫn bị từ chối (422), và một PNG khai là `image/webp` đi vào
      // handler với `file.type === "image/png"`. Nghĩa là đuôi trong object key
      // luôn khớp byte thật, không khớp một lời khai. Đừng bỏ `type` ở đây với
      // lý do "domain đã kiểm rồi": domain chỉ đọc được lời khai.
      body: t.Object({
        file: t.File({ maxSize: MAX_AVATAR_BYTES, type: [...AVATAR_CONTENT_TYPES] }),
      }),
      response: { 200: okSchema, 400: errorSchema, 404: errorSchema },
    },
  )

  .delete(
    "/staff/me/avatar",
    async ({ staff, status }) => {
      if (!staff) return status(404, toError("NOT_FOUND"));
      const r = await deleteStaffAvatar(staff.id);
      if (r.ok) return status(200, { ok: true });
      return status(404, toError(r.reason));
    },
    { response: { 200: okSchema, 404: errorSchema } },
  )

  /**
   * Stream byte về cho `<img>` của `apps/staff` (qua `fetch` + `blob:`, xem
   * `apps/staff/src/lib/avatar.ts`).
   *
   * KHÔNG khai `response` schema, khác luật chung của workspace này — cùng ngoại
   * lệ với `GET /rentals/:id/photos/:photoId/content`: thân response là một
   * `ReadableStream` byte, không có schema nào mô tả được nó, và khai bừa một
   * schema sẽ bắt Elysia serialize lại thứ đang được stream.
   */
  .get(
    "/staff/users/:id/avatar/content",
    async ({ params, status, set }) => {
      const r = await readStaffAvatar(params.id);
      if (!r.ok) return status(404, toError(r.reason));

      set.headers["content-type"] = r.contentType;
      // ⚠️ URL này KHÔNG mang số hiệu bản, nên bộ nhớ đệm chỉ đúng chừng nào chỗ
      // gọi còn gắn `?v=<avatarVersion>` (`fetchAvatarObjectUrl` ở
      // `apps/staff/src/lib/avatar.ts`). Bỏ tham số đó đi thì đổi ảnh xong người
      // dùng còn thấy ảnh cũ tới một tiếng, và không có gì kêu.
      //
      // `private`, KHÔNG `public`: ảnh mặt của nhân viên, proxy dùng chung không
      // được giữ bản sao. Cùng lý lẽ ảnh bàn giao.
      set.headers["cache-control"] = "private, max-age=3600";
      // Chặn trình duyệt tự đoán kiểu nội dung — với file người dùng gửi lên,
      // đoán sai kiểu là đường biến một "ảnh" thành tài liệu chạy được.
      set.headers["x-content-type-options"] = "nosniff";
      return r.stream;
    },
    { params: t.Object({ id: t.String() }) },
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
