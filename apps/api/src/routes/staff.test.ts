import { beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { PASSWORD_RESET_MAX, passwordResetLimiter } from "../plugins/rate-limit";
import { staffGuard } from "../plugins/staff-guard";
import { isEmailConfigured } from "../services/email";
import { createResetCode, findStaffByEmail } from "../services/password-reset";
import { createPendingStaff } from "../services/staff";
import { staff } from "./staff";

/**
 * Topology GIỐNG `index.ts`: guard nối vào app gốc, route nghiệp vụ là plugin
 * riêng nối sau. Đây không phải chi tiết thừa — `staffGuard` dựa vào
 * `as: "global"` để vượt ranh giới plugin, và một fixture gắn route bằng `.get()`
 * trên cùng một chuỗi sẽ xanh kể cả khi cơ chế đó hỏng.
 */
const app = new Elysia().use(staffGuard).use(staff);

const call = (path: string, init?: RequestInit) =>
  app.handle(new Request(`http://localhost${path}`, init));

const postJson = (path: string, body: unknown) =>
  call(path, {
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
  const existing = await findStaffByEmail(EMAIL);
  if (existing) userId = existing.id;
  else await createPendingStaff({ id: ID, email: EMAIL, fullName: "Nhân viên test route" });
  // Một mã còn sống để bài "mã sai" bên dưới thật sự đi tới bước so mã, thay vì
  // chết sớm ở `CODE_EXPIRED` và xanh vì lý do khác.
  await createResetCode(userId);
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
    const res = await call("/staff/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "NOT_AUTHENTICATED" });
  });

  it("GET /staff/users không cookie → 401 (route OWNER cũng nằm sau guard)", async () => {
    expect((await call("/staff/users")).status).toBe(401);
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
   * khẳng định đúng cái đang chạy thay vì bỏ qua: đọc `isEmailConfigured` (cùng
   * nguồn sự thật mà route đọc) rồi chốt con số.
   */
  const expected = isEmailConfigured ? 200 : 503;

  it(`email không tồn tại → ${String(expected)}, không lộ sự tồn tại`, async () => {
    const res = await postJson("/staff/password-reset/request", {
      email: "ztest-khong-ton-tai@v9.vn",
    });
    expect(res.status).toBe(expected);
  });

  it("email có thật cho ra ĐÚNG cùng phản hồi với email lạ", async () => {
    const unknownRes = await postJson("/staff/password-reset/request", {
      email: "ztest-la@v9.vn",
    });
    const knownRes = await postJson("/staff/password-reset/request", { email: EMAIL });
    expect(knownRes.status).toBe(unknownRes.status);
    expect(await knownRes.text()).toBe(await unknownRes.text());
  });
});

describe("POST /staff/password-reset/confirm", () => {
  /**
   * `WRONG_CODE` (chứ không phải `NOT_FOUND` hay `WEAK_PASSWORD`) chính là bằng
   * chứng KHÔNG ai bị đổi mật khẩu: người dùng `ztest-` này không tồn tại bên
   * SuperTokens, nên nếu luồng có đi tới `createResetToken` thì phản hồi đã là
   * `NOT_FOUND`. Nhận được `WRONG_CODE` nghĩa là nó dừng lại TRƯỚC khi phát ra
   * bất kỳ credential đặt lại nào — đúng thứ tự mà `resetPasswordWithCode` cam kết.
   */
  it("mã sai → 400 WRONG_CODE, và không credential nào được phát", async () => {
    const res = await postJson("/staff/password-reset/confirm", {
      email: EMAIL,
      code: "000000",
      matKhauMoi: "MatKhauMoi123",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "WRONG_CODE" });
  });

  it("email lạ → 400 chứ không 404 (404 sẽ lộ email nào có thật)", async () => {
    const res = await postJson("/staff/password-reset/confirm", {
      email: "ztest-khong-ton-tai@v9.vn",
      code: "999999",
      matKhauMoi: "MatKhauMoi123",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
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

/**
 * Nợ đã đóng (docs/DEBT.md, "Không có rate limit theo IP"). File này chạy ở
 * dev — không `.listen()` nên `context.server` là `null`, và `env.isProduction`
 * là `false` trong CHÍNH tiến trình chạy `bun test` này — nên `getClientIp`
 * (plugins/rate-limit.ts) rơi về `"unknown"` cho MỌI request ở đây. Nghĩa là
 * MỌI lời gọi tới route này trong CẢ FILE (kể cả hai bài ở describe phía
 * trên) chia sẻ đúng MỘT bucket. `.reset()` ngay đầu bài để không phụ thuộc
 * số lần đã gọi trước đó, và describe này đứng SAU MỌI describe khác gọi
 * route này — không lời gọi nào chạy SAU khi bucket bị bào cạn ở đây.
 *
 * Đa dạng IP thật (khác nhau theo `X-Forwarded-For` ở production, và cách
 * dev đọc socket address thay vì tin header) đã khoá kỹ ở
 * `plugins/rate-limit.test.ts` — bài dưới đây chỉ chứng minh khớp nối cuối:
 * ROUTE THẬT SỰ trả 429 khi limiter báo hết lượt, và đường bình thường (chưa
 * chạm ngưỡng) không bị ảnh hưởng gì — không chỉ limiter tự nó đúng.
 */
describe("POST /staff/password-reset/request — rate limit theo IP", () => {
  it(`đường bình thường không bị chặn; lần thứ ${String(PASSWORD_RESET_MAX + 1)} trong 15 phút → 429`, async () => {
    passwordResetLimiter.reset();

    for (let i = 0; i < PASSWORD_RESET_MAX; i++) {
      const res = await postJson("/staff/password-reset/request", {
        email: `ztest-ratelimit-${String(i)}@v9.vn`,
      });
      // Đường bình thường: dù SMTP có cấu hình hay không (200/503), KHÔNG
      // được là 429 trong ngưỡng.
      expect(res.status).not.toBe(429);
    }

    const blocked = await postJson("/staff/password-reset/request", {
      email: "ztest-ratelimit-blocked@v9.vn",
    });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "RATE_LIMITED" });
    // Client thật cần biết đợi bao lâu, không chỉ "bị chặn".
    expect(blocked.headers.get("retry-after")).not.toBeNull();

    // Reset lại sau khi xong, không chỉ trước — `passwordResetLimiter` là một
    // singleton cấp module và `bun test` chạy mọi file trong CÙNG một tiến
    // trình (apps/api/CLAUDE.md, bẫy ①). Không có file nào khác gọi route này
    // hôm nay, nhưng để bucket cạn sẵn ở cuối file là một quả bom hẹn giờ cho
    // file kế tiếp lỡ thêm một lời gọi thật tới route này.
    passwordResetLimiter.reset();
  });
});
