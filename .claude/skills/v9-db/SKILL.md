---
name: v9-db
description: Luật viết code trong packages/db (Drizzle + migration SQL): drizzle-kit push bị cấm, db:migrate dùng migrator tự viết chứ không phải drizzle-kit migrate, mọi script phải tự mang --env-file, và ba service dùng chung Postgres nhưng chỉ packages/db được đổi schema. Dùng TRƯỚC khi đụng schema hay migration.
---

# packages/db

Kiến trúc chung: [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) · Quy trình: [`CLAUDE.md`](../../../CLAUDE.md) · ADR: Serena memory `architecture/*`.

## `drizzle-kit push` bị **cấm**

Schema chỉ đi qua migration file. Đó là điều kiện để dev và prod hội tụ, và để review được thay
đổi schema trong diff.

| Việc                                                                      | Lệnh                                 |
| ------------------------------------------------------------------------- | ------------------------------------ |
| Bảng thường (khai trong `src/schema/`)                                    | `bun run db:generate`                |
| DDL Postgres thuần (extension, exclusion constraint, partial index, role) | `bun run db:custom` rồi viết SQL tay |
| Apply                                                                     | `bun run db:migrate`                 |

Cả bốn script của package này (`generate`, `custom`, `migrate`, `studio`) đều **tự mang**
`--env-file=../../.env` và gọi **thẳng binary** trong `node_modules/.bin`, không qua `bun x`.
Không phải rườm rà — xem mục kế tiếp.

Migration hiện có:

| File                        | Nội dung                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `0000_btree_gist`           | bật extension                                                                          |
| `0001_service_roles`        | role + schema cho Directus và SuperTokens                                              |
| `0002_tearful_plazm`        | `vehicles` + `vehicle_photos`, CHECK `slug`/`status`, partial index cho xe `published` |
| `0003_puzzling_pete_wisdom` | CHECK tiền không âm và `engine_cc > 0`                                                 |
| `0004_real_mantis`          | hàm `set_updated_at()` + trigger `vehicles_set_updated_at`                             |
| `0005_tidy_machine_man`     | `staff_users` + `password_reset_codes`, CHECK `role`/`status`, partial index           |
| `0006_spooky_proteus`       | FK tự trỏ `staff_users.approved_by → staff_users.id`, `ON DELETE SET NULL`             |
| `0007_little_micromacro`    | đổi tên index/constraint của `0005` sang quy ước dài của Drizzle                       |
| `0008_flaky_carlie_cooper`  | `staff_users.sessions_invalid_before` — mốc thu hồi access token                       |

`0002` và `0003` do `db:generate` sinh — kể cả bốn CHECK, vì chúng khai bằng `check()` ngay trong
`src/schema/vehicles.ts`. `0004` thì **phải** là `db:custom`: Drizzle không mô tả được TRIGGER, nên
không có gì để sinh ra từ đó. `0004` để tên hàm chung (`set_updated_at`) chứ không gắn riêng vào
`vehicles` — bảng sau chỉ cần thêm `CREATE TRIGGER`, không cần hàm mới.

`0005`–`0008` cũng do `db:generate` sinh. `staff_users` cố ý **không** có trigger `set_updated_at`
dù `vehicles` có: trigger đó tồn tại vì `vehicles` có HAI đường ghi (Directus ghi thẳng vào
Postgres, vòng qua `apps/api`), còn `staff_users` chỉ có một — lý do đầy đủ nằm trong comment của
`src/schema/staff.ts`, đừng "thống nhất" hai bảng.

## `db:migrate` KHÔNG dùng `drizzle-kit migrate`

Nó dùng migrator tự viết ở `scripts/migrate.ts` trên `drizzle-orm/bun-sql`.

Lý do: `drizzle-kit migrate` không hỗ trợ `bun-sql` — nó đòi cài `pg` hoặc `postgres`, tức kéo
một driver Postgres **thứ hai** vào dự án chỉ để chạy migration. Giữ một driver duy nhất còn có
lợi ích thứ hai: migration chạy trên cùng driver với production, nên khiếm khuyết của `bun-sql`
lộ ngay lúc migrate thay vì ẩn tới lúc chạy thật.

`drizzle-kit` vẫn dùng cho `generate` và `generate --custom` — hai lệnh đó không cần driver.

Script `migrate` của package này trỏ vào `scripts/migrate.ts`, **không** phải `drizzle-kit
migrate`. Trước đây nó trỏ vào `drizzle-kit migrate` — một cái bẫy: tài liệu ghi CLI đó không
dùng được, nhưng `bun run --filter @v9/db migrate` vẫn gọi đúng vào nó.

## ⚠️ Vì sao mọi script ở đây phải tự mang `--env-file=../../.env`

Bun chỉ nạp `.env` ở **đúng cwd**, không đi ngược lên cha. Mà `--filter` đặt cwd là thư mục
package, nên `.env` ở root **không tới nơi**:

```bash
# root → CÓ  |  cwd=packages/db → KHÔNG
env -u DATABASE_URL bun -e 'console.log(process.env.DATABASE_URL ? "CÓ" : "KHÔNG")'
```

Và `--env-file` **không đi xuyên qua `bun x`** (bunx spawn tiến trình mới). Đó là lý do script
gọi thẳng `./node_modules/.bin/drizzle-kit` thay vì `bun x drizzle-kit`.

Kiểm bằng env sạch, đừng kiểm bằng cách đọc lại script — trên máy đã có sẵn biến trong shell thì
script hỏng vẫn chạy xanh:

```bash
env -u DATABASE_URL bun run --filter @v9/db generate   # PHẢI ra "No schema changes"
```

`bun --env-file` trỏ vào file không tồn tại là **no-op, không throw** — nên cùng script này chạy
được ở CI (không có `.env`, biến lấy từ khối `env:` của job).

## ⚠️ Ba service dùng chung Postgres — chỉ `packages/db` được đổi schema

Từ migration `0001_service_roles.sql`, database này có **bốn schema tách bạch**:

| Schema        | Ai làm chủ                | Ai được đổi cấu trúc |
| ------------- | ------------------------- | -------------------- |
| `public`      | migration của package này | **chỉ migration**    |
| `directus`    | Directus tự quản          | Directus             |
| `supertokens` | SuperTokens tự quản       | SuperTokens          |
| `drizzle`     | journal migration         | migrator             |

Directus và SuperTokens kết nối bằng role riêng (`directus_app`, `supertokens_app`) **không có
quyền DDL trên `public`**. Directus đọc ghi được _dữ liệu_ trong `public`; SuperTokens không chạm
`public` chút nào.

Ép ở tầng database chứ không bằng cấu hình của từng tool, vì toggle trong UI là thứ người sau bật
lại được và không để lại dấu vết nào trong repo. Xem §3.2 và §4.2 của
`docs/plans/2026-08-05-round2-directus-staff-design.md`.

**Kiểm lại sau mỗi lần nâng version Directus hoặc SuperTokens** — đừng tin cấu hình, hãy thử phá:

```bash
# PHẢI ra: ERROR: permission denied for schema public
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; CREATE TABLE public.x (id int);"

# PHẢI thành công — chặn dữ liệu là hỏng, không phải an toàn
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; SELECT 1;"
```

Bằng chứng đã thu được từ chính UI Directus khi bấm _Create Field_:

```
[INTERNAL_SERVER_ERROR] alter table "probe_vehicles" add column "probe_field" varchar(255) null
  - must be owner of table probe_vehicles
```

**`CREATE ROLE` là đối tượng cấp cluster, không phải cấp database.** Chạy lại migration trên cùng
một cluster Postgres sẽ gặp role đã tồn tại — đó là lý do `0001` bọc `CREATE ROLE` trong
`DO $$ IF NOT EXISTS $$`. Bảng thì `CREATE TABLE IF NOT EXISTS` là đủ; role thì không.

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
`.code`. Xem `../../docs/ARCHITECTURE.md`.

## Test

Test ở đây **chạm Postgres thật** — không mock. Ràng buộc cần chứng minh (CHECK, partial index,
exclusion constraint, TRIGGER) đều sống ở tầng database, nên một bản mock chỉ chứng minh chính nó.
Vì vậy cần Postgres đang chạy: `docker compose up -d`.

| File                          | Chứng minh gì                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/test-support.ts`         | không phải test — hạ tầng dùng chung: `setupDb()` mở kết nối cho **một** file và tự `afterAll`, `inRollback()` chạy trong transaction rồi luôn ROLLBACK |
| `src/btree-gist.test.ts`      | extension dùng được thật: bảng tạm có exclusion constraint, INSERT chồng lấn bị chặn bằng `23P01`, chạm đầu-đuôi **được** chấp nhận. Không commit gì.   |
| `src/vehicles-schema.test.ts` | ràng buộc của `0002`–`0004`: CHECK `status`/`slug`/tiền/`engine_cc`, cascade của `vehicle_photos`, và trigger `updated_at` thật sự nhích khi UPDATE     |

`setupDb()` là **hàm**, không phải client khai ở module scope: `bun test` chạy nhiều file trong
cùng tiến trình với chung module cache, nên một client ở module scope sẽ bị `afterAll` của file nạp
trước đóng mất trong khi file sau vẫn đang dùng.

`inRollback(fn)` chỉ an toàn **khi `fn` chỉ dùng `tx`**. Client ngoài vẫn nằm trong scope bên trong
callback; chạm vào nó là ghi ngoài transaction và commit thật — đúng kiểu hỏng mà helper sinh ra để
chặn.

⚠️ Cạm bẫy khi test trigger của `0004`: `now()` là timestamp của **transaction**, nên sửa một hàng
ngay sau khi insert nó trong **cùng** transaction cho ra `updated_at == created_at` — không phải vì
trigger không chạy. `vehicles-schema.test.ts` xử lý bằng cách insert với `created_at` lùi về quá khứ.
