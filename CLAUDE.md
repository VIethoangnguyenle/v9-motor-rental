# V9 Motor Rental — CLAUDE.md

Hệ quản lý cho shop cho thuê mô tô phân khối lớn ở TP.HCM. UI tiếng Việt trước, tiếng Anh sau.

Repo này được phát triển **chủ yếu bởi AI agent**. Vì vậy ranh giới do máy ép và tài liệu này là
deliverable ngang hàng với code, không phải phụ lục.

> Thiết kế và lý do đằng sau mọi quyết định: `docs/plans/2026-08-04-scaffolding-design.md`.
> Khi tài liệu này và design doc mâu thuẫn, **design doc thắng** — và hãy sửa file này.

---

## Repo map

| Workspace | Vai trò |
|---|---|
| `apps/api` | Bun + Elysia + TypeBox. Export `type App` cho Eden Treaty. |
| `apps/staff` | Vite + TanStack Router/Query, **PWA**. Vận hành: lịch, thống kê, lên đơn/bàn giao, khách hàng. Role `OWNER`, `STAFF`; `SALES` để dành. |
| Directus | **Chỉ dữ liệu gốc**: danh mục xe, ảnh, bảng giá. Không làm vận hành. |
| SuperTokens | Xác thực cho `apps/staff`. Schema riêng trong cùng Postgres. |
| `apps/web` | Next 16 App Router, `output: "standalone"`, SSG/ISR. Site công khai, **SEO quan trọng**. |
| `packages/shared` | Domain logic thuần + Eden client factory. |
| `packages/db` | Drizzle schema + migration SQL. |

**Hai frontend dùng hai framework khác nhau, có chủ ý.** `apps/staff` là app vận hành nội bộ nên
SEO vô nghĩa; `apps/web` giữ Next vì SEO chính là lý do Next được chọn. Đừng "thống nhất" chúng.

## Canonical commands

```bash
bun install                  # cài, ở root
docker compose up -d         # dev: postgres + minio (KHÔNG có app)
bun run dev                  # api + web + staff chạy trên host
bun run db:migrate           # apply migration (chạy từ root, không dùng --filter)
bun run db:generate          # sinh migration cho bảng thường
bun run db:custom            # migration trống để viết SQL tay
bun test                     # bun test, toàn repo
bun run typecheck            # cả 4 workspace (5 khi có apps/staff)
bun run lint                 # eslint, có ép ranh giới kiến trúc
bun run format               # prettier
bun run bench                # đo /health, exit 1 nếu vượt perf budget
```

Prod: `docker compose -f compose.prod.yaml up -d`.

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
với `current transaction is aborted`. Muốn *thử* insert rồi xử lý va chạm mà vẫn dùng tiếp
transaction đó thì phải bọc câu có thể lỗi trong `tx.savepoint(async (sp) => { ... })`.

---

## Perf budget — vượt là coi như fail, không phải góp ý

| Thao tác | p95 |
|---|---|
| `GET /health` | < 5 ms |
| Đọc một record theo id | < 25 ms |
| Truy vấn availability | < 50 ms |

Baseline đo 2026-08-05 trên máy dev: `/health` p50 1.28ms · p95 2.26ms · p99 2.95ms · 34.968 rps.
`bun run bench` exit 1 khi vượt.

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

### `bun run --filter '*'` **im lặng bỏ qua** workspace thiếu script

Rồi vẫn exit 0. Nghĩa là `bun run typecheck` có thể xanh mà chưa kiểm tra package nào.
**Luật: mọi workspace mới bắt buộc khai `typecheck` trong `package.json` ngay khi được tạo.**

Ngoài ra `--filter` chạy với cwd là thư mục package, nên `.env` ở root không tới nơi. Lệnh nào
cần env thì chạy từ root với `bun --env-file=.env ...`.

### `exactOptionalPropertyTypes`: bật ở `packages/*`, tắt ở `apps/{web,staff}`

Không phải quên. Cờ này đánh nhau với mẫu JSX `prop={cond ? value : undefined}` vì React khai
`prop?: T` chứ không phải `prop?: T | undefined`. Đừng "sửa" theo hướng nào cả.

### `apps/staff`: `VITE_API_URL` bị nướng vào bundle **lúc build**

Đặt biến đó lúc chạy trong compose **không có tác dụng gì**. Đổi API URL của staff bắt buộc phải
build lại image. `deploy.yml` truyền nó qua `--build-arg`.

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
# PHẢI nổ
echo 'import { schema } from "@v9/db"; export const l = schema;' > packages/shared/src/domain/__p.ts
bun x eslint packages/shared/src/domain/__p.ts   # boundaries/dependencies
rm packages/shared/src/domain/__p.ts

# PHẢI im (mẫu Eden hợp lệ — import type bị xoá lúc build)
bun x eslint apps/web/lib/api.ts apps/staff/src/lib/api.ts
```

Config linter "chạy được và exit 0" **không chứng minh điều gì**. Chỉ probe vi phạm thật mới chứng minh.

---

## Bộ công cụ AI — dùng khi nào, **không** dùng khi nào

| Tool | Dùng khi | KHÔNG dùng khi |
|---|---|---|
| **superpowers** | Mọi thay đổi không tầm thường: brainstorm → design doc → plan các bước verify được → implement → verify trước khi tuyên bố xong. Design doc và plan commit vào `docs/plans/` để sống sót qua các phiên. **TDD nghiêm bắt buộc** cho `packages/shared`. | Việc infra và UI dùng verification-before-completion thay cho test-first. |
| **Serena** | Cách **duy nhất** để điều hướng và sửa code theo ngữ nghĩa. Bắt buộc `find_symbol` / `find_referencing_symbols` **trước khi** sửa bất kỳ exported function hay shared type nào. Ưu tiên sửa ở mức symbol hơn ghi đè cả file. | Không đổi tên hay đổi signature khi chưa kiểm tra reference. |
| **Agent Memory** | Là **ADR, không phải cache code**. **Đọc** lúc mở phiên và trước **mọi** đề xuất đổi schema hay API contract. **Ghi** quyết định + lý do, naming convention, gotcha phát hiện lúc debug. | Không lưu code snippet hay nội dung file — git và Serena lo phần đó. Nếu đề xuất mâu thuẫn với quyết định đã lưu, **nêu xung đột cho người**, không tự đè. |
| **rtk** | Đã hook sẵn, không cần làm gì. Ưu tiên chạy test/git/docker qua bash để rtk nén output. | Không dán output dài vào context bằng tay. |
| **impeccable** | `apps/web` là chính; audit nhẹ cho `apps/staff`. UI của `apps/web` phải tôn trọng `DESIGN.md`. | `apps/staff` ưu tiên chức năng — **không polish pass trừ khi được yêu cầu**. |

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

Chính sách tính ngày thuê và bảng giá · schema nghiệp vụ (`vehicles`, `customers`, `rentals`) kèm
exclusion constraint chống double-booking · implement JWT auth (seam: `grep -rn "SEAM: JWT auth"`)
· next-intl khi thật sự có tiếng Anh · upload ảnh lên MinIO.
