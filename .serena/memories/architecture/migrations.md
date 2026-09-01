# Migration chạy bằng migrator tự viết trên bun-sql, KHÔNG phải `drizzle-kit migrate`

ADR 2026-08-05, kiểm lại 2026-09-01 — vẫn đúng nguyên văn.

## Quyết định

`drizzle-kit migrate` **không hỗ trợ bun-sql**: nó đòi cài `pg`, `postgres`,
`@neondatabase/serverless` hoặc `@vercel/postgres`. Mà driver runtime đã chốt là
`drizzle-orm/bun-sql`. Dùng `drizzle-kit migrate` sẽ buộc kéo **driver Postgres thứ hai** vào dự án
chỉ để chạy migration.

Chốt: `packages/db/scripts/migrate.ts` dùng `drizzle-orm/bun-sql/migrator` trực tiếp trên
`new SQL(DATABASE_URL)`. Giữ **đúng một** driver trong cả hệ thống, và migration chạy **trên cùng
driver với production** nên khiếm khuyết của bun-sql lộ ngay lúc migrate thay vì ẩn tới lúc chạy
thật.

`drizzle-kit` **vẫn** dùng cho `generate` và `generate --custom` — hai lệnh đó không cần driver.
`drizzle-kit push` bị **cấm**: schema chỉ đi qua migration file, để dev và prod hội tụ và để thay
đổi schema review được trong diff.

## ⚠️ Gotcha env — lý do `db:migrate` chạy từ root

`bun run --filter @v9/db <script>` đặt **cwd = `packages/db`**, mà Bun chỉ nạp `.env` từ **đúng cwd**
và không đi ngược lên thư mục cha. Nên `DATABASE_URL` ở root **không tới nơi**.

Vì vậy:

```jsonc
"db:migrate": "bun --env-file=.env packages/db/scripts/migrate.ts"          // từ root
"generate":   "bun --env-file=../../.env ./node_modules/.bin/drizzle-kit generate"  // gọi THẲNG binary
```

`bun --env-file=... bun x <cli>` **không** hoạt động — `bun x` spawn tiến trình mới và env-file bị bỏ.
Đó là lý do script gọi thẳng `./node_modules/.bin/drizzle-kit`.

`bun --env-file` trỏ vào file **không tồn tại** là **no-op, không throw** — nhờ đó CI (không có
`.env`) chạy được nguyên văn cùng một script với máy dev.

## Trạng thái

`bun-sql` đã qua lần tiếp xúc thật đầu tiên sạch sẽ (2026-08-05): migrate chạy được, idempotent khi
chạy lại, exclusion constraint hoạt động.

**Đếm 2026-09-01: `0000` → `0012`.** Bản ghi cũ không nói con số này. Bảng liệt kê từng migration
sống trong skill **`v9-db`** (đã cập nhật tới `0012`); `packages/db/CLAUDE.md` nay chỉ còn là con trỏ
5 dòng vào skill đó — đừng tìm nội dung ở file cũ nữa.

Ba service dùng chung một Postgres, chỉ `packages/db` được đổi schema `public` — chi tiết role và
cách ép: `mem:architecture/directus`.

Bẫy `db:custom` ghi snapshot là bản sao của snapshot trước (nên cột viết tay vô hình với chuỗi
snapshot): `mem:architecture/postgres-and-search`.

Thủ tục hằng ngày: skill `v9-db`.
