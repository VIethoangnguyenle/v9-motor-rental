import { Elysia, t } from "elysia";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";
import { requireRole, staffGuard } from "../plugins/staff-guard";
import { emailDaCauHinh, guiMaDatLaiMatKhau } from "../services/email";
import {
  doiMatKhauBangMa,
  taoMaDatLaiMatKhau,
  timStaffTheoEmail,
  type KetQuaDoiMatKhau,
  type PasswordResetDeps,
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
  taoTokenDatLai: (userId, email) =>
    EmailPassword.createResetPasswordToken("public", userId, email),
  doiMatKhauBangToken: (token, matKhauMoi) =>
    EmailPassword.resetPasswordUsingToken("public", token, matKhauMoi),
  revokeSessions,
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
const hoSoCongKhai = (s: StaffUser) => ({
  id: s.id,
  email: s.email,
  fullName: s.fullName,
  phone: s.phone,
  role: s.role,
  status: s.status,
});

const loiSchema = t.Object({ message: t.String(), code: t.String() });
const okSchema = t.Object({ ok: t.Boolean() });

type LyDoQuyen = Extract<StaffMutationResult, { ok: false }>["reason"];
type LyDoMatKhau = Extract<KetQuaDoiMatKhau, { ok: false }>["reason"];
type LyDo = LyDoQuyen | LyDoMatKhau;

/**
 * Domain trả `reason` (pattern 3 của repo — discriminated union, không throw);
 * route dịch sang HTTP. **Mã giữ nguyên cho frontend, thông điệp cho người đọc**:
 * `apps/staff` phân nhánh theo `code`, không theo chuỗi tiếng Việt.
 *
 * `satisfies Record<LyDo, string>` không phải trang trí — `LyDo` suy thẳng từ kiểu
 * trả về của hai service, nên thêm một reason ở domain mà quên dịch ở đây là **lỗi
 * biên dịch**. Một `switch` có `default` sẽ nuốt reason mới thành "Yêu cầu không
 * hợp lệ" và không ai biết.
 */
const THONG_DIEP = {
  KHONG_PHAI_OWNER: "Chỉ chủ shop mới làm được việc này",
  TU_DUYET_MINH: "Không tự duyệt tài khoản của chính mình",
  KHONG_CHO_DUYET: "Tài khoản này không ở trạng thái chờ duyệt",
  TU_KHOA_MINH: "Không tự khoá tài khoản của chính mình",
  OWNER_CUOI_CUNG: "Đây là chủ shop cuối cùng — không hạ quyền hoặc khoá được",
  KHONG_TIM_THAY: "Không tìm thấy nhân viên",
  MA_SAI: "Mã không đúng",
  MA_HET_HIEU_LUC: "Mã đã hết hạn hoặc đã dùng — xin chủ shop cấp mã mới",
  MAT_KHAU_YEU: "Mật khẩu mới chưa đạt yêu cầu",
} as const satisfies Record<LyDo, string>;

const loi = (reason: LyDo) => ({ message: THONG_DIEP[reason], code: reason });

/**
 * Ba nhóm khác nhau, ba mã khác nhau — gộp tất cả thành 409 (hay 400) làm frontend
 * không phân biệt được "bạn không có quyền" với "luật nghiệp vụ chặn".
 * 403 = thiếu quyền · 409 = xung đột luật · 404 = không có hàng đó.
 */
const MA_HTTP = {
  KHONG_PHAI_OWNER: 403,
  TU_DUYET_MINH: 409,
  KHONG_CHO_DUYET: 409,
  TU_KHOA_MINH: 409,
  OWNER_CUOI_CUNG: 409,
  KHONG_TIM_THAY: 404,
} as const satisfies Record<LyDoQuyen, 403 | 404 | 409>;

/** Ba route OWNER dùng chung đúng bộ mã này. */
const responseQuanTri = {
  200: okSchema,
  403: loiSchema,
  404: loiSchema,
  409: loiSchema,
};

/**
 * Vế `|| !staff` chỉ để TypeScript thu hẹp kiểu: `requireRole` nhận `staff | null`
 * nên khi nó trả `null` (đủ quyền) TS vẫn chưa biết `staff` khác `null`, mà các
 * handler bên dưới cần `staff.id` làm actor. Về mặt chạy thật nó không bao giờ
 * đúng một mình — `requireRole(null, ...)` luôn từ chối. Viết thế này để không
 * phải rải `!` (non-null assertion) khắp file.
 */
const THIEU_QUYEN = { message: "Không đủ quyền", code: "THIEU_QUYEN" } as const;

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
      if (!staff) return status(404, loi("KHONG_TIM_THAY"));
      return status(200, hoSoCongKhai(staff));
    },
    { response: { 200: staffSchema, 404: loiSchema } },
  )

  .get(
    "/staff/users",
    async ({ query, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);
      return status(200, (await listStaff(query.status)).map(hoSoCongKhai));
    },
    {
      query: t.Object({ status: t.Optional(statusSchema) }),
      response: { 200: t.Array(staffSchema), 403: loiSchema },
    },
  )

  .post(
    "/staff/users/:id/approve",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied || !staff) return status(403, denied ?? THIEU_QUYEN);

      const res = await approveStaff(staff.id, params.id, body.role);
      if (!res.ok) return status(MA_HTTP[res.reason], loi(res.reason));
      return status(200, { ok: true });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ role: roleSchema }),
      response: responseQuanTri,
    },
  )

  .post(
    "/staff/users/:id/role",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied || !staff) return status(403, denied ?? THIEU_QUYEN);

      const res = await changeStaffRole(staff.id, params.id, body.role);
      if (!res.ok) return status(MA_HTTP[res.reason], loi(res.reason));
      return status(200, { ok: true });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ role: roleSchema }),
      response: responseQuanTri,
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
      if (denied || !staff) return status(403, denied ?? THIEU_QUYEN);

      const res = await disableStaff(staffDeps, staff.id, params.id);
      if (!res.ok) return status(MA_HTTP[res.reason], loi(res.reason));
      return status(200, { ok: true });
    },
    { params: t.Object({ id: t.String() }), response: responseQuanTri },
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
      if (!target) return status(404, loi("KHONG_TIM_THAY"));
      return status(200, { code: await taoMaDatLaiMatKhau(target.id) });
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: t.Object({ code: t.String() }), 403: loiSchema, 404: loiSchema },
    },
  )

  .post(
    "/staff/password-reset/request",
    async ({ body, status }) => {
      // Thiếu SMTP là trạng thái mặc định của một prod mới dựng, nên câu trả lời
      // phải chỉ ra lối đi tiếp — không phải một lỗi cụt.
      if (!emailDaCauHinh) {
        return status(503, {
          message: "Hệ thống chưa cấu hình email — liên hệ chủ shop để lấy mã",
          code: "CHUA_CAU_HINH_EMAIL",
        });
      }

      const found = await timStaffTheoEmail(body.email);
      if (found) {
        const ma = await taoMaDatLaiMatKhau(found.id);
        await guiMaDatLaiMatKhau(body.email, ma);
      }

      // LUÔN 200, kể cả khi email không tồn tại hoặc chủ nó đang bị khoá. Trả 404
      // cho email lạ là biến endpoint này thành máy dò danh sách nhân viên của
      // shop. §5.1 design doc — đừng "cải thiện" bằng cách phân biệt hai ca.
      return status(200, { ok: true });
    },
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
      response: { 200: okSchema, 503: loiSchema },
    },
  )

  /**
   * MỌI thất bại ở đây là 400, kể cả `KHONG_TIM_THAY` — cùng lý do không lộ email
   * như route trên. Ở các route quản trị thì `KHONG_TIM_THAY` là 404, vì ở đó
   * người gọi đã là OWNER và đã được phép biết ai có trong bảng.
   */
  .post(
    "/staff/password-reset/confirm",
    async ({ body, status }) => {
      const res = await doiMatKhauBangMa(resetDeps, body.email, body.code, body.matKhauMoi);
      if (!res.ok) return status(400, loi(res.reason));
      return status(200, { ok: true });
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        code: t.String({ minLength: 6, maxLength: 6 }),
        // Chính sách mật khẩu thật do SuperTokens giữ (`MAT_KHAU_YEU`). 8 ký tự ở
        // đây chỉ để chặn thân request rỗng — KHÔNG nhân bản luật sang tầng này,
        // hai bản luật sẽ lệch nhau ở lần đầu một trong hai được sửa.
        matKhauMoi: t.String({ minLength: 8 }),
      }),
      response: { 200: okSchema, 400: loiSchema },
    },
  );
