import { env } from "../env";

/**
 * Rate limit theo IP, TRONG TIẾN TRÌNH (không Redis) — nợ đã đóng
 * (docs/DEBT.md, "Không có rate limit theo IP"). Bảo vệ hai endpoint công
 * khai tốn tài nguyên: `POST /staff/password-reset/request` (argon2id
 * ~115ms mỗi lần email có thật, xem `services/password-reset.ts`) và
 * `POST /auth/signup` (băm ở SuperTokens core, cộng một hàng PENDING mỗi
 * request thành công).
 *
 * ⚠️ Nằm ở `plugins/`, KHÔNG phải `services/` — nhưng KHÔNG như `staff-guard`
 * và `timing`. Hai plugin đó gắn `as: "global"` và phủ ĐỀU lên mọi route; một
 * rate limiter đúng nghĩa phải áp NGƯỠNG KHÁC NHAU cho từng endpoint (5/15
 * phút vs 5/giờ), nên gắn nó thành hook toàn cục là sai phạm vi — mọi route
 * sẽ dùng chung một ngưỡng hoặc phải rẽ nhánh theo path bên trong hook, phức
 * tạp hơn và dễ quên rẽ đúng nhánh. Ở đây file này chỉ export các HÀM THUẦN
 * (limiter + cách đọc IP); route/plugin cần giới hạn tự gọi trực tiếp, đúng
 * cách `routes/staff.ts` gọi `isEmailConfigured`/`sendResetCodeEmail` từ
 * `services/email.ts` — không qua một Elysia hook nào.
 *
 * Vẫn xếp vào `plugins/` chứ không phải `services/` vì nó đọc `Request`/IP —
 * một khái niệm HTTP, không phải nghiệp vụ thuê xe — đúng lớp với
 * `staff-guard.ts` (cũng đọc session từ `Request`). Nhờ vậy `api-plugins`
 * được phép import `api-infra` (`env`, xem policy trong `eslint.config.js`,
 * giống `plugins/auth.ts` đã làm) mà không cần vòng qua `services/`.
 *
 * ⚠️ HAI GIỚI HẠN THẬT của limiter trong tiến trình — chấp nhận được cho quy
 * mô ở đây (một shop, một VPS), nhưng phải viết ra chứ không giấu:
 *
 *   1. **Mất trạng thái khi restart.** Deploy mới, crash, hay
 *      `docker compose restart api` xoá sạch mọi bucket đang đếm — kẻ tấn
 *      công "được" thêm một cửa sổ đầy ngay sau đó. Không request nào của
 *      client tự kích hoạt được việc restart container, nên khai thác thật
 *      đòi hỏi kiểm soát được vòng đời container — ngoài mô hình đe doạ của
 *      một shop cho thuê xe máy phân khối lớn.
 *   2. **Đếm theo TỪNG tiến trình, không theo tổng.** `compose.prod.yaml`
 *      hôm nay chỉ chạy ĐÚNG MỘT container `api` (không `deploy.replicas`,
 *      Caddy chỉ reverse_proxy tới một địa chỉ `api:3001` duy nhất) nên
 *      ngưỡng đúng như khai báo. Thêm container `api` thứ hai (scale ngang
 *      hoặc load balancing) mà không đổi gì ở đây thì ngưỡng hiệu lực NHÂN
 *      ĐÔI — mỗi tiến trình giữ bucket riêng, không biết gì về tiến trình
 *      kia. Đó là lúc PHẢI chuyển sang một kho đếm dùng chung (Redis) —
 *      không sớm hơn: root CLAUDE.md đã ghi "không có Redis trong dự án
 *      này", và dựng Redis chỉ để chặn vài request/15 phút là đổi một nợ nhỏ
 *      lấy một hạ tầng mới, đắt hơn chính nợ nó vá.
 */
export interface RateLimitResult {
  readonly allowed: boolean;
  /** `0` khi `allowed`; ngược lại là số giây tới khi cửa sổ hiện tại hết hạn. */
  readonly retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  readonly check: (key: string) => RateLimitResult;
  /**
   * Chỉ dùng trong test: xoá toàn bộ bucket để các `it()` không phụ thuộc
   * thứ tự/trạng thái để lại bởi lần chạy trước — `bun test` chạy nhiều
   * file trong CÙNG một tiến trình (xem apps/api/CLAUDE.md), nên module-level
   * `Map` của limiter sống xuyên suốt cả lần `bun test`.
   */
  readonly reset: () => void;
}

/**
 * Fixed window, không phải sliding window hay token bucket — đơn giản nhất
 * còn đúng cho mục tiêu ở đây (chặn burst tốn CPU/RAM, không cần độ mượt tới
 * từng mili-giây). Đánh đổi đã biết và chấp nhận được: request rơi đúng lúc
 * giao giữa hai cửa sổ có thể đi qua gần gấp đôi `max` trong một khoảng ngắn
 * — không phải một hàng rào chính xác tuyệt đối, chỉ cần đủ để bịt vòi.
 */
export function createRateLimiter(windowMs: number, max: number): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    check(key) {
      const now = Date.now();
      const bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (bucket.count >= max) {
        return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
      }

      bucket.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset() {
      buckets.clear();
    },
  };
}

// ── Ngưỡng — LỰA CHỌN của người viết, không phải sự thật đo được ──────────
// Đặt tên và giải thích lý do TỪNG con số, để người sau đổi được khi sai thay
// vì đoán mò ý nghĩa của "5" hay "15".

/**
 * 5 lần / 15 phút / IP cho `/staff/password-reset/request`. Đủ cho một nhân
 * viên gõ nhầm email vài lần rồi thử lại đúng trong một phiên; không đủ để
 * một script bơm hàng chục lần băm argon2id (~115ms/lần) mỗi giây — đúng thứ
 * debt này tồn tại để chặn (docs/DEBT.md).
 *
 * Đổi ngưỡng này nếu vận hành thật báo nhân viên bị chặn oan (case chính
 * đáng nhưng hiếm: đổi máy/mạng liên tục trong lúc quên đúng email đăng ký).
 */
export const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_MAX = 5;

/**
 * 5 lần / giờ / IP cho `/auth/signup`. Một người thật đăng ký lại tối đa vài
 * lần (gõ sai mật khẩu, sửa số điện thoại). Ngưỡng để chặn kịch bản "script
 * tạo hàng loạt hồ sơ PENDING" — mỗi hồ sơ là một hàng OWNER phải tự
 * duyệt/từ chối tay (routes/staff.ts, `POST /staff/users/:id/approve`) —
 * không phải để chặn người đăng ký thật.
 *
 * Đổi ngưỡng này nếu một đợt tuyển dụng/onboard thật khiến nhiều người dùng
 * chung một IP (văn phòng, wifi quán) đăng ký trong cùng một giờ.
 */
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
export const SIGNUP_MAX = 5;

export const passwordResetLimiter = createRateLimiter(PASSWORD_RESET_WINDOW_MS, PASSWORD_RESET_MAX);
export const signupLimiter = createRateLimiter(SIGNUP_WINDOW_MS, SIGNUP_MAX);

/**
 * Tối thiểu cần để đọc IP từ đối tượng server — khớp cấu trúc `Server` của
 * Bun/Elysia (`server.requestIP(request)`) mà không cần import type sâu của
 * `elysia`, và cho phép test tự bịa một server giả không cần `.listen()`
 * thật.
 */
export interface IpSource {
  requestIP: (request: Request) => { readonly address: string } | null;
}

/**
 * IP người gọi thật — nguồn khác nhau tuỳ MÔI TRƯỜNG, và không được lẫn lộn.
 * Điều kiện là `env.isProduction`, cùng lý lẽ với `cookieDomain` ở
 * `plugins/auth.ts` và `devOtp` ở `env.ts`: phải hỏi môi trường, không phải
 * "header đó có mặt hay không" — `X-Forwarded-For` có thể có mặt (hoặc bị
 * giả) ở dev y hệt prod, sự HIỆN DIỆN của nó không nói lên gì về việc có nên
 * tin nó hay không.
 *
 * **Production — tin `X-Forwarded-For`, lấy phần tử CUỐI.**
 * `compose.prod.yaml` không publish port nào cho service `api` — chỉ `caddy`
 * nghe 80/443 (`ports: ["80:80", "443:443"]`), và `Caddyfile` reverse_proxy
 * thẳng `api:3001` qua network nội bộ của compose. `reverse_proxy` của Caddy
 * (không cấu hình `header_up` nào khác trong `Caddyfile`) mặc định TỰ THÊM
 * `X-Forwarded-For`: nếu request đã mang header đó (kẻ gọi tự chèn), Caddy
 * NỐI THÊM địa chỉ nó thấy vào cuối danh sách thay vì ghi đè — client viết
 * được vào ĐẦU danh sách, không viết được vào CUỐI. Nên: tin phần tử ĐẦU là
 * tự mở cửa cho giả mạo (client gửi `X-Forwarded-For: 1.1.1.1` là bắt được
 * rate limit của người khác); phần tử CUỐI luôn là địa chỉ Caddy — proxy tin
 * cậy duy nhất đứng trước `api` — thực sự thấy, client không ghi đè được.
 *
 * Container khác trong cùng docker network (postgres, minio, web, staff, …)
 * VỀ MẶT KỸ THUẬT vẫn gọi thẳng được `api:3001` mà bỏ qua Caddy, kèm
 * `X-Forwarded-For` tự bịa — không có gì ở tầng ứng dụng chặn việc đó. Chấp
 * nhận được: các container đó là hạ tầng CỦA CHÍNH shop trong compose, không
 * phải input từ Internet; ranh giới tin cậy ở đây là docker network nội bộ,
 * không phải endpoint HTTP này. Nếu shop từng thêm một service thứ ba không
 * tin cậy vào cùng network đó, giả định này phải xét lại.
 *
 * **Dev — bỏ qua `X-Forwarded-For`, đọc socket address qua `server.requestIP`.**
 * `compose.yaml` (dev) KHÔNG chạy service `api` — `apps/api` chạy thẳng trên
 * host qua `bun run dev`, không có proxy nào đứng trước. Tin
 * `X-Forwarded-For` ở đây là tự mở cửa thật sự: bất kỳ client nào (kể cả
 * `curl`) gắn được header đó để giả IP tuỳ ý và né rate limit của chính họ.
 * `Server.requestIP()` (Bun) đọc địa chỉ socket TCP thật — không header nào
 * viết đè lên được.
 *
 * `"unknown"` khi không xác định được (không có `server`, hoặc
 * `requestIP()` trả `null` — xảy ra khi request đã đóng hoặc qua unix
 * socket): rơi vào CHUNG một bucket với mọi request khác không xác định
 * được IP, thay vì được bỏ qua rate limit hoàn toàn. Hỏng theo chiều ĐÓNG
 * (chặn sớm hơn cần thiết khi không rõ IP), không phải chiều mở.
 */
export function getClientIp(request: Request, server: IpSource | null): string {
  if (env.isProduction) {
    const header = request.headers.get("x-forwarded-for");
    if (header) {
      const parts = header
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const last = parts.at(-1);
      if (last) return last;
    }
    // Không có header dù đang production: không nên xảy ra sau Caddy (nó
    // luôn thêm), nhưng rơi về socket address thay vì "unknown" — đó là địa
    // chỉ của Caddy (kết nối TCP tới `api` luôn đến từ Caddy), vẫn còn tác
    // dụng chặn theo kiểu least-effort thay vì mất rate limit hoàn toàn.
  }
  return server?.requestIP(request)?.address ?? "unknown";
}
