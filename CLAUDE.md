# V9 Motor Rental — CLAUDE.md

Hệ quản lý cho shop cho thuê mô tô phân khối lớn ở TP.HCM. UI tiếng Việt trước, tiếng Anh sau.

Repo này được phát triển **chủ yếu bởi AI agent**. Vì vậy ranh giới do máy ép và tài liệu này là
deliverable ngang hàng với code, không phải phụ lục.

**File này là router: giữ luật chung, trỏ đi nơi khác cho chiều sâu.** Nó nạp lại mỗi phiên nên
độ dài của nó là chi phí lặp — thứ chỉ cần khi làm một việc cụ thể thì không thuộc về đây.

## Gặp việc này → mở cái này

| Việc                                                            | Ở đâu                                       | Nạp thế nào  |
| --------------------------------------------------------------- | ------------------------------------------- | ------------ |
| Đụng `eslint.config.js`, nâng version plugin, thêm thư mục code | skill `v9-fences`                           | theo việc    |
| Auth, role, session, đăng ký/duyệt nhân viên, FK tới nhân viên  | skill `v9-auth`                             | theo việc    |
| Directus: ảnh xe, quyền Public, sau khi nâng version            | skill `v9-directus`                         | theo việc    |
| Chuẩn bị deploy, sửa `compose.prod.yaml`                        | skill `v9-deploy`                           | theo việc    |
| Viết code trong một workspace                                   | `CLAUDE.md` của workspace đó                | theo thư mục |
| Đợt kế tiếp, việc nghiệp vụ cần brainstorm                      | [`docs/ROADMAP.md`](docs/ROADMAP.md)        |              |
| Nợ đã biết                                                      | [`docs/DEBT.md`](docs/DEBT.md)              |              |
| Lý do đằng sau một quyết định cũ                                | [`docs/plans/`](docs/plans/) · Agent Memory |              |

`CLAUDE.md` của workspace **thắng** file này khi hai bên nói cùng một chuyện; design doc trong
`docs/plans/` thắng cả hai. Thấy mâu thuẫn thì **nêu cho người**, đừng tự chọn bên.

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

### Định danh tiếng Anh, nội dung tiếng Việt

Component · tên file · hàm · biến · type · hằng · URL route (cả hai frontend) · mã lỗi trong hợp
đồng API: **tiếng Anh**. Comment · tài liệu · chuỗi hiển thị cho người dùng: **tiếng Việt**.

Ranh giới đó không tuỳ hứng: thứ máy đọc thì tiếng Anh, thứ người đọc thì tiếng Việt. Repo có ~2000
dòng comment giải thích _vì sao_ — dịch chúng là phá đúng thứ có giá trị nhất.

Áp cho định danh **mới**. Chỗ cũ còn tiếng Việt là nợ đang trả, không phải ngoại lệ của luật.

⚠️ **Luật này KHÔNG ép được bằng máy.** Không linter nào kiểm được "tên phải là tiếng Anh". Đây là
quy ước trong tài liệu, không phải hàng rào — xem mục "ranh giới repo ép vs cấu hình local".

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

### ⚠️ Ba cái bẫy quanh lỗi Postgres — hỏng im lặng nếu làm sai

**SQLSTATE nằm ở `.errno`, KHÔNG phải `.code`** (`.code` luôn là `"ERR_POSTGRES_SERVER_ERROR"`),
nên `e.code === "23P01"` là điều kiện **không bao giờ đúng** — va chạm booking rơi ra 500 thay vì
409, và unit test không bắt được vì phải có Postgres thật mới lộ.

**Nhưng `.errno` chỉ đúng cho Bun.SQL TRẦN.** Đi qua Drizzle (`db.insert(...)`), lỗi bị bọc trong
`DrizzleQueryError` và trên đường đó `.errno` là **`undefined`** — tức `e.errno === "23P01"` cũng
thành một điều kiện không bao giờ đúng, đúng cái bẫy trên chỉ sâu hơn một tầng. Lỗi thật nằm ở
`e.cause`. Bảng đo hai tầng: [`apps/api/CLAUDE.md`](apps/api/CLAUDE.md).

**Lỗi trong transaction làm hỏng cả transaction** — bọc câu có thể lỗi trong `tx.savepoint(...)`,
và `try/catch` phải bọc **cả lời gọi `savepoint`**, không bọc câu lệnh bên trong: nuốt lỗi bên
trong callback làm nó trông như thành công, rồi `RELEASE` một sub-transaction đã abort ném `25P02`
ở ngoài tầm bắt của bạn.

Chi tiết, cùng ba chỗ đang dựa vào `SELECT ... FOR UPDATE`:
[`apps/api/CLAUDE.md`](apps/api/CLAUDE.md).

## Perf budget — vượt là coi như fail, không phải góp ý

`GET /health` < 5 ms · đọc một record theo id < 25 ms · availability < 50 ms (p95).
`bun run bench` exit 1 khi vượt.

Baseline **2026-08-05**: p50 1,28 ms · p95 2,26 ms · 34.968 rps. Đo lại 2026-08-10 với đủ
container: p95 2,88 ms · p99 16,78 ms — p95 vẫn trong budget; p99 và rps xấu đi **do máy chật,
không do code**. Cố ý **không** ghi đè baseline bằng số đo trên máy đang ồn: đó là rửa số liệu, và
lần sau có regression thật sẽ không ai thấy.

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

### Hai cờ trông như quên nhưng là cố ý

`exactOptionalPropertyTypes` bật ở `packages/*`, tắt ở `apps/{web,staff}` — nó đánh nhau với mẫu
JSX `prop={cond ? value : undefined}`. Đừng "sửa" theo hướng nào cả.

`VITE_API_URL` và `NEXT_PUBLIC_*` bị nướng vào bundle **lúc build**, đặt lúc chạy không có tác
dụng gì. `vite-plugin-pwa` **không** chạy ở `vite dev`. Chi tiết ở `CLAUDE.md` của hai app đó.

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
được và không để lại dấu vết nào trong repo. Probe DDL sau mỗi lần nâng version Directus hoặc
SuperTokens: skill `v9-directus`.

### Cấu hình Directus KHÔNG nằm trong git

Collection, role Public và preset transform sống trong database của Directus. `git clone` không
mang chúng theo, và bấm nút trong Data Studio không để lại dấu vết nào trong diff. Nguồn sự thật
viết ra được là `scripts/directus-setup.ts` — nhưng nó **không tự chạy** và **mù với quyền ai đó
tự thêm**. Ba probe bắt drift: skill `v9-directus`.

## ⚠️ Hàng rào phải được probe, không được tin

`eslint-plugin-boundaries` đã **suy thoái im lặng bốn lần** trong dự án — mỗi lần đều `exit 0`,
đều trông như đang bảo vệ, đều không kiểm gì. Lần thứ tư nạn nhân là chính bộ probe viết ra để
chống chuyện đó.

Config linter "chạy được và exit 0" **không chứng minh điều gì**. Probe exit 1 **cũng chưa chứng
minh gì** nếu bạn không đọc nó nổ vì luật nào.

Sau mỗi lần đụng `eslint.config.js` hoặc nâng version plugin: chạy bốn probe của skill
`v9-fences`, và **đọc tên luật trong thông báo lỗi**.

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

### Quy trình chạm code — áp cho **mọi** agent, kể cả subagent

Bốn bước, theo thứ tự.

1. **Hỏi CodeGraph trước** — trước khi grep hay đọc file để _hiểu_ một vùng code. Coi output của
   nó là **đã đọc**: đừng `Read` lại file nó vừa trả nguyên văn source.
2. **Serena định vị** — `find_symbol`, `find_declaration`, `find_referencing_symbols`.
3. **Serena sửa** — theo **symbol**, không theo số dòng. Số dòng trôi sau mỗi lần sửa; symbol thì
   không.
4. **Ghi lại** quyết định và lý do vào Agent Memory.

**Không bao giờ:** dùng grep/find/Read để _khám phá_ khi CodeGraph trả lời được (vẫn dùng chúng để
_kiểm chứng_) · `Read` lại file CodeGraph vừa trả source · đổi tên hay đổi signature của exported
function / shared type khi chưa chạy `find_referencing_symbols`.

⚠️ **Ai giao việc cho subagent phải chép luật này vào đề bài.** Subagent không đọc `CLAUDE.md` —
luật không tự đi theo nó. Không mang sang thì subagent sẽ grep, và người giao việc là người chịu
trách nhiệm, không phải subagent.

Cú pháp, bảng kê tool Serena, bốn probe sau `codegraph upgrade`, và những chỗ output nói dối:
skill `v9-codegraph`.

⚠️ **Không máy nào ép quy trình này** — cùng hạng với luật định danh tiếng Anh. Xem mục ngay dưới.

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
