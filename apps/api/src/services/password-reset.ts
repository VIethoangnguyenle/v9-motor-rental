import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@v9/db";
import { db } from "../db";
import { env } from "../env";

const HAN_DUNG_MS = 10 * 60 * 1000;
const SO_LAN_TOI_DA = 5;

/**
 * Deps là tham số (pattern 2 của repo), y như `StaffDeps` ở `staff.ts` và vì đúng
 * cùng một lý do: `supertokens-node` đòi `supertokens.init()` chạy trước, init đó
 * nằm ở `plugins/auth.ts`, và `services/` bị ESLint cấm import `plugins/`. Gọi thẳng
 * `EmailPassword.*` ở đây thì unit test nổ "SuperTokens must be initialized" và cả
 * file này thành thứ chỉ chạy được khi có SuperTokens sống.
 *
 * Route — nơi được phép chạm cả hai tầng — truyền hàm thật vào; test truyền spy.
 */
export interface PasswordResetDeps {
  /** Ở prod: `EmailPassword.createResetPasswordToken("public", userId, email)`. */
  readonly taoTokenDatLai: (
    userId: string,
    email: string,
  ) => Promise<{ status: string; token?: string }>;
  /** Ở prod: `EmailPassword.resetPasswordUsingToken("public", token, matKhauMoi)`. */
  readonly doiMatKhauBangToken: (token: string, matKhauMoi: string) => Promise<{ status: string }>;
  /** Ở prod: `Session.revokeAllSessionsForUser(userId)`. */
  readonly revokeSessions: (userId: string) => Promise<unknown>;
}

/**
 * Chỉ MỘT thứ khác nhau giữa dev và prod. Toàn bộ phần còn lại — băm, hết hạn,
 * đếm lần sai, đổi mã lấy mật khẩu mới — chạy y hệt nhau ở cả hai môi trường.
 * Cố ý KHÔNG làm nhánh `if (ma === "999999") cho qua`: một cửa sau riêng nghĩa là
 * luồng chạy ở prod không phải luồng được test nhiều nhất.
 * §5.2 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * Điều kiện là `NODE_ENV`, KHÔNG phải "SMTP chưa cấu hình" — thiếu SMTP là trạng
 * thái mặc định của một prod mới dựng, và nếu thiếu config bật được mã cố định thì
 * cả shop mở bằng sáu con số. `env.ts` còn ném lúc khởi động nếu `AUTH_DEV_OTP` có
 * mặt ở production.
 *
 * crypto.getRandomValues chứ KHÔNG phải Math.random — mã đoán được là mã không
 * bảo vệ gì, và Math.random không hứa hẹn gì về việc đoán được hay không.
 */
function sinhMa(): string {
  if (!env.isProduction) return env.devOtp;

  // Rejection sampling thay cho `% 1_000_000` thẳng: 2^32 không chia hết cho 10^6
  // nên phép chia dư làm 967.296 giá trị đầu tiên hay gặp hơn phần còn lại. Độ
  // lệch nhỏ, nhưng vòng lặp này rẻ hơn việc để lại một câu hỏi "chỗ này lệch bao
  // nhiêu" trong đoạn code sinh bí mật. Xác suất lặp lại < 0,03%.
  const NGUONG = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0] ?? 0;
  } while (v >= NGUONG);
  return String(v % 1_000_000).padStart(6, "0");
}

/**
 * Trả về **mã thô**. Người gọi quyết định gửi nó đi đâu: email (`services/email.ts`),
 * hay màn hình OWNER để đọc qua Zalo. Service này cố ý không biết đường gửi nào —
 * đường cứu của OWNER phải dùng chung đúng bảng và đúng đường xác minh với đường
 * email, nếu không thì có hai luồng và chỉ một trong hai được test.
 */
export async function taoMaDatLaiMatKhau(staffUserId: string): Promise<string> {
  const ma = sinhMa();
  // Băm TRƯỚC khi mở transaction: `Bun.password.hash` là argon2id, cỡ trăm mili-giây.
  // Băm bên trong transaction là giữ khoá trên các hàng vừa UPDATE suốt ngần ấy thời
  // gian, không đổi lấy được gì — tính nguyên tử ở đây chỉ cần bao hai câu lệnh ghi.
  const codeHash = await Bun.password.hash(ma);

  await db.transaction(async (tx) => {
    // Xin mã mới thì mã cũ chết ngay. Cùng một transaction với INSERT bên dưới, vì
    // nếu chỉ UPDATE thành công rồi INSERT hỏng thì người dùng mất luôn mã đang cầm
    // mà không nhận được mã nào — và nếu INSERT chạy trước khi UPDATE commit thì có
    // lúc hai mã cùng sống, phá bất biến "tối đa MỘT hàng used_at IS NULL" mà partial
    // index `password_reset_codes_active_idx` dựa vào (xem comment ở schema).
    await tx
      .update(schema.passwordResetCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.passwordResetCodes.staffUserId, staffUserId),
          isNull(schema.passwordResetCodes.usedAt),
        ),
      );
    await tx.insert(schema.passwordResetCodes).values({
      staffUserId,
      codeHash,
      expiresAt: new Date(Date.now() + HAN_DUNG_MS),
    });
  });

  return ma;
}

export type KetQuaKiemTra = { ok: true } | { ok: false; reason: "MA_SAI" | "MA_HET_HIEU_LUC" };

/**
 * Ba lý do chết đều trả CÙNG MỘT `MA_HET_HIEU_LUC` — hết hạn, quá số lần, không có
 * mã nào. Phân biệt được ba trạng thái đó là nói cho người đoán mò biết họ đang ở
 * đâu: "còn hạn nhưng sai" khác hẳn "không có mã nào" khi đang dò email của shop.
 */
export async function kiemTraMa(staffUserId: string, ma: string): Promise<KetQuaKiemTra> {
  const [row] = await db
    .select()
    .from(schema.passwordResetCodes)
    .where(
      and(
        eq(schema.passwordResetCodes.staffUserId, staffUserId),
        isNull(schema.passwordResetCodes.usedAt),
      ),
    )
    .orderBy(desc(schema.passwordResetCodes.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: "MA_HET_HIEU_LUC" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "MA_HET_HIEU_LUC" };
  if (row.attempts >= SO_LAN_TOI_DA) return { ok: false, reason: "MA_HET_HIEU_LUC" };

  if (!(await Bun.password.verify(ma, row.codeHash))) {
    // `attempts + 1` tính Ở POSTGRES, không phải `row.attempts + 1` tính ở JS: hai
    // lần đoán chạy song song cùng đọc `attempts = 3` rồi cùng ghi `4` thì kẻ tấn
    // công được thêm lượt miễn phí mỗi lần bắn kèm. Giới hạn 5 lần là hàng rào duy
    // nhất giữa sáu con số và một tài khoản — nó phải đếm đúng khi bị bắn song song.
    await db
      .update(schema.passwordResetCodes)
      .set({ attempts: sql`${schema.passwordResetCodes.attempts} + 1` })
      .where(eq(schema.passwordResetCodes.id, row.id));
    return { ok: false, reason: "MA_SAI" };
  }

  // Đánh dấu đã dùng ngay khi xác minh đúng: mã dùng được một lần, kể cả khi các
  // bước sau (sinh token, đổi mật khẩu) hỏng. Hỏng theo hướng đóng, không mở.
  await db
    .update(schema.passwordResetCodes)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetCodes.id, row.id));
  return { ok: true };
}

/**
 * `null` cho cả hai trường hợp "không có email này" và "người này đang DISABLED":
 * người bị khoá không được tự mở lại tài khoản bằng luồng quên mật khẩu, và người
 * gọi không cần phân biệt hai ca — route trả cùng một 200 chung chung để không ai
 * dò được shop có những email nào (§5.1 design doc).
 */
export async function timStaffTheoEmail(email: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: schema.staffUsers.id, status: schema.staffUsers.status })
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.email, email));
  if (!row) return null;
  if (row.status === "DISABLED") return null;
  return { id: row.id };
}

export type KetQuaDoiMatKhau =
  | { ok: true }
  | { ok: false; reason: "MA_SAI" | "MA_HET_HIEU_LUC" | "KHONG_TIM_THAY" | "MAT_KHAU_YEU" };

/**
 * Token đặt lại của SuperTokens được sinh Ở ĐÂY và dùng xong ngay trong CÙNG lời
 * gọi — nó KHÔNG BAO GIỜ được lưu xuống đĩa. Nghĩa là trong database của ta không
 * có chuỗi nào tự nó mở được tài khoản: bảng `password_reset_codes` chỉ chứa bản
 * băm argon2id của sáu con số, hết hạn sau 10 phút và chết sau 5 lần đoán sai.
 * §5.1 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * THỨ TỰ LÀ MỘT YÊU CẦU, không phải chi tiết triển khai: `kiemTraMa` phải chạy
 * xong và trả `ok` TRƯỚC KHI `taoTokenDatLai` được gọi. Sinh token rồi mới kiểm mã
 * là phát ra một credential đặt lại mật khẩu cho kẻ đang đoán mò — kể cả khi hàm
 * này cuối cùng trả về lỗi. Test "mã sai thì không gọi deps nào" khoá đúng điều đó.
 */
export async function doiMatKhauBangMa(
  deps: PasswordResetDeps,
  email: string,
  ma: string,
  matKhauMoi: string,
): Promise<KetQuaDoiMatKhau> {
  const staff = await timStaffTheoEmail(email);
  if (!staff) return { ok: false, reason: "KHONG_TIM_THAY" };

  const check = await kiemTraMa(staff.id, ma);
  if (!check.ok) return check;

  const token = await deps.taoTokenDatLai(staff.id, email);
  // `UNKNOWN_USER_ID_ERROR` là ca thật: hàng trong `staff_users` còn nhưng user bên
  // SuperTokens đã biến mất. Với người dùng thì đó vẫn là "không tìm thấy".
  if (token.status !== "OK" || !token.token) return { ok: false, reason: "KHONG_TIM_THAY" };

  const reset = await deps.doiMatKhauBangToken(token.token, matKhauMoi);
  // Chính sách mật khẩu do SuperTokens giữ, không nhân bản sang đây — hai bản luật
  // sẽ lệch nhau ở lần đầu tiên một trong hai được sửa.
  if (reset.status !== "OK") return { ok: false, reason: "MAT_KHAU_YEU" };

  // Đổi mật khẩu là lúc thu hồi mọi phiên cũ — kể cả phiên đang chạy trên máy kẻ
  // đã chiếm tài khoản. Không thu hồi thì đổi mật khẩu chỉ chặn được lần đăng nhập
  // sau của họ, không chặn phiên họ đang mở.
  await deps.revokeSessions(staff.id);
  return { ok: true };
}
