import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import supertokens from "supertokens-node";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";
import { client } from "../db";
import {
  doiMatKhauBangMa,
  type PasswordResetDeps,
  taoMaDatLaiMatKhau,
} from "../services/password-reset";
import { disableStaff, type StaffDeps } from "../services/staff";
import { auth } from "./auth";
import { staffGuard } from "./staff-guard";

/**
 * Thu hồi session TỨC THÌ — cạnh mà `Session.revokeAllSessionsForUser` một mình
 * KHÔNG giữ được.
 *
 * Đo 2026-08-11, trước bản sửa, với đúng cookie cũ sau khi đổi mật khẩu:
 * `/auth/session/refresh` → 401, `supertokens.session_info` → 0 hàng, nhưng
 * `/staff/me` → **200**. Access token là JWT tự xác thực cục bộ nên nó sống tới
 * khi hết hạn (mặc định 1 giờ). Cột `staff_users.sessions_invalid_before` là thứ
 * đóng nốt vế đó.
 *
 * Vì vậy file này đi qua SuperTokens THẬT + Postgres THẬT, không mock: chỗ hỏng
 * nằm đúng ở chỗ ghép giữa token do core cấp và hàng DB do ta ghi — thứ mà mock
 * sẽ che mất. Ba service (`doiMatKhauBangMa`, `disableStaff`) được gọi với deps
 * THẬT, đúng bộ mà `routes/staff.ts` dựng, nên test cũng khoá luôn việc chúng
 * còn đóng dấu hay không.
 */

// Tiền tố riêng cho file này — `bun test` chạy mọi file trong CÙNG một tiến trình
// và không hứa thứ tự, nên dùng chung `ztest-` với staff.test.ts là hai file dọn
// mất dữ liệu của nhau giữa chừng.
const P = "ztest-thuhoi-";
const EMAIL = `${P}nv@v9.vn`;
const EMAIL_GIAY = `${P}giay@v9.vn`;
const EMAIL_KHOA = `${P}bikhoa@v9.vn`;
const EMAIL_OWNER = `${P}owner@v9.vn`;
const EMAILS = [EMAIL, EMAIL_GIAY, EMAIL_KHOA, EMAIL_OWNER];
// Phải qua policy mặc định của SuperTokens (>= 8 ký tự, có chữ và số).
const MAT_KHAU = "matkhau-test-2026";
const MAT_KHAU_MOI = "matkhau-moi-2026";

/**
 * Fixture mô phỏng đúng topology của `index.ts`: `auth` → `staffGuard` → route
 * nghiệp vụ trong plugin RIÊNG. Không import `routes/staff.ts` được — boundaries
 * không có policy `api-plugins → api-routes` — nên hai đường dẫn dưới đây là bản
 * sao đường dẫn, không phải bản sao handler:
 *   • `/staff/me` nằm trong `CAN_SESSION_KHONG_CAN_ACTIVE` (ngoại lệ duy nhất)
 *   • `/rentals-gia` là route thường, đòi session + ACTIVE
 * Cần cả hai: phép kiểm thu hồi phải đứng TRƯỚC cả ngoại lệ kia, nếu không màn
 * "chờ duyệt" thành cửa hậu cho token đã bị thu hồi.
 */
const fixture = new Elysia({ name: "fixture-thu-hoi" })
  .get("/staff/me", () => ({ ok: true }))
  .get("/rentals-gia", () => ({ ok: true }));

const app = new Elysia().use(auth).use(staffGuard).use(fixture);

const formFields = (fields: Record<string, string>) => ({
  formFields: Object.entries(fields).map(([id, value]) => ({ id, value })),
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

const get = (path: string, cookie: string) =>
  app.handle(new Request(`http://localhost${path}`, { headers: { cookie } }));

/** `name=value` của từng Set-Cookie, ghép lại thành header `Cookie` gửi đi. */
const thanhHeaderCookie = (setCookies: readonly string[]): string =>
  setCookies.map((c) => c.split(";", 1)[0] ?? "").join("; ");

/**
 * Đăng nhập thật và trả về header `Cookie` dùng được.
 *
 * ⚠️ `st-auth-mode: cookie` là BẮT BUỘC, không phải trang trí: thiếu nó
 * SuperTokens trả token qua header và KHÔNG phát `Set-Cookie` nào — mọi bài dưới
 * sẽ 401 vì "không có cookie", tức xanh/đỏ vì lý do hoàn toàn khác.
 */
async function dangNhap(email: string, matKhau: string): Promise<string> {
  const res = await post("/auth/signin", formFields({ email, password: matKhau }), {
    "st-auth-mode": "cookie",
  });
  expect(await res.json()).toMatchObject({ status: "OK" });
  const cookies = res.headers.getSetCookie();
  expect(cookies.some((c) => c.startsWith("sAccessToken="))).toBe(true);
  return thanhHeaderCookie(cookies);
}

/**
 * Chờ qua biên giây kế tiếp.
 *
 * ⚠️ KHÔNG phải "sleep cho hết flaky". Đây là điều kiện ngữ nghĩa của chính cơ
 * chế: guard so `iat` (giây) với mốc thu hồi ĐÃ CẮT xuống giây, nên token cấp
 * trong CÙNG GIÂY với lúc đóng dấu **cố ý** sống sót — đó là cái giá phải trả để
 * người vừa đổi mật khẩu xong đăng nhập lại được ngay (xem `tokenDaBiThuHoi`).
 * Một bài test chạy hết trong vài chục mili giây rơi đúng vào cửa sổ đó và sẽ
 * đỏ/xanh tuỳ vị trí của nó so với biên giây — đã gặp thật: lần chạy đầu, bài
 * `disableStaff` nhận 403 thay vì 401 vì đăng nhập và đóng dấu cùng một giây.
 *
 * Kẻ tấn công ngoài đời cầm token cũ hàng phút nên không hưởng cửa sổ này; test
 * thì phải tự đẩy mình ra khỏi nó, tường minh, thay vì hy vọng.
 */
const choSangGiayMoi = () => Bun.sleep(1000 - (Date.now() % 1000) + 50);

/** Đăng ký rồi kéo hàng `staff_users` lên ACTIVE — guard đòi ACTIVE cho route thường. */
async function taoNhanVien(email: string, role = "STAFF"): Promise<string> {
  const res = await post(
    "/auth/signup",
    formFields({ email, password: MAT_KHAU, hoTen: "Người Kiểm Thử Thu Hồi" }),
  );
  expect(await res.json()).toMatchObject({ status: "OK" });
  // `client` (Bun.SQL, element `api-infra`) chứ không Drizzle + `schema`:
  // boundaries cấm `api-plugins` chạm element `db`, và không service nào phơi
  // hàm "đặt thẳng trạng thái" — đúng như thiết kế.
  const rows: { id: string }[] = await client`
    UPDATE staff_users SET status = 'ACTIVE', role = ${role} WHERE email = ${email} RETURNING id
  `;
  const id = rows[0]?.id;
  expect(id).toBeString();
  return id ?? "";
}

/**
 * `iat` đọc thẳng từ JWT trong cookie — cùng con số mà guard đọc, nên bài dưới
 * đo đúng thứ nó tuyên bố đo thay vì một mốc thời gian tự chế.
 *
 * Ném thay vì trả `null`: hình dạng token đổi là chuyện phải nổ to, không phải
 * chuyện để một bài test lặng lẽ đổi sang đo cái khác.
 */
function docIatTuCookie(cookie: string): number {
  const jwt = /sAccessToken=([^;]+)/.exec(cookie)?.[1];
  const than = decodeURIComponent(jwt ?? "").split(".")[1] ?? "";
  const payload: unknown = JSON.parse(Buffer.from(than, "base64url").toString("utf8"));
  if (typeof payload !== "object" || payload === null) throw new Error("payload không phải object");
  if (!("iat" in payload) || typeof payload.iat !== "number") {
    throw new Error("Access token không mang `iat` kiểu số — hình dạng token đã đổi");
  }
  return payload.iat;
}

const docMoc = async (id: string): Promise<Date | null> => {
  const rows: { sessions_invalid_before: Date | null }[] = await client`
    SELECT sessions_invalid_before FROM staff_users WHERE id = ${id}
  `;
  return rows[0]?.sessions_invalid_before ?? null;
};

/**
 * Deps THẬT — cùng bộ `routes/staff.ts` dựng. Dùng spy ở đây thì test chỉ chứng
 * minh chính nó: cái cần giữ là "đổi mật khẩu xong thì token cũ chết", mà mắt
 * xích là SuperTokens thật.
 */
const revokeSessions = (userId: string) => Session.revokeAllSessionsForUser(userId);

const resetDeps: PasswordResetDeps = {
  taoTokenDatLai: (userId, email) =>
    EmailPassword.createResetPasswordToken("public", userId, email),
  doiMatKhauBangToken: (token, matKhauMoi) =>
    EmailPassword.resetPasswordUsingToken("public", token, matKhauMoi),
  revokeSessions,
};
const staffDeps: StaffDeps = { revokeSessions };

// Dọn ở CẢ beforeAll lẫn afterAll: afterAll không chạy khi lần trước bị Ctrl-C,
// và một user `ztest-thuhoi-` sót lại làm `/auth/signup` trả EMAIL_ALREADY_EXISTS.
const clean = async () => {
  for (const email of EMAILS) {
    for (const user of await supertokens.listUsersByAccountInfo("public", { email })) {
      await supertokens.deleteUser(user.id);
    }
  }
  await client`DELETE FROM staff_users WHERE email LIKE ${`${P}%`}`;
};

beforeAll(clean);
afterAll(clean);

describe("đổi mật khẩu ngắt session đang mở", () => {
  it("cookie cũ chết NGAY, và người vừa đổi đăng nhập lại được ngay", async () => {
    const id = await taoNhanVien(EMAIL);
    const cookieCu = await dangNhap(EMAIL, MAT_KHAU);

    // Vế đối chứng, bắt buộc có trước: nếu cookie này vốn đã không vào được thì
    // cái 401 bên dưới không chứng minh gì cả.
    expect((await get("/staff/me", cookieCu)).status).toBe(200);
    expect((await get("/rentals-gia", cookieCu)).status).toBe(200);

    const ma = await taoMaDatLaiMatKhau(id);
    await choSangGiayMoi();
    expect(await doiMatKhauBangMa(resetDeps, EMAIL, ma, MAT_KHAU_MOI)).toEqual({ ok: true });
    expect(await docMoc(id)).toBeInstanceOf(Date);

    // ĐÂY là assertion của cả task. Trước bản sửa, dòng này ra 200: refresh token
    // đã chết nhưng access token trong cookie thì chưa.
    const me = await get("/staff/me", cookieCu);
    expect(me.status).toBe(401);
    expect(await me.json()).toMatchObject({ code: "PHIEN_HET_HIEU_LUC" });
    // `/staff/me` là ngoại lệ "cần session, không cần ACTIVE" — phép kiểm thu hồi
    // phải đứng TRƯỚC nó, nếu không đây là cửa hậu.
    expect((await get("/rentals-gia", cookieCu)).status).toBe(401);

    // 401 chứ không 403: chỉ 401 mới khiến `supertokens-web-js` đi refresh, và
    // refresh thất bại mới là thứ dọn session rác trong trình duyệt.
    expect(me.status).not.toBe(403);

    // Chống hồi quy cho cạm bẫy độ phân giải giây: đăng nhập lại NGAY LẬP TỨC
    // bằng mật khẩu mới phải vào được. Bài này thật nhưng phụ thuộc đồng hồ (chỉ
    // đỏ khi lần đăng nhập rơi đúng vào cùng giây với lúc đóng dấu); bản khoá
    // cạnh này một cách tất định là `tokenDaBiThuHoi` ở `staff-guard.test.ts` và
    // bài "mốc lệch dưới một giây" ngay dưới.
    const cookieMoi = await dangNhap(EMAIL, MAT_KHAU_MOI);
    expect((await get("/staff/me", cookieMoi)).status).toBe(200);
    expect((await get("/rentals-gia", cookieMoi)).status).toBe(200);
  });

  /**
   * Cạm bẫy giây, đo bằng TOKEN THẬT thay vì số cố định — và tất định.
   *
   * Đọc `iat` ra khỏi chính cookie vừa nhận, rồi đặt mốc thu hồi trễ hơn đúng
   * 500ms so với biên giây của `iat`. Đó chính xác là hoàn cảnh "đóng dấu lúc
   * 10:00:00.500, đăng nhập lại lúc 10:00:00.900": guard PHẢI cho qua.
   *
   * Bỏ `Math.floor(...)` trong `tokenDaBiThuHoi` thì bài này đỏ, mọi lần chạy.
   */
  it("mốc thu hồi trễ hơn iat dưới một giây → token vẫn dùng được", async () => {
    const id = await taoNhanVien(EMAIL_GIAY);
    const cookie = await dangNhap(EMAIL_GIAY, MAT_KHAU);
    const iat = docIatTuCookie(cookie);

    await client`
      UPDATE staff_users SET sessions_invalid_before = to_timestamp(${iat}) + interval '500 milliseconds'
      WHERE id = ${id}
    `;
    expect((await get("/staff/me", cookie)).status).toBe(200);

    // Vế đối chứng: lùi mốc sang giây KẾ TIẾP thì đúng cookie đó phải chết. Thiếu
    // dòng này thì "guard không kiểm gì cả" cũng qua được bài trên.
    await client`
      UPDATE staff_users SET sessions_invalid_before = to_timestamp(${iat} + 1)
      WHERE id = ${id}
    `;
    expect((await get("/staff/me", cookie)).status).toBe(401);
  });
});

describe("khoá tài khoản cũng ngắt session đang mở", () => {
  it("disableStaff đóng dấu, và cookie cũ ra 401 chứ không 403", async () => {
    const ownerId = await taoNhanVien(EMAIL_OWNER, "OWNER");
    const id = await taoNhanVien(EMAIL_KHOA);
    const cookieCu = await dangNhap(EMAIL_KHOA, MAT_KHAU);
    expect((await get("/staff/me", cookieCu)).status).toBe(200);

    await choSangGiayMoi();
    expect(await disableStaff(staffDeps, ownerId, id)).toEqual({ ok: true });
    expect(await docMoc(id)).toBeInstanceOf(Date);

    // `status = 'DISABLED'` một mình đã ra 403 DA_KHOA — nên 401 ở đây là bằng
    // chứng phép kiểm thu hồi chạy TRƯỚC phép kiểm trạng thái. Chủ đích: token
    // cấp trước mốc không còn là credential, và câu hỏi đó thuộc tầng xác thực,
    // phải trả lời trước mọi câu hỏi về quyền.
    const res = await get("/staff/me", cookieCu);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "PHIEN_HET_HIEU_LUC" });

    // Và thông điệp "đã bị khoá" KHÔNG mất — nó tới sau một vòng đăng nhập, vì
    // SuperTokens không biết gì về `staff_users`.
    const cookieMoi = await dangNhap(EMAIL_KHOA, MAT_KHAU);
    const sauKhiDangNhapLai = await get("/staff/me", cookieMoi);
    expect(sauKhiDangNhapLai.status).toBe(403);
    expect(await sauKhiDangNhapLai.json()).toMatchObject({ code: "DA_KHOA" });
  });
});
