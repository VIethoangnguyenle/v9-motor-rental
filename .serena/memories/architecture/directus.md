# Directus: giữ gì, chứng minh được là KHÔNG làm được gì, và hai đính chính

Gộp từ ba bản ghi agentmemory: ADR 2026-08-05 (phân vai + role Postgres), ADR 2026-08-10 (ranh giới
DDL), và **hai bản ĐÍNH CHÍNH** viết sau khi thật sự viết `scripts/directus-setup.ts`. Bản gốc và
bản đính chính được ghi tách rời trong agentmemory; ở đây **gộp lại**, vì đọc bản gốc mà không kèm
đính chính thì tệ hơn không đọc gì. Đối chiếu lại với repo 2026-09-01: **cả hai đính chính đã nằm
trong comment đầu `scripts/directus-setup.ts` và mã đang chạy đúng theo chúng.**

Thủ tục probe (chạy sau mỗi lần nâng version / dựng lại môi trường): skill `v9-directus`.

## Phân vai

Directus = **chỉ dữ liệu gốc**: danh mục xe, ảnh, bảng giá. **Không** làm vận hành. Lịch đặt xe,
thống kê, lên đơn/bàn giao, khách hàng đều thuộc `apps/staff`.

Lý do kỹ thuật, không phải sở thích: calendar layout của Directus chỉ nhóm bản ghi theo **một**
trường ngày, không dựng được lưới xe × thời gian với khoảng chồng lấn; Insights không đủ cho báo
cáo doanh thu theo xe theo tháng. Ép vào Directus là phải viết extension — tự viết code trong môi
trường khó hơn.

## Chặn schema drift bằng **role Postgres**, không bằng cấu hình Directus

Toggle trong UI là thứ người sau bật lại được và không để lại dấu vết trong repo.

`packages/db/migrations/0001_service_roles.sql` (đã kiểm 2026-09-01, còn nguyên):

```sql
CREATE ROLE directus_app LOGIN PASSWORD '...'        -- bọc DO $$ IF NOT EXISTS $$
CREATE SCHEMA directus AUTHORIZATION directus_app
GRANT USAGE ON SCHEMA public + SELECT/INSERT/UPDATE/DELETE ON ALL TABLES
REVOKE CREATE ON SCHEMA public FROM directus_app     -- dòng then chốt
ALTER DEFAULT PRIVILEGES ...                          -- cho bảng tương lai
```

`CREATE ROLE` bọc trong `DO $$ IF NOT EXISTS $$` vì role là đối tượng **cấp cluster**, không phải
cấp database — chạy lại migration trên cùng cluster sẽ gặp role đã tồn tại.

`DB_SEARCH_PATH: directus,public` trên `directus/directus:11`: 29 bảng `directus_*` nằm ở schema
`directus`, **zero** ở `public`, mà vẫn resolve được bảng nghiệp vụ.

**Chặn schema, KHÔNG chặn dữ liệu** — cấu hình chặn tất là thất bại chứ không phải thành công. Bằng
chứng lấy nguyên văn từ UI khi bấm Create Field:
`[INTERNAL_SERVER_ERROR] alter table "probe_vehicles" add column ... - must be owner of table`,
trong khi tạo item qua UI vẫn thành công và `psql` xác nhận row tồn tại.

## Ranh giới DDL — đo thật, không phỏng đoán

**KHÔNG được** (Directus phát DDL → Postgres từ chối `must be owner of table`, HTTP **500**
`INTERNAL_SERVER_ERROR` chứ không phải 400 `INVALID_PAYLOAD`):

- `POST /fields/...` khi field có cột thật (→ `ALTER TABLE ADD COLUMN`)
- `POST /relations` (→ `ALTER TABLE ADD CONSTRAINT`), **kể cả khi bỏ hẳn khoá `schema`**
- `DELETE /collections/...` (→ `DROP TABLE`)

**Được:**

- Nhận (adopt) bảng có sẵn — xem đính chính ① dưới
- `PATCH /fields/<collection>/<field>` (chỉ metadata) → 200
- **`POST /fields` với `type: "alias"` và KHÔNG kèm khoá `schema`** → chỉ ghi một dòng vào
  `directus.directus_fields`, không DDL. Đây là cách `vehicles.photos` (nửa đầu của O2M) tồn tại.
  Bản ghi cũ nói gọn "POST /fields không được" — **đúng cho field có cột, sai cho alias**.

**Cách phân biệt nguyên nhân** (chỗ dễ kết luận sai): lỗi DDL mang **nguyên văn câu SQL** Directus
định chạy kèm lỗi DB nối đuôi, và là 500. Đối chứng quyết định: `PATCH /fields` trả 200 với **cùng
token, cùng collection** → auth và adoption ổn, chỉ DDL chết.

## Đường đi vòng đã chọn: khai quan hệ bằng metadata

Chèn thẳng dòng vào `directus.directus_relations` (schema mà `directus_app` toàn quyền). Quan hệ
chạy đầy đủ với `schema: null` — **Directus không cần foreign key ở tầng DB để expand file.**

Hai hệ quả bắt buộc nhớ:

1. Sau khi chèn thẳng, **phải** gọi `POST /utils/cache/clear`. Directus giữ schema cũ trong bộ nhớ;
   thiếu bước này quan hệ trông như trơ và người sau debug nhầm chỗ. (Script gọi nó **luôn**, kể cả
   khi không có gì đổi.)
2. Metadata mồ côi không tự dọn được (`DELETE /collections` cần DDL). Đã gặp thật với dòng
   `probe_vehicles` sót từ đợt probe. Dọn bằng SQL. *(Chưa kiểm lại 2026-09-01 xem dòng đó còn hay
   đã dọn — không grep thấy trong repo, nhưng nó sống trong DB nên repo không nói lên gì.)*

## ⚠️ Hai đính chính — bản ghi 2026-08-10 SAI hai chi tiết thao tác

Phần cốt lõi của ADR gốc **vẫn đúng** (Directus phát DDL, bị `directus_app` chặn, đường vòng là
`directus_relations`). Hai chi tiết dưới thì sai, đã đo lại trên **Directus 11.17.4** lúc viết
script thật:

| | SAI (ADR gốc) | ĐÚNG |
| --- | --- | --- |
| ① Nhận bảng có sẵn | `POST /collections` với chỉ khoá `meta` | **`PATCH /collections/<tên>`** với chỉ `meta` |
| ② Kiểm đã nhận chưa | `GET /fields/<collection>` → 403 nếu chưa nhận | **`GET /collections/<tên>` → `data.meta === null`** nghĩa là chưa nhận |

① `POST` trả **400 `Collection "<name>" already exists`** — `createOne` từ chối khi tên có trong
`directus_collections` **hoặc** trong schema cache, mà **mọi bảng vật lý trong `public` đều nằm ở vế
sau**. `PATCH` dùng `updateOne`, là upsert, và không phát DDL.

② `GET /fields/<collection>` với token admin trả **200** (mọi field `meta: null`) cho bảng chưa
nhận, **không phải 403**.

**Vì sao probe ban đầu đo sai — đây mới là bài học:** probe tạo bảng `probe_fleet` rồi adopt ngay.
`POST` thành công và `GET /fields` trả 403 **chỉ vì schema cache của Directus chưa kịp thấy bảng vừa
tạo**. Probe cho kết quả **đúng vì lý do sai** — một cuộc đua thắng được một lần, không phải một cơ
chế. Trên bảng đã tồn tại từ trước (mọi trường hợp thật) nó luôn hỏng.

**Lỗi ② nguy hiểm hơn ①:** nó không làm hỏng lần chạy đầu. Script idempotent dùng phép kiểm sai sẽ
**tưởng mọi thứ đã adopt, im lặng bỏ qua**, và chỉ lộ khi có người dựng môi trường mới. *Script
idempotent kiểm sai chỗ tệ hơn script không idempotent — cái sau ít nhất còn nổ.*

Luật rút ra, áp cho mọi probe trong repo: **probe chạy trên đối tượng VỪA TẠO có thể đo trúng trạng
thái tạm thời của cache thay vì hành vi thật.** Probe trên đối tượng đã tồn tại sẵn, hoặc chạy lại
lần hai sau khi cache ấm. Xem `mem:process/verification-traps`.

## Ranh giới phơi ra internet

Role **Public** chỉ đọc `directus_files`, và chỉ một tập field hẹp: `id, type, title, description,
filename_download, width, height, filesize, focal_point_x, focal_point_y, modified_on`. **Không có
quyền nào trên `vehicles`/`vehicle_photos`** — `GET /items/vehicles` không token → 403.

Vì sao thu hẹp field: `fields: ["*"]` phơi `filename_disk`, `storage`, `uploaded_by` (uuid tài khoản
back-office) và `tus_data` ra internet. Script kiểm cả **nội dung** permission chứ không chỉ sự tồn
tại — một permission bị ai đó thu hẹp trong UI vẫn "tồn tại" và `/assets` sẽ hỏng im lặng.

`storage_asset_transform = "presets"` + **đúng một** preset `web` (fit inside, 2000px, quality 80).
`?width=` tuỳ ý → 400 `INVALID_QUERY`. Không chặn thì mỗi tổ hợp kích thước là một lần resize + một
entry cache — vòi CPU miễn phí cho bot.

Caddy route là **`data.<domain>`, không phải `admin.`** — có chủ ý: `admin.` gợi ý đây là app quản
trị chính, mà nó không phải; vận hành nằm ở `apps/staff`.

## Cấu hình Directus KHÔNG nằm trong git

Nó sống trong database của Directus. Nguồn sự thật viết ra được là `scripts/directus-setup.ts`
(idempotent, `bun run directus:setup`), nhưng **không có gì bắt ai chạy nó** — đây là "cấu hình
local", không phải "ranh giới repo ép". Vì vậy có probe trong skill `v9-directus` để drift lộ ra
nhanh thay vì lộ khi khách mở trang.

**Hệ quả vận hành cho shop:** không ai thêm được trường mới cho xe bằng cách bấm trong Directus.
Thêm trường = migration trong `packages/db` + chạy lại script.

Liên quan: `mem:architecture/vehicles-catalog` · `mem:architecture/migrations`
