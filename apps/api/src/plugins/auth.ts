import { Elysia } from "elysia";
import supertokens from "supertokens-node";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";
import {
  CollectingResponse,
  middleware,
  PreParsedRequest,
} from "supertokens-node/framework/custom";
import type { HTTPMethod } from "supertokens-node/types";
// Đường dẫn sâu nhưng KHÔNG phải hack: `./lib/*` nằm trong `exports` map của
// supertokens-node, tức là entry point được package công bố. Dùng chính hàm mà
// adapter express/fastify/awsLambda của họ dùng để cookie ta phát ra giống hệt
// từng byte với mọi adapter SuperTokens khác — tự nối chuỗi thì `Expires`,
// escape giá trị và hoa/thường của `SameSite` là ba chỗ lệch âm thầm.
// Version bị ghim cứng ("supertokens-node": "24.0.3") nên đường dẫn không tự trôi.
import { serializeCookieValue } from "supertokens-node/lib/build/framework/utils";
import { env } from "../env";

// ─────────────────────────────────────────────────────────────────────────
// SEAM: JWT auth — nay đã ghép SuperTokens thật (Round 2 Task 5, §4 design doc
// docs/plans/2026-08-05-round2-directus-staff-design.md). Seam không còn là
// giấy: mọi request `/auth/*` được chuyển thẳng vào SuperTokens core qua
// middleware() của framework "custom". CHƯA route nghiệp vụ nào enforce auth —
// chưa có route nghiệp vụ nào để bảo vệ, và một cơ chế permission chưa từng
// được thực thi còn tệ hơn không có gì (§4.4 design doc).
// Tìm bằng: grep -rn "SEAM: JWT auth"
// ─────────────────────────────────────────────────────────────────────────

supertokens.init({
  framework: "custom",
  supertokens: {
    connectionURI: env.supertokens.connectionUri,
    apiKey: env.supertokens.apiKey,
  },
  appInfo: {
    appName: "V9 Motor Rental",
    apiDomain: env.apiDomain,
    websiteDomain: env.staffAppUrl,
    apiBasePath: "/auth",
    websiteBasePath: "/auth",
  },
  recipeList: [
    EmailPassword.init({
      signUpFeature: {
        // Hai field thêm vào form đăng ký. SuperTokens tự validate "có mặt";
        // ràng buộc nội dung nằm ở service khi ghi staff_users.
        formFields: [{ id: "hoTen" }, { id: "soDienThoai", optional: true }],
      },
      override: {
        apis: (original) => ({
          ...original,
          // ⚠️ TẮT luồng đặt lại mật khẩu dựng sẵn. Không tắt thì hệ thống có HAI
          // luồng reset song song và một trong hai gửi mail từ noreply@supertokens.io
          // bằng dịch vụ hosted mặc định — không ai biết là có.
          // Luồng thật của ta là mã 6 số ở /staff/password-reset/*.
          // §4.1 docs/plans/2026-08-10-staff-auth-design.md.
          generatePasswordResetTokenPOST: undefined,
          passwordResetPOST: undefined,
        }),
      },
    }),
    Session.init(),
  ],
});

export type Role = "OWNER" | "STAFF" | "SALES";

export interface AuthContext {
  readonly userId: string;
  readonly role: Role;
}

// middleware() không truyền wrapRequest/wrapResponse → mặc định là identity
// (xem framework/custom/framework.js), nên OrigReqType/OrigRespType suy ra
// BaseRequest/BaseResponse. PreParsedRequest và CollectingResponse đều là
// subclass của hai type đó nên truyền thẳng instance là hợp lệ, không cần wrap.
const stMiddleware = middleware();

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function parseQuery(url: string): Record<string, string> {
  const query: Record<string, string> = {};
  new URL(url).searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

/**
 * Dùng chung với staff-guard.ts — hai chỗ dựng khác nhau là hai chỗ lệch nhau.
 *
 * Guard đọc session bằng đúng cặp adapter mà route `/auth/*` dùng để nói chuyện
 * với SuperTokens; nếu mỗi bên tự dựng `PreParsedRequest` riêng thì một hôm nào
 * đó cookie parse ra khác nhau và "đăng nhập được nhưng guard bảo chưa đăng
 * nhập" — thứ hỏng im lặng, không nổ ở đâu cả.
 */
export function toPreParsedRequest(request: Request): PreParsedRequest {
  return new PreParsedRequest({
    url: request.url,
    method: request.method.toLowerCase() as HTTPMethod,
    headers: request.headers,
    cookies: parseCookies(request.headers.get("cookie")),
    query: parseQuery(request.url),
    getJSONBody: () => request.json(),
    getFormBody: () => request.formData(),
  });
}

/**
 * Bọc middleware() của framework "custom" thành một route Elysia.
 *
 * PreParsedRequest / CollectingResponse là cặp adapter chuẩn Web Request/Response
 * (apps/api/node_modules/supertokens-node/lib/build/framework/custom/framework.d.ts)
 * — cùng cặp SuperTokens dùng cho Next.js App Router. Elysia cũng chạy trên
 * Request/Response chuẩn Web nên đây là chỗ ghép tự nhiên.
 *
 * Không khai `response` schema như các route khác trong repo: handler trả thẳng
 * một `Response` (Elysia phát hiện `instanceof Response` và dùng nguyên, bỏ qua
 * serialize/validate) vì thân response tới từ SuperTokens — hình dạng khác nhau
 * theo từng recipe/route của nó, cố tình không model lại ở đây.
 */
export const auth = new Elysia({ name: "auth" }).all("/auth/*", async ({ request }) => {
  const preParsedRequest = toPreParsedRequest(request);
  const collectingResponse = new CollectingResponse();

  const result = await stMiddleware(preParsedRequest, collectingResponse);

  if ("error" in result) {
    // middleware() đã tự gọi errorHandler nội bộ trước khi rơi vào nhánh này
    // (xem framework/custom/framework.js) — {error} chỉ xuất hiện khi CHÍNH
    // errorHandler cũng throw, tức lỗi thật sự không mong đợi. Không có gì
    // dùng được trong collectingResponse ở nhánh này nên ném tiếp cho Elysia
    // trả 500 mặc định thay vì tự bịa một response.
    throw result.error;
  }

  if (!result.handled) {
    return new Response("Not Found", { status: 404 });
  }

  const response = new Response(collectingResponse.body ?? null, {
    status: collectingResponse.statusCode,
    headers: collectingResponse.headers,
  });

  // ⚠️ CollectingResponse KHÔNG nhét cookie vào `.headers`. Nó cất riêng ở mảng
  // `.cookies` (`CookieInfo[]` — xem framework/custom/framework.d.ts), vì adapter
  // "custom" không biết framework đích biểu diễn Set-Cookie kiểu gì. Bỏ vòng lặp
  // này thì `POST /auth/signin` vẫn trả `{"status":"OK"}` mà KHÔNG có một header
  // Set-Cookie nào: đăng nhập "thành công", session không bao giờ tồn tại trong
  // trình duyệt, và không có lỗi ở đâu cả — frontend trông như hỏng ngẫu nhiên.
  // Đúng kiểu hỏng-im-lặng mà repo này đã dính nhiều lần, nên có `auth.test.ts`
  // giữ nó bằng một lần đăng nhập thật.
  //
  // `.append()` chứ KHÔNG gán: một response mang NHIỀU cookie (`sAccessToken`,
  // `sRefreshToken`, và cookie xoá lúc signout). Gán đè bằng object literal hay
  // `.set()` thì chỉ cookie cuối sống sót — mất refresh token là session chết
  // sau đúng một chu kỳ access token, tức hỏng muộn và trông như lỗi khác.
  for (const cookie of collectingResponse.cookies) {
    response.headers.append(
      "Set-Cookie",
      serializeCookieValue(
        cookie.key,
        cookie.value,
        cookie.domain,
        cookie.secure,
        cookie.httpOnly,
        cookie.expires,
        cookie.path,
        cookie.sameSite,
      ),
    );
  }

  return response;
});
