import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { schema } from "@v9/db";
import { db } from "../db";
import { env } from "../env";
import { revokeAndStamp } from "./staff";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

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
  readonly createResetToken: (
    userId: string,
    email: string,
  ) => Promise<{ status: string; token?: string }>;
  /** Ở prod: `EmailPassword.resetPasswordUsingToken("public", token, newPassword)`. */
  readonly resetPasswordWithToken: (
    token: string,
    newPassword: string,
  ) => Promise<{ status: string }>;
  /** Ở prod: `Session.revokeAllSessionsForUser(userId)`. */
  readonly revokeSessions: (userId: string) => Promise<unknown>;
  /** Ở prod: `EmailPassword.verifyCredentials("public", email, password)`. */
  readonly verifyPassword: (email: string, password: string) => Promise<{ status: string }>;
}

/**
 * Sáu chữ số ngẫu nhiên mã hoá — **đoạn code duy nhất trong repo sinh ra bí mật
 * thật ở production**.
 *
 * Tách khỏi `generateCode()` và export CHỈ để test được. `generateCode()` trả `env.devOtp`
 * ngay dòng đầu ở mọi môi trường không phải production, nên khi nó còn ôm cả phần
 * rejection sampling thì đoạn quan trọng nhất của file này có coverage đúng 0% —
 * không test nào trong repo từng chạy qua nó. Hàm này cố ý KHÔNG đọc `env`: đó là
 * điều kiện để test gọi thẳng, không phải dựng lại `NODE_ENV`.
 *
 * crypto.getRandomValues chứ KHÔNG phải Math.random — mã đoán được là mã không
 * bảo vệ gì, và Math.random không hứa hẹn gì về việc đoán được hay không.
 *
 * Trả **chuỗi** đã `padStart`, không phải số: `"000123"` là mã hợp lệ, và một số
 * `123` đánh mất ba chữ số 0 ở đầu. Người gọi không được parse nó thành số.
 */
export function generateRandomCode(): string {
  // Rejection sampling thay cho `% 1_000_000` thẳng: 2^32 không chia hết cho 10^6
  // nên phép chia dư làm 967.296 giá trị đầu tiên hay gặp hơn phần còn lại. Độ
  // lệch nhỏ, nhưng vòng lặp này rẻ hơn việc để lại một câu hỏi "chỗ này lệch bao
  // nhiêu" trong đoạn code sinh bí mật. Xác suất lặp lại < 0,03%.
  const THRESHOLD = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0] ?? 0;
  } while (v >= THRESHOLD);
  return String(v % 1_000_000).padStart(6, "0");
}

/**
 * Chỉ MỘT thứ khác nhau giữa dev và prod. Toàn bộ phần còn lại — băm, hết hạn,
 * đếm lần sai, đổi mã lấy mật khẩu mới — chạy y hệt nhau ở cả hai môi trường.
 * Cố ý KHÔNG làm nhánh `if (code === "999999") cho qua`: một cửa sau riêng nghĩa là
 * luồng chạy ở prod không phải luồng được test nhiều nhất.
 * §5.2 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * Điều kiện là `NODE_ENV`, KHÔNG phải "SMTP chưa cấu hình" — thiếu SMTP là trạng
 * thái mặc định của một prod mới dựng, và nếu thiếu config bật được mã cố định thì
 * cả shop mở bằng sáu con số. `env.ts` còn ném lúc khởi động nếu `AUTH_DEV_OTP` có
 * mặt ở production.
 */
function generateCode(): string {
  if (!env.isProduction) return env.devOtp;
  return generateRandomCode();
}

/**
 * Trả về **mã thô**. Người gọi quyết định gửi nó đi đâu: email (`services/email.ts`),
 * hay màn hình OWNER để đọc qua Zalo. Service này cố ý không biết đường gửi nào —
 * đường cứu của OWNER phải dùng chung đúng bảng và đúng đường xác minh với đường
 * email, nếu không thì có hai luồng và chỉ một trong hai được test.
 */
export async function createResetCode(staffUserId: string): Promise<string> {
  const code = generateCode();
  // Băm TRƯỚC khi mở transaction: `Bun.password.hash` là argon2id, cỡ trăm mili-giây.
  // Băm bên trong transaction là giữ khoá trên các hàng vừa UPDATE suốt ngần ấy thời
  // gian, không đổi lấy được gì — tính nguyên tử ở đây chỉ cần bao hai câu lệnh ghi.
  const codeHash = await Bun.password.hash(code);

  await db.transaction(async (tx) => {
    // KHOÁ hàng `staff_users` của chính người này TRƯỚC, rồi mới UPDATE + INSERT.
    //
    // Một transaction bao hai câu ghi là ĐIỀU KIỆN CẦN NHƯNG KHÔNG ĐỦ cho bất biến
    // "tối đa MỘT hàng used_at IS NULL". Mức cô lập mặc định là READ COMMITTED: câu
    // `UPDATE ... SET used_at` của T2 chỉ nhìn thấy các hàng đã commit tại thời điểm
    // nó bắt đầu, nên hàng T1 vừa INSERT (chưa commit) KHÔNG bị nó đánh dấu — hai
    // transaction cùng UPDATE "không có hàng nào", cùng INSERT, và cùng commit. Đo
    // thật trước khi có dòng khoá này: 8 lời gọi song song để lại 5 mã cùng sống.
    //
    // Hậu quả không chỉ là rác: `verifyCode` lấy đúng hàng MỚI NHẤT, nên các mã kia
    // vô hiệu với chính nhân viên đã nhận email chứa chúng. Và nó phá đúng bất biến
    // mà comment của `password_reset_codes_active_idx` nói index dựa vào.
    //
    // `FOR UPDATE` trên hàng staff_users tuần tự hoá hai lời gọi cho CÙNG một người
    // — T2 chờ T1 commit rồi mới đọc lại, lúc đó mã của T1 đã hiện ra và bị đánh
    // dấu — trong khi hai người khác nhau khoá hai hàng khác nhau nên không đụng
    // nhau. Cùng mẫu với `activeOwnersLockedQuery` ở `services/staff.ts`; và cũng
    // như ở đó, khoá PHẢI đặt qua `tx`, không phải `db`: gọi bằng `db` trong callback
    // của `db.transaction` mở một connection KHÁC và khoá đặt trên đó vô nghĩa.
    //
    // Không cần migration cho cách này — một unique index thật trên
    // `(staff_user_id) WHERE used_at IS NULL` cũng ép được bất biến, nhưng đổi lại
    // là một migration cộng với việc mọi lời gọi phải xử lý `23505`.
    await tx
      .select({ id: schema.staffUsers.id })
      .from(schema.staffUsers)
      .where(eq(schema.staffUsers.id, staffUserId))
      .for("update");

    // Xin mã mới thì mã cũ chết ngay. Cùng một transaction với INSERT bên dưới, vì
    // nếu chỉ UPDATE thành công rồi INSERT hỏng thì người dùng mất luôn mã đang cầm
    // mà không nhận được mã nào.
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
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
  });

  return code;
}

export type VerifyCodeResult = { ok: true } | { ok: false; reason: "WRONG_CODE" | "CODE_EXPIRED" };

/**
 * Ba lý do chết đều trả CÙNG MỘT `CODE_EXPIRED` — hết hạn, quá số lần, không có
 * mã nào. Phân biệt được ba trạng thái đó là nói cho người đoán mò biết họ đang ở
 * đâu: "còn hạn nhưng sai" khác hẳn "không có mã nào" khi đang dò email của shop.
 *
 * ⚠️ CỔNG "còn lượt không" NẰM TRONG CHÍNH CÂU UPDATE, và chạy TRƯỚC `verify`.
 * Đây là điểm quan trọng nhất của hàm, đừng tách nó ra thành `if` ở JS cho "dễ đọc".
 *
 * Bản trước đọc `attempts` bằng SELECT, chạy `Bun.password.verify` (argon2id, ~115ms),
 * rồi mới UPDATE — check-then-act không khoá. Mọi request lọt vào cửa sổ ~115ms đó
 * đều đọc cùng một `attempts` cũ và đều đi qua cổng. Đo thật trên cùng một mã:
 *
 *     SONG SONG N=20: WRONG_CODE=20  CODE_EXPIRED=0   attempts_cuoi=20
 *     TUẦN TỰ  N=20: WRONG_CODE=5   CODE_EXPIRED=15  attempts_cuoi=5
 *
 * Tức là giới hạn 5 lần — hàng rào DUY NHẤT giữa sáu con số và một tài khoản — chỉ
 * tồn tại với kẻ tấn công chịu xếp hàng. Bộ đếm vẫn tăng đúng bằng SQL (`attempts + 1`
 * tính ở Postgres, không phải ở JS); **đếm đúng ≠ chặn đúng**, và comment cũ ở đây
 * tuyên bố nhầm cái thứ hai từ cái thứ nhất.
 *
 * Dồn cả bốn điều kiện vào `WHERE` làm cổng thành nguyên tử: Postgres khoá hàng theo
 * từng câu UPDATE, và ở READ COMMITTED câu bị chặn sẽ ĐỌC LẠI hàng rồi áp lại `WHERE`
 * sau khi câu trước commit — nên `attempts < 5` được đánh giá trên giá trị mới nhất,
 * không phải trên snapshot cũ. Không có hàng trả về ⇒ hết lượt / hết hạn / đã dùng.
 *
 * Lợi ích thứ hai, không nhỏ: argon2id (64MB, ~115ms) không còn chạy cho mã đã cạn
 * lượt, nên endpoint này thôi là vòi CPU miễn phí. Rate limit theo IP vẫn là việc
 * riêng còn thiếu.
 */
export async function verifyCode(staffUserId: string, code: string): Promise<VerifyCodeResult> {
  const [latest] = await db
    .select({ id: schema.passwordResetCodes.id })
    .from(schema.passwordResetCodes)
    .where(
      and(
        eq(schema.passwordResetCodes.staffUserId, staffUserId),
        isNull(schema.passwordResetCodes.usedAt),
      ),
    )
    .orderBy(desc(schema.passwordResetCodes.createdAt))
    .limit(1);

  if (!latest) return { ok: false, reason: "CODE_EXPIRED" };

  // Câu này VỪA tiêu một lượt VỪA quyết định có được đoán hay không — một lần chạm
  // DB, không có khe hở giữa đọc và ghi. `expires_at > now()` để Postgres tự so giờ:
  // so bằng `Date.now()` ở JS là lấy đồng hồ của một máy khác với máy đã ghi hàng.
  const [row] = await db
    .update(schema.passwordResetCodes)
    .set({ attempts: sql`${schema.passwordResetCodes.attempts} + 1` })
    .where(
      and(
        eq(schema.passwordResetCodes.id, latest.id),
        lt(schema.passwordResetCodes.attempts, MAX_ATTEMPTS),
        isNull(schema.passwordResetCodes.usedAt),
        gt(schema.passwordResetCodes.expiresAt, sql`now()`),
      ),
    )
    .returning({ codeHash: schema.passwordResetCodes.codeHash });

  if (!row) return { ok: false, reason: "CODE_EXPIRED" };

  // `attempts` tăng cả khi đoán ĐÚNG. Chấp nhận được: mã chết ngay ở câu UPDATE
  // dưới đây, nên cái lượt vừa tiêu không còn ai dùng tới.
  if (!(await Bun.password.verify(code, row.codeHash))) return { ok: false, reason: "WRONG_CODE" };

  // Đánh dấu đã dùng ngay khi xác minh đúng: mã dùng được một lần, kể cả khi các
  // bước sau (sinh token, đổi mật khẩu) hỏng. Hỏng theo hướng đóng, không mở.
  await db
    .update(schema.passwordResetCodes)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetCodes.id, latest.id));
  return { ok: true };
}

/**
 * `null` cho cả hai trường hợp "không có email này" và "người này đang DISABLED":
 * người bị khoá không được tự mở lại tài khoản bằng luồng quên mật khẩu, và người
 * gọi không cần phân biệt hai ca — route trả cùng một 200 chung chung để không ai
 * dò được shop có những email nào (§5.1 design doc).
 *
 * So bằng `lower(...)` ở CẢ HAI vế, không phải `eq`: `supertokens-node` chỉ
 * `.trim()` form field lúc đăng ký/đăng nhập, không hạ hoa thường, nên nhân viên
 * gõ `Nguyen@V9.VN` mà hồ sơ lưu `nguyen@v9.vn` phải vẫn tìm ra được. Khớp đúng
 * biểu thức của `staff_users_email_lower_idx` (migration `0011`) nên vẫn đi qua
 * index, không phải full scan.
 */
export async function findStaffByEmail(email: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: schema.staffUsers.id, status: schema.staffUsers.status })
    .from(schema.staffUsers)
    .where(sql`lower(${schema.staffUsers.email}) = lower(${email})`);
  if (!row) return null;
  if (row.status === "DISABLED") return null;
  return { id: row.id };
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: "WRONG_CODE" | "CODE_EXPIRED" | "NOT_FOUND" | "WEAK_PASSWORD" };

/**
 * Token đặt lại của SuperTokens được sinh Ở ĐÂY và dùng xong ngay trong CÙNG lời
 * gọi — nó KHÔNG BAO GIỜ được lưu xuống đĩa. Nghĩa là trong database của ta không
 * có chuỗi nào tự nó mở được tài khoản: bảng `password_reset_codes` chỉ chứa bản
 * băm argon2id của sáu con số, hết hạn sau 10 phút và chết sau 5 lần đoán sai.
 * §5.1 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * THỨ TỰ LÀ MỘT YÊU CẦU, không phải chi tiết triển khai: `verifyCode` phải chạy
 * xong và trả `ok` TRƯỚC KHI `createResetToken` được gọi. Sinh token rồi mới kiểm mã
 * là phát ra một credential đặt lại mật khẩu cho kẻ đang đoán mò — kể cả khi hàm
 * này cuối cùng trả về lỗi. Test "mã sai thì không gọi deps nào" khoá đúng điều đó.
 */
export async function resetPasswordWithCode(
  deps: PasswordResetDeps,
  email: string,
  code: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const staff = await findStaffByEmail(email);
  if (!staff) return { ok: false, reason: "NOT_FOUND" };

  const check = await verifyCode(staff.id, code);
  if (!check.ok) return check;

  const token = await deps.createResetToken(staff.id, email);
  // `UNKNOWN_USER_ID_ERROR` là ca thật: hàng trong `staff_users` còn nhưng user bên
  // SuperTokens đã biến mất. Với người dùng thì đó vẫn là "không tìm thấy".
  if (token.status !== "OK" || !token.token) return { ok: false, reason: "NOT_FOUND" };

  const reset = await deps.resetPasswordWithToken(token.token, newPassword);
  // Chính sách mật khẩu do SuperTokens giữ, không nhân bản sang đây — hai bản luật
  // sẽ lệch nhau ở lần đầu tiên một trong hai được sửa.
  if (reset.status !== "OK") return { ok: false, reason: "WEAK_PASSWORD" };

  // ⚠️ MỘT lời gọi, không phải hai lời gọi rời — `revokeAndStamp` (services/staff.ts)
  // tự khoá thứ tự bên trong nó, và từ ngoài không còn cách nào gọi thiếu một vế.
  //
  // Số đo dưới đây giữ lại vì nó là lý do vế thứ hai (đóng dấu) tồn tại. Đo
  // 2026-08-11, trên stack thật, với đúng cookie cũ, khi chỗ này CHỈ có
  // `revokeSessions` (chưa có `revokeAndStamp`):
  //
  //   /auth/session/refresh với cookie cũ  → 401  (refresh token chết ngay)
  //   supertokens.session_info của user    → 0 hàng
  //   /staff/me với cùng cookie cũ         → 200  ← VẪN SỐNG
  //
  // Access token của SuperTokens là JWT tự xác thực cục bộ; `getSession` không hỏi
  // core trừ khi truyền `checkDatabase: true` — mà cờ đó bắt MỌI request được bảo
  // vệ phải gọi sang core, tức đổi một lỗ hổng lấy một phụ thuộc cứng trên đường
  // nóng nhất. Nên kẻ đang cầm token không gia hạn được nữa, nhưng vẫn dùng được
  // tới khi token hết hạn (mặc định 1 giờ) — đó là vế `revokeAndStamp` đóng nốt.
  // Vì sao cả hai vế đều cần và vì sao thứ tự revoke-trước-đóng-dấu-sau là bắt
  // buộc: xem `revokeAndStamp`.
  await revokeAndStamp(deps, staff.id);
  return { ok: true };
}

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      reason: "SAME_PASSWORD" | "WRONG_CURRENT_PASSWORD" | "NOT_FOUND" | "WEAK_PASSWORD";
    };

/**
 * Đường thứ hai để đổi mật khẩu, dành cho người ĐANG đăng nhập — khác
 * `resetPasswordWithCode` ở chỗ không cần mã 6 số, chỉ cần đang cầm session hợp lệ
 * và gõ đúng mật khẩu hiện tại.
 *
 * `deps.verifyPassword` phải là `EmailPassword.verifyCredentials`, KHÔNG phải
 * `signIn`: `verifyCredentials` chỉ so mật khẩu, không tạo session mới. Dùng
 * `signIn` ở đây sẽ âm thầm cấp thêm một session bên cạnh session người dùng đang
 * có sẵn — cái giá không ai cần trả chỉ để kiểm một mật khẩu.
 *
 * Check "mật khẩu mới trùng mật khẩu cũ" đứng ĐẦU TIÊN, trước cả `verifyPassword`
 * — không phải để tối ưu tốc độ (dù argon2id ~115ms mỗi lần cũng không rẻ), mà vì
 * mọi bước sau nó đều có khả năng thu hồi session. Đổi mật khẩu thành chính nó rồi
 * bị đá ra ngoài là một sự kiện gây hoang mang không cần thiết — chặn nó trước khi
 * chạm bất cứ deps nào là cách duy nhất đảm bảo nó không xảy ra.
 *
 * Tái dùng `createResetToken` + `resetPasswordWithToken` của đường quên-mật-khẩu
 * thay vì gọi một API khác của SuperTokens: chính sách mật khẩu (độ dài, độ mạnh)
 * nhờ vậy chỉ nằm ở đúng MỘT chỗ — bên trong SuperTokens — nên `WEAK_PASSWORD` ở
 * đây đọc thẳng từ `status` của lời gọi reset, không phải một kiểm tra độ dài viết
 * tay có thể lệch với luật thật.
 *
 * ⚠️ `staff.email` là BẢN SAO (quyết định ① của ADR auth: SuperTokens giữ email
 * gốc, `staff_users.email` chỉ mirror). Nếu hai nơi từng lệch nhau, `verifyPassword`
 * sẽ báo sai và người dùng bị chặn đổi mật khẩu — hỏng theo hướng đóng, chấp nhận
 * được, nhưng không ghi lại thì người debug sau này sẽ mất cả buổi chiều đoán vì
 * sao mật khẩu đúng mà vẫn báo sai.
 */
export async function changePassword(
  deps: PasswordResetDeps,
  staff: { id: string; email: string },
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  if (currentPassword === newPassword) return { ok: false, reason: "SAME_PASSWORD" };

  const verify = await deps.verifyPassword(staff.email, currentPassword);
  if (verify.status !== "OK") return { ok: false, reason: "WRONG_CURRENT_PASSWORD" };

  const token = await deps.createResetToken(staff.id, staff.email);
  if (token.status !== "OK" || !token.token) return { ok: false, reason: "NOT_FOUND" };

  const reset = await deps.resetPasswordWithToken(token.token, newPassword);
  if (reset.status !== "OK") return { ok: false, reason: "WEAK_PASSWORD" };

  await revokeAndStamp(deps, staff.id);
  return { ok: true };
}
