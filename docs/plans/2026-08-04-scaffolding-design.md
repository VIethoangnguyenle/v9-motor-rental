# V9 Motor Rental — Scaffolding & Agent Environment Design

- **Ngày**: 2026-08-04
- **Trạng thái**: Approved (người dùng duyệt trong phiên brainstorm)
- **Phạm vi**: hạ tầng, scaffold, môi trường làm việc cho AI agent. **Không** có business feature nào.

---

## 1. Bối cảnh

Hệ quản lý cho một shop cho thuê mô tô phân khối lớn ở TP.HCM. UI tiếng Việt trước, tiếng Anh sau.
Ba deliverable dài hạn, phiên này chỉ dựng khung:

| App | Vai trò | Ghi chú |
|---|---|---|
| `apps/api` | Backend API | Bun + Elysia + TypeBox |
| `apps/admin` | App quản trị nội bộ | Role `OWNER`, `STAFF`; `SALES` để dành |
| `apps/web` | Site khách hàng công khai | SEO quan trọng → SSG/ISR |

Repo này sẽ được phát triển chủ yếu bởi AI agent. Vì vậy CLAUDE.md và ranh giới do máy ép
là deliverable ngang hàng với code, không phải phụ lục.

## 2. Non-goals (cố ý không làm ở phiên này)

- Không implement bất kỳ business feature nào (booking, pricing thật, khách hàng, xe, thanh toán).
- Không implement auth — chỉ để lại seam đánh dấu rõ.
- Không k8s.
- Không i18n runtime (next-intl); chỉ để seam.
- Không quyết định **chính sách tính ngày thuê**. Đó là business policy, phải brainstorm riêng.

## 3. Quyết định đã khoá từ đầu (người dùng đặt ra, không mở lại)

Runtime Bun + Elysia, TypeBox validation, Eden Treaty cho type xuyên suốt · Next.js App Router
`output: "standalone"` ~~cho cả admin và web~~ **chỉ cho `apps/web`** (xem §4.10 — người dùng
đổi ngày 2026-08-05) · PostgreSQL + Drizzle, migration là file SQL trong
`packages/db` · monorepo bun workspaces · `packages/shared` giữ **toàn bộ** domain logic pricing
và availability dạng pure function có unit test, frontend không được implement lại ·
MinIO cho ảnh xe và ảnh check-in · Docker Compose cho cả dev và prod, có Caddy auto-HTTPS ·
chống double-booking bằng exclusion constraint Postgres trên `(vehicle_id, tstzrange)`,
bật `btree_gist` ngay migration đầu.

## 4. Quyết định chốt trong phiên này

### 4.1 Eden client đặt ở đâu — phá vòng lặp `shared ↔ api`

**Vấn đề.** Spec yêu cầu đồng thời hai điều: `packages/shared` giữ toàn bộ domain logic, *và*
frontend gọi API qua "typed Eden client từ `packages/shared`". Nhưng Eden cần `typeof app` từ
`apps/api`, trong khi `apps/api` import `packages/shared` để dùng domain logic → chu trình
`shared → api → shared`. Nó cũng phá điều kiện zero-dep của `shared`, vốn là thứ khiến ép TDD
nghiêm ở đó trở nên khả thi.

**Chốt.** `packages/shared` thêm subpath export `@v9/shared/client`, export
`createApiClient<T>(baseUrl)` bọc `treaty<T>()`. `shared` **không bao giờ** import `apps/api`.
Frontend tự cấp type:

```ts
// apps/web/lib/api.ts
import type { App } from "@v9/api";
import { createApiClient } from "@v9/shared/client";
export const api = createApiClient<App>(process.env.NEXT_PUBLIC_API_URL!);
```

**Hệ quả.** `packages/shared` có đúng **hai** dependency — `@elysiajs/eden` và `elysia` — và cả
hai bị nhốt trong subpath `/client`. Domain logic nằm ở `src/domain/**` và tuyệt đối không import
gì; đó mới là vùng bắt buộc TDD.

> **Sửa ngày 2026-08-05.** Bản duyệt đầu ghi "đúng một dependency". Sai, và chỉ lộ ra khi biên
> dịch thật ở Task 5: chữ ký của `treaty` là
> `<const App extends Elysia<any, any, any, any, any, any, any>>`, nên `createApiClient<T>` phải
> ràng buộc `T extends Elysia<...>`, tức `shared` buộc phải biết type `Elysia`.
>
> Điều này **không** tái lập chu trình. `shared → elysia` là phụ thuộc vào một thư viện bên thứ
> ba, khác hẳn `shared → @v9/api` vốn là thứ tạo vòng. Import cũng là `import type` nên bị xoá
> lúc build, không có chi phí runtime nào cho frontend. Tính chất cần bảo vệ — `shared` không bao
> giờ biết tới `apps/api` — vẫn nguyên vẹn.

**Đã loại.** Tách `packages/api-client` riêng (sạch hơn nhưng thêm một package và lệch câu chữ
của spec) · `apps/api` tự export client (ít file nhất nhưng frontend coupling thẳng vào app backend).

### 4.2 Docker Compose — hai file

`compose.yaml` là dev, chỉ `postgres` + `minio` (+ một container `mc` one-shot tạo bucket).
`compose.prod.yaml` là stack đầy đủ sáu service kèm `caddy`.

Lý do: HMR chạy native trên host nhanh hơn hẳn qua bind mount trên Linux, và mỗi file đọc hết
được trong một lượt, không có merge ẩn của `compose.override.yaml`.

**Đánh đổi đã chấp nhận**: hai file có thể trôi khỏi nhau. Giảm thiểu bằng cách để `.env.example`
là nguồn sự thật duy nhất cho tên biến môi trường ở cả hai file.

**Đã loại.** Một file + profiles (một file phải gánh cả khác biệt port, build target, domain HTTPS)
· full stack trong Docker cả dev (HMR chậm, rebuild image mỗi lần đổi dependency).

### 4.3 Migration — `drizzle-kit generate` + `--custom`

Bảng thường khai báo trong `packages/db/src/schema/*.ts`, sinh SQL bằng `drizzle-kit generate`.
DDL Postgres thuần mà Drizzle DSL không biểu diễn được (`btree_gist`, exclusion constraint,
partial index) viết tay qua `drizzle-kit generate --custom`, vẫn nằm trong journal.

Một journal duy nhất biết toàn bộ trạng thái đã apply → `bun run db:migrate` chỉ là một lệnh.
Drizzle không đụng tới constraint nó không biết.

**`drizzle-kit push` bị cấm** trong repo này. Schema chỉ đi qua migration file — đây là điều kiện
để môi trường dev và prod hội tụ, và để review được thay đổi schema trong diff.

### 4.4 Tiền — `number`, số nguyên, đơn vị đồng

VND không có đơn vị phụ nên `1 = 1 đồng`, luôn nguyên.

| Tầng | Biểu diễn |
|---|---|
| `packages/shared` | `export type Vnd = number` |
| `packages/db` | `bigint("...", { mode: "number" })` → cột Postgres `bigint` |
| `apps/api` | `t.Integer({ minimum: 0 })` |
| JSON qua Eden | số nguyên native, không cần serializer riêng |

`MAX_SAFE_INTEGER` ≈ 9 triệu tỷ đồng, xa mọi con số của shop. Rủi ro duy nhất là phép chia sinh
số lẻ → chặn bằng test và bằng quy ước **làm tròn phải tường minh** trong `shared/domain/money.ts`.

**Đã loại.** Minor units ×100 (thổi mọi số VND lên 100 lần vô nghĩa, mọi chỗ hiển thị phải nhớ chia)
· `bigint` của JS (`JSON.stringify` ném lỗi → phải tự viết serializer hai đầu cho Eden, TypeBox
không có schema bigint sẵn).

### 4.5 Kiến trúc backend — functional core, imperative shell

`packages/shared` là functional core: pure, zero-dep, TDD bắt buộc.
`apps/api` là imperative shell mỏng: `route → service → Drizzle` trực tiếp.
Không class, không DI container, không repository interface.

**Vì sao không Clean Architecture đầy đủ.** Người dùng ưu tiên performance cho backend. Bọc Drizzle
sau repository trả về domain entity phải trả giá runtime thật: allocation cho việc map entity ↔ row
ở mọi request, và mất khả năng compose join của Drizzle — con đường ngắn nhất dẫn tới N+1.
Ranh giới thật sự cần cho pricing/deposit/availability đã được `packages/shared` cung cấp ở dạng
cứng hơn quy ước: nó là package riêng, do workspace và ESLint ép, không do lễ nghi.

SOLID vẫn có, ở dạng function một trách nhiệm và tham số, không ở dạng interface.

### 4.6 Design pattern cho backend (ghi thành luật trong CLAUDE.md)

1. **Elysia plugin cho mỗi domain**, luôn đặt `name`. Đây là cách compose duy nhất giữ được
   codegen tĩnh của Elysia; thiếu `name` thì plugin bị chạy lại nhiều lần.
2. **Deps là tham số**: `createRental(deps, input)`. Dependency inversion không cần container,
   test không cần mock framework.
3. **Domain trả discriminated union, không throw**: `{ ok: false, reason: ... }`. Route dịch sang
   HTTP. Exception đắt và làm mất type.
4. **Transaction boundary thuộc service, không thuộc route.** Bắt buộc bắt Postgres `23P01`
   (`exclusion_violation`) và dịch thành **409**. Đây là mặt trái của quyết định chống
   double-booking ở tầng DB: không bắt mã này thì va chạm booking rơi ra ngoài dưới dạng 500.

   > **Cách bắt — kiểm chứng thực nghiệm ở Task 7, đừng đoán lại:**
   >
   > **SQLSTATE nằm ở `.errno`, KHÔNG phải `.code`.** Bun.SQL bọc lỗi server-side thành
   > `PostgresError` với `.code` luôn bằng `"ERR_POSTGRES_SERVER_ERROR"` cho *mọi* lỗi Postgres.
   > Viết `if (e.code === "23P01")` cho ra một điều kiện **không bao giờ đúng**, và nó im lặng —
   > va chạm booking sẽ thành 500, còn unit test không bắt được vì phải có Postgres thật mới lộ.
   >
   > ```ts
   > if ((e as { errno?: string }).errno === "23P01") return { ok: false, reason: "overlap" };
   > ```
   >
   > **Lỗi trong transaction làm hỏng cả transaction.** Sau một câu lệnh lỗi, mọi câu sau đều bị
   > từ chối với `current transaction is aborted`. Nếu service cần *thử* insert rồi xử lý va chạm
   > mà vẫn dùng tiếp transaction đó, phải bọc câu có thể lỗi trong `tx.savepoint(...)` —
   > nó phát `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` và gỡ độc cho transaction ngoài.

### 4.7 Lint / format — ESLint 9 flat + Prettier

Chọn ESLint thay Biome vì hai thứ Biome không có và đáng tiền ở codebase async nhiều:
`no-floating-promises`, `no-misused-promises` (type-aware), cộng `eslint-plugin-boundaries` ép
tầng đúng nghĩa. Chấp nhận `bun run lint` chậm hơn (~8–15s toàn repo) — đó là chi phí dev-time,
không phải runtime.

### 4.8 Performance — default nhanh + driver Bun.sql native + seam đo đạc

Driver: `drizzle-orm/bun-sql` trên `Bun.SQL` native (đã verify export tồn tại trong
`drizzle-orm@0.45.2`: `./bun-sql`, `./bun-sql/driver`, `./bun-sql/session`, `./bun-sql/migrator`).

**Rủi ro đã nêu và người dùng vẫn chọn**: adapter `bun-sql` trẻ hơn `postgres-js`, edge case
transaction và pool còn đang chín; và nó buộc **`apps/api`** chạy trên Bun ở mọi môi trường,
mất đường lùi Node cho riêng service đó. (`apps/admin` và `apps/web` không bị ảnh hưởng —
runtime của chúng vẫn là Node, xem mục 9.)
**Giảm thiểu**: driver bị nhốt trong **đúng một file** `apps/api/src/db.ts`. Đổi về
`drizzle-orm/postgres-js` là sửa một file, không service nào phải đổi. Việc adapter chạy thật
nằm trong danh sách verify của phiên implement, không tin vào README.

Kèm theo: một pool duy nhất · response schema TypeBox ở mọi route để Elysia serialize đường nhanh ·
prepared statement cho query nóng · index GiST của exclusion constraint dùng luôn cho tra cứu
availability · `plugins/timing.ts` ghi `{route, ms, status}` có cấu trúc · `bun run bench`.

**Perf budget — vượt là coi như test fail, không phải góp ý:**

| Thao tác | p95 |
|---|---|
| `GET /health` | < 5 ms |
| Đọc một record theo id | < 25 ms |
| Truy vấn availability | < 50 ms |

### 4.9 Deploy — GitHub Actions → GHCR → SSH vào VPS

Người dùng chủ động đè ràng buộc "no CI" trong spec gốc.

`ci.yml`: mọi push và PR chạy `bun install` → `lint` → `typecheck` → `test`.
`deploy.yml`: push vào `main` chạy CI, build ba image, đẩy lên
`ghcr.io/viethoangnguyenle/v9-motor-rental-{api,admin,web}`, rồi SSH vào VPS chạy
`docker compose -f compose.prod.yaml pull && up -d`. (GHCR bắt buộc chữ thường ở phần owner —
tài khoản viết là `VIethoangnguyenle` nhưng tên image phải là `viethoangnguyenle`.)

Secrets cần: `SSH_HOST`, `SSH_USER`, `SSH_KEY`. Thêm một **repository variable** `ROOT_DOMAIN`
(để ở variable chứ không phải secret vì tên miền không bí mật) — build của `apps/admin` cần nó.
GHCR dùng `GITHUB_TOKEN` sẵn có.

**Hệ quả của việc `apps/admin` là SPA tĩnh:** Vite nướng `VITE_API_URL` thẳng vào bundle lúc
build. Khác hẳn `apps/api` và `apps/web` vốn đọc env lúc chạy. Đổi API URL của admin **bắt buộc
phải build lại image** — khai biến trong `compose.prod.yaml` hoàn toàn vô tác dụng. Vì vậy
`deploy.yml` phải truyền `--build-arg VITE_API_URL=...` cho riêng image admin.

> **Đã ghi nhận**: token `gh` hiện tại có scope `gist, read:org, repo` — **thiếu `workflow`**.
> Không vỡ vì git protocol đang là SSH nên push file workflow vẫn qua. Chỉ vỡ nếu sau này
> chuyển sang push HTTPS; khi đó phải thêm scope `workflow`.

### 4.10 `apps/admin` chuyển sang TanStack, `apps/web` giữ Next

**Thay đổi sau khi design doc đã duyệt** (2026-08-05, giữa lúc thực thi Task 3). Người dùng
yêu cầu frontend dùng TanStack. "TanStack" là một họ sản phẩm nên đã hỏi rõ mức độ; chốt phương án
tách đôi:

| App | Stack | Vì sao |
|---|---|---|
| `apps/admin` | Vite + TanStack Router + TanStack Query, build ra SPA tĩnh | Dashboard nội bộ. **SEO không có nghĩa gì** ở đây, nên ràng buộc SSG/ISR vốn là lý do chọn Next không áp dụng. Router type-safe của TanStack ghép với Eden Treaty tự nhiên hơn App Router. |
| `apps/web` | Next 16 App Router, `output: "standalone"`, SSG/ISR | **SEO là lý do Next được chọn ngay từ đầu.** Không có gì thay đổi lý do đó. |

**Giá phải trả, ghi rõ để không ai ngạc nhiên sau:** hai framework trong một repo, hai cách build,
hai Dockerfile khác hẳn nhau. Một lập trình viên chuyển giữa hai app phải đổi mô hình tư duy —
`apps/web` là server-first (RSC, fetch trong server component), `apps/admin` là client-first
(SPA, mọi thứ qua TanStack Query).

**Không đổi:** `packages/shared` vẫn là nguồn duy nhất của domain logic cho cả hai. Eden Treaty
vẫn dùng `createApiClient<App>()` từ `@v9/shared/client` y như §4.1 — TanStack Query **bọc lên
trên** Eden chứ không thay nó, nên `queryFn` chỉ là gọi `api.<route>.get()`. Đồ thị phụ thuộc ở
§6 giữ nguyên: `apps/admin` vẫn chỉ được chạm `@v9/shared` và type-only `@v9/api`.

**Đã loại.** Chỉ thêm TanStack Query lên Next (nhẹ nhất, nhưng không tận dụng được router
type-safe cho dashboard) · TanStack Start thay Next cả hai (đảo quyết định đã khoá, và ISR của
Start chưa chín bằng Next — trong khi SSG/ISR chính là yêu cầu đặt ra cho `apps/web`).

### 4.11 Mọi workspace chạy trên Bun phải khai `"types": ["bun"]`

Phát hiện khi chạy thật ở Task 3, không phải suy đoán. TypeScript **không tự nạp** `@types/bun`
trong layout install của bun. Hệ quả dây chuyền: `bun:test` không có type → `typecheck` báo
`TS2307` → `describe`/`it`/`expect` bị suy ra là `any` → type-aware lint nổ 30 lỗi
`no-unsafe-call`.

Đã kiểm chứng bằng cài lại sạch: thêm `bun-types` làm devDependency **không** giải quyết được;
chỉ `"types": ["bun"]` trong `tsconfig.json` của từng workspace mới đủ. Áp dụng cho
`packages/shared`, `packages/db`, `apps/api`. `apps/web` dùng type mặc định của Next;
`apps/admin` dùng `"types": ["vite/client"]`.

Đặt ở từng workspace chứ không đặt ở `tsconfig.base.json` là có chủ ý: nó khai báo tường minh
workspace nào chạy trên runtime nào, thay vì để một dòng ở base ngầm áp lên cả hai frontend
vốn không chạy trên Bun.

## 5. Repo map

```
v9-rental/
├── apps/
│   ├── api/                    @v9/api
│   ├── admin/                  @v9/admin
│   └── web/                    @v9/web
├── packages/
│   ├── db/                     @v9/db
│   └── shared/                 @v9/shared
├── docs/plans/
├── .github/workflows/          ci.yml  deploy.yml
├── compose.yaml                dev: postgres + minio + mc
├── compose.prod.yaml           prod: 6 service + caddy
├── Caddyfile
├── CLAUDE.md  PRODUCT.md  DESIGN.md
├── .env.example  .gitignore
├── eslint.config.js  .prettierrc  tsconfig.base.json
└── package.json                workspaces + canonical scripts
```

## 6. Đồ thị phụ thuộc và cách ép

```
@v9/shared/domain   ──►  (không gì cả)
@v9/shared/client   ──►  @elysiajs/eden
@v9/db              ──►  drizzle-orm
@v9/api             ──►  @v9/db, @v9/shared
@v9/web, @v9/admin  ──►  @v9/shared, @v9/api (type-only)
```

Trong `apps/api`: `routes → services → db`. Không có mũi tên ngược.

`eslint-plugin-boundaries` cấu hình element-types theo đúng đồ thị trên. Thêm hai luật:
`packages/shared/src/domain/**` không được import gì ngoài chính nó; `apps/*` không được import
sâu vào `src/` của package khác (chỉ qua entrypoint đã export).

## 7. Version pin

| Package | Version | Ghi chú |
|---|---|---|
| bun | 1.3.10 | runtime, đã có trên máy |
| **typescript** | **6.0.3** | **pin < 7** |
| elysia | 1.4.29 | |
| @elysiajs/eden | 1.4.9 | |
| @elysiajs/cors | 1.4.2 | |
| drizzle-orm | 0.45.2 | export `./bun-sql` đã verify |
| drizzle-kit | 0.31.10 | |
| next | 16.3.0 | **chỉ `apps/web`** |
| react · react-dom | 19.2.8 | cả hai frontend |
| vite · @vitejs/plugin-react | 8.2.0 · 6.0.5 | **chỉ `apps/admin`** |
| @tanstack/react-router | 1.170.18 | `apps/admin` |
| @tanstack/react-query | 5.101.4 | `apps/admin` |
| eslint | 10.8.0 | |
| typescript-eslint | 8.66.0 | peer `typescript >=4.8.4 <6.1.0` |
| eslint-plugin-boundaries | 7.1.0 | peer `eslint >=6` |
| prettier | 3.9.6 | |

**Vì sao TypeScript bị pin ở 6.0.3 dù 7.0.2 đã ra.** `typescript-eslint@8.66.0` khai peer
`typescript: ">=4.8.4 <6.1.0"`. TS 7 (bản compiler viết lại bằng Go) nằm ngoài range → type-aware
lint không chạy, mà `no-floating-promises` chính là lý do chọn ESLint thay Biome. 6.0.3 là bản
mới nhất còn nằm trong range.

**Điều kiện gỡ pin**: khi `typescript-eslint` phát hành bản nới peer lên TS 7. Luật này phải nằm
trong CLAUDE.md, nếu không phiên sau sẽ có agent nâng TS lên 7 rồi làm gãy lint mà không hiểu vì sao.

## 8. Thiết kế từng package

### 8.1 `apps/api`

```
src/
├── index.ts            Elysia app; export type App   ← Eden lấy type từ đây
├── db.ts               Bun.SQL + drizzle/bun-sql     ← driver bị nhốt ở đây
├── env.ts              đọc + validate env, fail fast khi thiếu
├── plugins/
│   ├── auth.ts         SEAM JWT — chưa implement
│   └── timing.ts       onAfterResponse → {route, ms, status}
├── services/
│   └── health.ts       checkPostgres() · checkMinio()  ← nơi duy nhất chạm hạ tầng
└── routes/
    └── health.ts       GET /health · GET /health/deep  ← chỉ HTTP + schema
```

**`routes/` KHÔNG được import `db.ts` hay `env.ts`.** ESLint chặn thật: `api-routes` chỉ được
chạm `api-routes`, `api-services`, `api-plugins`, `shared-domain`. Bản duyệt đầu đặt
`checkPostgres`/`checkMinio` ngay trong `routes/health.ts` — sai, và hàng rào boundaries bắt được
trước khi kịp viết một dòng. Mọi thứ chạm Postgres hay MinIO đi vào `services/`.

`GET /health` trả đúng `{ status: "ok" }` với response schema TypeBox.
`GET /health/deep` kiểm tra thật cả Postgres lẫn MinIO và trả trạng thái từng cái. Tách ra vì
health check của Caddy không nên kéo theo query DB mỗi lần.

**Auth seam.** `plugins/auth.ts` đọc header `Authorization: Bearer` và export sẵn
`type Role = "OWNER" | "STAFF" | "SALES"` cùng `type AuthContext`. Phiên này **không route nào**
enforce. File mở đầu bằng comment `// SEAM: JWT auth` để tìm được bằng grep.

Macro `requireRole` trong bản duyệt đầu bị **bỏ**: không route nào dùng nó ở phiên này, và một
macro chưa bao giờ được chạy thì tệ hơn là không có — nó trông như đã được kiểm chứng trong khi
không. Seam đúng nghĩa là type cộng điểm móc, không phải cơ chế phân quyền chưa ai gọi.

### 8.2 `packages/shared`

```
src/
├── domain/
│   ├── money.ts        type Vnd; formatVnd; quy ước làm tròn tường minh
│   ├── interval.ts     overlaps() — nửa khoảng [start, end)
│   └── *.test.ts       test nằm cạnh source
└── client.ts           createApiClient<T>(baseUrl)   ← subpath @v9/shared/client
```

**Hàm mẫu là `overlaps(a, b)`** theo nửa khoảng `[start, end)` — bản sao TS của `tstzrange` mà
exclusion constraint dùng. Chọn nó vì nó khoá một convention xuyên suốt (biên nửa khoảng phải
khớp giữa TS và Postgres, lệch là sinh bug booking) mà **không** chôn sẵn chính sách kinh doanh
nào. Kèm `formatVnd` để khoá luôn convention tiền.

TDD nghiêm bắt buộc cho mọi thứ trong `src/domain/`.

### 8.3 `packages/db`

```
src/schema/*.ts         nguồn cho bảng thường (phiên này: rỗng, chưa có bảng nghiệp vụ)
migrations/
├── 0000_btree_gist.sql drizzle-kit generate --custom
└── meta/_journal.json
drizzle.config.ts
```

**Migration đầu tiên chỉ làm một việc: `CREATE EXTENSION IF NOT EXISTS btree_gist`.**

Lý do phải nói rõ: exclusion constraint `EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)`
cần bảng `rentals` tồn tại, mà `rentals` là **business schema** — thứ §2 cấm ở phiên này.
Nên phiên này chỉ bật extension; constraint sẽ đi cùng migration tạo bảng `rentals` ở phiên
làm nghiệp vụ. Index GiST sinh ra từ constraint đó, khi có, được dùng luôn cho tra cứu
availability — không tạo index thứ hai.

Để `btree_gist` không chỉ "được bật trên giấy", test của `packages/db` sẽ mở một transaction,
tạo bảng tạm có exclusion constraint đúng dạng sẽ dùng sau, khẳng định INSERT chồng lấn bị chặn,
rồi ROLLBACK. Chứng minh extension dùng được thật mà không commit một dòng business schema nào.

### 8.4 `apps/web` — Next 16

Next 16 App Router, `output: "standalone"`, một trang placeholder gọi `/health` qua Eden client
typed và render kết quả. Bật SSG/ISR vì SEO quan trọng.

### 8.5 `apps/admin` — Vite + TanStack

SPA tĩnh: Vite + `@vitejs/plugin-react`, TanStack Router (route khai bằng code, **không** dùng
file-based routing plugin ở phiên scaffold — một route thì bộ máy sinh route là chi phí không có
người trả), TanStack Query bọc lên Eden client. Một trang placeholder gọi `/health` và render
kết quả, đi qua `useQuery` để chứng minh đường dây Query → Eden → API chạy thật.

`"types": ["vite/client"]` trong tsconfig. Build ra `dist/` tĩnh, không cần Node runtime.

**i18n**: hard-code `vi`. Seam là `messages/vi.json` + `NEXT_PUBLIC_DEFAULT_LOCALE`. Chưa cài
next-intl — thêm khi thật sự có tiếng Anh, không dựng máy móc cho một locale.

## 9. Docker

**Dev** — `compose.yaml`: `postgres` (5432), `minio` (9000 API / 9001 console), `mc` one-shot tạo
bucket `vehicles` và `checkins` rồi thoát. `docker compose up -d` rồi `bun run dev` chạy api, admin,
web trên host.

**Prod** — `compose.prod.yaml`: sáu service + `caddy`. Ba image, ba runtime khác nhau:

| Service | Builder | Runtime | Vì sao |
|---|---|---|---|
| `api` | `oven/bun` | `oven/bun` | driver `bun-sql` bắt buộc chạy Bun (§4.8) |
| `web` | `oven/bun` | `node:22-alpine` chạy `.next/standalone` | `output: "standalone"` sinh `server.js` nhắm Node |
| `admin` | `oven/bun` | `caddy:2-alpine` phục vụ tĩnh | SPA tĩnh, không có server-side runtime nào để chạy |

Dùng Node cho runtime Next là lựa chọn boring có chủ ý — đây không phải chỗ để thử nghiệm, chỗ
thử nghiệm đã dùng hết cho driver `bun-sql`.

Image `admin` cần Caddyfile riêng bên trong với `try_files {path} /index.html`, nếu không mọi
đường dẫn sâu của TanStack Router sẽ 404 khi người dùng F5. Đây là lỗi kinh điển của SPA tĩnh và
chỉ lộ ra khi reload, không lộ khi điều hướng trong app.

**Caddy**: `v9.<domain>` → web, `admin.<domain>` → admin, `api.<domain>` → api. Auto-HTTPS.

## 10. Biến môi trường

`.env.example` là nguồn sự thật duy nhất cho tên biến, dùng chung cho cả hai file compose.
Không commit secret. Danh sách: kết nối Postgres, credential và endpoint MinIO cùng tên hai bucket,
`API_PORT`, `NEXT_PUBLIC_API_URL` cho admin và web, `NEXT_PUBLIC_DEFAULT_LOCALE`, domain gốc cho
Caddy, và một placeholder `JWT_SECRET` đánh dấu rõ là chưa dùng.

## 11. Môi trường làm việc cho AI agent

### 11.1 CLAUDE.md root — bắt buộc có

Repo map · canonical commands · luật domain-chỉ-ở-`shared` · luật per-tool · workflow phiên (a)–(g)
· perf budget · luật pin TS kèm điều kiện gỡ · luật cấm `drizzle-kit push` · bốn design pattern
backend ở mục 4.6.

### 11.2 Luật per-tool — mỗi tool phải nói rõ *dùng khi nào* và *không dùng khi nào*

| Tool | Dùng khi | Không dùng khi |
|---|---|---|
| **superpowers** | Mọi thay đổi không tầm thường: brainstorm → design doc → plan các bước verify được → implement → verify trước khi tuyên bố xong. **TDD nghiêm bắt buộc** cho mọi thứ trong `packages/shared` (tiền, pricing, deposit, availability). | Việc infra và UI dùng verification-before-completion thay cho test-first. |
| **Serena** | Cách **duy nhất** để điều hướng và sửa code theo ngữ nghĩa. Bắt buộc `find_symbol` / `find_referencing_symbols` **trước khi** sửa bất kỳ exported function hay shared type nào. Ưu tiên symbol-level edit hơn rewrite cả file. | Không đổi tên hay đổi signature khi chưa kiểm tra reference. |
| **Agent Memory** | Là ADR, không phải cache code. **Đọc** lúc mở phiên và trước **mọi** đề xuất đổi schema hay API contract. **Ghi** quyết định + lý do, naming convention, gotcha phát hiện lúc debug. | Không lưu code snippet hay nội dung file — git và Serena lo phần đó. Nếu đề xuất mâu thuẫn với quyết định đã lưu, **nêu xung đột cho người**, không tự đè. |
| **rtk** | Đã hook sẵn, không cần làm gì. Ưu tiên chạy test, git, docker qua bash để rtk nén output. | Không dán output dài vào context bằng tay. |
| **impeccable** | `apps/web` là chính; audit nhẹ cho `apps/admin`. UI của `apps/web` phải tôn trọng DESIGN.md. | `apps/admin` ưu tiên chức năng — không có polish pass trừ khi được yêu cầu. |

### 11.3 Workflow chuẩn cho mỗi phiên

(a) đọc memory lấy quyết định liên quan → (b) nhắc lại phạm vi task → (c) nếu không tầm thường thì
lập plan bằng superpowers → (d) implement bằng Serena → (e) chạy `bun test` và `bun run typecheck`
→ (f) ghi quyết định mới vào memory → (g) verify done-criteria trước khi tuyên bố hoàn thành.

### 11.4 CLAUDE.md của từng app

Ngắn, trỏ về root. `apps/web/CLAUDE.md` trỏ sang `DESIGN.md` và `PRODUCT.md`.
`apps/admin/CLAUDE.md` ghi rõ ưu tiên chức năng, không polish.
`apps/api/CLAUDE.md` nhắc lại `route → service → db`, luật `23P01` → 409, và perf budget.

### 11.5 PRODUCT.md và DESIGN.md

Sinh bằng `/impeccable init` ở phase implement. Context đưa vào: khán giả là dân chơi PKL Việt
cộng khách du lịch nước ngoài; vibe moto-garage — tối, nhiều ảnh, typography đậm; **cấm rõ**
thẩm mỹ SaaS generic (gradient tím, Inter ở mọi nơi, card lồng card).

> **Ghi chú môi trường**: impeccable **không** có sẵn trong harness lúc bắt đầu phiên. Đã cài từ
> npm `impeccable@3.5.0` trong phiên này (Apache-2.0, repo `pbakaus/impeccable`). Nó cài global vào
> `~/.claude/skills/impeccable/` và `~/.agents/skills/impeccable/`; `~/.claude/settings.json`
> **không** bị sửa và không có hook global nào được thêm.
>
> **Serena** cũng không được đăng ký MCP lúc bắt đầu phiên dù binary có ở `~/.local/bin/serena-agent`.
> Phải đăng ký, và tool MCP chỉ nạp lúc khởi động session nên chỉ có hiệu lực từ phiên kế tiếp.

## 12. Ma trận verify — 12 tiêu chí "setup done"

Không tiêu chí nào được tuyên bố đạt nếu chưa chạy lệnh và đọc output.

| # | Tiêu chí | Cách verify |
|---|---|---|
| 1 | `bun install` chạy được, workspace resolve | `bun install` ở root; `bun pm ls` thấy đủ 5 workspace |
| 2 | `docker compose up` lên postgres + minio, api nối được cả hai | `docker compose up -d`, `docker compose ps` healthy; `curl /health/deep` trả ok cho cả pg và minio |
| 3 | `GET /health` trả `{status:"ok"}` qua Elysia + TypeBox, export type Eden | `curl -s localhost:$API_PORT/health`; `bun run typecheck` thấy `App` export được |
| 4 | admin và web render placeholder và gọi `/health` qua Eden client typed | build cả hai, mở trang, thấy trạng thái health render ra |
| 5 | `packages/db` có drizzle config + migration đầu bật `btree_gist`; `bun run db:migrate` chạy | `bun run db:migrate`; `\dx` thấy `btree_gist`; test rollback chứng minh exclusion constraint chặn được overlap thật |
| 6 | `packages/shared` có pure function mẫu + test pass; `bun test` pass ở root | `bun test` |
| 7 | CLAUDE.md root đủ nội dung mục 11; mỗi app có CLAUDE.md trỏ về root | đọc lại từng file đối chiếu mục 11 |
| 8 | PRODUCT.md và DESIGN.md tồn tại, được `apps/web/CLAUDE.md` tham chiếu | `/impeccable init` rồi kiểm tra file và link |
| 9 | `docs/plans/` có design doc và plan của phiên này | `ls docs/plans/` |
| 10 | `.env.example` phủ mọi biến bắt buộc, không commit secret | đối chiếu với `env.ts` và hai file compose; `git log -p` không có secret |
| 11 | `bun run typecheck` pass toàn workspace | `bun run typecheck` |
| 12 | Ghi quyết định scaffolding vào Agent Memory | `memory_save` layout monorepo, cách nối Eden, workflow migration; rồi `memory_recall` đọc lại |

Thêm ngoài 12 tiêu chí gốc, do phạm vi được mở rộng trong phiên: `bun run lint` pass ·
`drizzle-orm/bun-sql` nối được Postgres thật · `ci.yml` xanh trên GitHub.

## 13. Giả định đã chốt

- **i18n**: hard-code `vi`, seam `messages/vi.json` + `NEXT_PUBLIC_DEFAULT_LOCALE`, chưa có next-intl.
- **Auth seam**: `plugins/auth.ts` trả 501 nếu bị enforce, export `Role` và `AuthContext`,
  không route nào enforce ở phiên này.
- **Hàm mẫu shared**: `overlaps()` nửa khoảng `[start, end)`, cộng `formatVnd`.
- **Repo GitHub**: `git@github.com:VIethoangnguyenle/v9-motor-rental.git` (người dùng cung cấp).
  Thư mục làm việc local là `v9-rental` — **tên local và tên remote cố ý khác nhau**, không phải nhầm.
  Image GHCR vì vậy là `ghcr.io/viethoangnguyenle/v9-motor-rental-{api,admin,web}`.

## 14. Việc để lại cho phiên sau

Chính sách tính ngày thuê và bảng giá · schema domain thật (vehicles, customers, rentals) ·
implement JWT auth · next-intl khi có tiếng Anh · upload ảnh lên MinIO ·
đăng ký Serena MCP có hiệu lực (cần restart session).
