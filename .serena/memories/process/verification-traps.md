# Họ lỗi "xanh mà không chứng minh gì"

Gộp bốn bản ghi agentmemory (2026-08-05 → 2026-08-12) + đối chiếu repo 2026-09-01. Đây là **họ lỗi
đặc trưng của dự án này**: một cơ chế kiểm chứng trông như đang chạy, exit 0, không ai nghi ngờ, và
không kiểm gì cả.

Ca hỏng của đợt 2026-09-01 (test xanh mà không đo gì, số đo bịa, tiền đề sai của người ra đề) nằm
riêng ở `mem:process/lessons-2026-09-01`. File này giữ các ca **trước** đó và bài học đã cứng lại
thành luật.

## Hai luật, luật thứ hai mạnh hơn một bậc

1. **Config linter "chạy được và exit 0" không chứng minh điều gì.** Chỉ probe vi phạm thật mới
   chứng minh.
2. **Probe exit 1 CŨNG chưa chứng minh gì nếu bạn không đọc nó nổ vì LUẬT NÀO.** Luôn grep tên rule
   trong output.

Luật ② sinh ra từ lần thứ tư, khi **nạn nhân là chính bộ probe viết ra để chống chuyện này**.

## Bốn lần `eslint-plugin-boundaries` suy thoái im lặng

| # | Hỏng ở đâu | Triệu chứng |
| --- | --- | --- |
| 1 | resolver thiếu `extensions: [".ts", ...]` | không resolve được gì → không phân loại được gì |
| 2 | thiếu element type cho file entrypoint | file **không khớp pattern nào** thì plugin **không đăng ký dependency visitor nào** — nó không bị kiểm yếu, nó **miễn hoàn toàn** |
| 3 | import kiểu **package specifier** (`@v9/db`) không bị kiểm | hàng rào canh con đường không ai đi, bỏ ngỏ con đường mọi người đi |
| 4 | **bộ probe** viết ra để bắt #3 đo sai chỗ | probe vẫn exit 1, vẫn trông như đang bảo vệ, chứng minh **số không** |

**#2 đẻ ra `boundaries/no-unknown-files: "error"`** — nổ ngay khi một file top-level không khớp
element pattern nào, thay vì im lặng thoát mọi kiểm tra như `apps/api/src/index.ts` và
`packages/shared/src/index.ts` từng làm.

### #3 — và ⚠️ chẩn đoán trong bản ghi cũ CHƯA ĐỦ

Triệu chứng: `apps/api/src/index.ts` import thẳng `@v9/db` → **không một lỗi nào**, trong khi cùng vi
phạm viết bằng đường dẫn tương đối thì bị chặn đúng. Chết người vì **không ai viết import xuyên
package bằng đường dẫn tương đối**; người ta viết `@v9/db`. `tsc` cũng im lặng — `@v9/db` là
dependency đã khai của `apps/api`.

Bản ghi 2026-08-05 quy nguyên nhân cho *"resolver phân loại package specifier là `origin: "external"`,
mà `checkAllOrigins` mặc định `false`"*. **Nửa sau đúng, nhưng nếu đọc nó như một đơn thuốc thì
đơn thuốc đó SAI và sẽ phá build.** Đọc `eslint.config.js` hiện tại (2026-09-01), nguyên nhân thật
có **hai tầng** và cách vá nằm hoàn toàn ở `import/resolver`:

1. `eslint-import-resolver-node` dùng gói `resolve`, gói này chỉ bật "exports" resolution khi
   `options.engines` cho nó biết range Node. Mặc định `engines: true` = đọc `engines.node` từ
   `package.json` gần nhất — **không package.json nào trong repo khai `engines.node`** (root chỉ có
   `engines.bun`) → tra cứu thất bại → resolver **âm thầm** rơi về thuật toán "main field" cũ →
   `packages/db` chỉ khai `"exports"`, không có `"main"` → `@v9/db` resolve ra `{ found: false }`.
   Vá: đặt thẳng **`engines: ">=18"`**.
2. Resolve xong, path trả về là `apps/api/node_modules/@v9/db/src/index.ts` (symlink workspace, chưa
   realpath, vì mặc định `preserveSymlinks: true`). Path đó **chứa chuỗi `node_modules`** →
   `flagAsExternal.inNodeModules` phân loại "external" → `boundaries/dependencies` bỏ qua.
   Vá: **`preserveSymlinks: false`** buộc `fs.realpathSync` → `packages/db/src/index.ts` → "local".

**`checkAllOrigins` vẫn cố ý để `false`.** Bật nó lên sẽ kiểm luôn cả import bên thứ ba thật, mà
không policy nào cho phép import vào element `"unknown"` → mọi `import elysia/react/vite/...` bị
disallow, phá toàn bộ dev. Ai đọc bản ghi cũ rồi đi bật cờ đó là làm hỏng repo.

⚠️ Ba thứ trong `eslint.config.js` trông như rác cần dọn, xoá cái nào cũng làm hàng rào im lặng
ngừng hoạt động: `import/resolver` (`extensions`/`engines`/`preserveSymlinks`) · `mode: "full"` trên
element một-file · các element `api-root`/`shared-root`.

### #4 — probe đúng-vì-lý-do-sai

Bộ probe cũ đặt vi phạm ở `packages/shared/src/domain/` với `import { schema } from "@v9/db"`. Nhưng
`packages/shared` **không khai** `@v9/db` là dependency, nên lint chết ở
`@typescript-eslint/no-unsafe-assignment` **trước khi boundaries kịp phân loại**.

```
packages/shared + "@v9/db"  ->  no-unsafe-assignment     (SAI, không chứng minh gì)
apps/api        + "@v9/db"  ->  boundaries/dependencies  (ĐÚNG)
```

Khác biệt: `apps/api` **khai** `@v9/db` là dependency thật nên import resolve được, boundaries mới có
gì để phân loại. Bộ probe đúng (4 mũi, gồm cả một mũi **phải IM**) nằm ở skill `v9-fences`.

### Lần thứ năm, dạng nhẹ hơn: một **comment** tự tin sai

2026-08-16, đợt `frontend-ui`. Comment trong `eslint.config.js` khẳng định *"hai pattern folder-mode
chồng nhau đều dồn vào `element.types`, thứ tự chỉ ảnh hưởng thứ tự mảng"*. **Sai.** Với
`elements-single-match` mặc định `true`, vòng lặp `break` ngay ở descriptor **đầu tiên** khớp — file
nhận **đúng một** type. `alert.tsx` dưới `components/ui/` nhận `["frontend-ui"]`, **không có**
`"frontend"` trong mảng. Hệ quả: policy `frontend → frontend` phải khai rõ `"frontend-ui"` trong
`anyOf`, nếu không `pages/` mất quyền import từ `ui/`. **Probe bắt được, comment thì không.**

## CodeGraph nói sai một cách tự tin — nhưng ĐỪNG chép cảnh báo cũ

Đo 2026-08-12 trên **v1.5.0**, ba lỗi. **Đo lại 2026-08-31 trên v1.6.0: hai trong ba đã hết.**

| | v1.5.0 (bản ghi cũ) | v1.6.0 (đo lại) |
| --- | --- | --- |
| `explore` với tên không tồn tại | trả về symbol không liên quan + "Found 26 symbols across 4 files" | ✅ `No relevant code found` |
| Cờ test | `⚠️ no covering tests found` — heuristic **tên-xuất-hiện-trong-file-test** | ✅ `no tests found within 3 caller hops` — reachability theo caller hop |
| Cạnh gọi hàm trùng tên | phân giải sai | ⚠️ **còn nguyên** |

Ca cũ của cờ test: hàm `dongDauThuHoiSession` bị gắn cờ "không có test" trong khi **ba** file test
phủ hành vi của nó qua caller — chỉ là không test nào gọi thẳng tên hàm. Trên v1.6.0 ca tương đương
ra đúng `tested via callers`.

Vẫn phải đọc đúng chữ: **"trong 3 hop" không đồng nghĩa "không có test"**. Và **index cũ không cảnh
báo gì** — file watcher là thuộc tính của tiến trình `codegraph serve --mcp`, không phải của index.
Daemon tắt thì `query`/`explore` đọc thẳng DB cũ và trả `No results` cho file vừa tạo, **không một
cảnh báo nào**. Dùng CLI trần (script, git hook, phiên khác) thì `codegraph sync -q` trước.

Bốn probe sau mỗi `codegraph upgrade` + bảng tool: skill `v9-codegraph`. Probe thứ tư chỉ có giá trị
nếu bạn **đối chiếu** caller nó liệt kê với `grep` thật — nó in ra một bảng đẹp không chứng minh gì.

*(Bẫy thao tác nhỏ, dính 2 lần trong 1 phiên: `pkill -f "codegraph serve"` khớp **luôn dòng lệnh của
chính shell đang chạy nó** → tự sát, exit 144. Dùng character class: `pgrep -f '[c]odegraph serve'`.)*

## Ba bẫy "xanh mà sai" của đợt danh mục xe (2026-08-10)

1. **Index không khớp `ORDER BY` vì `NULLS LAST`** — mất index không lỗi, không cảnh báo, chỉ chậm.
   Chi tiết + số EXPLAIN: `mem:architecture/vehicles-catalog`.
2. **Frontend không được import barrel `@v9/shared`.** `boundaries` cho `frontend → shared-domain`
   và `shared-client`, **không** cho `shared-root` (`packages/shared/src/index.ts`), mà package chỉ
   export `"."` và `"./client"` → `apps/web` không có đường hợp lệ nào tới `formatVnd`.
   Cách sửa **đúng**: thêm subpath export `"./domain/money"`, **không** nới allow-list của
   boundaries. (Kiểm 2026-09-01: `packages/shared/package.json` nay có 4 subpath `./domain/*`.)
   **Đo cả hai chiều** — `@v9/shared/domain/money` → eslint **im**; `@v9/shared` → nổ với
   `no policy allowing dependencies from elements of type "frontend" to elements of type "shared-root"`.
   Probe một chiều không phát hiện được nếu cửa mới là thừa.
3. **`bun test` chạy mọi file trong MỘT tiến trình, dùng chung module cache.** Một `Bun.SQL` client
   ở module scope bị `afterAll` của file nạp trước đóng mất trong khi file sau vẫn đang dùng → test
   flaky **phụ thuộc thứ tự file**. Đúng: hàm `setupDb()` trả client riêng cho từng file
   (`packages/db/src/test-support.ts`, còn nguyên và có doc giải thích).

Kèm: **`now()` là timestamp của TRANSACTION**, bất biến trong transaction. Test trigger `updated_at`
bằng cách so `updated_at > created_at` ngay sau INSERT+UPDATE trong cùng transaction sẽ thấy **bằng
nhau** và kết luận sai là trigger không chạy. Giữ `now()` (đúng ngữ nghĩa production: Directus sửa
hàng loạt thì mọi hàng một mốc), cho test chèn hàng probe lùi thời gian.

## Probe trên đối tượng VỪA TẠO đo trúng cache, không phải hành vi

Đợt Directus: probe tạo bảng rồi adopt ngay, `GET /fields` trả 403 **chỉ vì schema cache chưa kịp
thấy bảng mới**. Probe cho kết quả **đúng vì lý do sai** — một cuộc đua thắng được một lần, không
phải một cơ chế; trên bảng đã tồn tại từ trước (mọi trường hợp thật) nó luôn hỏng. Toàn bộ ca:
`mem:architecture/directus`.

Luật: **probe trên đối tượng đã tồn tại sẵn, hoặc chạy lại lần hai sau khi cache ấm.**

Hệ luận cay hơn: *script idempotent kiểm sai chỗ **tệ hơn** script không idempotent* — cái sau ít
nhất còn nổ; cái trước im lặng bỏ qua và chỉ lộ khi có người dựng môi trường mới.

## Cùng họ: PWA im lặng

- `vite-plugin-pwa` **không** chèn manifest và **không** đăng ký service worker ở `vite dev` trừ khi
  bật `devOptions.enabled`. Mọi hành vi PWA chỉ quan sát được trên bản **build** (`vite preview`).
  Kiểm ở dev rồi kết luận PWA hỏng là **kết luận sai**.
- Thiếu file icon (`icon-192.png` / `icon-512.png`) thì trình duyệt **im lặng** không mời cài app —
  không lỗi console, không gì trong build output.

## ⚠️ Phân biệt ranh giới **repo ép** vs **cấu hình local**

Nhầm hai loại này là cách sinh ra ảo giác "đang được bảo vệ". Sống sót qua `git clone`?

- ✅ `eslint.config.js` (CI chạy `bun run lint`) · migration `0001_service_roles.sql` (ép ở tầng
  Postgres) · `bun test` · `.serena/memories/**` (**đã kiểm: được track**, chỉ `.serena/cache/` bị
  ignore)
- ⚠️ có mặt nhưng **không máy nào ép**: luật trong `.claude/CLAUDE.md`/`docs/ARCHITECTURE.md` (root
  `CLAUDE.md` đã chuyển vào `.claude/` ngày 2026-09-01) — ví dụ "gọi
  CodeGraph trước khi đọc file", "định danh tiếng Anh". Không linter nào kiểm được.
- ❌ **KHÔNG** sống sót: `.claude/settings.local.json`, `.codex/` (gitignore) — detector của
  impeccable chỉ chạy trên máy đã cài. Hook im lặng **không** có nghĩa "UI đã qua kiểm tra".
- ❌ Cấu hình Directus (sống trong DB của nó) — xem `mem:architecture/directus`.

Liên quan: `mem:process/lessons-2026-09-01` · `mem:architecture/monorepo-and-build` ·
`mem:architecture/docs-layout` · skill `v9-fences` · skill `v9-codegraph`
