// DOM giả cho test component của apps/staff. `bun test` chạy trên Bun runtime,
// không có DOM — không có file này thì mọi `render()` ném `document is not defined`.
//
// GlobalRegistrator gắn document/window vào global scope MỘT LẦN cho cả tiến trình
// test. Nạp qua `preload` của bunfig.toml chứ không import trong từng file test:
// import lẻ thì thứ tự nạp phụ thuộc thứ tự file, và một file quên import sẽ đỏ
// theo cách trông như lỗi của chính nó.
import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Ruling 5: happy-dom được cầm DOM, KHÔNG được cầm tầng mạng. `GlobalRegistrator.register()`
// không chỉ "thêm global" — nó GHI ĐÈ mọi property của `window` lên `globalThis`, và tầng mạng ở
// đây là BỐN global: `fetch`, `Request`, `Response`, `Headers`. Mất bốn cái đó thì `apps/api` đỏ
// theo HAI kiểu khác nhau, đo trên ba file gọi `supertokens-node` (`querier.js` → SuperTokens core
// ở `http://localhost:3567`) và trên `app.handle()` của Elysia:
//
//   - Thiếu `fetch`: `NetworkError: Cross-Origin Request Blocked` — cửa sổ trình duyệt giả của
//     happy-dom mặc định bật Same-Origin Policy, và gọi ra `localhost:3567` bị nó coi là khác gốc.
//     `supertokens-node` dùng `fetch` toàn cục để gọi core, nên toàn bộ lệnh gọi core chết theo
//     kiểu network, không phải lỗi assertion — kèm một hệ quả phụ: lỗi ném trong `beforeAll`/hook
//     làm RỚT LUÔN các test còn lại trong cùng suite (7 test biến mất khỏi tổng số, không chỉ 4
//     assertion tự thân đỏ).
//   - Thiếu `Request`/`Response`/`Headers` (dù ĐÃ trả lại `fetch`): `expect(200).toBe(401)` — một
//     kiểu đỏ HOÀN TOÀN KHÁC, trông như bug xác thực/thu hồi session thật. Test gọi thẳng
//     `app.handle(new Request(...))` và đọc `res.headers.getSetCookie()`; sau khi happy-dom ghi đè
//     ba class này, `Request`/`Response`/`Headers` toàn cục không còn là instance Bun/Fetch API mà
//     Elysia mong đợi, nên `app.handle()` đọc sai cookie/session ngay từ bước xác thực cơ bản —
//     TRƯỚC CẢ khi chạm tới logic thu hồi mà bài test đang canh. Không có gợi ý DOM giả nào ở
//     thông báo lỗi — người sau gặp ca này dễ đi sửa nhầm `staff-guard.ts`.
//
// Đo cả bốn mốc, trên 3 file `apps/api` (`password-reset.test.ts`, `auth.test.ts`,
// `staff-guard-revocation.test.ts`):
//   - không preload:                                37 pass / 0 fail  (baseline)
//   - preload, chỉ bắt lại `fetch`:                  26 pass / 4 fail, 7 test biến mất — CORS
//   - preload, bắt lại cả bốn global dưới đây:       37 pass / 0 fail  — khớp baseline
// Bắt cả bốn global gốc TRƯỚC khi đăng ký, trả lại NGAY SAU — có DOM cho test component, KHÔNG đổi
// tầng mạng cho phần còn lại của repo. XOÁ khối dưới đây thì ba file `apps/api` đỏ lại theo MỘT
// trong hai kiểu trên tuỳ dòng nào bị xoá, không kèm gợi ý nào tại chỗ lỗi nói đây là do DOM giả.
const nativeFetch = globalThis.fetch;
const nativeRequest = globalThis.Request;
const nativeResponse = globalThis.Response;
const nativeHeaders = globalThis.Headers;
GlobalRegistrator.register();
globalThis.fetch = nativeFetch;
globalThis.Request = nativeRequest;
globalThis.Response = nativeResponse;
globalThis.Headers = nativeHeaders;

// `@testing-library/react` thường tự móc `cleanup()` vào `afterEach` của framework
// test — nhưng cơ chế tự móc đó dò global `afterEach` tại THỜI ĐIỂM MODULE INIT của
// chính nó, và ESM cache module: cả tiến trình `bun test` chỉ init nó MỘT LẦN
// (giống `document` ở trên — preload chạy một lần, không phải mỗi file). Đo trực
// tiếp trên `modal.test.tsx` (2 test, không unmount giữa hai test): panel còn lại
// trong DOM sau test 1, kiểm bằng `document.querySelectorAll("[data-panel]").length`
// ngay đầu test 2:
//   - `bun test modal.test.tsx` một mình:                          1 panel — tự dọn
//   - `bun test modal.test.tsx use-layout-variant.test.ts`:        2 panel — KHÔNG dọn
//   - đảo thứ tự hai file trên:                                    2 panel — KHÔNG dọn
// Tức việc tự-dọn "ăn may" khi chạy một file đơn, và mất hẳn ngay khi có từ hai
// file trở lên trong cùng lần `bun test` — không phụ thuộc file nào đứng trước.
// Triệu chứng đã bắt sống: `modal.test.tsx` đỏ ở test "footer nằm NGOÀI vùng cuộn"
// khi chạy chung với `use-layout-variant.test.ts` — `querySelector("[data-panel]")`
// bắt phải panel của lần render TRƯỚC (không có footer, còn `overflow-y-auto`) vì
// nó vẫn nằm trong `document`, không phải panel của lần render đang test. Không tự
// đăng ký `afterEach(cleanup)` ở đây thì bộ test âm thầm phụ thuộc thứ tự chạy.
//
// `import()` động, KHÔNG `import` tĩnh ở đầu file: import tĩnh của
// `@testing-library/react` bị hoist và chạy TRƯỚC dòng `GlobalRegistrator.register()`
// phía trên — `@testing-library/dom` chốt singleton `screen` vào global `document`
// ngay lúc module init, mà lúc đó `document` chưa tồn tại. Đo được: làm vậy thì MỌI
// test dùng `screen` (kể cả chạy một file, một mình) đỏ đồng loạt với
// `TypeError: For queries bound to document.body a global document has to be
// available`. `import()` động chạy sau khi `register()` đã gắn `document` xong.
const { cleanup } = await import("@testing-library/react");
afterEach(cleanup);
