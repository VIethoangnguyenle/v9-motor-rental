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
import { createPendingStaff } from "../services/staff";
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

          /**
           * Đăng ký xong thì phải có hồ sơ trong `public.staff_users` — nếu không,
           * người đó đăng nhập được mà `staff-guard` không biết họ là ai.
           *
           * ⚠️ HAI GHI KHÔNG NGUYÊN TỬ. SuperTokens ghi user vào schema của nó, ta
           * ghi hàng vào `public`: hai transaction khác nhau, KHÔNG có transaction
           * chung, và không thể có — chúng nằm sau hai connection khác nhau tới hai
           * schema có chủ khác nhau (§2.1 docs/plans/2026-08-10-staff-auth-design.md).
           * Bỏ qua lỗi insert thì còn lại một user SuperTokens mồ côi: đăng nhập
           * được, không hồ sơ, và không có gì báo cho ai biết.
           *
           * Vì vậy HAI lớp, và cần cả hai:
           *   • Lớp 1 (ở đây): insert hỏng → `supertokens.deleteUser` bù trừ, rồi
           *     ném tiếp để người đăng ký thấy lỗi thay vì tưởng đã xong.
           *   • Lớp 2 (`staff-guard`): có session mà thiếu hàng → `403 CHUA_CO_HO_SO`.
           *     Tồn tại vì CHÍNH lớp 1 cũng hỏng được — mất mạng đúng giữa `throw`
           *     và `deleteUser` là đủ.
           */
          signUpPOST: original.signUpPOST
            ? async (input) => {
                // ⚠️ PHẢI gọi qua `original.signUpPOST(...)`, KHÔNG được tách hàm
                // ra biến rồi gọi trần. `original` là một Proxy do
                // `supertokens-js-override` dựng, và getter của nó trả về hàm đọc
                // `this._call`. Destructure (`const { signUpPOST } = original`)
                // hay gán tạm rồi gọi làm mất `this`, và MỌI lần đăng ký nổ
                // `TypeError: undefined is not an object (evaluating 'this._call')`
                // → 500. Đã dính thật lúc viết task này. `!` ở đây là hệ quả của
                // ràng buộc đó, không phải lười thu hẹp kiểu.
                const response = await original.signUpPOST!(input);
                // Mọi nhánh không-OK (EMAIL_ALREADY_EXISTS_ERROR, SIGN_UP_NOT_ALLOWED,
                // GENERAL_ERROR) đi thẳng ra ngoài: chưa có user nào được tạo nên
                // không có gì để ghi, và cũng không có gì để bù trừ.
                if (response.status !== "OK") return response;

                // `formFields` khai `value: unknown` (types.d.ts) vì form field là
                // do người dùng cấu hình. Ta chỉ khai field kiểu chuỗi.
                const field = (id: string) =>
                  input.formFields.find((f) => f.id === id)?.value as string | undefined;

                try {
                  await createPendingStaff({
                    id: response.user.id,
                    // `?? ""` chỉ để thoả `noUncheckedIndexedAccess`: recipe
                    // emailpassword vừa tạo user BẰNG email nên `emails[0]` luôn có.
                    email: response.user.emails[0] ?? "",
                    // ⚠️ `.trim() ||` chứ không phải `??`. Đã đo (2026-08-11):
                    // SuperTokens từ chối `hoTen: ""` bằng FIELD_ERROR
                    // ("Field is not optional") nhưng CHO QUA chuỗi toàn khoảng
                    // trắng `"   "` — validator mặc định chỉ kiểm "có mặt", không
                    // kiểm nội dung. `??` sẽ để lọt một hồ sơ tên rỗng, hiển thị ra
                    // màn duyệt của OWNER thành một hàng trống không tra được là ai.
                    fullName: field("hoTen")?.trim() || "(chưa đặt tên)",
                    phone: field("soDienThoai")?.trim() || undefined,
                  });
                } catch (e) {
                  // CỐ Ý không tách riêng nhánh `23505` (UNIQUE trên
                  // `staff_users.email`) để trả FIELD_ERROR cho email. Hai lý do,
                  // cả hai đã đo/đọc chứ không đoán:
                  //   1. SuperTokens đã chặn email trùng TRƯỚC insert này. Đo
                  //      2026-08-11: đăng ký lại cùng email trả
                  //      {"status":"FIELD_ERROR","formFields":[{"id":"email",...}]}
                  //      — `signUpPOST` gốc trả EMAIL_ALREADY_EXISTS_ERROR và
                  //      `api/signup.js` dịch nó thành FIELD_ERROR. Nhánh đó thoát
                  //      ở `status !== "OK"` bên trên, không bao giờ tới đây.
                  //   2. Kiểu trả của `signUpPOST` không có biến thể FIELD_ERROR
                  //      (types.d.ts: OK | SIGN_UP_NOT_ALLOWED |
                  //      EMAIL_ALREADY_EXISTS_ERROR | GeneralErrorResponse), nên
                  //      từ đây cũng không trả được.
                  // Nghĩa là 23505 ở đây CHỈ xảy ra khi hai kho đã lệch nhau (hàng
                  // `staff_users` mồ côi, không có user SuperTokens tương ứng) —
                  // đó là sự cố dữ liệu, phải nổ to, không phải lỗi nhập liệu để
                  // hiển thị dịu dàng dưới ô email. Thêm nhánh đó là thêm code chết.
                  console.error("Tạo staff_users thất bại, đang xoá user SuperTokens:", e);
                  await supertokens.deleteUser(response.user.id);
                  throw e;
                }
                return response;
              }
            : undefined,
        }),
      },
    }),
    Session.init({
      // Prod tách subdomain: staff.$ROOT_DOMAIN gọi api.$ROOT_DOMAIN. Đặt cookie ở
      // domain cha để cookie đi được giữa hai subdomain. Ở dev cả hai cùng
      // `localhost` (cổng không tính vào "site") nên KHÔNG đặt — đặt "localhost"
      // làm cookieDomain là cách làm hỏng dev mà không lỗi ở đâu cả.
      //
      // Spread có điều kiện chứ KHÔNG phải `cookieDomain: x ?? undefined`:
      // `apps/api` bật `exactOptionalPropertyTypes` (tsconfig.base.json) và
      // SuperTokens khai `cookieDomain?: string` — không phải `string | undefined`
      // (recipe/session/types.d.ts:47). Truyền `undefined` tường minh là lỗi type.
      //
      // ⚠️ Vế này KHÔNG verify được ở localhost. Chỉ đóng lại bằng một lần đăng
      // nhập thật trên stack đã deploy. §7 docs/plans/2026-08-10-staff-auth-design.md.
      ...(env.rootDomain ? { cookieDomain: `.${env.rootDomain}` } : {}),
    }),
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
