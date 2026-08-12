# V9 Motor Rental — CLAUDE.md

Hệ quản lý cho shop cho thuê mô tô phân khối lớn ở TP.HCM. UI tiếng Việt trước, tiếng Anh sau.

Repo này được phát triển **chủ yếu bởi AI agent**. Vì vậy ranh giới do máy ép và tài liệu này là
deliverable ngang hàng với code, không phải phụ lục.

**File này giữ luật — thứ đúng cho cả repo và ít khi đổi.** Chi tiết theo workspace nằm ở
`CLAUDE.md` của workspace đó và **thắng** file này khi nói cùng một chuyện. Ba thứ đổi thường
xuyên đã tách ra: [`docs/ROADMAP.md`](docs/ROADMAP.md) · [`docs/DEBT.md`](docs/DEBT.md) ·
[`docs/FENCES.md`](docs/FENCES.md).

> Thiết kế và lý do đằng sau mọi quyết định:
> `docs/plans/2026-08-04-scaffolding-design.md` (đợt 1 — nền móng),
> `docs/plans/2026-08-05-round2-directus-staff-design.md` (đợt 2 — Directus, `apps/staff`, thu hẹp `apps/web`),
> `docs/plans/2026-08-10-staff-auth-design.md` (đợt auth — danh tính chia đôi, mặc định chặn, mã 6 số).
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

**`typecheck` là hai lệnh nối bằng `&&`, không phải một** — nửa sau
(`tsc -p scripts/tsconfig.json`) tồn tại vì `--filter '*'` **chỉ đi qua workspace**, mà `scripts/`
không phải workspace. Chỉ chạy nửa đầu thì `scripts/` không được kiểm lần nào **và lệnh vẫn xanh**.

Hệ quả: thư mục code mới nằm ngoài `apps/` và `packages/` phải được thêm vào một `tsconfig` có
người gọi, nếu không nó vô hình với `bun run typecheck`.

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
`PostgresError` với `.code` luôn bằng `"ERR_POSTGRES_SERVER_ERROR"`, nên `e.code === "23P01"` là
điều kiện **không bao giờ đúng** — va chạm booking rơi ra 500 thay vì 409, và unit test không bắt
được vì phải có Postgres thật mới lộ.

**Lỗi trong transaction làm hỏng cả transaction.** Muốn thử insert rồi xử lý va chạm mà vẫn dùng
tiếp transaction đó thì bọc câu có thể lỗi trong `tx.savepoint(...)`.

Chi tiết và ba chỗ đang dựa vào lý lẽ này: [`apps/api/CLAUDE.md`](apps/api/CLAUDE.md).

## Perf budget — vượt là coi như fail, không phải góp ý

| Thao tác               | p95     |
| ---------------------- | ------- |
| `GET /health`          | < 5 ms  |
| Đọc một record theo id | < 25 ms |
| Truy vấn availability  | < 50 ms |

`bun run bench` exit 1 khi vượt.

Baseline **2026-08-05** (máy dev, stack còn ít container): p50 1,28 ms · p95 2,26 ms · 34.968 rps.
Đo lại 2026-08-10 với đủ postgres + minio + directus + supertokens: p95 2,88 ms · p99 16,78 ms ·
23.314 rps — p95 vẫn trong budget; p99 và rps xấu đi **do máy chật, không do code** (`/health`
không chạm Postgres).

Cố ý **không** ghi đè baseline bằng số mới: đo lại trên máy đang ồn rồi gọi đó là baseline là rửa
số liệu, và lần sau có regression thật sẽ không ai thấy.

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

### Tailwind v4 — **không có `tailwind.config.js`**

Cả hai frontend dùng Tailwind 4. V4 khai theme **trong CSS** bằng `@theme`; đi tìm file config JS
rồi kết luận "chưa cấu hình" là hiểu sai. `apps/web` cắm qua PostCSS, `apps/staff` qua Vite plugin
— khác nhau vì hai cơ chế build, **không** phải thiếu nhất quán.

`postcss.config.mjs` không nằm trong tsconfig nào nên phải được `disableTypeChecked` trong
`eslint.config.js`. Bỏ `.mjs` ra khỏi khối đó thì lint chết với `was not found by the project
service` — lỗi **parse**, không phải lỗi luật.

### `bun run --filter '*'` **im lặng bỏ qua** workspace thiếu script

Rồi vẫn exit 0. Nghĩa là `bun run typecheck` có thể xanh mà chưa kiểm tra package nào.
**Luật: mọi workspace mới bắt buộc khai `typecheck` trong `package.json` ngay khi được tạo.**

### ⚠️ `--filter` đặt cwd ở thư mục package, nên `.env` ở root **không tới nơi**

Bun chỉ tự nạp `.env` ở **đúng cwd**, không đi ngược lên thư mục cha. Hệ quả: **mọi script ở root
động tới app hoặc DB đều phải mang `--env-file`** — và chỉ một cách truyền hoạt động với CLI:

| Cách                                           | tới nơi?                                                    |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `bun --env-file=.env run --filter @v9/api dev` | ✅ có                                                       |
| `bun --env-file=... x <cli>`                   | ❌ **không** — `bun x` spawn tiến trình mới, env-file bị bỏ |

Vì vậy script cần một CLI + env thì gọi **thẳng binary**:
`bun --env-file=../../.env ./node_modules/.bin/drizzle-kit generate`.

`bun --env-file` trỏ vào file **không tồn tại** là **no-op, không throw** — đó là lý do CI (không
có `.env`) chạy được đúng nguyên văn cùng một script với máy dev.

Kiểm bằng cách chạy với env sạch, không phải bằng cách đọc lại script:

```bash
env -u DATABASE_URL bun run dev     # PHẢI thấy cả 3 app lên, không có "Thiếu biến môi trường"
```

### `exactOptionalPropertyTypes`: bật ở `packages/*`, tắt ở `apps/{web,staff}`

Không phải quên. Cờ này đánh nhau với mẫu JSX `prop={cond ? value : undefined}` vì React khai
`prop?: T` chứ không phải `prop?: T | undefined`. Đừng "sửa" theo hướng nào cả.

### Biến env của frontend bị nướng vào bundle **lúc build**

`VITE_API_URL` (staff) và `NEXT_PUBLIC_*` (web) đều bị thay bằng hằng số lúc compile. Đặt chúng
lúc chạy trong compose **không có tác dụng gì** — phải build lại image; `deploy.yml` truyền qua
`--build-arg`. Chi tiết ở [`apps/staff/CLAUDE.md`](apps/staff/CLAUDE.md) và
[`apps/web/AGENTS.md`](apps/web/AGENTS.md).

`vite-plugin-pwa` **không** chạy ở `vite dev`, nên mọi hành vi PWA chỉ quan sát được trên bản
build. Đừng kiểm ở dev rồi kết luận PWA hỏng.

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

Collection, role Public và preset transform của Directus sống trong **database của Directus**,
không trong repo: `git clone` không mang chúng theo, và ai đó bấm vài nút trong Data Studio thì
không để lại dấu vết nào trong diff. Nguồn sự thật viết ra được là `scripts/directus-setup.ts`,
áp lại bằng `bun run directus:setup` — nhưng **script không tự chạy, và nó mù với quyền ai đó tự
thêm**, nên phải probe.

Ba lệnh probe, cách đọc kết quả, và cách dọn tay:
[`docs/runbooks/directus-vehicles.md`](docs/runbooks/directus-vehicles.md) §"Quyền công khai hẹp
tới mức nào". Chạy sau mỗi lần nâng version Directus và sau mỗi lần dựng lại môi trường.

### Xác thực: SuperTokens cho `apps/staff`, không có gì cho `apps/web`

**Luật là mặc định chặn.** Route nào không nằm trong danh sách công khai thì đòi session hợp lệ
**và** hồ sơ `ACTIVE` trong `staff_users`. Route nghiệp vụ đợt sau (`rentals`, `customers`)
**quên khai là bị chặn**, không phải lọt.

**Danh tính chia đôi có chủ ý.** SuperTokens giữ đúng hai thứ — mật khẩu và session. Role, trạng
thái duyệt và hồ sơ nằm ở `public.staff_users`, nơi **migration làm chủ**. Lý do quyết định nhất:
`rentals` đợt sau phải FK tới hàng nhân viên ("ai chốt đơn, ai bàn giao xe"), mà FK sang
`supertokens.*` là buộc dữ liệu nghiệp vụ vào schema **do tool khác làm chủ và tự đổi mỗi lần nâng
version**. Lý do thứ hai: khoá tài khoản phải có hiệu lực **ngay**, mà role nhét trong claim của
token thì nhân viên nghỉ việc vẫn vào được tới lúc token hết hạn.

Đánh đổi theo chiều ngược lại: `staff_users.email` là **bản sao**, nguồn sự thật vẫn ở
SuperTokens — đổi email nhân viên phải đồng bộ hai nơi.

**Nhân viên tự đăng ký → `PENDING` → OWNER duyệt.** `createPendingStaff` cố ý **không nhận**
`role`/`status` làm tham số, nên không ai tự chọn được quyền của mình. Hệ quả là hệ thống tự khoá
chính nó lúc mới dựng, nên OWNER **đầu tiên** tạo bằng script:

```bash
STAFF_OWNER_EMAIL=chu@shop.vn bun run staff:bootstrap   # chạy lại nhiều lần vô hại
```

**Quên mật khẩu đi bằng mã 6 số, không phải link** — hai đường vào (SMTP của shop, và OWNER phát
mã đọc qua Zalo) dùng chung một bảng và một đường xác minh. Ngoài production mã **luôn** là
`999999`, và điều kiện là **`NODE_ENV`**, KHÔNG phải "SMTP chưa cấu hình" — thiếu config là mặc
định của một prod mới dựng, nếu thiếu config bật được mã cố định thì hàng rào tự tắt đúng lúc nó
cần nhất. `apps/api/src/env.ts` **ném lúc khởi động** nếu `AUTH_DEV_OTP` xuất hiện ở
`NODE_ENV=production`.

**Thu hồi session cần HAI cơ chế.** `revokeAllSessionsForUser` giết refresh token nhưng **không**
giết access token đang cầm (JWT tự xác thực cục bộ). Công tắc ngắt tức thì là cột
`staff_users.sessions_invalid_before`. Bất biến: **hễ thu hồi thì đóng dấu**.

Bảng mã lỗi đầy đủ, thứ tự hai lời gọi, cạm bẫy cắt-xuống-giây, và lý do dùng 401 chứ không 403:
[`apps/api/CLAUDE.md`](apps/api/CLAUDE.md).

`apps/web` **không** dùng auth — khách gửi yêu cầu thuê không cần tài khoản. Directus giữ hệ tài
khoản riêng; hai nơi đăng nhập là **chấp nhận có ý thức**.

## ⚠️ Hàng rào phải được probe, không được tin

Trong phiên scaffold, `eslint-plugin-boundaries` đã **suy thoái im lặng ba lần** — mỗi lần đều
`exit 0`, đều trông như đang bảo vệ, đều không kiểm tra gì. Nguy hiểm nhất là lần thứ ba:
`import "@v9/db"` lọt hoàn toàn trong khi chỉ `import "../../../db/src"` bị chặn — mà không ai
viết đường dẫn tương đối xuyên package. Lần thứ tư nạn nhân là **chính bộ probe** viết ra để
chống chuyện đó.

**Trong `eslint.config.js` có ba thứ trông như rác cần dọn nhưng xoá cái nào cũng làm hàng rào im
lặng ngừng hoạt động:** `import/resolver` với `extensions`/`engines`/`preserveSymlinks`,
`mode: "full"` trên các element một-file, và các element `api-root`/`shared-root`. Mỗi chỗ đều có
comment giải thích hậu quả. Đọc trước khi sửa.

**Sau mỗi lần đụng `eslint.config.js` hoặc nâng version plugin, chạy lại bốn probe ở**
[`docs/FENCES.md`](docs/FENCES.md) — và **đọc tên luật trong thông báo lỗi**.

Config linter "chạy được và exit 0" **không chứng minh điều gì**. Probe exit 1 **cũng chưa chứng
minh gì** nếu bạn không đọc nó nổ vì luật nào.

## Bộ công cụ AI — dùng khi nào, **không** dùng khi nào

| Tool             | Dùng khi                                                                                                                                                                | KHÔNG dùng khi                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **superpowers**  | Mọi thay đổi không tầm thường: brainstorm → design doc → plan → implement → verify. Doc và plan commit vào `docs/plans/`. **TDD nghiêm bắt buộc** cho `packages/shared` | Việc infra/UI dùng verification-before-completion thay cho test-first                          |
| **CodeGraph**    | Câu hỏi "code này chạy thế nào / ai gọi cái này / đổi nó vỡ gì". `codegraph_explore` một lời gọi thay hàng chục lần đọc file                                            | Xem ba cảnh báo ngay dưới bảng — nó nói sai một cách tự tin ở ba chỗ                           |
| **Serena**       | Điều hướng và sửa theo ngữ nghĩa. Bắt buộc `find_referencing_symbols` **trước khi** đổi tên hay đổi signature của exported function / shared type                       | Không đổi tên khi chưa kiểm reference                                                          |
| **Agent Memory** | Là **ADR, không phải cache code**. Đọc lúc mở phiên và trước **mọi** đề xuất đổi schema/API. Ghi quyết định + lý do, gotcha lúc debug                                   | Không lưu code snippet — git và Serena lo phần đó. Mâu thuẫn thì **nêu cho người**, đừng tự đè |
| **rtk**          | Đã hook sẵn, không cần làm gì                                                                                                                                           | Không dán output dài vào context bằng tay                                                      |
| **impeccable**   | `apps/web` là chính. Đọc `PRODUCT.md` + `DESIGN.md` trước khi động vào UI                                                                                               | `apps/staff` ưu tiên chức năng — không polish trừ khi được yêu cầu                             |

⚠️ **CodeGraph nói sai một cách tự tin ở ba chỗ** (đo 2026-08-12): cờ `no covering tests` chỉ là
heuristic "tên có xuất hiện trong file test", không phải reachability · `explore` với tên không
tồn tại **không** báo "không thấy" mà trả về symbol không liên quan (`codegraph query` thì trung
thực) · cạnh gọi hàm phân giải sai khi trùng tên. Và **index cũ không cảnh báo gì**: watcher chỉ
chạy khi MCP server chạy, nên dùng CLI trần thì `codegraph sync -q` trước.

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

## Roadmap và nợ — ở file riêng

Hai thứ này đổi thường xuyên còn luật thì không, nên tách ra để file này không phình theo mỗi đợt:

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — đợt kế tiếp, việc nghiệp vụ cần brainstorm, deploy.
- [`docs/DEBT.md`](docs/DEBT.md) — năm món nợ của đợt auth, nợ có hạn (`mode` của boundaries), và
  **chặn deploy**: Directus đang cầm credential ROOT của MinIO ở prod.
