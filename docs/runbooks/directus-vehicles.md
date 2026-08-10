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

| Biến                      | Mặc định                                                       |
| ------------------------- | -------------------------------------------------------------- |
| `DIRECTUS_URL`            | **không có trong `.env.example`** — xem ghi chú ngay dưới bảng |
| `DIRECTUS_ADMIN_EMAIL`    | bắt buộc                                                       |
| `DIRECTUS_ADMIN_PASSWORD` | bắt buộc                                                       |
| `DATABASE_URL`            | bắt buộc — dùng cho bước quan hệ                               |

`DIRECTUS_URL` là **cửa lách tuỳ chọn**, cố ý không đưa vào `.env.example`: địa chỉ Directus
đã có một biến chính thức là `NEXT_PUBLIC_DIRECTUS_URL`, và khai hai biến cho cùng một thứ là
cách chúng lệch nhau. Script đọc theo thứ tự `DIRECTUS_URL` → `NEXT_PUBLIC_DIRECTUS_URL` →
`http://localhost:8055`; đặt `DIRECTUS_URL` chỉ khi cần trỏ script sang một Directus khác
trong đúng một lần chạy. **Mọi lệnh trong file này dùng `$NEXT_PUBLIC_DIRECTUS_URL`** — biến
có thật trong `.env`.

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

So sánh là **nông và chỉ trên tập khoá script khai** — nhưng đọc kỹ vế thứ hai: mọi khoá
**có trong** tập đó đều bị áp lại khi lệch. Hoàn nguyên drift chính là việc script sinh ra
để làm.

| Sửa trong UI Directus                                          | Lần chạy sau       |
| -------------------------------------------------------------- | ------------------ |
| `width` của `slug`/`plate`/`status`, `icon` của collection     | **bị hoàn nguyên** |
| `note`, `interface`, `options`, `display_template`             | **bị hoàn nguyên** |
| `readonly`, `color`, `hidden`, `group`, `sort`, `translations` | giữ nguyên         |

Đo trên Directus 11.17.4: đặt `vehicles.slug.width = full` và `icon = pedal_bike` rồi chạy
lại → script in `+ field vehicles.slug — đặt: width` và trả về `half`; trong khi
`readonly: true` và `color: "#FF0000"` đặt cùng lúc thì còn nguyên.

**Nói trước với shop:** nới rộng một ô nhập trong Data Studio là thay đổi **không bền**.
Muốn nó sống thì sửa `scripts/directus-setup.ts` rồi commit — đó mới là chỗ giữ cấu hình.
Bản trước của mục này hứa ngược lại (rằng `icon`/`width` không bị ghi đè); nó sai.

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
    # grep chứ KHÔNG `head -3`: Directus nhét khối CSP dài lên đầu, head cắt mất Content-Type
    curl -sI "http://localhost:8055/assets/<uuid>?key=web" | grep -i '^HTTP\|^content-type'

    # PHẢI 403 FORBIDDEN — Directus không phục vụ dữ liệu nghiệp vụ công khai
    curl -s "http://localhost:8055/items/vehicles"

    # PHẢI 400 INVALID_QUERY — chỉ preset đã khai mới dùng được
    curl -s "http://localhost:8055/assets/<uuid>?width=9999"

Lấy `<uuid>`: `SELECT file_id FROM vehicle_photos LIMIT 1;`. Ba lệnh này cũng nằm trong
`../../CLAUDE.md` — chúng bắt drift của cấu hình sống trong DB của Directus chứ không trong
git.

⚠️ **`bun run directus:setup` KHÔNG áp lại được cả ba.** Script chỉ đụng những gì nó khai:

- Quyền **đọc `directus_files`** — có kiểm cả nội dung (danh sách `fields`, `permissions`,
  `validation`) và sửa lại nếu ai đó thu hẹp trong UI. Probe ① và ② được nó bảo vệ.
- `storage_asset_transform` + preset `web` — probe ③ được nó bảo vệ.
- **Quyền ai đó THÊM MỚI thì không.** Script không liệt kê, không so, không xoá permission lạ.
  Đo thật: cấp cho policy Public một `read` trên `vehicles` trong UI rồi chạy script → script
  in `Không có gì phải đổi — Directus đã đúng cấu hình` trong khi `GET /items/vehicles` trả
  **200 kèm cả cột `plate`**, tức biển số ra internet. Script mù hoàn toàn với ca này.

Nghĩa là probe `curl -s ".../items/vehicles"` → **403** là hàng rào thật ở đây, không phải
script. Chạy nó sau mỗi lần có người đụng vào phân quyền trong Data Studio. Dọn tay:

```bash
# liệt kê mọi quyền của policy Public — chỉ được có ĐÚNG MỘT dòng: directus_files/read
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SELECT p.id, p.collection, p.action FROM directus.directus_permissions p
     JOIN directus.directus_access a ON a.policy = p.policy
    WHERE a.role IS NULL AND a.user IS NULL;"
```

Câu cuối là lý do có `storage_asset_transform = presets`: `/assets` công khai mà cho `?width=`
tự do là một vòi CPU miễn phí cho bot — mỗi tổ hợp kích thước là một lần resize và một entry
cache mới. `next/image` vẫn tự sinh đủ các cỡ responsive từ ảnh preset `web`.

---

## ⛔ Dữ liệu giả trong DB dev — XOÁ TRƯỚC KHI DEMO HOẶC CHỤP MÀN HÌNH

Database dev đang giữ **một** bản ghi xe do người dựng tự tạo để có gì mà kiểm end-to-end:

| Thứ                    | Giá trị                                                |
| ---------------------- | ------------------------------------------------------ |
| `vehicles.slug`        | `honda-cb500x-01`                                      |
| `vehicles.status`      | `published` — **nên nó hiện trên `/` và `/xe`**        |
| ảnh (`directus_files`) | `honda-cb500x-01.png`                                  |
| ảnh thứ hai            | `v9-storage-probe.png` — 119 byte, di chứng probe §4.1 |

**Nó là fixture, không phải nội dung.** Hai chỗ nói dối, và cả hai đều không tự lộ ra khi nhìn
trang:

1. **Ảnh không phải xe.** File `honda-cb500x-01.png` (PNG 1600×900, ~2,9 MB) là một **lưới ô màu
   test**, không có chiếc mô tô nào trong đó. Tự kiểm chứ đừng tin dòng này:

   ```bash
   curl -s "http://localhost:8055/assets/<uuid>?key=web" -o /tmp/fixture.png && file /tmp/fixture.png
   ```

   Kích thước file **không** phát hiện được nó: 2,9 MB nằm đúng khoảng một ảnh chụp thật, nên mẹo
   "dưới 50KB là ô màu trơn" ở đây vô dụng. Phải mở ảnh ra nhìn.

2. **Alt text mô tả một chiếc xe có thật:** _"Honda CB500X 471cc màu đỏ, nhìn nghiêng bên phải"_ —
   đúng định dạng alt mà `PRODUCT.md` yêu cầu, mô tả một vật không tồn tại trong ảnh lẫn trong đội
   xe. Với người dùng screen reader, đây là bịa nội dung nghe như thật.

Giữ lại là **cố ý**: nó chứng minh được cả chuỗi migration → Directus → `/assets` → `next/image`
mà không cần chờ shop gửi ảnh. `PRODUCT.md` §Evidence on Hand cấm bịa nội dung **trông như thật**,
nên cách giữ hợp lệ là fixture được ghi ra ở đây, chứ không phải fixture nằm im trong DB.

**Rủi ro cụ thể:** ai đó mở `localhost:3000` chụp màn hình gửi cho shop, hoặc `bun run --filter
@v9/web build` rồi đưa bản dựng đó cho người ngoài xem. Lúc ấy V9 có một "chiếc xe" là bảng màu,
kèm mô tả một con CB500X đỏ không tồn tại — và người xem không có cách nào biết.

Xoá trước mọi lần demo, chụp màn hình, hay dựng bản cho người ngoài xem. **Thứ tự quan trọng:** lấy
tên object trước, vì `filename_disk` chỉ có trong `directus_files` và bước sau sẽ xoá chính nó.

```bash
# ① Lấy tên object trong MinIO của đúng những file sắp xoá
docker compose exec -T postgres psql -U v9 -d v9_rental -tAc \
  "SELECT filename_disk FROM directus.directus_files
    WHERE filename_download IN ('honda-cb500x-01.png', 'v9-storage-probe.png');"

# ② Xoá object (thay <filename_disk> bằng từng dòng ở trên).
#    XOÁ ĐÍCH DANH, không dùng 'mc rm --recursive local/vehicles' — lệnh đó
#    cũng cuốn theo mọi ảnh THẬT nếu shop đã upload.
set -a; . ./.env; set +a
docker compose run --rm --entrypoint sh minio-init -c \
  "mc alias set local http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD >/dev/null &&
   mc rm local/vehicles/<filename_disk>"

# ③ Xoá dữ liệu
docker compose exec -T postgres psql -U v9 -d v9_rental <<'SQL'
-- vehicle_photos đi theo nhờ ON DELETE CASCADE của 0002 — không cần xoá tay
DELETE FROM vehicles WHERE slug = 'honda-cb500x-01';
DELETE FROM directus.directus_files
 WHERE filename_download IN ('honda-cb500x-01.png', 'v9-storage-probe.png');
SQL
```

Bước ② không bỏ được: xoá dòng `directus_files` bằng SQL **không** gọi tới storage, nên object ở
lại MinIO vĩnh viễn — vô hình với Directus và không ai dọn nữa.

Kiểm là hết:

```bash
# PHẢI ra 0 — không còn xe nào published
docker compose exec -T postgres psql -U v9 -d v9_rental -tAc \
  "SELECT count(*) FROM vehicles WHERE status = 'published';"
```

Sau khi xoá, `/xe` phải hiện câu trạng thái rỗng của khách (`vehicles.empty` trong
`apps/web/messages/vi.json`), **không** phải lưới trống hay lỗi. Đó là tiêu chí #10 của design doc
— và lần xoá này là dịp kiểm nó lại miễn phí.

Dựng lại fixture: upload ảnh trong Data Studio rồi tạo bản ghi xe. Không có script seed, **cố ý** —
một script seed commit vào repo là dữ liệu giả có đường chạy thẳng vào môi trường thật.

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

Rồi **bắt buộc** xoá cache — nếu không Directus vẫn phục vụ schema cũ. Endpoint này cần
token admin, mà `.env` chỉ có email/mật khẩu, nên phải đổi lấy token trước (bản trước của
mục này dùng `$TOKEN` mà không nói lấy ở đâu, và `$DIRECTUS_URL` là biến không có trong
`.env.example`):

```bash
set -a; . ./.env; set +a

TOKEN=$(curl -s -X POST "$NEXT_PUBLIC_DIRECTUS_URL/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$DIRECTUS_ADMIN_EMAIL\",\"password\":\"$DIRECTUS_ADMIN_PASSWORD\"}" \
  | bun -e 'process.stdout.write(JSON.parse(await Bun.stdin.text()).data.access_token)')

# PHẢI ra 200
curl -s -X POST "$NEXT_PUBLIC_DIRECTUS_URL/utils/cache/clear" \
  -H "Authorization: Bearer $TOKEN" -o /dev/null -w '%{http_code}\n'
```

Token này sống ngắn (mặc định 15 phút) — lấy lại khi hết hạn, đừng ghi nó vào file nào.
Không cần token nếu chỉ chạy `bun run directus:setup`: script tự đăng nhập bằng đúng hai
biến trên.

Tìm collection ma (có metadata nhưng không có bảng thật):

```sql
SELECT collection FROM directus.directus_collections c
 WHERE to_regclass('public.' || quote_ident(c.collection)) IS NULL;
```

Chiều ngược lại — bảng thật chưa được Directus nhận — không phải rác: chạy
`bun run directus:setup` là xong, hoặc bảng đó cố ý không cho Directus quản lý.
