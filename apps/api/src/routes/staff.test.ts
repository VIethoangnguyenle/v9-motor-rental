import { beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { staffGuard } from "../plugins/staff-guard";
import { emailDaCauHinh } from "../services/email";
import { taoMaDatLaiMatKhau, timStaffTheoEmail } from "../services/password-reset";
import { createPendingStaff } from "../services/staff";
import { staff } from "./staff";

/**
 * Topology GIỐNG `index.ts`: guard nối vào app gốc, route nghiệp vụ là plugin
 * riêng nối sau. Đây không phải chi tiết thừa — `staffGuard` dựa vào
 * `as: "global"` để vượt ranh giới plugin, và một fixture gắn route bằng `.get()`
 * trên cùng một chuỗi sẽ xanh kể cả khi cơ chế đó hỏng.
 */
const app = new Elysia().use(staffGuard).use(staff);

const goi = (path: string, init?: RequestInit) =>
  app.handle(new Request(`http://localhost${path}`, init));

const postJson = (path: string, body: unknown) =>
  goi(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * ⚠️ Fixture đi qua `services/`, KHÔNG qua `db` — và đó là ràng buộc của repo, không
 * phải sở thích: `apps/api/src/routes/**` là element `api-routes`, mà boundaries
 * không có policy `api-routes → api-infra`. File test nằm trong `routes/` nên chịu
 * đúng luật đó; `import { db } from "../db"` ở đây nổ
 * `boundaries/dependencies` (đã probe). Hệ quả: **không có đường xoá hàng từ file
 * này** — `services/` không phơi hàm delete nào, có chủ ý.
 *
 * Nên fixture được viết để CHẠY LẠI ĐƯỢC thay vì để dọn: có hàng rồi thì dùng lại,
 * chưa có thì tạo. Tối đa một hàng `ztest-` tồn tại, không tăng theo số lần chạy.
 * Hàng đó bị quét sạch bởi `services/staff.test.ts` (nó xoá `ztest-%` ở cả
 * `beforeAll` lẫn `afterAll`) trong một lần `bun test` đầy đủ, và bằng
 * `DELETE FROM staff_users WHERE id LIKE 'ztest-%'` khi chạy lẻ.
 */
const ID = "ztest-route-staff";
const EMAIL = "ztest-route-staff@v9.vn";

let userId = ID;

beforeAll(async () => {
  const daCo = await timStaffTheoEmail(EMAIL);
  if (daCo) userId = daCo.id;
  else await createPendingStaff({ id: ID, email: EMAIL, fullName: "Nhân viên test route" });
  // Một mã còn sống để bài "mã sai" bên dưới thật sự đi tới bước so mã, thay vì
  // chết sớm ở `MA_HET_HIEU_LUC` và xanh vì lý do khác.
  await taoMaDatLaiMatKhau(userId);
});

describe("guard phủ lên route /staff/*", () => {
  /**
   * Bài quan trọng nhất của file này. Elysia trả 404 TRƯỚC khi `onBeforeHandle`
   * chạy, nên trước Task 11 đường dẫn này cũng "không vào được" — nhưng bằng 404,
   * tức là không có hàng rào nào cả. 401 là bằng chứng route đã tồn tại VÀ guard
   * thật sự phủ lên nó. Nếu bài này đỏ với 404 thì `.use(staff)` đã rơi khỏi
   * `index.ts`; đỏ với 200 thì guard đã ngừng chạy.
   */
  it("GET /staff/me không cookie → 401, KHÔNG phải 404", async () => {
    const res = await goi("/staff/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "CHUA_DANG_NHAP" });
  });

  it("GET /staff/users không cookie → 401 (route OWNER cũng nằm sau guard)", async () => {
    expect((await goi("/staff/users")).status).toBe(401);
  });

  it("POST /staff/users/:id/disable không cookie → 401", async () => {
    expect((await postJson("/staff/users/ztest-ai-do/disable", {})).status).toBe(401);
  });
});

describe("POST /staff/password-reset/request", () => {
  /**
   * Yêu cầu bảo mật, không phải chi tiết triển khai: email lạ và email có thật
   * phải cho ra CÙNG một câu trả lời, nếu không endpoint này thành máy dò danh
   * sách nhân viên của shop (§5.1 design doc).
   *
   * Khi chưa cấu hình SMTP thì cả hai cùng ra 503 — vẫn không lộ gì. Bài test
   * khẳng định đúng cái đang chạy thay vì bỏ qua: đọc `emailDaCauHinh` (cùng
   * nguồn sự thật mà route đọc) rồi chốt con số.
   */
  const mongDoi = emailDaCauHinh ? 200 : 503;

  it(`email không tồn tại → ${String(mongDoi)}, không lộ sự tồn tại`, async () => {
    const res = await postJson("/staff/password-reset/request", {
      email: "ztest-khong-ton-tai@v9.vn",
    });
    expect(res.status).toBe(mongDoi);
  });

  it("email có thật cho ra ĐÚNG cùng phản hồi với email lạ", async () => {
    const la = await postJson("/staff/password-reset/request", { email: "ztest-la@v9.vn" });
    const that = await postJson("/staff/password-reset/request", { email: EMAIL });
    expect(that.status).toBe(la.status);
    expect(await that.text()).toBe(await la.text());
  });
});

describe("POST /staff/password-reset/confirm", () => {
  /**
   * `MA_SAI` (chứ không phải `KHONG_TIM_THAY` hay `MAT_KHAU_YEU`) chính là bằng
   * chứng KHÔNG ai bị đổi mật khẩu: người dùng `ztest-` này không tồn tại bên
   * SuperTokens, nên nếu luồng có đi tới `taoTokenDatLai` thì phản hồi đã là
   * `KHONG_TIM_THAY`. Nhận được `MA_SAI` nghĩa là nó dừng lại TRƯỚC khi phát ra
   * bất kỳ credential đặt lại nào — đúng thứ tự mà `doiMatKhauBangMa` cam kết.
   */
  it("mã sai → 400 MA_SAI, và không credential nào được phát", async () => {
    const res = await postJson("/staff/password-reset/confirm", {
      email: EMAIL,
      code: "000000",
      matKhauMoi: "MatKhauMoi123",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "MA_SAI" });
  });

  it("email lạ → 400 chứ không 404 (404 sẽ lộ email nào có thật)", async () => {
    const res = await postJson("/staff/password-reset/confirm", {
      email: "ztest-khong-ton-tai@v9.vn",
      code: "999999",
      matKhauMoi: "MatKhauMoi123",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "KHONG_TIM_THAY" });
  });

  it("thân request không hợp lệ bị chặn ở schema, không tới service", async () => {
    const res = await postJson("/staff/password-reset/confirm", {
      email: EMAIL,
      code: "123",
      matKhauMoi: "ngan",
    });
    expect(res.status).toBe(422);
  });
});
