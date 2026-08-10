import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { staffGuard } from "./staff-guard";

/**
 * Fixture route đăng ký SAU guard. Đây là hàng rào "mặc định chặn": route này
 * không nằm trong danh sách công khai nên phải bị chặn mà KHÔNG cần ai nhớ bật
 * gì cho nó. Test này xanh khi guard tắt là không chấp nhận được — nó phải đỏ.
 */
const app = new Elysia()
  .use(staffGuard)
  .get("/khong-khai-bao", () => ({ ok: true }))
  .get("/health", () => ({ status: "ok" }));

const call = (path: string) => app.handle(new Request(`http://localhost${path}`));

/**
 * Fixture thứ hai, mô phỏng ĐÚNG topology của `index.ts`: route nghiệp vụ nằm
 * trong một plugin RIÊNG, nối vào bằng `.use()` sau `staffGuard` — không phải
 * `.get()` trên cùng một chuỗi như fixture trên.
 *
 * Vì sao cần cả hai: mọi route thật đăng ký sau guard trong `index.ts`
 * (`health`, `vehicles`) đều nằm trong danh sách công khai, nên một 200 ở đó
 * KHÔNG phân biệt được "guard chạy rồi cho qua" với "guard không chạy". Fixture
 * này là chỗ duy nhất chứng minh `as: "global"` thật sự vượt được ranh giới
 * plugin — thứ mà cả hàng rào phụ thuộc vào.
 */
const rentalsGia = new Elysia({ name: "rentals-gia" }).get("/rentals", () => ({ ok: true }));
const appGhepPlugin = new Elysia().use(staffGuard).use(rentalsGia);

describe("staffGuard", () => {
  it("route không khai công khai → 401 khi không có session", async () => {
    expect((await call("/khong-khai-bao")).status).toBe(401);
  });

  it("/health nằm trong danh sách công khai → đi qua", async () => {
    expect((await call("/health")).status).toBe(200);
  });

  it("GET /vehicles công khai — apps/web SSG cần", async () => {
    expect((await call("/vehicles")).status).not.toBe(401);
  });

  it("/auth/* công khai", async () => {
    expect((await call("/auth/signin")).status).not.toBe(401);
  });

  it("route trong plugin RIÊNG nối sau guard → vẫn 401 (topology của index.ts)", async () => {
    const res = await appGhepPlugin.handle(new Request("http://localhost/rentals"));
    expect(res.status).toBe(401);
  });
});
