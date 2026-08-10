# V9 Motor Rental — CLAUDE.md

Hệ quản lý cho shop cho thuê mô tô phân khối lớn ở TP.HCM. UI tiếng Việt trước, tiếng Anh sau.

Repo này được phát triển **chủ yếu bởi AI agent**. Vì vậy ranh giới do máy ép và tài liệu này là
deliverable ngang hàng với code, không phải phụ lục.

> Thiết kế và lý do đằng sau mọi quyết định:
> `docs/plans/2026-08-04-scaffolding-design.md` (đợt 1 — nền móng) và
> `docs/plans/2026-08-05-round2-directus-staff-design.md` (đợt 2 — Directus, `apps/staff`, thu hẹp `apps/web`).
> Khi tài liệu này và design doc mâu thuẫn, **design doc thắng** — và hãy sửa file này.

---

## Repo map

| Workspace         | Vai trò                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`        | Bun + Elysia + TypeBox. Export `type App` cho Eden Treaty.                                                                             |
| `apps/staff`      | Vite + TanStack Router/Query, **PWA**. Vận hành: lịch, thống kê, lên đơn/bàn giao, khách hàng. Role `OWNER`, `STAFF`; `SALES` để dành. |
| Directus          | **Chỉ dữ liệu gốc**: danh mục xe, ảnh, bảng giá. Không làm vận hành.                                                                   |
| SuperTokens       | Xác thực cho `apps/staff`. Schema riêng trong cùng Postgres.                                                                           |
| `apps/web`        | Next 16 App Router, `output: "standalone"`, SSG/ISR. Site công khai, **SEO quan trọng**.                                               |
| `packages/shared` | Domain logic thuần + Eden client factory.                                                                                              |
| `packages/db`     | Drizzle schema + migration SQL.                                                                                                        |

**Hai frontend dùng hai framework khác nhau, có chủ ý.** `apps/staff` là app vận hành nội bộ nên
SEO vô nghĩa; `apps/web` giữ Next vì SEO chính là lý do Next được chọn. Đừng "thống nhất" chúng.

## Canonical commands

```bash
bun install                  # cài, ở root
docker compose up -d         # dev: postgres + minio (KHÔNG có app)
bun run dev                  # api + web + staff chạy trên host
bun run db:migrate           # apply migration
bun run db:generate          # sinh migration cho bảng thường
bun run db:custom            # migration trống để viết SQL tay
bun test                     # bun test, toàn repo
bun run typecheck            # 5 workspace + scripts/ (xem ngay dưới)
bun run lint                 # eslint, có ép ranh giới kiến trúc
bun run format               # prettier
bun run bench                # đo /health, exit 1 nếu vượt perf budget
bun run directus:setup       # cấu hình Directus, chạy lại được nhiều lần
```

Prod: `docker compose -f compose.prod.yaml up -d`.

**`typecheck` là hai lệnh nối bằng `&&`, không phải một:**

```
bun run --filter '*' typecheck && ./node_modules/.bin/tsc --noEmit -p scripts/tsconfig.json
```

Nửa sau tồn tại vì `--filter '*'` **chỉ đi qua workspace**, mà `scripts/` (nơi có
`directus-setup.ts`) không phải workspace — nó không có `package.json`. Chỉ chạy nửa đầu thì
`scripts/` **không được typecheck lần nào** và lệnh vẫn xanh: đúng cái bẫy bỏ-qua-im-lặng mà file
này cảnh báo ở mục `bun run --filter '*'` bên dưới, chỉ khác là lần này thứ bị bỏ sót không phải
một workspace thiếu script mà là một thư mục không bao giờ là workspace.

Hệ quả: thư mục code mới nằm **ngoài** `apps/` và `packages/` phải được thêm vào một `tsconfig`
nào đó có người gọi, nếu không nó vô hình với `bun run typecheck`.

---

## Luật kiến trúc

### Domain logic **chỉ** ở `packages/shared`

Mọi phép tính giá thuê, tiền cọc, và tính khả dụng nằm trong `packages/shared/src/domain/`.
`apps/api` và hai frontend **không được implement lại**. ESLint chặn thật.

`src/domain/**` **không được import bất cứ gì** — đó là điều kiện để nó test được không cần DB,
và là lý do TDD nghiêm khả thi ở đó.

### `apps/api`: `routes → services → infra`, không có mũi tên ngược

`routes/` chỉ có HTTP và schema. Mọi thứ chạm Postgres hay MinIO nằm ở `services/`.
`db.ts` và `env.ts` là `api-infra` — **routes không được import chúng**.

### Tiền là số nguyên đồng

`type Vnd = number`. VND không có đơn vị phụ. Mọi phép chia **phải** đi qua `roundVnd()` —
không được để số lẻ rò ra ngoài dưới dạng `Vnd`.

### TDD nghiêm cho `packages/shared`

Test trước, luôn luôn, cho mọi thứ trong `src/domain/`. Việc infra và UI thì dùng
verification-before-completion thay cho test-first.

---

## Bốn design pattern cho backend

1. **Mỗi domain là một Elysia plugin, luôn đặt `name`.** Đây là cách compose duy nhất giữ được
   codegen tĩnh của Elysia; thiếu `name` thì plugin bị chạy lại mỗi lần `.use()`.
2. **Deps là tham số**: `createRental(deps, input)`. Dependency inversion không cần container,
   test không cần mock framework.
3. **Domain trả discriminated union, không throw**: `{ ok: false, reason: ... }`. Route dịch sang
   HTTP. Exception đắt và làm mất type.
4. **Transaction boundary thuộc service, không thuộc route** — và bắt buộc bắt `23P01` → **409**.

### ⚠️ Hai cái bẫy của Bun.SQL — hỏng im lặng nếu làm sai

**SQLSTATE nằm ở `.errno`, KHÔNG phải `.code`.** Bun.SQL bọc mọi lỗi server-side thành
`PostgresError` với `.code` luôn bằng `"ERR_POSTGRES_SERVER_ERROR"`.

```ts
// SAI — điều kiện này KHÔNG BAO GIỜ đúng
if ((e as { code?: string }).code === "23P01") ...

// ĐÚNG
if ((e as { errno?: string }).errno === "23P01") ...
```

Viết sai thì va chạm booking rơi ra thành 500 thay vì 409, và **unit test không bắt được** vì
phải có Postgres thật mới lộ.

**Lỗi trong transaction làm hỏng cả transaction.** Sau một câu lệnh lỗi, mọi câu sau bị từ chối
với `current transaction is aborted`. Muốn _thử_ insert rồi xử lý va chạm mà vẫn dùng tiếp
transaction đó thì phải bọc câu có thể lỗi trong `tx.savepoint(async (sp) => { ... })`.

---

## Perf budget — vượt là coi như fail, không phải góp ý

| Thao tác               | p95     |
| ---------------------- | ------- |
| `GET /health`          | < 5 ms  |
| Đọc một record theo id | < 25 ms |
| Truy vấn availability  | < 50 ms |

Baseline đo 2026-08-05 trên máy dev: `/health` p50 1.28ms · p95 2.26ms · p99 2.95ms · 34.968 rps.
`bun run bench` exit 1 khi vượt.

⚠️ **Baseline đó đo khi stack còn ít container.** Đo lại 2026-08-10 với đủ postgres + minio +
directus + supertokens đang chạy: p50 1.55ms · **p95 2.88ms** · p99 16.78ms · 23.314 rps. p95 vẫn
trong budget và budget chỉ ép p95 — nhưng p99 cao gấp sáu và rps thấp hơn một phần ba, **do máy
chật chứ không do code**: `/health` không chạm Postgres, và đợt 3 không thêm gì vào đường đi của
nó.

Cố ý **không** ghi đè baseline bằng số mới. Đo lại trên một máy đang ồn rồi gọi đó là baseline là
rửa số liệu — lần sau có regression thật sẽ không ai thấy. Con số 2026-08-05 giữ nguyên làm mốc;
đoạn này tồn tại để người đọc không nhầm nhiễu môi trường thành hồi quy.

---

## Ràng buộc phiên bản và công cụ

### TypeScript bị ghim ở 6.0.3 — **đừng nâng lên 7**

`typescript-eslint@8.66.0` khai peer `typescript: ">=4.8.4 <6.1.0"`. TS 7 nằm ngoài range → mất
type-aware lint, mà `no-floating-promises` chính là lý do chọn ESLint thay Biome.

**Điều kiện gỡ ghim:** khi `typescript-eslint` phát hành bản nới peer lên TS 7. Không sớm hơn.

### `drizzle-kit push` bị **cấm**

Schema chỉ đi qua migration file. Đó là điều kiện để dev và prod hội tụ, và để review được thay
đổi schema trong diff.

`db:migrate` dùng migrator tự viết trên `bun-sql` (`packages/db/scripts/migrate.ts`), **không**
dùng `drizzle-kit migrate` — CLI đó không hỗ trợ `bun-sql` và sẽ đòi cài driver Postgres thứ hai.

### Tailwind v4 — **không có `tailwind.config.js`**, và hai app cắm hai kiểu

Cả hai frontend dùng Tailwind `4.3.3`. V4 khai theme **trong CSS** bằng `@theme`, không bằng file
config JS — đi tìm `tailwind.config.js` rồi kết luận "chưa cấu hình" là hiểu sai.

| App          | Cách cắm                                                    | Theme                                           |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| `apps/web`   | PostCSS — `@tailwindcss/postcss` trong `postcss.config.mjs` | token của `DESIGN.md`, khai ở `app/globals.css` |
| `apps/staff` | Vite plugin — `@tailwindcss/vite` trong `vite.config.ts`    | mặc định, chưa có token riêng                   |

Khác nhau vì hai cơ chế build khác nhau, **không** phải thiếu nhất quán.

`postcss.config.mjs` không nằm trong tsconfig nào nên phải được `disableTypeChecked` trong
`eslint.config.js` (khối `["**/*.js", "**/*.mjs"]`). Bỏ `.mjs` ra khỏi khối đó thì lint chết với
`was not found by the project service` — lỗi **parse**, không phải lỗi luật.

### `bun run --filter '*'` **im lặng bỏ qua** workspace thiếu script

Rồi vẫn exit 0. Nghĩa là `bun run typecheck` có thể xanh mà chưa kiểm tra package nào.
**Luật: mọi workspace mới bắt buộc khai `typecheck` trong `package.json` ngay khi được tạo.**

### ⚠️ `--filter` đặt cwd ở thư mục package, nên `.env` ở root **không tới nơi**

Bun chỉ tự nạp `.env` ở **đúng cwd**, không đi ngược lên thư mục cha. Đã đo:

```bash
# root  → CÓ   |  cwd=apps/api → KHÔNG  |  cwd=packages/db → KHÔNG
env -u DATABASE_URL bun -e 'console.log(process.env.DATABASE_URL ? "CÓ" : "KHÔNG")'
```

Hệ quả — **hai cách truyền env, chỉ một cách chạy được với `bun x`:**

| Cách                                           | `--env-file` có tới nơi?                                    |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `bun --env-file=.env run --filter @v9/api dev` | ✅ có, propagate xuống script của package                   |
| `bun --env-file=... x <cli>`                   | ❌ **không** — `bun x` spawn tiến trình mới, env-file bị bỏ |

Vì vậy script nào cần một CLI + env thì gọi **thẳng binary**, đừng qua `bun x`:
`bun --env-file=../../.env ./node_modules/.bin/drizzle-kit generate`.

`bun --env-file` trỏ vào file **không tồn tại** là **no-op, không throw** — đó là lý do CI (không
có `.env`) chạy được đúng nguyên văn cùng một script với máy dev, không cần biến thể riêng.

**Luật: mọi script ở root động tới app hoặc DB đều phải mang `--env-file`.** Kiểm bằng cách chạy
với env sạch, không phải bằng cách đọc lại script:

```bash
env -u DATABASE_URL bun run dev     # PHẢI thấy cả 3 app lên, không có "Thiếu biến môi trường"
```

### `exactOptionalPropertyTypes`: bật ở `packages/*`, tắt ở `apps/{web,staff}`

Không phải quên. Cờ này đánh nhau với mẫu JSX `prop={cond ? value : undefined}` vì React khai
`prop?: T` chứ không phải `prop?: T | undefined`. Đừng "sửa" theo hướng nào cả.

### `apps/staff`: `VITE_API_URL` bị nướng vào bundle **lúc build**

Đặt biến đó lúc chạy trong compose **không có tác dụng gì**. Đổi API URL của staff bắt buộc phải
build lại image. `deploy.yml` truyền nó qua `--build-arg`.

### `vite-plugin-pwa` **không** chạy ở chế độ dev

Ở `vite dev`, plugin không chèn link manifest và không đăng ký service worker trừ khi bật
`devOptions.enabled`. Nghĩa là **mọi hành vi PWA chỉ quan sát được trên bản build**. Kiểm bằng
`bun run --filter @v9/staff build` rồi `vite preview`, đừng kiểm ở dev rồi kết luận PWA hỏng.

`apps/staff/public/icon-192.png` và `icon-512.png` hiện là **placeholder màu đặc**, chưa phải logo
thật của shop. Thiếu file icon thì trình duyệt **im lặng** không mời cài app — không báo lỗi ở đâu
cả. Shop đã có logo ngoài đời; thay hai file này trước khi ship.

---

## Ba service dùng chung một Postgres — chỉ migration được đổi schema

| Schema        | Chủ                         | Được đổi cấu trúc |
| ------------- | --------------------------- | ----------------- |
| `public`      | migration của `packages/db` | **chỉ migration** |
| `directus`    | Directus                    | Directus          |
| `supertokens` | SuperTokens                 | SuperTokens       |
| `drizzle`     | journal migration           | migrator          |

Directus và SuperTokens kết nối bằng role riêng **không có quyền DDL trên `public`**
(migration `0001_service_roles.sql`). Directus đọc-ghi được _dữ liệu_ trong `public`; SuperTokens
không chạm `public` chút nào.

Ép ở tầng database chứ **không** bằng cấu hình của tool: toggle trong UI là thứ người sau bật lại
được và không để lại dấu vết nào trong repo.

**Kiểm lại sau mỗi lần nâng version Directus hoặc SuperTokens:**

```bash
# PHẢI ra: ERROR: permission denied for schema public
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; CREATE TABLE public.x (id int);"
```

Bằng chứng thu được từ chính UI Directus khi bấm _Create Field_:
`must be owner of table probe_vehicles`. Dữ liệu vẫn ghi được bình thường — **chặn schema, không
chặn dữ liệu**. Một cấu hình chặn tất là hỏng, không phải an toàn.

`CREATE ROLE` là đối tượng **cấp cluster**, không phải cấp database — migration phải bọc trong
`DO $$ IF NOT EXISTS $$`, `CREATE TABLE IF NOT EXISTS` không có tương đương cho role.

### Probe asset công khai — bắt drift của cấu hình KHÔNG nằm trong git

Probe DDL ở trên bảo vệ **schema**. Ba lệnh dưới bảo vệ thứ khác hẳn: collection, role Public và
preset transform của Directus sống trong **database của Directus**, không trong repo. `git clone`
không mang chúng theo, và ai đó bấm vài nút trong Data Studio thì không để lại dấu vết nào trong
diff. Nguồn sự thật viết ra được là `scripts/directus-setup.ts`, áp lại bằng
`bun run directus:setup` (chạy nhiều lần vô hại) — nhưng **script không tự chạy**, nên phải probe.

Chạy sau mỗi lần nâng version Directus, và sau mỗi lần dựng lại môi trường:

```bash
# ① PHẢI ra 200 và content-type: image/*  (KHÔNG kèm token — role Public phải đọc được)
curl -sI "http://localhost:8055/assets/<uuid-một-ảnh-xe>?key=web" | grep -i '^HTTP\|^content-type'
#   → HTTP/1.1 200 OK  /  Content-Type: image/png

# ② PHẢI bị từ chối — transform tuỳ ý là vòi CPU miễn phí cho bot
curl -s "http://localhost:8055/assets/<uuid>?width=9999" | head -c 120
#   → 400, "code":"INVALID_QUERY" — Only configured presets can be used

# ③ PHẢI 403 — Directus không được phơi dữ liệu nghiệp vụ ra internet
curl -s "http://localhost:8055/items/vehicles" | head -c 120
#   → "code":"FORBIDDEN"
```

⚠️ Dùng `grep` chứ **không** `head -3` ở lệnh ①: Directus nhét một khối CSP dài lên đầu response,
nên `head -3` chỉ ra được dòng `HTTP/1.1 200` với hai header bảo mật — đúng cái `Content-Type` cần
đọc thì bị cắt mất. Một probe hiển thị thiếu thứ nó tuyên bố kiểm là probe không kiểm gì; xem mục
"Hàng rào phải được probe" bên dưới. Với ② và ③ thì đọc **body**, vì mã lỗi phân biệt được nguyên
nhân (`INVALID_QUERY` vs `FORBIDDEN`) còn status code thì không.

Ba lệnh đo ba thứ khác nhau và **không thay thế được cho nhau**: lệnh ① rằng ảnh vẫn ra được (hỏng
là trang trắng ảnh), lệnh ② rằng `storage_asset_transform = presets` còn nguyên (hỏng là mỗi
`?width=` lạ thành một lần resize + một entry cache), lệnh ③ rằng role Public vẫn **chỉ** đọc
`directus_files` (hỏng là `plate` và toàn bộ hàng `draft` ra internet — vòng qua chính lớp lọc mà
`apps/api` dựng lên).

Lấy `<uuid>`: `SELECT file_id FROM vehicle_photos LIMIT 1;`. Chi tiết và cách dọn ở
`docs/runbooks/directus-vehicles.md`.

### Xác thực: SuperTokens cho `apps/staff`, không có gì cho `apps/web`

`apps/api/src/plugins/auth.ts` phơi `/auth/*` qua framework `custom` của `supertokens-node`
(`PreParsedRequest` / `CollectingResponse` — chuẩn Web `Request`/`Response`, khớp Elysia tự nhiên).

**Hiện chưa route nào enforce auth và chưa có màn hình đăng nhập** — chưa có route nghiệp vụ nào
để bảo vệ, và một cơ chế phân quyền chưa từng chạy thì tệ hơn không có: nó trông như đã kiểm chứng
trong khi không.

`apps/web` **không** dùng auth. Khách gửi yêu cầu thuê không cần tài khoản — bắt đăng nhập chỉ làm
giảm số yêu cầu nhận được, mà yêu cầu chính là thứ web sinh ra để tạo.

Directus giữ hệ tài khoản riêng của nó. Hai nơi đăng nhập là **chấp nhận có ý thức**: hai nhóm
người dùng khác nhau, và Directus chỉ có vài tài khoản back-office. Hợp nhất bằng OIDC là việc
thêm khi có nhu cầu thật.

---

## ⚠️ Hàng rào phải được probe, không được tin

Trong phiên scaffold, `eslint-plugin-boundaries` đã **suy thoái im lặng ba lần** — mỗi lần đều
`exit 0`, đều trông như đang bảo vệ, đều không kiểm tra gì. Nguy hiểm nhất là lần thứ ba:
`import "@v9/db"` lọt hoàn toàn trong khi chỉ `import "../../../db/src"` bị chặn — mà không ai
viết đường dẫn tương đối xuyên package.

**Trong `eslint.config.js` có ba thứ trông như rác cần dọn nhưng xoá cái nào cũng làm hàng rào
im lặng ngừng hoạt động:** `import/resolver` với `extensions`/`engines`/`preserveSymlinks`,
`mode: "full"` trên các element một-file, và các element `api-root`/`shared-root`. Mỗi chỗ đều có
comment giải thích hậu quả. Đọc trước khi sửa.

**Sau mỗi lần đụng `eslint.config.js` hoặc nâng version plugin, chạy lại bộ probe:**

```bash
# ① PHẢI nổ với boundaries/dependencies — KHÔNG phải lỗi khác
cp apps/api/src/index.ts /tmp/idx.bak
sed -i '1i import { schema } from "@v9/db";' apps/api/src/index.ts
bun x eslint apps/api/src/index.ts
#   → phải thấy: boundaries/dependencies
#     "no policy allowing dependencies from elements of type "api-root" to elements of type "db""
cp /tmp/idx.bak apps/api/src/index.ts

# ② PHẢI nổ với boundaries/no-unknown-files
mkdir -p apps/api/src/nowhere && echo 'export const x = 1;' > apps/api/src/nowhere/x.ts
bun x eslint apps/api/src/nowhere/x.ts
rm -rf apps/api/src/nowhere

# ③ PHẢI im (mẫu Eden hợp lệ — import type bị xoá lúc build)
bun x eslint apps/web/lib/api.ts apps/staff/src/lib/api.ts

# ④ PHẢI nổ với boundaries/dependencies, thông điệp nhắc "api-plugins" → "db"
cp apps/api/src/plugins/timing.ts /tmp/timing.bak
sed -i '1i import { schema } from "@v9/db";' apps/api/src/plugins/timing.ts
bun x eslint apps/api/src/plugins/timing.ts
#   → phải thấy: boundaries/dependencies
#     "no policy allowing dependencies from elements of type "api-plugins" to elements of type "db""
cp /tmp/timing.bak apps/api/src/plugins/timing.ts
```

Probe ④ khoá cạnh `api-plugins → api-services` mở ở đợt auth: plugin được gọi service, nhưng vẫn
**không** được tự viết Drizzle.

**Đọc kỹ mã lỗi, đừng chỉ nhìn exit code.** Probe ① dùng `apps/api` chứ không dùng
`packages/shared` là **có lý do**: `apps/api` khai `@v9/db` là dependency thật nên import resolve
được và boundaries mới có gì để phân loại. Bản cũ của bộ probe này đặt vi phạm trong
`packages/shared/src/domain/` — package đó **không** khai `@v9/db`, nên lint chết ở
`no-unsafe-assignment` **trước khi boundaries kịp nhìn**. Probe vẫn exit 1, vẫn trông như đang
bảo vệ, và không chứng minh gì cả.

Đó là lần thứ tư trong dự án này một cơ chế kiểm chứng trông như đang chạy mà thực ra không —
và lần này nạn nhân là chính bộ probe được viết ra để chống chuyện đó.

Config linter "chạy được và exit 0" **không chứng minh điều gì**. Probe exit 1 **cũng chưa chứng
minh gì** nếu bạn không đọc nó nổ vì luật nào.

---

## Bộ công cụ AI — dùng khi nào, **không** dùng khi nào

| Tool             | Dùng khi                                                                                                                                                                                                                                               | KHÔNG dùng khi                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **superpowers**  | Mọi thay đổi không tầm thường: brainstorm → design doc → plan các bước verify được → implement → verify trước khi tuyên bố xong. Design doc và plan commit vào `docs/plans/` để sống sót qua các phiên. **TDD nghiêm bắt buộc** cho `packages/shared`. | Việc infra và UI dùng verification-before-completion thay cho test-first.                                                                                  |
| **Serena**       | Cách **duy nhất** để điều hướng và sửa code theo ngữ nghĩa. Bắt buộc `find_symbol` / `find_referencing_symbols` **trước khi** sửa bất kỳ exported function hay shared type nào. Ưu tiên sửa ở mức symbol hơn ghi đè cả file.                           | Không đổi tên hay đổi signature khi chưa kiểm tra reference.                                                                                               |
| **Agent Memory** | Là **ADR, không phải cache code**. **Đọc** lúc mở phiên và trước **mọi** đề xuất đổi schema hay API contract. **Ghi** quyết định + lý do, naming convention, gotcha phát hiện lúc debug.                                                               | Không lưu code snippet hay nội dung file — git và Serena lo phần đó. Nếu đề xuất mâu thuẫn với quyết định đã lưu, **nêu xung đột cho người**, không tự đè. |
| **rtk**          | Đã hook sẵn, không cần làm gì. Ưu tiên chạy test/git/docker qua bash để rtk nén output.                                                                                                                                                                | Không dán output dài vào context bằng tay.                                                                                                                 |
| **impeccable**   | `apps/web` là chính; audit nhẹ cho `apps/staff`. Ràng buộc sản phẩm ở `PRODUCT.md`, hệ thiết kế ở `DESIGN.md` — **cả hai đã có**, đọc trước khi động vào UI.                                                                                           | `apps/staff` ưu tiên chức năng — **không polish pass trừ khi được yêu cầu**.                                                                               |

### ⚠️ Phân biệt: ranh giới **repo ép** vs **cấu hình local**

Nhầm hai loại này là cách sinh ra ảo giác "đang được bảo vệ" — dự án này đã dính bốn lần.

| Cơ chế                            | Nằm ở đâu                                           | Sống sót qua `git clone`?          |
| --------------------------------- | --------------------------------------------------- | ---------------------------------- |
| Boundaries kiến trúc              | `eslint.config.js` (đã commit)                      | ✅ **có** — CI chạy `bun run lint` |
| Chặn DDL của Directus/SuperTokens | migration `0001_service_roles.sql`                  | ✅ **có** — ép ở tầng Postgres     |
| TDD cho `packages/shared`         | `bun test` (đã commit)                              | ✅ **có**                          |
| **Detector của impeccable**       | `.claude/settings.local.json` + `.codex/hooks.json` | ❌ **KHÔNG**                       |

Hai file cuối **không được track**: `.claude/settings.local.json` bị chặn bởi gitignore toàn cục
của máy, `.codex/` bị chặn ở `.gitignore:42` vì nội dung hard-code path máy local.

Nghĩa là detector của impeccable chỉ chạy trên máy đã cài. **Không được coi nó là ràng buộc của
repo**, và không được kết luận "UI đã qua kiểm tra" chỉ vì hook im lặng — trên máy khác hook
không tồn tại. Muốn ép thật thì phải đưa vào `eslint.config.js` hoặc CI.

---

## Workflow chuẩn mỗi phiên

**(a)** Đọc memory lấy quyết định liên quan →
**(b)** nhắc lại phạm vi task →
**(c)** nếu không tầm thường thì lập plan bằng superpowers →
**(d)** implement bằng Serena →
**(e)** chạy `bun test` và `bun run typecheck` →
**(f)** ghi quyết định mới vào memory →
**(g)** verify done-criteria **trước khi** tuyên bố hoàn thành.

Bước (g) không phải hình thức. Trong phiên scaffold, mọi lỗi nghiêm trọng đều lộ ra ở bước verify
chứ không ở bước đọc code.

---

## Việc còn để lại

**Đợt kế tiếp:** `booking_requests` + form gửi yêu cầu thuê trên `apps/web`. Đó là mảnh còn thiếu
để đội xe đang hiển thị sinh ra được việc — hiện khách xem xong không có đường nào gửi yêu cầu.
Ràng buộc copy của form nằm ở `apps/web/AGENTS.md` (không hứa xe còn trống).

**Nghiệp vụ (cần brainstorm riêng trước khi code):** chính sách tính ngày thuê và bảng giá ·
schema `customers`, `rentals`, `booking_requests` — `rentals` kèm exclusion constraint chống đặt
trùng · bốn tính năng của `apps/staff`: lịch, thống kê, lên đơn/bàn giao, quản lý khách hàng ·
vai trò `SALES` làm gì.

`vehicles` và `vehicle_photos` **đã xong** (migration `0002`–`0004`, đợt 3).

**Kỹ thuật:** enforce auth trên route thật (SuperTokens đã nối, chưa route nào dùng) · `next-intl`
khi thật sự có tiếng Anh · upload ảnh lên MinIO.

⚠️ **Nợ có hạn: `mode` trong `eslint.config.js` đã deprecated ở `eslint-plugin-boundaries` v7** và
in cảnh báo mỗi lần lint. Bản thay là `partialMatch: false`. Phải chuyển **trước** khi nâng
boundaries lên major kế tiếp, vì mục "hàng rào phải được probe" bên trên ghi rõ: xoá `mode: "full"`
làm hàng rào **im lặng** ngừng hoạt động. Nếu một bản major xoá `mode` mà chưa chuyển, hàng rào tự
tắt và mọi thứ vẫn exit 0 — đúng kiểu suy thoái đã xảy ra bốn lần trong dự án này. Chuyển xong phải
chạy lại cả ba probe và **đọc tên luật**, không nhìn exit code.

**Chặn ở người, không chặn ở code** — hai việc này không tự làm được, cần asset/quyết định từ shop:

Cả hai đều chờ **đúng một** thứ: **file logo thật của shop**.

- **Màu accent của `DESIGN.md`.** Hệ thiết kế đã chốt (nền BMW M, adapt 7 chỗ) nhưng cố ý để
  trống đúng một ô: màu thương hiệu. Bản gốc dùng M tricolor của BMW — ta không dùng được, và
  `PRODUCT.md` cấm vẽ lại nhận diện. **Đừng bịa màu**: dựng đơn sắc trắng-đen cho tới khi có
  asset. Xem §9 của `DESIGN.md`.
- **Icon thật cho `apps/staff`.** `public/icon-{192,512}.png` đang là ô màu đặc. Thiếu icon thì
  trình duyệt **im lặng** không mời cài app.

**Deploy:** đang gác. Secret SSH đã đặt; còn thiếu `ssh-copy-id` lên VPS, `ROOT_DOMAIN` +
`CADDY_EMAIL`, bootstrap `~/v9-motor-rental`, và `docker login ghcr.io` trên VPS (repo private nên
image cũng private). Chi tiết trong Agent Memory.

⚠️ **Chặn deploy: Directus đang cầm credential ROOT của MinIO ở prod.**
`compose.prod.yaml` truyền `STORAGE_S3_KEY: ${MINIO_ROOT_USER}` và
`STORAGE_S3_SECRET: ${MINIO_ROOT_PASSWORD}` — tức là service phơi ra internet nhiều nhất lại giữ
đúng cái khoá mở được **mọi** bucket, kể cả `checkins` (ảnh tình trạng xe lúc bàn giao, thứ dùng
làm bằng chứng khi tranh chấp). Một lỗ hổng trong Directus thành quyền toàn bộ object storage.

`.env.example` đã có câu cảnh báo đúng chỗ đó, và nó **không ép được gì** — đây chính là ví dụ của
mục "ranh giới repo ép vs cấu hình local" bên trên: một dòng comment không phải hàng rào.

Trước khi stack chạm VPS thật: tạo **access key MinIO riêng cho Directus**, policy giới hạn đúng
bucket `vehicles`, rồi trỏ `STORAGE_S3_KEY`/`STORAGE_S3_SECRET` vào cặp key đó. Ở dev thì dùng
root vẫn chấp nhận được — dev không phơi ra internet và volume vứt đi được.
