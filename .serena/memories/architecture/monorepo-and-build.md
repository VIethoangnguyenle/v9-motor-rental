# Layout monorepo, đồ thị phụ thuộc, và ba bẫy Docker

Nguồn: ADR 2026-08-05 (đợt scaffold) trong agentmemory, đã đối chiếu lại với repo 2026-09-01.

## Workspace

`bun workspaces`: `apps/{api,staff,web}` + `packages/{db,shared}`.

⚠️ **Bản ghi cũ ghi `apps/admin`.** App đó đã đổi tên thành `apps/staff` (SPA vận hành). Mọi câu
trong ADR cũ nói "admin" phải đọc là "staff": `apps/staff/Dockerfile`, `staff.<domain>` trong
`Caddyfile`, `VITE_API_URL`.

## Đồ thị phụ thuộc — **ép bằng máy**, không phải quy ước

`eslint-plugin-boundaries` 7.1.0, rule `boundaries/dependencies` (tên cũ `boundaries/element-types`
đã deprecated; cùng factory, cùng options, đổi tên là zero-behaviour-change và đã probe lại).

```
shared/domain  -> KHÔNG GÌ CẢ (pure, zero import, TDD nghiêm)
shared/client  -> chỉ @elysiajs/eden + elysia (type-only)
shared-root    -> chỉ shared-domain
db             -> chỉ db
api-infra (db.ts, env.ts) -> chỉ api-infra
api-services   -> api-services, api-infra, db, shared-domain
api-routes     -> api-routes, api-services, api-plugins, shared-domain   (KHÔNG chạm api-infra)
api-root       -> api-root, api-routes, api-plugins, api-infra, shared-domain  (KHÔNG chạm db)
frontend       -> frontend, frontend-ui, shared-domain, shared-client
                  + api-root CHỈ khi dependency.kind === "type"
frontend-ui    -> (apps/staff/src/components/ui/**, khai TRƯỚC `frontend` nên thắng)
```

**`frontend-ui` là element mới sau ADR gốc** (đợt design system 2026-08-16) và nó đẻ ra một cái bẫy
thật: với `elements-single-match` mặc định `true`, hai pattern folder chồng nhau **không** dồn vào
cùng `element.types` — descriptor khai trước thắng và file nhận **đúng một** type. Nên policy
`frontend → frontend` phải khai rõ `"frontend-ui"` trong `anyOf`, nếu không `pages/` mất quyền
import từ `ui/`. Comment cũ trong `eslint.config.js` khẳng định ngược lại và **đã sai**.

Cách probe hàng rào: skill `v9-fences` (bốn lệnh, phải đọc **tên luật** chứ không nhìn exit code).
Vì sao luật đó tồn tại: `mem:process/verification-traps`.

## Kiến trúc: functional core + imperative shell

`packages/shared` là core thuần; `apps/api` là shell mỏng `route → service → Drizzle trực tiếp`.
**KHÔNG class, KHÔNG DI container, KHÔNG repository interface** — bọc Drizzle sau repository trả
entity phải trả giá allocation mỗi request và mất khả năng compose join (đường ngắn nhất tới N+1).
SOLID vẫn có, ở dạng hàm một trách nhiệm + deps là tham số.

Hai frontend dùng hai framework **có chủ ý**: `apps/web` = Next 16 (SEO là lý do tồn tại),
`apps/staff` = Vite + TanStack, SPA tĩnh (nội bộ, SEO vô nghĩa). Đừng "thống nhất".

## Eden Treaty nối được mà không tạo chu trình `shared ↔ api`

Vấn đề: `packages/shared` giữ domain logic **và** phải cung cấp typed client, nhưng Eden cần
`typeof app` từ `apps/api`, mà `apps/api` import domain từ `shared`.

Chốt: `packages/shared/src/client.ts` export `createApiClient<T extends AnyElysiaApp>(baseUrl)` bọc
`treaty<T>()`. **`shared` không bao giờ import `apps/api`.** Frontend ghép hai đầu:

```ts
import type { App } from "@v9/api";
import { createApiClient } from "@v9/shared/client";
export const api = createApiClient<App>(url);
```

Chữ ký thật của `treaty` là `<const App extends Elysia<any,any,any,any,any,any,any>>`, nên
`client.ts` **phải** `import type { Elysia } from "elysia"`. Đó là lý do `packages/shared` có **hai**
dependency chứ không phải một — `elysia` là thư viện bên thứ ba, khác hẳn `@v9/api`, và là
`import type` nên bị xoá lúc build.

ESLint cho `frontend → api-root` **chỉ** với `dependency.kind: "type"`; value import vẫn bị chặn, đã
probe cả hai chiều.

**Điều kiện để type chảy được:** mọi route **phải** khai response schema TypeBox — kể cả cho từng
status code lỗi. Route không khai thì frontend nhận `unknown`, và `error.value` cũng `unknown`.

TanStack Query **bọc lên** Eden chứ không thay: `queryFn` chỉ gọi `api.<route>.get()`.
⚠️ Nhưng Eden nuốt lỗi transport — xem `mem:architecture/eden-swallows-transport-errors`.

## Ba bẫy đóng Docker cho bun workspace (còn nguyên trong `apps/*/Dockerfile`)

1. **Pattern 2-stage `deps` KHÔNG dùng được.** Bun dùng isolated linker: `bun install` không hoist
   lên root `node_modules`; mọi thứ nằm ở `apps/<app>/node_modules/*` dạng symlink trỏ vào store
   `node_modules/.bun`. `COPY --from=deps /app/node_modules` chép một thư mục gần như rỗng → image
   không resolve được **mọi** dependency, không riêng `@v9/*`.
   Đúng: copy manifest → `bun install --frozen-lockfile` **tại chỗ**.
2. **`--frozen-lockfile` xác thực TOÀN BỘ đồ thị workspace.** Thiếu `package.json` của bất kỳ
   workspace nào — kể cả workspace app này không dùng — nó báo "lockfile had changes" và fail. Nên
   mỗi Dockerfile COPY manifest của **tất cả** workspace.
3. **Next 16 build crash trên Bun + musl**: `"Expected CommonJS module to have a function wrapper"`
   ở pha "Collecting page data". Cùng source, cùng lockfile, host glibc thì chạy. Vá:
   `apk add nodejs` trong builder rồi gọi thẳng `node ./node_modules/.bin/next build`. `bun install`
   và Turbopack không bị ảnh hưởng.

**Bẫy thứ tư, KHÔNG có trong ADR cũ — thêm sau, cùng họ "hỏng im lặng":** Node bản Alpine dựng với
ICU tối giản (`en`), và `Intl` **không ném lỗi** khi thiếu locale, nó lặng lẽ rơi về `en-US`.
`formatVnd()` chạy trên `Intl.NumberFormat("vi-VN")` nên mọi trang prerender ra `450,000 ₫` thay vì
`450.000 ₫` — người Việt đọc thành 450 đồng, và nó đi vào cả `generateMetadata`. Tệ hơn: **bug tự
giấu mình**, vì stage runtime `node:22-alpine` có full ICU nên sau lần ISR revalidate đầu trang tự
sửa lại. Vá bằng `apk add icu-data-full` **cộng** một dòng `node -e` assert `format(450000) ===
"450.000"` ngay trong builder — hàng rào, không phải trang trí.

Runtime ba image cố ý khác nhau: `api` = `oven/bun` (driver bun-sql đòi Bun) · `web` =
`node:22-alpine` chạy `.next/standalone` (nhớ COPY `public/` tay — `output: "standalone"` không gói
nó) · `staff` = `caddy:2-alpine` phục vụ tĩnh.

Liên quan: `mem:architecture/migrations` · `mem:architecture/directus` · `mem:process/verification-traps`
