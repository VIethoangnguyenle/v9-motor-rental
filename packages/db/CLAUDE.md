# packages/db — CLAUDE.md

Luật chung của repo ở [`../../CLAUDE.md`](../../CLAUDE.md). Đọc file đó trước.

Drizzle schema + migration SQL. Phiên scaffold **chưa có bảng nghiệp vụ nào** — `src/schema/`
cố ý rỗng.

## `drizzle-kit push` bị **cấm**

Schema chỉ đi qua migration file. Đó là điều kiện để dev và prod hội tụ, và để review được thay
đổi schema trong diff.

| Việc | Lệnh |
|---|---|
| Bảng thường (khai trong `src/schema/`) | `bun run db:generate` |
| DDL Postgres thuần (extension, exclusion constraint, partial index) | `bun run db:custom` rồi viết SQL tay |
| Apply | `bun run db:migrate` |

## `db:migrate` KHÔNG dùng `drizzle-kit migrate`

Nó dùng migrator tự viết ở `scripts/migrate.ts` trên `drizzle-orm/bun-sql`.

Lý do: `drizzle-kit migrate` không hỗ trợ `bun-sql` — nó đòi cài `pg` hoặc `postgres`, tức kéo
một driver Postgres **thứ hai** vào dự án chỉ để chạy migration. Giữ một driver duy nhất còn có
lợi ích thứ hai: migration chạy trên cùng driver với production, nên khiếm khuyết của `bun-sql`
lộ ngay lúc migrate thay vì ẩn tới lúc chạy thật.

`drizzle-kit` vẫn dùng cho `generate` và `generate --custom` — hai lệnh đó không cần driver.

Chạy từ **root** (`bun --env-file=.env packages/db/scripts/migrate.ts`), không dùng `--filter`:
`--filter` đặt cwd là thư mục package nên `.env` ở root không tới nơi.

## ⚠️ Khi tạo bảng `rentals`

Migration của nó **phải** kèm:

```sql
ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);
```

với `period` kiểu `tstzrange` dùng biên `[)` — **khớp `overlaps()` trong `@v9/shared`**. Lệch biên
giữa hai bên là nguồn bug booking kinh điển.

Extension `btree_gist` đã bật sẵn ở migration `0000` để dòng trên chạy được. Index GiST sinh ra
từ constraint đó dùng luôn cho tra cứu availability — **không tạo index thứ hai**.

Service phải bắt SQLSTATE `23P01` → HTTP 409. Nhớ: Bun.SQL để SQLSTATE ở **`.errno`**, không phải
`.code`. Xem `../../CLAUDE.md`.

## Test

`src/btree-gist.test.ts` chứng minh extension dùng được thật: nó tạo bảng tạm có exclusion
constraint trong một transaction, khẳng định INSERT chồng lấn bị chặn bằng `23P01`, khẳng định
chạm đầu-đuôi **được** chấp nhận, rồi ROLLBACK. Không commit một dòng schema nghiệp vụ nào.

Test cần Postgres đang chạy: `docker compose up -d`.
