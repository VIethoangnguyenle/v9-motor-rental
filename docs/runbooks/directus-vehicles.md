# Runbook — Directus cho danh mục đội xe

Cấu hình Directus **không** do repo ép — không có gì bắt ai chạy script. Nhưng nó
được viết thành `scripts/directus-setup.ts` nên review được trong diff và chạy lại
được, thay vì sống trong trí nhớ người đã bấm.

Môi trường mới, hoặc sau khi reset volume Postgres:

    docker compose up -d
    bun run db:migrate
    bun run directus:setup     # chạy được nhiều lần, vô hại

Thứ tự bắt buộc: `db:migrate` **trước**. Script chỉ nhận bảng có sẵn, nó không tạo bảng
— và không tạo được, xem §"Directus không làm được gì ở đây".

Script đọc bốn biến môi trường (`bun run directus:setup` tự nạp `.env` ở root):

| Biến                      | Mặc định                                         |
| ------------------------- | ------------------------------------------------ |
| `DIRECTUS_URL`            | `NEXT_PUBLIC_DIRECTUS_URL`, rồi `localhost:8055` |
| `DIRECTUS_ADMIN_EMAIL`    | bắt buộc                                         |
| `DIRECTUS_ADMIN_PASSWORD` | bắt buộc                                         |
| `DATABASE_URL`            | bắt buộc — dùng cho bước quan hệ                 |

---

## Script làm gì

Bảy bước, mỗi bước **kiểm trước khi làm**. Mỗi dòng in ra bắt đầu bằng `+` (vừa đổi) hoặc
`·` (đã đúng sẵn), nên đọc output là biết ngay lần chạy này có động vào gì không.

1. Đăng nhập lấy token admin.
2. **Nhận** hai bảng có sẵn `vehicles`, `vehicle_photos` — chỉ ghi metadata.
3. Cấu hình interface cho các cột đã có: `status` dropdown ba giá trị khớp `CHECK` của DB,
   `slug`/`plate`/`alt` kèm ghi chú, `description` textarea, `file_id` bộ chọn ảnh.
4. Field alias O2M `vehicles.photos` + hai dòng quan hệ trong `directus.directus_relations`.
5. Role Public: **chỉ** quyền đọc `directus_files`, không gì khác.
6. `storage_asset_transform = presets` và đúng một preset `web` (fit inside, 2000px, quality 80).
7. Xoá cache schema của Directus.

Bước 7 **luôn chạy**, kể cả khi sáu bước trên không đổi gì. Sau một lần chèn thẳng vào
`directus_relations`, Directus vẫn phục vụ schema cũ trong bộ nhớ cho tới khi cache bị xoá
hoặc container restart — bỏ bước này thì quan hệ trông như trơ ra và người sau đi debug
nhầm chỗ. Xoá cache không phải một thay đổi cấu hình nên nó không tính vào bộ đếm cuối.

### Lần chạy thứ hai phải không đổi gì

Đó là tiêu chí nghiệm thu, không phải chi tiết làm đẹp: một script cấu hình chỉ chạy đúng
trên database trắng sẽ hỏng đúng vào lần dựng lại môi trường thứ hai — lúc không ai còn
nhớ nó tồn tại. Chạy hai lần liên tiếp, lần hai phải ra:

    Không có gì phải đổi — Directus đã đúng cấu hình.

So sánh là **nông và chỉ trên tập khoá script quan tâm**: ai đó chỉnh thêm `icon` hay
`width` trong UI thì lần chạy sau không ghi đè, nhưng đổi ba lựa chọn của `status` thì có.

---

## Directus không làm được gì ở đây — và vì sao đó là chủ ý

Directus kết nối bằng role Postgres `directus_app`. Role đó sở hữu schema `directus` nhưng
**không có DDL trên schema `public`** (migration `0001_service_roles.sql`). Hệ quả, đã đo
thật trên Directus 11.17.4:

| Thao tác trong Directus                     | Được? | Vì sao                                                                       |
| ------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| Nhận bảng có sẵn (`PATCH /collections/<t>`) | ✅    | chỉ chèn/sửa một dòng trong `directus.directus_collections`                  |
| Sửa interface (`PATCH /fields/<t>/<f>`)     | ✅    | chỉ metadata                                                                 |
| Tạo field alias (`POST /fields`, `alias`)   | ✅    | alias không có cột trong DB nên không phát DDL                               |
| **Tạo field mới**                           | ❌    | Directus phát `ALTER TABLE ... ADD COLUMN`                                   |
| **Tạo quan hệ** (`POST /relations`)         | ❌    | Directus phát `ALTER TABLE ... ADD CONSTRAINT`, không có chế độ chỉ-metadata |
| **Xoá collection** (`DELETE /collections`)  | ❌    | Directus phát `DROP TABLE`                                                   |

Cả ba dòng ❌ chết ở cùng một câu của Postgres: `must be owner of table`. **Đó là hàng rào
đang làm đúng việc của nó, không phải trục trặc — đừng cấp thêm quyền cho `directus_app`.**

**Nói trước với shop:** không ai thêm được trường mới cho xe bằng cách bấm trong Directus.
Thêm trường = một migration trong `packages/db` + chạy lại `bun run directus:setup`.

Kiểm hàng rào còn nguyên (chạy lại sau mỗi lần nâng version Directus):

    # PHẢI ra: ERROR: must be owner of table vehicles
    docker compose exec -T postgres psql -U v9 -d v9_rental -c \
      "SET ROLE directus_app; ALTER TABLE public.vehicles ADD COLUMN x int;"

### Đường đi vòng đúng: quan hệ khai bằng metadata

Vì `POST /relations` bị chặn, hai dòng quan hệ được **chèn thẳng bằng SQL** vào
`directus.directus_relations` (schema mà role Directus toàn quyền):

| `many_collection` | `many_field` | `one_collection` | `one_field` | `sort_field` | `one_deselect_action` |
| ----------------- | ------------ | ---------------- | ----------- | ------------ | --------------------- |
| `vehicle_photos`  | `file_id`    | `directus_files` | —           | —            | `nullify`             |
| `vehicle_photos`  | `vehicle_id` | `vehicles`       | `photos`    | `sort`       | `delete`              |

Directus **không cần** foreign key ở tầng DB để expand: `GET /relations/vehicle_photos/file_id`
trả `schema: null` mà `file_id` vẫn expand ra object file thật.

`one_deselect_action = delete` cho quan hệ thứ hai là bắt buộc, không phải sở thích:
`vehicle_photos.vehicle_id` là `NOT NULL`, nên `nullify` sẽ làm Postgres từ chối khi có ai
gỡ một ảnh khỏi form xe.

Gallery hiện trên form xe cần **cả hai nửa**: field alias `vehicles.photos`
(`type: alias`, `special: ["o2m"]`, `interface: list-o2m` — một dòng trong `directus_fields`,
không có cột trong DB) **và** `one_field = 'photos'` trên dòng quan hệ. Thiếu field alias thì
gallery không hiện; thiếu `one_field` thì field alias hiện ra nhưng rỗng vĩnh viễn.

---

## Quyền công khai hẹp tới mức nào

Role Public chỉ có **read `directus_files`**. Không có quyền nào trên `vehicles` hay
`vehicle_photos`: JSON nghiệp vụ đi ra qua `apps/api`, nên Directus phơi ra internet đúng
byte ảnh và không một trường dữ liệu nghiệp vụ nào.

    # PHẢI 200 + content-type: image/*
    curl -sI "http://localhost:8055/assets/<uuid>?key=web" | head -3

    # PHẢI 403 FORBIDDEN — Directus không phục vụ dữ liệu nghiệp vụ công khai
    curl -s "http://localhost:8055/items/vehicles"

    # PHẢI 400 INVALID_QUERY — chỉ preset đã khai mới dùng được
    curl -s "http://localhost:8055/assets/<uuid>?width=9999"

Câu cuối là lý do có `storage_asset_transform = presets`: `/assets` công khai mà cho `?width=`
tự do là một vòi CPU miễn phí cho bot — mỗi tổ hợp kích thước là một lần resize và một entry
cache mới. `next/image` vẫn tự sinh đủ các cỡ responsive từ ảnh preset `web`.

---

## Dọn metadata mồ côi khi một bảng bị xoá

Xoá bảng bằng migration **không** dọn metadata của Directus, và `DELETE /collections` cũng
không dọn được (nó cần `DROP TABLE`, tức DDL, tức bị chặn). Kết quả là một collection ma:
hiện trong Data Studio, mở ra thì lỗi.

Chuyện này đã xảy ra thật — `probe_vehicles` từ một phiên probe cũ nằm lại trong
`directus_collections` sau khi bảng đã bị drop. Dọn bằng SQL:

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "DELETE FROM directus.directus_collections WHERE collection = 'probe_vehicles';"
```

Bảng nào có field/quan hệ/quyền đã cấu hình thì dọn cả bốn chỗ, rồi xoá cache:

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental <<'SQL'
DELETE FROM directus.directus_permissions WHERE collection = 'ten_bang';
DELETE FROM directus.directus_relations
 WHERE many_collection = 'ten_bang' OR one_collection = 'ten_bang';
DELETE FROM directus.directus_fields      WHERE collection = 'ten_bang';
DELETE FROM directus.directus_collections WHERE collection = 'ten_bang';
SQL
```

Rồi **bắt buộc** xoá cache — nếu không Directus vẫn phục vụ schema cũ:

```bash
curl -s -X POST "$DIRECTUS_URL/utils/cache/clear" -H "Authorization: Bearer $TOKEN"
```

Tìm collection ma (có metadata nhưng không có bảng thật):

```sql
SELECT collection FROM directus.directus_collections c
 WHERE to_regclass('public.' || quote_ident(c.collection)) IS NULL;
```

Chiều ngược lại — bảng thật chưa được Directus nhận — không phải rác: chạy
`bun run directus:setup` là xong, hoặc bảng đó cố ý không cho Directus quản lý.
