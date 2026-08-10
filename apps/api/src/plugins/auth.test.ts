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
/** Đăng ký "sạch" — kiểm hàng staff_users sinh ra đúng PENDING/STAFF. */
const EMAIL_DANGKY = `${P}dangky@v9.vn`;
/** `hoTen` toàn khoảng trắng — SuperTokens cho qua, ta phải tự đỡ. */
const EMAIL_TRANG = `${P}trang@v9.vn`;
/** Lớp bù trừ: một hàng staff_users chiếm sẵn email này để insert đụng UNIQUE. */
const EMAIL_KENH = `${P}kenh@v9.vn`;
const EMAILS = [EMAIL, EMAIL_DANGKY, EMAIL_TRANG, EMAIL_KENH];
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
  for (const email of EMAILS) {
    const users = await supertokens.listUsersByAccountInfo("public", { email });
    for (const user of users) {
      await supertokens.deleteUser(user.id);
    }
  }
  // Dùng `client` (Bun.SQL) thay vì Drizzle + `schema`: boundaries cấm
  // `api-plugins` import element `db` — plugin phải đi qua service, và không có
  // service nào xoá staff. `../db` là `api-infra`, cạnh này được phép.
  // `LIKE` chứ không `= EMAIL`: override `signUpPOST` sinh một hàng cho MỌI email
  // của file này, kể cả hàng "chiếm chỗ" mà test lớp bù trừ tự cắm vào.
  await client`DELETE FROM staff_users WHERE email LIKE ${`${P}%`}`;
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

/**
 * Override `signUpPOST` — §2.1 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * Đi qua HTTP thật (`app.handle`) chứ không gọi `createPendingStaff` trực tiếp:
 * thứ cần giữ là "đăng ký xong thì CÓ hồ sơ", mà mắt xích duy nhất nối hai vế đó
 * là cái override. Test service suông sẽ xanh kể cả khi override bị gỡ khỏi
 * `supertokens.init()`.
 */

interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  status: string;
}

const docHang = async (email: string): Promise<StaffRow | undefined> => {
  // Annotate chứ không `as`: Bun.SQL suy tham số kiểu của nó từ chỗ nhận, nên
  // `as StaffRow[]` là assertion rỗng và ESLint bắt đúng (`no-unnecessary-type-assertion`).
  const rows: StaffRow[] = await client`
    SELECT id, email, full_name, phone, role, status FROM staff_users WHERE email = ${email}
  `;
  return rows[0];
};

const demUserSuperTokens = async (email: string): Promise<number> =>
  (await supertokens.listUsersByAccountInfo("public", { email })).length;

describe("signUpPOST ghi staff_users", () => {
  it("đăng ký xong có hàng PENDING/STAFF, đúng họ tên và số điện thoại", async () => {
    const res = await post(
      "/auth/signup",
      formFields({
        email: EMAIL_DANGKY,
        password: PASSWORD,
        hoTen: "Nguyễn Văn Test",
        soDienThoai: "0901234567",
      }),
    );
    expect(await res.json()).toMatchObject({ status: "OK" });

    const row = await docHang(EMAIL_DANGKY);
    expect(row).toBeDefined();
    expect(row?.full_name).toBe("Nguyễn Văn Test");
    expect(row?.phone).toBe("0901234567");
    // Hai giá trị này KHÔNG đến từ input — `createPendingStaff` cố ý không nhận
    // `role`/`status` làm tham số, nên không có đường nào để người tự đăng ký tự
    // cấp quyền cho mình. Assert ở đây là để đường đó không mọc lại.
    expect(row?.status).toBe("PENDING");
    expect(row?.role).toBe("STAFF");

    // `id` của hàng PHẢI là userId của SuperTokens — đó là toàn bộ cách
    // `staff-guard` tìm được hồ sơ từ session. Lệch là "đăng nhập được nhưng
    // CHUA_CO_HO_SO" vĩnh viễn.
    const [user] = await supertokens.listUsersByAccountInfo("public", { email: EMAIL_DANGKY });
    expect(row?.id).toBe(user?.id ?? "");
  });

  it("hoTen toàn khoảng trắng thành '(chưa đặt tên)', không phải chuỗi rỗng", async () => {
    // SuperTokens từ chối `hoTen: ""` (FIELD_ERROR "Field is not optional") nhưng
    // CHO QUA `"   "` — validator mặc định chỉ kiểm có mặt, không kiểm nội dung.
    // Đo 2026-08-11. Đây là ca duy nhất tên rỗng lọt được xuống DB.
    const res = await post(
      "/auth/signup",
      formFields({
        email: EMAIL_TRANG,
        password: PASSWORD,
        hoTen: "   ",
        soDienThoai: "  ",
      }),
    );
    expect(await res.json()).toMatchObject({ status: "OK" });

    const row = await docHang(EMAIL_TRANG);
    expect(row?.full_name).toBe("(chưa đặt tên)");
    expect(row?.full_name).not.toBe("");
    // Cùng một phép `.trim() ||`, chiều ngược lại: sđt trắng là KHÔNG có sđt.
    expect(row?.phone).toBeNull();
  });

  it("insert hỏng thì xoá user SuperTokens — không để lại user mồ côi", async () => {
    // Hai ghi không nguyên tử (§2.1). Dựng đúng cảnh hỏng bằng cách chiếm sẵn
    // email trong `staff_users`: SuperTokens KHÔNG biết gì về hàng này nên nó tạo
    // user bình thường, rồi insert của ta đụng UNIQUE (23505) và ném.
    await client`
      INSERT INTO staff_users (id, email, full_name) VALUES (${`${P}chiem-cho`}, ${EMAIL_KENH}, 'Chiếm chỗ')
    `;
    expect(await demUserSuperTokens(EMAIL_KENH)).toBe(0);

    const res = await post(
      "/auth/signup",
      formFields({ email: EMAIL_KENH, password: PASSWORD, hoTen: "Người Xui" }),
    );
    // Đăng ký PHẢI thất bại. Trả "OK" ở đây còn tệ hơn 500: người dùng tưởng có
    // tài khoản, đăng nhập vào thì bị CHUA_CO_HO_SO không giải thích được.
    expect(res.status).toBe(500);

    // ĐÂY là assertion của cả task. Bỏ `await supertokens.deleteUser(...)` trong
    // `auth.ts` thì mọi assertion khác trong test này vẫn xanh và chỉ dòng dưới đỏ.
    expect(await demUserSuperTokens(EMAIL_KENH)).toBe(0);

    // Và hàng chiếm chỗ vẫn nguyên — lớp bù trừ chỉ được dọn thứ chính nó tạo ra.
    const row = await docHang(EMAIL_KENH);
    expect(row?.id).toBe(`${P}chiem-cho`);
    expect(row?.full_name).toBe("Chiếm chỗ");
  });
});
