# packages/db

Tài liệu tham chiếu cho workspace này — **đọc khi sắp sửa code ở đây**, không nạp sẵn.

Kiến trúc chung: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) · Quy trình: [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md) · ADR: Serena memory `architecture/*`.

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

| File                        | Nội dung                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0000_btree_gist`           | bật extension                                                                                                                                                           |
| `0001_service_roles`        | role + schema cho Directus và SuperTokens                                                                                                                               |
| `0002_tearful_plazm`        | `vehicles` + `vehicle_photos`, CHECK `slug`/`status`, partial index cho xe `published`                                                                                  |
| `0003_puzzling_pete_wisdom` | CHECK tiền không âm và `engine_cc > 0`                                                                                                                                  |
| `0004_real_mantis`          | hàm `set_updated_at()` + trigger `vehicles_set_updated_at`                                                                                                              |
| `0005_tidy_machine_man`     | `staff_users` + `password_reset_codes`, CHECK `role`/`status`, partial index                                                                                            |
| `0006_spooky_proteus`       | FK tự trỏ `staff_users.approved_by → staff_users.id`, `ON DELETE SET NULL`                                                                                              |
| `0007_little_micromacro`    | đổi tên index/constraint của `0005` sang quy ước dài của Drizzle                                                                                                        |
| `0008_flaky_carlie_cooper`  | `staff_users.sessions_invalid_before` — mốc thu hồi access token                                                                                                        |
| `0009_watery_shinobi_shaw`  | `customers` (CHECK chuẩn hoá `phone`) + `rentals` (FK `vehicle_id`/`customer_id`/`created_by`, tám CHECK trạng thái/tiền/giao-trả), partial index `rentals_revenue_idx` |
| `0010_clumsy_jack_power`    | cột sinh `rentals.period` (`tstzrange`) + exclusion constraint `rentals_no_overlap` chống đặt trùng xe                                                                  |
| `0011_skinny_falcon`        | đổi unique `staff_users.email` từ text thô sang biểu thức `lower(email)` — sửa bug so sánh phân biệt hoa/thường                                                         |
| `0012_crazy_kinsey_walden`  | bật `unaccent`/`pg_trgm`, hàm `f_unaccent()`, GIN index tìm khách theo tên không dấu; thêm ba cột giấy tờ/địa chỉ giao xe vào `rentals`                                 |
| `0013_motionless_celestials` | `rental_requests` — yêu cầu thuê khách gửi từ `apps/web`. FK `vehicle_id`/`handled_by`, CHECK chuẩn hoá `phone` + trạng thái + trần `days` + "đã xử lý thì phải có `handled_at`", partial index cho `NEW` |
| `0014_jazzy_edwin_jarvis`   | CHECK `vehicle_photos_alt_meaningful` — alt không rỗng và không phải tên file (`PRODUCT.md` §Accessibility)                                                             |

`0002` và `0003` do `db:generate` sinh — kể cả bốn CHECK, vì chúng khai bằng `check()` ngay trong
`src/schema/vehicles.ts`. `0004` thì **phải** là `db:custom`: Drizzle không mô tả được TRIGGER, nên
không có gì để sinh ra từ đó. `0004` để tên hàm chung (`set_updated_at`) chứ không gắn riêng vào
`vehicles` — bảng sau chỉ cần thêm `CREATE TRIGGER`, không cần hàm mới.

`0005`–`0008` cũng do `db:generate` sinh. `staff_users` cố ý **không** có trigger `set_updated_at`
dù `vehicles` có: trigger đó tồn tại vì `vehicles` có HAI đường ghi (Directus ghi thẳng vào
Postgres, vòng qua `apps/api`), còn `staff_users` chỉ có một — lý do đầy đủ nằm trong comment của
`src/schema/staff.ts`, đừng "thống nhất" hai bảng.

`0009` cũng do `db:generate` sinh: `customers` và `rentals` (kể cả tám CHECK của `rentals`) khai
thẳng bằng `check()` trong `src/schema/rentals.ts`, đúng mẫu của `0002`/`0003`. `0010` thì **phải**
là `db:custom`, cùng lý do `0004`: Drizzle không sinh được cột `GENERATED ALWAYS AS (...) STORED`
kiểu range lẫn `EXCLUDE USING gist` — không có khai báo TypeScript nào để generate hai thứ đó từ
đó cả. `0011` quay lại `db:generate`: đổi `.unique()` trên cột `email` sang
``uniqueIndex("staff_users_email_lower_idx").on(sql`lower(${t.email})`)`` (trong
`src/schema/staff.ts`) là thứ Drizzle diễn đạt trọn vẹn — phần bình luận dài ở đầu file SQL của
`0011` là thêm tay SAU khi generate, không phải bằng chứng nó là `db:custom`.

`0013` và `0014` do `db:generate` sinh, đúng mẫu `0002`/`0009`: cả bảng `rental_requests` lẫn hai
CHECK của nó khai thẳng bằng `check()` trong `src/schema/rental-requests.ts`, và CHECK alt khai
trong `src/schema/vehicles.ts`.

⚠️ **`rental_requests` CỐ Ý không có exclusion constraint** dù nó cũng mang xe + khoảng ngày. Đó
không phải bỏ sót: `apps/web` không đọc availability thời gian thực, nên hai khách xin cùng một xe
cùng một khoảng ngày là chuyện bình thường và phải ghi nhận được cả hai. Chặn ở đây là dạy database
một điều web không biết, và khách thứ hai bị từ chối bằng một lỗi không nhân viên nào nhìn thấy để
giải thích. Ràng buộc chống đặt trùng vẫn nguyên vẹn ở `rentals`, nơi nhân viên chạm vào lúc chốt
đơn — xem `packages/shared/src/domain/rental-request.ts`.

⚠️ **CHECK alt của `0014` chỉ chặn được HÌNH DẠNG, không chặn được nội dung sai.** Một tấm ảnh
test kèm alt viết đúng vẫn qua — và đó là ca đã xảy ra thật (xem comment trong
`src/schema/vehicles.ts`). Đừng đọc constraint này như một bảo đảm rằng ảnh trong danh mục là ảnh
thật của shop.

### ⚠️ `0012` trộn `db:generate` với SQL viết tay — cái bẫy nếu đổi thứ tự

`0012` vừa là output của `db:generate` (ba câu `ALTER TABLE "rentals" ADD COLUMN` ở CUỐI file —
`document_type`, `document_returned_at`, `delivery_address`, khớp đúng ba cột khai trong
`src/schema/rentals.ts`) vừa có ba câu ĐẦU viết tay: `CREATE EXTENSION`, `CREATE FUNCTION
public.f_unaccent`, và `CREATE INDEX ... USING gin`.

Thứ tự sinh ra file này không tuỳ hứng — nó là cách né một cái bẫy của `db:custom`. `db:custom` ghi
ra một snapshot **byte-copy của snapshot liền trước**, không phải một snapshot tính lại từ
`src/schema/`. Cột viết tay trong một migration `db:custom` (kiểu `period` của `0010`, hay hàm/index
của `0012`) vì vậy KHÔNG BAO GIỜ vào chuỗi snapshot — drizzle-kit không biết chúng tồn tại, đúng như
comment trong `src/schema/rentals.ts` đã ghi cho `period`. Nếu `0012` được viết bằng `db:custom`
NGAY TỪ ĐẦU, ba cột `document_type`/`document_returned_at`/`delivery_address` — dù ĐÃ khai trong
`src/schema/rentals.ts` và hoàn toàn generate được — cũng sẽ bị cuốn theo kiểu byte-copy đó và rơi
ra ngoài snapshot. Lần `db:generate` kế tiếp so `src/schema/rentals.ts` với một snapshot vẫn coi
như ba cột đó chưa tồn tại, và sinh ra một migration MA cố `ADD COLUMN` lại thứ đã có.

Cách `0012` né bẫy: **generate trước, mở rộng tay sau**. Chạy `db:generate` để nó tự viết ba câu
`ALTER TABLE` và tự cập nhật `meta/0012_snapshot.json` đúng theo `src/schema/rentals.ts` — rồi mở
file migration vừa sinh ra, THÊM ba câu viết tay vào ĐẦU file, và không chạm
`meta/0012_snapshot.json` nữa. Ba cột generate được thì vào snapshot đúng đường; hàm và GIN index
thì cố ý đứng ngoài snapshot (comment trong `src/schema/rentals.ts` giải thích lý do: chúng phụ
thuộc `f_unaccent` phải tồn tại TRƯỚC, mà thứ tự câu lệnh trong file generate là do drizzle-kit
quyết định, không phải do mình) — và không cần vào.

Luật cho lần sau viết một migration trộn: nếu vừa cần đổi cột đã khai trong `src/schema/` vừa cần
SQL tay Drizzle không sinh được, LUÔN `db:generate` trước để phần generate-được đi qua đường chính
thống, rồi mở file migration ra thêm phần viết tay vào SAU. Làm ngược lại — `db:custom` rồi tự gõ
luôn cả phần lẽ ra generate được — thì phần đó biến mất khỏi tầm nhìn của drizzle-kit mãi mãi, và
migration ma sẽ xuất hiện ở lần `db:generate` kế tiếp mà ai đó chạy.

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

## `rentals` — hàng rào chống đặt trùng (đã tồn tại từ `0009`/`0010`)

Migration `0010` thêm:

```sql
ALTER TABLE rentals ADD COLUMN period tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)
  WHERE (status <> 'CANCELLED');
```

`period` là cột SINH — không ghi tay được, nên không thể lệch khỏi `starts_at`/`ends_at` theo kiểu
làm hàng rào đứng đó bảo vệ nhầm khoảng thời gian. Biên `[)` khớp `overlaps()` trong `@v9/shared`:
đơn kết thúc đúng lúc đơn sau bắt đầu thì KHÔNG chồng nhau. Mệnh đề `WHERE (status <> 'CANCELLED')`
loại đơn đã huỷ khỏi hàng rào — `transition()` ở `@v9/shared` cấm `ONGOING → CANCELLED`, nên một
đơn `CANCELLED` không bao giờ là đơn đã giao xe, và không có lý do tiếp tục giữ chỗ cho nó.

Extension `btree_gist` đã bật sẵn ở migration `0000` để câu `EXCLUDE USING gist` chạy được. Index
GiST sinh ra từ constraint đó dùng luôn cho tra cứu availability — **không tạo index thứ hai**.

Service phải bắt SQLSTATE `23P01` → HTTP 409. Nhớ: Bun.SQL để SQLSTATE ở **`.errno`**, không phải
`.code` — và nếu câu INSERT đi qua Drizzle (`db.insert(...)`, đúng đường `createRental` ở
`apps/api/src/services/rentals.ts` đang đi), lỗi còn bị bọc thêm một tầng `DrizzleQueryError` khiến
`.errno` cũng thành `undefined`; lỗi thật nằm ở `e.cause`. Xem `../../docs/ARCHITECTURE.md`.

`rentals.created_by` là FK **bắt buộc** tới `staff_users.id` (`ON DELETE restrict` — không cho xoá
một nhân viên đã từng chốt đơn), thêm ở `0009` cùng lúc bảng được tạo. Trước khi thêm FK tới nhân
viên vào một bảng khác, nạp skill `v9-auth` — đó là ADR cho danh tính nhân viên, không phải hướng
dẫn implement.

Constraint và CHECK của `rentals`/`customers` được chứng minh (một phần — xem ghi chú KHÔNG test
trong bảng dưới) bởi `src/schema/rentals-schema.test.ts`, không phải suy luận từ đọc SQL.

## Test

Test ở đây **chạm Postgres thật** — không mock. Ràng buộc cần chứng minh (CHECK, partial index,
exclusion constraint, TRIGGER) đều sống ở tầng database, nên một bản mock chỉ chứng minh chính nó.
Vì vậy cần Postgres đang chạy: `docker compose up -d`.

| File                                | Chứng minh gì                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/test-support.ts`               | không phải test — hạ tầng dùng chung: `setupDb()` mở kết nối cho **một** file và tự `afterAll`, `inRollback()` chạy trong transaction rồi luôn ROLLBACK                                                                                                                                                                                                                                                                                                                                            |
| `src/btree-gist.test.ts`            | extension dùng được thật: bảng tạm có exclusion constraint, INSERT chồng lấn bị chặn bằng `23P01`, chạm đầu-đuôi **được** chấp nhận. Không commit gì.                                                                                                                                                                                                                                                                                                                                              |
| `src/vehicles-schema.test.ts`       | ràng buộc của `0002`–`0004`: CHECK `status`/`slug`/tiền/`engine_cc`, cascade của `vehicle_photos`, và trigger `updated_at` thật sự nhích khi UPDATE                                                                                                                                                                                                                                                                                                                                                |
| `src/schema/rentals-schema.test.ts` | ràng buộc của `0009`/`0010`/`0012`: exclusion constraint `rentals_no_overlap` (chồng lấn → `23P01`, chạm biên **được** chấp nhận, đơn `CANCELLED` không chặn chỗ, khác xe thì không sao); CHECK `period_valid`/`status_valid`/`ongoing_has_handover`/`handover_only_when_out`/`return_after_handover`, hai CHECK giấy tờ, và `customers_phone_normalized`. ⚠️ Ba CHECK còn lại của `rentals` (`money_nonneg`, `completed_has_return`, `return_only_when_completed`) KHÔNG có test riêng ở file này |

`setupDb()` là **hàm**, không phải client khai ở module scope: `bun test` chạy nhiều file trong
cùng tiến trình với chung module cache, nên một client ở module scope sẽ bị `afterAll` của file nạp
trước đóng mất trong khi file sau vẫn đang dùng.

`inRollback(fn)` chỉ an toàn **khi `fn` chỉ dùng `tx`**. Client ngoài vẫn nằm trong scope bên trong
callback; chạm vào nó là ghi ngoài transaction và commit thật — đúng kiểu hỏng mà helper sinh ra để
chặn.

⚠️ Cạm bẫy khi test trigger của `0004`: `now()` là timestamp của **transaction**, nên sửa một hàng
ngay sau khi insert nó trong **cùng** transaction cho ra `updated_at == created_at` — không phải vì
trigger không chạy. `vehicles-schema.test.ts` xử lý bằng cách insert với `created_at` lùi về quá khứ.
