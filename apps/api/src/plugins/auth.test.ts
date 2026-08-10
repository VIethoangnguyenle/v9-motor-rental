import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import supertokens from "supertokens-node";
import { client } from "../db";
import { auth } from "./auth";

/**
 * Giữ đúng MỘT thứ: route `/auth/*` phải chuyển cookie của SuperTokens ra ngoài.
 *
 * `CollectingResponse` cất cookie ở mảng `.cookies` chứ không nhét vào `.headers`,
 * nên bản đầu của `auth.ts` dựng `Response` từ `.headers` là đủ để nuốt sạch
 * `Set-Cookie`: `/auth/signin` trả `{"status":"OK"}`, không lỗi ở đâu cả, mà
 * trình duyệt không bao giờ có session. Lỗi này sống qua cả đợt scaffold vì
 * chưa có màn hình đăng nhập nào chạm vào nó.
 *
 * Vì vậy test đăng nhập THẬT (SuperTokens core + Postgres), không giả lập: chỗ
 * hỏng nằm đúng ở đường ghép giữa adapter và Response, thứ mà mock sẽ che mất.
 */

// Tiền tố riêng cho file này. `bun test` chạy nhiều file trong CÙNG một tiến
// trình và không hứa thứ tự, nên dùng chung `ztest-` với staff.test.ts /
// password-reset.test.ts là hai file dọn mất dữ liệu của nhau giữa chừng.
const P = "ztest-auth-";
const EMAIL = `${P}signin@v9.vn`;
// Mật khẩu phải qua policy mặc định của SuperTokens (>= 8 ký tự, có chữ và số).
const PASSWORD = "matkhau-test-2026";

/**
 * Chỉ nối `auth`, KHÔNG dựng cả `index.ts`: import file đó chạy `.listen()` ở
 * thân module và sẽ chiếm cổng 3001 mỗi lần chạy test.
 */
const app = new Elysia().use(auth);

/** SuperTokens nhận `formFields`, không nhận JSON phẳng. */
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

/**
 * Dọn ở CẢ beforeAll lẫn afterAll: afterAll không chạy khi lần trước bị Ctrl-C,
 * và một user `ztest-auth-` sót lại làm `/auth/signup` trả EMAIL_ALREADY_EXISTS.
 *
 * Xoá theo email chứ không theo id: user SuperTokens mang id UUID, không đeo
 * tiền tố nào, nên email là thứ duy nhất nhận diện được rác của file này.
 */
const clean = async () => {
  const users = await supertokens.listUsersByAccountInfo("public", { email: EMAIL });
  for (const user of users) {
    await supertokens.deleteUser(user.id);
  }
  // Dùng `client` (Bun.SQL) thay vì Drizzle + `schema`: boundaries cấm
  // `api-plugins` import element `db` — plugin phải đi qua service, và không có
  // service nào xoá staff. `../db` là `api-infra`, cạnh này được phép.
  // Hàng chỉ xuất hiện khi override `signUpPOST` đã land; DELETE này vô hại khi
  // chưa có, và là thứ giữ cho `SELECT ... LIKE 'ztest-%'` về 0 khi đã có.
  await client`DELETE FROM staff_users WHERE email = ${EMAIL}`;
};

beforeAll(clean);
afterAll(clean);

describe("/auth/* forward cookie của SuperTokens", () => {
  it("đăng nhập trả Set-Cookie, và có sAccessToken", async () => {
    const signup = await post(
      "/auth/signup",
      formFields({
        email: EMAIL,
        password: PASSWORD,
        hoTen: "Người Kiểm Thử",
        soDienThoai: "0900000001",
      }),
    );
    // Khẳng định signup OK trước: nếu nó hỏng (policy mật khẩu đổi, formFields
    // đổi tên) thì signin bên dưới sẽ đỏ vì lý do KHÁC hẳn cái test này canh.
    expect(await signup.json()).toMatchObject({ status: "OK" });

    const res = await post("/auth/signin", formFields({ email: EMAIL, password: PASSWORD }), {
      "st-auth-mode": "cookie",
    });
    expect(await res.json()).toMatchObject({ status: "OK" });

    // ⚠️ `getSetCookie()` trả MẢNG. `headers.get("set-cookie")` gộp mọi cookie
    // thành một chuỗi ngăn bằng dấu phẩy — đọc nó rồi kết luận "có một cookie"
    // là đúng cái nhầm lẫn làm bug này sống lâu đến vậy.
    const cookies = res.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);

    const accessToken = cookies.find((c) => c.startsWith("sAccessToken="));
    expect(accessToken).toBeDefined();
    // Cookie rỗng (`sAccessToken=;`) cũng khớp `startsWith` — session vẫn chết.
    expect(accessToken).not.toStartWith("sAccessToken=;");
    // httpOnly là cả lý do §7 design doc chọn cookie thay vì header mode: token
    // JS không đọc được thì XSS không lấy được. Mất cờ này là mất luận điểm đó.
    expect(accessToken).toContain("HttpOnly");
  });

  it("phát ĐỦ cả access lẫn refresh token — không chỉ cookie cuối cùng", async () => {
    // Test này canh riêng lỗi `.set()` thay vì `.append()`. Với `.set()` thì
    // assertion "có ít nhất một Set-Cookie" ở trên VẪN XANH trong khi chỉ cookie
    // cuối sống sót — mất refresh token nghĩa là session chết sau đúng một chu kỳ
    // access token, hỏng muộn và trông như một lỗi hoàn toàn khác.
    const res = await post("/auth/signin", formFields({ email: EMAIL, password: PASSWORD }), {
      "st-auth-mode": "cookie",
    });

    const names = res.headers.getSetCookie().map((c) => c.slice(0, c.indexOf("=")));
    expect(names).toContain("sAccessToken");
    expect(names).toContain("sRefreshToken");
  });
});
