# V9 Motor Rental — Đợt 3: danh mục đội xe (Directus nhập, `apps/web` hiển thị)

- **Ngày**: 2026-08-10
- **Trạng thái**: Approved (người dùng duyệt từng phần trước khi viết)
- **Tiền đề**: [`2026-08-05-round2-directus-staff-design.md`](2026-08-05-round2-directus-staff-design.md) — đợt 2 đã xong: Directus lên, role không DDL, `apps/web` thu hẹp về xem xe + tạo request
- **Phạm vi**: business feature **đầu tiên** của dự án. Một lát dọc: migration → Directus → `apps/api` → `apps/web`.

---

## 1. Vì sao có đợt này

Hôm nay `apps/web` hiển thị "Xe mẫu 01 / 02 / 03" với thông số gạch ngang, lấy từ
`apps/web/app/_placeholder-data.ts`. File đó tự khai ngay dòng đầu rằng nó là dữ liệu giả và phải
bị xoá khi có bảng `vehicles`.

Thứ đang chặn là **dữ liệu**, không phải luồng. Shop đã có xe thật và ảnh thật (`PRODUCT.md`
§Evidence on Hand); cái thiếu là nơi để nhập và đường để dữ liệu đó ra tới trang công khai.

Đợt này làm đúng đường đó và không làm gì thêm.

## 2. Bốn quyết định đã chốt

| #   | Câu hỏi                    | Chốt                                                                 | Hệ quả lớn nhất                                                                                            |
| --- | -------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Một bản ghi xe là gì?      | **Một chiếc cụ thể** (biển số, ODO, ảnh của chính nó)                | Khớp thẳng `EXCLUDE (vehicle_id, period)` sau này; đổi lại xe trùng model sinh nhiều trang gần giống nhau  |
| 2   | `apps/web` lấy data ở đâu? | **JSON qua `apps/api`, ảnh qua `/assets` của Directus**              | Một contract Eden duy nhất cho cả `apps/staff` dùng lại; Directus không phơi dữ liệu nghiệp vụ ra internet |
| 3   | Giá hiển thị thế nào?      | **Một `price_per_day` + `deposit`**, kèm câu "thuê dài ngày liên hệ" | Không phải chốt chính sách giá bậc thang — thứ `PRODUCT.md` ghi là chưa quyết                              |
| 4   | Phạm vi đợt này?           | **Lát dọc mỏng**: danh mục + hiển thị. Không lọc, không form yêu cầu | Form gửi yêu cầu thuê là đợt kế ngay sau                                                                   |

### 2.1 Vì sao chấp nhận trùng nội dung SEO ở quyết định #1

Hai chiếc CB500X sinh hai trang mô tả gần giống nhau. Đó là chi phí thật cho SEO — một site
catalogue lý tưởng sẽ có một trang cho mỗi _mẫu_ xe.

Chấp nhận vì phương án hai bảng (`vehicle_models` + `vehicles`) bắt người nhập liệu làm việc hai
tầng cho một đội xe mà **hiện chưa biết có bao nhiêu chiếc trùng model**. Tối ưu SEO cho một vấn đề
chưa quan sát được, bằng cách làm nặng thao tác hằng ngày của shop, là đánh đổi sai chiều.

**Điều kiện xem lại:** khi shop có từ hai chiếc trở lên trùng model và trùng năm. Lúc đó tách
`vehicle_models` ra là một migration cộng một lần đổi shape của endpoint — không phải viết lại.

## 3. Mô hình dữ liệu

Hai bảng trong schema `public`, sinh bằng migration của `packages/db`. Directus không có DDL trên
`public` (migration `0001_service_roles.sql`), nên đây là đường duy nhất — và đó là chủ ý, không
phải bất tiện.

```sql
CREATE TABLE vehicles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  make          text NOT NULL,          -- Honda
  model         text NOT NULL,          -- CB500X
  year          integer,                -- đời xe
  engine_cc     integer NOT NULL,
  odo_km        integer,
  color         text,
  plate         text,                   -- biển số: nội bộ, KHÔNG ra web
  description   text,
  price_per_day integer NOT NULL,       -- Vnd
  deposit       integer NOT NULL,       -- Vnd
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','published','archived')),
  sort          integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  file_id    uuid NOT NULL,             -- trỏ tới directus.directus_files(id), KHÔNG có FK
  alt        text NOT NULL,
  sort       integer NOT NULL DEFAULT 0
);

CREATE INDEX vehicles_published_idx ON vehicles (sort, created_at DESC) WHERE status = 'published';
CREATE INDEX vehicle_photos_vehicle_idx ON vehicle_photos (vehicle_id, sort);
```

Partial index đánh trên `(sort, created_at)` chứ **không** đánh trên `status`: đây là index chỉ chứa
hàng `published`, nên `status` bên trong nó là hằng số và làm khoá tìm kiếm thì vô dụng. Cột cần
đánh là cột dùng để **sắp xếp** — đúng thứ tự `ORDER BY` của endpoint danh sách ở §5.

Cả hai bảng khai trong `packages/db/src/schema/` rồi sinh bằng `bun run db:generate` — đây là "bảng
thường" theo bảng phân loại ở `packages/db/CLAUDE.md`. `drizzle-orm@0.45.2` diễn đạt được cả
`check()` lẫn partial index (`.where()`), nên **không cần** `db:custom` ở đây.

Điều kiện đổi ý: nếu đọc file SQL sinh ra mà thiếu `CHECK` hoặc thiếu mệnh đề `WHERE` của index thì
bổ sung phần thiếu bằng một migration `db:custom` **kế tiếp** — không sửa tay file đã sinh, vì làm
thế là để snapshot của drizzle lệch khỏi thực tế và lần `db:generate` sau sẽ đòi tạo lại bảng.

### 3.1 Sáu quyết định trong đoạn SQL trên

**`integer` cho tiền, không phải `bigint`.** Drizzle trả `bigint` về JavaScript dưới dạng `string`.
Thế là `type Vnd = number` của `packages/shared` vỡ ngay tại ranh giới, và nó vỡ **im lặng** — chuỗi
`"1200000"` vẫn nối được, vẫn render được, chỉ sai lúc đem đi cộng. Giá ngày và tiền cọc không tới
2,1 tỷ nên `integer` đủ, và nó là kiểu duy nhất giữ được `Vnd` nguyên vẹn.

**`status` là trạng thái _danh mục_, không phải trạng thái _rảnh/bận_.** Ba giá trị, và không giá
trị nào mang nghĩa "xe đang có sẵn". `apps/web` bị cấm hứa xe còn trống (`apps/web/AGENTS.md`), nên
`CHECK` nằm ở tầng DB để lần ai đó định thêm `'available'` thì Postgres từ chối, thay vì code review
phải bắt được.

Xe đang bảo dưỡng dài ngày thì chuyển về `draft`. Không thêm giá trị thứ tư cho việc đó — bảo dưỡng
là chuyện vận hành, thuộc `apps/staff`, không thuộc danh mục công khai.

**`plate` lưu nhưng không ra web.** Nhân viên cần biển số để làm việc. Công khai nó trên một trang
tĩnh cho Google index là chuyện khác hẳn, và ở TP.HCM biển số là dữ liệu nhạy cảm thật. Cơ chế chặn
nằm ở §5.

**`slug` do người nhập, có `CHECK`.** Mỗi chiếc là một bản ghi nên slug phải phân biệt được:
`honda-cb500x-01`, `honda-cb500x-02`. Directus không tự sinh slug nếu không viết extension. `CHECK`
biến một lỗi gõ tay thành lỗi lúc bấm Lưu, thay vì thành URL hỏng phát hiện sau ba tuần.

**`alt` là `NOT NULL`.** `PRODUCT.md` §Accessibility đòi văn bản thay thế mô tả thật (loại xe, phân
khối, tình trạng), không phải tên file. Cột cho phép NULL sẽ vĩnh viễn là NULL.

**`vehicle_photos.file_id` KHÔNG có foreign key** tới `directus.directus_files`. Không phải bỏ sót:
bảng đó chỉ tồn tại **sau khi Directus boot lần đầu**, mà trên một bản clone mới `bun run db:migrate`
chạy trước điều đó. Đặt FK ở đây là migration chết ngay trên máy người mới, với một thông báo lỗi
không nói gì về nguyên nhân thật.

Giá phải trả, ghi rõ: xoá một file trong Directus để lại `file_id` trỏ vào hư không. Ảnh vỡ trên
web, không phải lỗi 500. Với quy mô một shop thì đó là đánh đổi đúng chiều; nếu sau này phiền, cách
sửa là một job dọn rác chứ không phải thêm FK xuyên schema.

## 4. Directus

### 4.1 Nối storage vào MinIO — hiện đang hỏng, chưa ai phát hiện

Khối `directus` trong `compose.yaml` và `compose.prod.yaml` **không có volume và không có biến
`STORAGE_*`**. Nghĩa là mọi file upload rơi vào ổ đĩa bên trong container và **mất sạch** sau
`docker compose down` hoặc mỗi lần nâng image. Bucket MinIO `vehicles` đã được `minio-init` tạo sẵn
từ đợt 1 nhưng cho tới giờ **chưa có ai ghi vào**.

Chưa lộ ra vì chưa ai upload ảnh thật. Đợt này là lúc lộ, nên sửa ở đây.

```yaml
directus:
  depends_on:
    postgres: { condition: service_healthy }
    minio: { condition: service_healthy } # thêm
  environment:
    STORAGE_LOCATIONS: s3
    STORAGE_S3_DRIVER: s3
    STORAGE_S3_KEY: ${MINIO_ROOT_USER}
    STORAGE_S3_SECRET: ${MINIO_ROOT_PASSWORD}
    STORAGE_S3_BUCKET: ${MINIO_BUCKET_VEHICLES}
    STORAGE_S3_REGION: us-east-1
    STORAGE_S3_ENDPOINT: http://minio:9000
    STORAGE_S3_FORCE_PATH_STYLE: "true"
```

`STORAGE_S3_FORCE_PATH_STYLE` là chỗ hỏng kinh điển: driver S3 mặc định dựng URL kiểu
`bucket.host/key`, MinIO chỉ phục vụ `host/bucket/key`. Thiếu dòng này thì upload trả 403 hoặc 404
với thông báo không nhắc gì tới path style.

Prod dùng access key riêng cho Directus thay vì `MINIO_ROOT_*`. Ghi thành một dòng phải-đổi trong
`.env.example`, vì root lọt ra prod theo quán tính là cách rò rỉ quyền phổ biến nhất.

### 4.2 Directus nhận hai bảng có sẵn

Directus tạo collection từ bảng đã tồn tại bằng cách chèn metadata vào schema `directus`
(`directus_collections`, `directus_fields`, `directus_relations`) — không đụng DDL lên `public`.

Cấu hình cần: `vehicle_photos.file_id` dùng interface file; `vehicles` có O2M xuống
`vehicle_photos`; `plate` đánh dấu là trường nội bộ; `status` dùng dropdown ba giá trị khớp `CHECK`.

**Đây là giả định lớn nhất của cả thiết kế** — xem §7.

### 4.3 Quyền công khai hẹp nhất có thể

Vì JSON đi qua `apps/api`, role Public của Directus **chỉ cần quyền đọc `directus_files`**. Không
cần quyền nào trên `vehicles` hay `vehicle_photos`.

Kết quả: Directus phơi ra internet đúng byte ảnh, không phơi một trường dữ liệu nghiệp vụ nào. Nếu
sau này ai đó cần Directus trả JSON công khai, đó là một quyết định phải viết ra — không phải thứ
bật sẵn từ trước.

### 4.4 Chặn transform tuỳ ý

`/assets` công khai mà cho `?width=` tự do là một vòi CPU miễn phí cho bot: mỗi tổ hợp kích thước
là một lần resize và một entry cache mới.

Đặt `storage_asset_transform = presets` và khai đúng một preset `web` (fit inside, tối đa 2000px,
quality 80). `next/image` vẫn tự sinh đủ các cỡ responsive từ ảnh đó — Directus hạ một lần cho bớt
nặng, Next lo phần còn lại. Ảnh chụp bằng điện thoại 4000px/5MB không đi thẳng vào optimizer của
Next.

### 4.5 Chỗ này KHÔNG được ép bằng repo, và tài liệu không giả vờ ngược lại

Ngoài phần `compose.yaml`, toàn bộ §4.2 → §4.4 nằm trong **database của Directus, không nằm trong
git**. Clone repo về máy khác là không có gì cả, và không có dòng nào trong diff ghi lại rằng nó
từng được cấu hình.

Đây đúng họ với `.claude/settings.local.json` mà `CLAUDE.md` §"ranh giới repo ép vs cấu hình local"
đã cảnh báo. Không đề xuất giả vờ rằng nó được repo bảo đảm. Đề xuất là làm cho drift **lộ ra
nhanh**:

1. Một runbook `docs/runbooks/directus-vehicles.md` liệt kê đúng các bước bấm.
2. Một lệnh probe thêm vào `CLAUDE.md`, chạy sau mỗi lần nâng version Directus:

```bash
# PHẢI ra 200 và content-type: image/*
curl -sI "http://localhost:8055/assets/<uuid>?key=web" | head -3
```

## 5. Contract của `apps/api`

Một Elysia plugin `vehicles`, **luôn đặt `name`** (thiếu `name` thì plugin chạy lại mỗi lần `.use()`
— pattern #1 của repo). Đi đúng `routes → services → infra`: route chỉ có HTTP và schema, mọi thứ
chạm Postgres nằm ở service.

```
GET /vehicles          → danh sách xe status='published', sắp theo (sort NULLS LAST, created_at DESC)
GET /vehicles/:slug    → một xe published; 404 nếu không tồn tại hoặc chưa published
```

Response khai bằng TypeBox:

| Trường                        | Ghi chú                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `slug`, `make`, `model` |                                                                                                                                        |
| `year`, `odoKm`, `color`      | nullable                                                                                                                               |
| `engineCc`                    |                                                                                                                                        |
| `pricePerDay`, `deposit`      | `Vnd` — số nguyên đồng                                                                                                                 |
| `description`                 | chỉ ở endpoint chi tiết                                                                                                                |
| ảnh                           | danh sách trả `photo: { fileId, alt } \| null` (**một object, không phải mảng**); chi tiết trả `photos: { fileId, alt }[]` theo `sort` |

Hai endpoint cố ý khác shape ở chỗ ảnh: lưới xe chỉ dùng được một ảnh, và trả cả bộ ở đó nghĩa là
mỗi lần vào trang danh sách kéo về hàng chục uuid không ai dùng. `null` khi xe chưa có ảnh nào —
trạng thái này có thật, vì Directus cho lưu bản ghi trước rồi upload ảnh sau.

**API trả `fileId`, không trả URL ảnh.** Web dựng `/assets/{fileId}?key=web` từ
`NEXT_PUBLIC_DIRECTUS_URL`. Đổi domain Directus sau này là sửa một biến môi trường, không phải đi
sửa dữ liệu đã nướng vào hàng chục trang HTML tĩnh.

**`plate` không lọt ra được, và không phải nhờ ai nhớ.** Elysia cắt mọi field không có trong response
schema. Cái chặn là schema — không phải một câu `SELECT` viết cẩn thận, vì câu `SELECT` đó sẽ thành
`SELECT *` vào một ngày nào đó.

`packages/shared` **không đổi gì**: `formatVnd()` và `type Vnd` đã có sẵn trong
`src/domain/money.ts`. Đợt này không sinh thêm domain logic nào — danh mục xe là dữ liệu, không phải
phép tính.

## 6. `apps/web`

| Trang           | Cách render                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `/xe`           | lưới 3-up theo `DESIGN.md`, `revalidate = 300`                                                   |
| `/xe/[slug]`    | `generateStaticParams()` + `dynamicParams = true`, `generateMetadata()` cho title/description/OG |
| `/` (trang chủ) | ba xe published đầu thay cho `PLACEHOLDER_VEHICLES`                                              |

**Dọn dẹp bắt buộc:**

- Xoá `apps/web/app/_placeholder-data.ts`.
- `PlaceholderTag` biến mất khỏi lưới xe — nhưng **giữ nguyên trên ảnh hero**, vì hero vẫn là ảnh AI
  sinh. Gỡ nhãn mà chưa thay ảnh là nói dối khách (`PRODUCT.md` nguyên tắc #2).
- Viết lại `messages.vehicles.empty` — câu hiện tại ("bảng vehicles chưa được tạo") sai ngay sau đợt
  này. Trạng thái rỗng mới phải nói về việc _chưa có xe nào được đăng_, không nói về schema.
- `next.config.ts` thêm `images.remotePatterns` cho `data.$ROOT_DOMAIN` và `localhost:8055`. Thiếu
  thì `next/image` từ chối thẳng, không phải cảnh báo.
- `.env.example` và compose thêm `NEXT_PUBLIC_DIRECTUS_URL`.

### 6.1 Không làm JSON-LD `Product` / `offers`

Schema.org `Offer` bắt khai `availability`, mà **mọi** giá trị của trường đó đều là một lời hứa về
tình trạng còn trống — đúng thứ app này bị cấm nói, và lần này nói với Google chứ không chỉ với
khách. `generateMetadata` thường là đủ ở quy mô một shop.

Xem lại khi nào: khi hệ thống thật sự biết xe còn trống hay không, tức là sau khi có `rentals`.

### 6.2 Khi API chết lúc build

`generateStaticParams()` trả `[]` thay vì ném lỗi. CI không có Postgres, nên ném lỗi biến "chưa có
DB" thành build đỏ ở mọi PR. `dynamicParams = true` khiến trang xe vẫn render được lúc chạy.

Đây là cùng đánh đổi mà `apps/web/AGENTS.md` đã ghi cho `/health` ("build không cần API, nhưng hỏng
im lặng nếu API chết") — giữ nhất quán, không phát minh luật mới. Hệ quả cũng giống: một khoảng xấu
xí ngay sau deploy cho tới lần revalidate đầu tiên.

## 7. Rủi ro chính và chốt chặn đặt trước

Cả thiết kế này đứng trên một giả định chưa được chứng minh: **Directus nhận được một bảng có sẵn và
cấu hình được field ảnh mà không cần DDL lên `public`.** Nếu Directus đòi `ALTER TABLE` để tạo quan
hệ file, role `directus_app` sẽ bị Postgres từ chối và hình dạng này sụp.

Repo này đã bốn lần dính chuyện "trông như đang chạy mà thực ra không" (`CLAUDE.md` §hàng rào phải
được probe). Nên **task đầu tiên của plan là probe điều đó trên Directus thật — trước khi viết một
dòng migration nào**, không phải verify ở cuối:

```sql
-- tạo bảng probe bằng role v9, thử adopt trong UI Directus, thử gắn field file
CREATE TABLE public.probe_fleet (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid);
```

**Nếu probe thất bại**, hai đường lùi, theo thứ tự ưu tiên:

1. Khai quan hệ bằng cách chèn thẳng vào `directus_relations` (schema `directus`, role có toàn
   quyền) — Directus vẫn render được file picker mà không cần FK ở tầng DB.
2. Bỏ file library cho ảnh xe: `vehicle_photos` giữ `storage_key text`, upload đi qua một route của
   `apps/api` lên MinIO. Đắt hơn hẳn — phải tự viết UI upload — nên chỉ dùng khi (1) cũng hỏng.

Rủi ro thứ hai, nhỏ hơn nhưng cùng loại: `ALTER DEFAULT PRIVILEGES` trong migration `0001` chỉ áp cho
bảng do **đúng role đã chạy nó** tạo ra. Migration chạy bằng `v9` nên trên lý thuyết là khớp — nhưng
"trên lý thuyết" chính là cách repo này đã tự lừa mình bốn lần. Thành tiêu chí #3 ở §10.

### 7.1 Kết quả probe (chạy ngày 2026-08-10)

Probe chạy trên Directus 11 thật qua REST API (UI chỉ là client của cùng API này). Xác nhận trước
khi đo, để kết quả có nghĩa: Directus kết nối bằng role `directus_app` (`DB_USER` trong
`compose.yaml`, đối chiếu `pg_stat_activity` thấy đúng role đó đang giữ kết nối), role này **không**
superuser, và `has_schema_privilege('directus_app', 'public', 'CREATE')` = `false`. Không bước nào
cấp thêm quyền cho bất kỳ role nào.

- Directus nhận collection từ bảng có sẵn: **được** — `POST /collections` với **chỉ khoá `meta`**,
  không kèm `schema`/`fields` (HTTP 200). Bảng tự hiện trong `GET /collections` ngay khi `v9` tạo
  xong, nhưng khi chưa có dòng metadata thì `GET /fields/probe_fleet` trả 403 `FORBIDDEN` — nên vẫn
  phải adopt chính thức. Sau adopt, cột của `public.probe_fleet` **không đổi** (`id`, `name`,
  `file_id`); chỉ thêm một dòng trong `directus.directus_collections`.
- Gắn field ảnh không cần DDL: **không** — cả ba đường chính thức đều bị Postgres chặn:

  ```
  POST /relations {"collection":"probe_fleet","field":"file_id",
                   "related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}
  → HTTP 500
  alter table "probe_fleet" add constraint "probe_fleet_file_id_foreign" foreign key ("file_id")
  references "directus_files" ("id") on delete SET NULL - must be owner of table probe_fleet

  POST /relations (bỏ hẳn khoá "schema", hy vọng chỉ ghi metadata)
  → HTTP 500
  alter table "probe_fleet" add constraint "probe_fleet_file_id_foreign" foreign key ("file_id")
  references "directus_files" ("id") - must be owner of table probe_fleet

  POST /fields/probe_fleet (tạo cột ảnh mới thay vì dùng cột sẵn có)
  → HTTP 500
  alter table "probe_fleet" add column "anh_moi" uuid null - must be owner of table probe_fleet
  ```

  Đây là lỗi **quyền/sở hữu của Postgres**, không phải lỗi validate payload của Directus: thông báo
  mang nguyên văn câu SQL mà Directus đã phát ra rồi mới đính lỗi DB vào cuối, và mã trả về là 500
  `INTERNAL_SERVER_ERROR` chứ không phải 400 `INVALID_PAYLOAD`. Đối chứng độc lập: chạy thẳng
  `ALTER TABLE` bằng psql với `SET ROLE directus_app` ra đúng cùng một câu `must be owner of table
  probe_fleet`.

  Riêng `PATCH /fields/probe_fleet/file_id` với **chỉ `meta`** (`interface: file-image`,
  `special: ["file"]`) thì qua được (HTTP 200) — phần metadata không đụng DDL. Chỗ vỡ là **quan hệ**:
  `/relations` của Directus **luôn** tạo FOREIGN KEY, không có chế độ chỉ-metadata.
- `directus_app` đọc được bảng sinh sau migration 0001: **được** — `SET ROLE directus_app; SELECT
  count(*) FROM public.probe_fleet;` trả `0`. `ALTER DEFAULT PRIVILEGES` phủ đúng bảng tạo sau, nên
  rủi ro thứ hai nêu ngay trên **không xảy ra**.
- `ALTER TABLE` bằng `directus_app` vẫn bị từ chối: **đúng** — `ERROR: must be owner of table
  probe_fleet`. Hàng rào DDL còn nguyên sau toàn bộ probe; không FK nào được thêm vào
  `public.probe_fleet` (chỉ còn `probe_fleet_pkey`).

**Kết luận: đường chính KHÔNG chạy — bắt buộc chuyển sang đường lùi (1).** Directus không tự cấu
hình được field ảnh trên bảng thuộc `public`, vì thao tác đó bắt buộc đi qua `ALTER TABLE`. Không có
cách nào lách bằng payload: bỏ khoá `schema` vẫn ra cùng lệnh DDL.

Đường lùi (2) **không cần dùng** — đã đo được đường lùi (1) chạy đầu-cuối. Chèn thẳng một dòng vào
`directus.directus_relations` (`many_collection`, `many_field='file_id'`,
`one_collection='directus_files'`, `one_deselect_action='nullify'`) thì:

- `GET /relations/probe_fleet/file_id` trả 200 với `schema: null` — Directus chấp nhận quan hệ không
  có FK ở tầng DB;
- `POST /items/probe_fleet` kèm `file_id` tạo record bình thường;
- `GET /items/probe_fleet?fields=*,file_id.*` **expand đúng** thành object file lồng nhau:
  `"file_id":{"id":"f08202b0-…","type":"image/png","filename_download":"px.png"}`.

Hệ quả cho phần triển khai: **migration phải tự khai quan hệ Directus**, không trông chờ bấm trong
UI — và §10 cần thêm một tiêu chí kiểm rằng dòng `directus_relations` tồn tại sau khi migrate.

**Xác nhận kèm theo cho §4.1** (không sửa ở task này): file upload trong probe trả về
`"storage":"local"` — đúng như §4.1 dự đoán, Directus chưa có `STORAGE_*` nên ảnh rơi vào ổ đĩa
trong container chứ không vào MinIO. Ghi lại như **bằng chứng đã xác nhận**; việc sửa thuộc task 3.

Dọn dẹp: đã xoá file test, ba dòng metadata (`collections` / `fields` / `relations`) và
`DROP TABLE public.probe_fleet`; đếm lại cả ba bảng đều `0`, `to_regclass('public.probe_fleet')`
rỗng. Ghi chú: `DELETE /collections/probe_fleet` qua API cũng hỏng (`drop table "probe_fleet" - must
be owner of table probe_fleet`), nên metadata phải xoá bằng SQL trong schema `directus`. Còn sót
**từ trước probe này** một dòng `probe_vehicles` trong `directus.directus_collections` trong khi bảng
thật đã bị drop — rác của phiên trước, cố ý không đụng tới ở đây.

## 8. Non-goals đợt này

- Không làm form gửi yêu cầu thuê (`booking_requests`) — đợt kế ngay sau.
- Không làm bộ lọc / phân loại xe. Lọc bắt đầu có giá trị khi đội xe trên khoảng 20 chiếc; dưới
  ngưỡng đó nó chỉ thêm một thứ để hỏng và thêm tổ hợp URL cho Google index nhầm.
- Không tách `vehicle_models`. Điều kiện xem lại ở §2.1.
- Không làm bảng giá bậc thang, không đụng chính sách tính ngày thuê.
- Không đụng `apps/staff`. Nó sẽ dùng lại đúng hai endpoint này khi tới lượt.
- Không làm tiếng Anh. `next-intl` vẫn chờ tới khi thật sự có bản dịch.
- Không enforce auth. Hai endpoint này công khai theo đúng thiết kế.

## 9. Phạm vi công việc

| #   | Việc                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Probe Directus adopt bảng có sẵn + field file, không DDL** (chốt chặn §7 — làm trước mọi thứ)                                            |
| 2   | Khai hai bảng trong `packages/db/src/schema/`, sinh migration `0002_*` bằng `db:generate`, **đọc file SQL sinh ra** trước khi `db:migrate` |
| 3   | `compose.yaml` + `compose.prod.yaml`: `STORAGE_*` cho Directus, `depends_on: minio`; `.env.example`                                        |
| 4   | Directus: adopt hai collection, cấu hình field, quyền Public đọc `directus_files`, preset `web`                                            |
| 5   | `apps/api`: plugin `vehicles` — routes, service, TypeBox schema                                                                            |
| 6   | `apps/web`: `/xe`, `/xe/[slug]`, trang chủ dùng data thật, xoá `_placeholder-data.ts`, `remotePatterns`                                    |
| 7   | `docs/runbooks/directus-vehicles.md` + probe vào `CLAUDE.md`; cập nhật `CLAUDE.md` §Việc còn để lại                                        |

## 10. Tiêu chí "xong"

Không tiêu chí nào được tuyên bố đạt nếu chưa chạy lệnh và đọc output.

| #   | Tiêu chí                                        | Cách verify                                                                           |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Directus nhận bảng có sẵn, không cần DDL        | probe §7, chạy **trước** khi viết migration                                           |
| 2   | `directus_app` đọc ghi được hai bảng mới        | `SET ROLE directus_app; SELECT * FROM vehicles;` → thành công                         |
| 3   | `directus_app` **vẫn không** đổi được schema    | `SET ROLE directus_app; ALTER TABLE vehicles ADD COLUMN x int;` → `permission denied` |
| 4   | Ảnh nằm trong MinIO, không trong container      | upload trong Directus rồi `mc ls local/vehicles` thấy object                          |
| 5   | Ảnh sống sót qua `docker compose down && up -d` | upload → down → up → mở lại `/assets/<uuid>?key=web`                                  |
| 6   | `plate` không rò ra                             | `curl localhost:3001/vehicles \| grep -i plate` → rỗng                                |
| 7   | Xe `draft` không lên web                        | tạo một bản ghi `draft`, `curl` không thấy nó                                         |
| 8   | Transform tuỳ ý bị chặn                         | `curl -sI "…/assets/<uuid>?width=9999"` → không trả ảnh 9999px                        |
| 9   | Trang tĩnh chứa tên xe thật                     | `bun run --filter @v9/web build` rồi grep HTML sinh ra                                |
| 10  | Trạng thái rỗng không nói về schema             | xoá hết xe published, mở `/xe`, đọc câu hiện ra                                       |
| 11  | Toàn bộ vẫn xanh                                | `bun test`, `bun run typecheck`, `bun run lint`                                       |
| 12  | ADR đã ghi                                      | `memory_recall` đọc lại được quyết định "một bản ghi = một chiếc" và lý do            |

Tiêu chí **#1** là tiêu chí quan trọng nhất. Nếu nó hỏng thì §3 và §5 phải viết lại trước khi code,
chứ không phải sau.

Tiêu chí **#5** là cái duy nhất chứng minh §4.1 thật sự được sửa — mọi kiểm tra khác vẫn xanh trên
một Directus lưu file vào container sắp bị xoá.
