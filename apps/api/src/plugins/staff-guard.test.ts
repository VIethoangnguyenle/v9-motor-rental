import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { isTokenRevoked, staffGuard } from "./staff-guard";

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
const fakeRentals = new Elysia({ name: "fake-rentals" }).get("/rentals", () => ({ ok: true }));
const pluginApp = new Elysia().use(staffGuard).use(fakeRentals);

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
    const res = await pluginApp.handle(new Request("http://localhost/rentals"));
    expect(res.status).toBe(401);
  });
});

/**
 * Phép so mốc thu hồi — tách thành hàm thuần CHỈ để khoá được ca dưới-một-giây
 * bằng số cố định. Bản e2e (`staff-guard-thu-hoi.test.ts`) chạy với token thật
 * nhưng thời điểm cấp token do đồng hồ quyết, nên nó KHÔNG chứng minh được cạnh
 * này một cách ổn định. Hai bài đo hai thứ khác nhau, không thay nhau được.
 *
 * `iat` tính bằng giây; mốc thu hồi là `timestamptz` có micro giây.
 */
describe("isTokenRevoked", () => {
  /** 2026-08-11T10:00:00.500Z — cố ý lệch 500ms khỏi biên giây. */
  const REVOKED_AT = new Date(Date.UTC(2026, 7, 11, 10, 0, 0, 500));
  const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

  it("chưa từng thu hồi → mọi token đều qua", () => {
    expect(isTokenRevoked(null, seconds(REVOKED_AT) - 3600)).toBe(false);
  });

  it("token cấp trước mốc một giây → bị thu hồi", () => {
    expect(isTokenRevoked(REVOKED_AT, seconds(REVOKED_AT) - 1)).toBe(true);
  });

  it("token cấp một giờ trước (kẻ đang cầm cookie cũ) → bị thu hồi", () => {
    expect(isTokenRevoked(REVOKED_AT, seconds(REVOKED_AT) - 3600)).toBe(true);
  });

  /**
   * ⚠️ BÀI QUAN TRỌNG NHẤT của cả cơ chế này. Đóng dấu lúc 10:00:00.500, người
   * dùng đăng nhập lại lúc 10:00:00.900 → token mang `iat = 10:00:00` (JWT làm
   * tròn xuống giây). So thẳng `iat*1000 < moc` cho ra "bị thu hồi" và đá văng
   * chính người vừa đổi mật khẩu xong — tức "quên mật khẩu" thành tính năng
   * không dùng được, hỏng nặng hơn lỗ hổng đang vá.
   *
   * Bỏ `Math.floor(...)` trong `isTokenRevoked` thì ĐÚNG bài này đỏ.
   */
  it("đăng nhập lại trong CÙNG GIÂY với lúc đóng dấu → vẫn vào được", () => {
    expect(isTokenRevoked(REVOKED_AT, seconds(REVOKED_AT))).toBe(false);
  });

  it("token cấp sau mốc → vào được", () => {
    expect(isTokenRevoked(REVOKED_AT, seconds(REVOKED_AT) + 1)).toBe(false);
  });

  /** Hình dạng token đổi = mất khả năng kiểm → chặn, không phải cho qua. */
  it("không đọc được iat mà đã có mốc → hỏng theo chiều ĐÓNG", () => {
    expect(isTokenRevoked(REVOKED_AT, null)).toBe(true);
  });

  it("không đọc được iat và chưa từng thu hồi → không ảnh hưởng ai", () => {
    expect(isTokenRevoked(null, null)).toBe(false);
  });
});
