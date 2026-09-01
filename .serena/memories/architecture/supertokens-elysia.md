# SuperTokens ghép vào Elysia qua framework "custom"

ADR 2026-08-05, đối chiếu lại 2026-09-01. **Quyết định về danh tính nhân viên** (role ở
`public.staff_users`, tự đăng ký → PENDING → OWNER duyệt, mã 6 số) nằm ở skill `v9-auth`; chi tiết
implement (`CollectingResponse`, `resolve` vs `.state()`, bảng mã lỗi) ở **`docs/workspaces/api.md`**
(`apps/api/CLAUDE.md` nay chỉ là con trỏ vào skill đó). File
này giữ đúng một thứ hai nơi kia không có: **vì sao ghép kiểu này và nó có chạy được không.**

## Vì sao SuperTokens, và vì sao thử trước khi chốt

Giải quyết câu hỏi danh tính cho `apps/staff` mà không phải tự viết JWT. `supertokens-node` **không
có adapter Elysia**, nên đã thử thật **trước** khi chốt: `init({ framework: "custom" })` chạy được
dưới Bun, `middleware()` trả handler.

## Cách ghép

Framework `"custom"` phơi `PreParsedRequest` / `CollectingResponse` — chuẩn Web `Request`/`Response`,
**cùng lớp SuperTokens dùng cho Next App Router**. Elysia cũng chạy trên `Request`/`Response` nên
ghép tự nhiên.

- `middleware()` gọi **không tham số** → `wrapRequest`/`wrapResponse` mặc định là identity
- Elysia `.all("/auth/*")` dựng `PreParsedRequest` tay từ raw `Request` (url, method lowercase,
  headers, cookies, query, `getJSONBody`, `getFormBody`)
- `new CollectingResponse()` làm buffer; resolve xong thì dựng `new Response(...)` từ
  `.body`/`.statusCode`/`.headers`
- Elysia nhận ra `instanceof Response` và trả nguyên

⚠️ `CollectingResponse` **không** nhét cookie vào `.headers` — nó cất riêng ở mảng `.cookies`
(`CookieInfo[]`), vì adapter "custom" không biết framework đích biểu diễn `Set-Cookie` kiểu gì. Bỏ
vòng lặp đọc mảng đó = session không bao giờ được set. Mã hiện dùng chính
`serializeCookieValue` của `supertokens-node/lib/build/framework/utils` (nằm trong `exports` map,
không phải hack) để cookie phát ra **giống từng byte** với adapter express/fastify — tự nối chuỗi
thì `Expires`, escape giá trị và hoa/thường của `SameSite` là ba chỗ lệch âm thầm. Version ghim cứng
`supertokens-node: 24.0.3` nên đường dẫn sâu đó không tự trôi.

## Một cải tiến đã phát hiện nhưng CHƯA áp dụng

Subpath **`supertokens-node/custom`** (khác `supertokens-node/framework/custom`) có sẵn
`handleAuthAPIRequest(): (req: Request) => Promise<Response>` — đúng cây cầu Request→Response đó,
dựng sẵn. Đổi sang nó sẽ xoá ~30 dòng cầu tay mà không đổi hành vi.

**Kiểm 2026-09-01: subpath `./custom` vẫn có trong `exports` của 24.0.3, và mã vẫn CHƯA đổi** — vẫn
import từ `supertokens-node/framework/custom`. Vẫn là ứng viên refactor, chưa ai làm.

## Hạ tầng

- Image `registry.supertokens.io/supertokens/supertokens-postgresql`
- `POSTGRESQL_TABLE_SCHEMA=supertokens` đã kiểm chứng đặt đúng 55 bảng vào schema `supertokens`,
  **zero** vào `public`
- Role `supertokens_app`: `REVOKE ALL ON SCHEMA public` — không có quyền gì trên `public`
- Healthcheck dùng **curl** (image có curl+bash, **không có wget**) hit `GET /hello` → `"Hello"`
- **SuperTokens không có route Caddy.** Chỉ `apps/api` nói chuyện với nó; phơi ra ngoài là mở rộng
  bề mặt tấn công vô cớ.

## ⚠️ Một câu trong ADR cũ ĐÃ LỖI THỜI

ADR gốc ghi: *"chưa route nào enforce auth, chưa có màn hình đăng nhập — có chủ ý, vì cơ chế phân
quyền chưa từng chạy thì trông như đã kiểm chứng trong khi không."*

**Không còn đúng.** 2026-09-01: `apps/api/src/plugins/staff-guard.ts` tồn tại và
`routes/{rentals,staff,stats}.ts` đều `.use(staffGuard)`; có `staff-guard.test.ts` và
`staff-guard-revocation.test.ts`.

Kèm theo: **comment SEAM ở `apps/api/src/plugins/auth.ts` (~dòng 26) vẫn viết "CHƯA route nghiệp vụ
nào enforce auth" — comment đó đã lỗi thời trong chính source.** Đáng sửa; ghi ra đây để người sau
đừng tin nó.

Câu còn đúng: **`apps/web` không dùng auth** (khách gửi yêu cầu thuê không cần tài khoản), và
Directus giữ hệ tài khoản riêng — **hai nơi đăng nhập là chấp nhận có ý thức**, hợp nhất bằng OIDC
nếu sau này phiền.

Liên quan: skill `v9-auth` · `mem:architecture/directus`
