import { describe, expect, it } from "bun:test";
import {
  createRateLimiter,
  getClientIp,
  PASSWORD_RESET_MAX,
  PASSWORD_RESET_WINDOW_MS,
  SIGNUP_MAX,
  SIGNUP_WINDOW_MS,
  type IpSource,
} from "./rate-limit";

describe("createRateLimiter — fixed window trong tiến trình", () => {
  it("cho qua đúng `max` lần trong một cửa sổ, chặn lần kế tiếp", () => {
    const limiter = createRateLimiter(60_000, 3);
    const key = "1.2.3.4";

    expect(limiter.check(key).allowed).toBe(true);
    expect(limiter.check(key).allowed).toBe(true);
    expect(limiter.check(key).allowed).toBe(true);

    const blocked = limiter.check(key);
    expect(blocked.allowed).toBe(false);
    // Phải nói ĐƯỢC thử lại lúc nào, không chỉ "không được" — client thật (và
    // test dưới) cần con số này để quyết định đợi bao lâu.
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("đường một-request-duy-nhất không bị ảnh hưởng gì — không phải mọi request đều bị chặn", () => {
    const limiter = createRateLimiter(60_000, 5);
    const result = limiter.check("9.9.9.9");
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("IP KHÁC không bị ăn theo IP đã cạn lượt — hai bucket độc lập", () => {
    const limiter = createRateLimiter(60_000, 1);

    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(false); // IP này đã cạn lượt

    // IP thứ hai, KHÔNG liên quan gì tới IP trên, phải hoàn toàn không bị ảnh hưởng.
    expect(limiter.check("2.2.2.2").allowed).toBe(true);
    expect(limiter.check("2.2.2.2").allowed).toBe(false);
    // Và IP đầu tiên KHÔNG được "hồi lượt" chỉ vì IP thứ hai vừa gọi.
    expect(limiter.check("1.1.1.1").allowed).toBe(false);
  });

  it("mở lại cho phép request khi cửa sổ CŨ đã hết hạn", async () => {
    // Cửa sổ ngắn để test nhanh, nhưng đủ dài để không flaky trên máy đang tải:
    // 60ms cửa sổ + chờ 120ms (gấp đôi) trước khi kiểm lại.
    const limiter = createRateLimiter(60, 1);
    const key = "3.3.3.3";

    expect(limiter.check(key).allowed).toBe(true);
    expect(limiter.check(key).allowed).toBe(false);

    await Bun.sleep(120);

    expect(limiter.check(key).allowed).toBe(true);
  });

  it("reset() xoá sạch mọi bucket — chỉ dùng trong test", () => {
    const limiter = createRateLimiter(60_000, 1);
    expect(limiter.check("4.4.4.4").allowed).toBe(true);
    expect(limiter.check("4.4.4.4").allowed).toBe(false);

    limiter.reset();

    expect(limiter.check("4.4.4.4").allowed).toBe(true);
  });

  it("ngưỡng đặt tên cho hai endpoint khớp quyết định trong docs/DEBT.md", () => {
    // Không phải test hành vi — canh CON SỐ, để một chỉnh sửa vô tình đổi
    // ngưỡng (vd gõ nhầm 50 thành 5, hay đổi đơn vị) bị bắt ngay ở đây thay vì
    // chỉ lộ ra khi vận hành thật báo bị chặn oan hoặc không bị chặn.
    expect(PASSWORD_RESET_MAX).toBe(5);
    expect(PASSWORD_RESET_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(SIGNUP_MAX).toBe(5);
    expect(SIGNUP_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});

describe("getClientIp — dev (env.isProduction === false trong tiến trình test này)", () => {
  // `bun test` không đặt NODE_ENV=production, nên `env.isProduction` đã đóng
  // băng thành `false` từ lúc import ở ĐÚNG tiến trình chạy file test này
  // (env.ts đọc process.env lúc import — cùng lý do auth.test.ts phải test
  // nhánh production ở tiến trình CON, xem describe cuối file).
  const fakeServer = (address: string | null): IpSource => ({
    requestIP: () => (address === null ? null : { address }),
  });

  it("đọc socket address qua server.requestIP — KHÔNG tin X-Forwarded-For", () => {
    // Không có proxy nào đứng trước api ở dev (compose.yaml không chạy service
    // api — apps/api chạy thẳng trên host). Header dưới đây là client TỰ BỊA,
    // và phải bị bỏ qua hoàn toàn.
    const req = new Request("http://localhost/x", {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    expect(getClientIp(req, fakeServer("10.0.0.5"))).toBe("10.0.0.5");
  });

  it("server null, hoặc requestIP() trả null → 'unknown', không throw", () => {
    const req = new Request("http://localhost/x");
    expect(getClientIp(req, null)).toBe("unknown");
    expect(getClientIp(req, fakeServer(null))).toBe("unknown");
  });

  it("hai request có cùng socket address rơi vào CÙNG một key — dùng được cho rate limit", () => {
    // Không test hành vi rate limit ở đây (đã khoá ở describe trên) — chỉ
    // khoá tính chất "cùng nguồn thật → cùng key", điều kiện cần để limiter
    // hoạt động đúng khi ráp getClientIp() với createRateLimiter().
    const server = fakeServer("192.168.1.50");
    const req1 = new Request("http://localhost/a");
    const req2 = new Request("http://localhost/b", {
      headers: { "x-forwarded-for": "1.2.3.4" }, // khác header, cùng socket — vẫn phải ra cùng IP
    });
    expect(getClientIp(req1, server)).toBe(getClientIp(req2, server));
  });
});

/**
 * `env.isProduction` đọc `process.env.NODE_ENV` lúc IMPORT, một lần cho cả
 * tiến trình (cùng ràng buộc mà `auth.test.ts` giải quyết bằng tiến trình
 * con cho các bài `cookieDomain`). `bun test` chạy toàn bộ file trong MỘT
 * tiến trình nên không đặt lại `NODE_ENV` giữa chừng được — phải spawn một
 * tiến trình Bun MỚI với `NODE_ENV=production` để canh đúng nhánh production
 * của `getClientIp`.
 */
const CHILD_SCRIPT = `
const { getClientIp } = await import("./src/plugins/rate-limit.ts");
const req = new Request("http://localhost/x", {
  headers: process.env.V9_TEST_XFF ? { "x-forwarded-for": process.env.V9_TEST_XFF } : {},
});
// server=null: nhánh production đọc thẳng header, không cần server thật.
console.log("V9_IP " + getClientIp(req, null));
`;

async function getClientIpInChildProcess(xff: string | null): Promise<string> {
  const proc = Bun.spawn(["bun", "-e", CHILD_SCRIPT], {
    // Cùng lý do auth.test.ts: import tương đối "./src/plugins/rate-limit.ts"
    // tính theo cwd, nên cwd phải là apps/api.
    cwd: `${import.meta.dir}/../..`,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ...(xff === null ? {} : { V9_TEST_XFF: xff }),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  const line = out.split("\n").find((l) => l.startsWith("V9_IP "));
  if (!line) {
    throw new Error(`Tiến trình con không in kết quả (exit ${proc.exitCode}).\n${out}\n${err}`);
  }
  return line.slice("V9_IP ".length);
}

describe("getClientIp — production (sau Caddy, tiến trình con NODE_ENV=production)", () => {
  it("lấy phần tử CUỐI của X-Forwarded-For — Caddy nối vào cuối, client viết được vào đầu", async () => {
    // Mô phỏng đúng kịch bản debt cảnh báo: kẻ tấn công tự chèn
    // "203.0.113.9" ở ĐẦU để mạo danh IP đó; Caddy (reverse_proxy mặc định,
    // không header_up nào ghi đè trong Caddyfile) NỐI THÊM địa chỉ nó thực sự
    // thấy — "10.0.0.2" — vào CUỐI thay vì ghi đè.
    const ip = await getClientIpInChildProcess("203.0.113.9, 10.0.0.2");
    expect(ip).toBe("10.0.0.2");
    // Đối chứng bắt buộc: nếu implementation vô tình đọc phần tử ĐẦU thay vì
    // cuối, bài test trên vẫn có thể "tình cờ" xanh với một số input khác —
    // assertion dưới khoá đúng việc IP client tự chèn KHÔNG được dùng.
    expect(ip).not.toBe("203.0.113.9");
  });

  it("chỉ một IP trong header (không có hop nào khác) vẫn đọc đúng", async () => {
    const ip = await getClientIpInChildProcess("198.51.100.7");
    expect(ip).toBe("198.51.100.7");
  });

  it("thiếu header (không nên xảy ra sau Caddy) → rơi về socket address, không throw", async () => {
    // server=null trong CHILD_SCRIPT nên nhánh fallback phải ra "unknown",
    // không phải ném lỗi hay treo.
    const ip = await getClientIpInChildProcess(null);
    expect(ip).toBe("unknown");
  });
});
