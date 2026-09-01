# Danh mục đội xe: một hàng `vehicles` = MỘT CHIẾC XE, và đường đi dữ liệu của `apps/web`

ADR 2026-08-10 (`docs/plans/2026-08-10-fleet-catalogue-design.md`), đối chiếu lại 2026-09-01 —
`packages/db/src/schema/vehicles.ts` và `apps/api/src/services/vehicles.ts` vẫn khớp từng điểm.

## Không tách `vehicle_models`

**Một bản ghi `vehicles` = một chiếc xe cụ thể**, không phải một mẫu xe.

Lý do: khớp thẳng exclusion constraint `EXCLUDE (vehicle_id, period)` (đã dựng thật ở migration
`0010`, constraint tên `rentals_no_overlap`), và giữ nguyên tắc "khách thấy đúng con xe mình sẽ
nhận" — ảnh thật của từng chiếc.

**Giá phải trả, chấp nhận có ý thức:** hai chiếc cùng model sinh hai trang mô tả gần giống nhau →
trùng nội dung, hại SEO. Chấp nhận vì phương án hai bảng bắt nhập liệu hai tầng cho một đội xe mà
**hiện chưa biết** có bao nhiêu chiếc trùng model — tối ưu SEO cho vấn đề chưa quan sát được, bằng
cách làm nặng thao tác hằng ngày của shop, là đánh đổi sai chiều.

**ĐIỀU KIỆN XEM LẠI:** khi shop có từ hai chiếc trở lên **trùng model VÀ trùng năm**. Lúc đó tách
`vehicle_models` là một migration cộng một lần đổi shape endpoint, không phải viết lại.

## Tiền là `integer`, không `bigint` — và lý do cũ từng SAI

`price_per_day` / `deposit` là `integer`. Hai lý do (đo trên `drizzle-orm@0.45.2`, version này vẫn
đang dùng):

1. `integer` (~2,1 tỷ) thừa sức chứa giá ngày và tiền cọc tính bằng đồng.
2. `integer` là kiểu **duy nhất round-trip về `number` thuần mà không có tuỳ chọn nào để chọn sai**.
   `bigint` bắt chọn `mode`: `"number"` → `PgBigInt53`, `"bigint"` → `PgBigInt64` trả `BigInt`, thứ
   làm vỡ `type Vnd = number`.

⚠️ **KHÔNG** phải vì "Drizzle trả bigint dưới dạng string" — nó không trả string; đó là hành vi của
`numeric`/`decimal` (`PgNumeric`). Nhầm này từng nằm trong chính comment schema và trong §3.1 design
doc; **cả hai đã sửa**.

## Ràng buộc đẩy xuống tầng DB, không để ở code review

`vehicles` có bốn `CHECK`: slug format, `status IN ('draft','published','archived')`,
`price_per_day >= 0 AND deposit >= 0`, `engine_cc > 0`.

Lý lẽ: `NOT NULL` chặn được "không có giá", **không** chặn được "giá âm" — và một giá ngày âm hôm nay
insert được sẽ chảy thẳng ra trang công khai.

**`status` là trạng thái DANH MỤC, không phải rảnh/bận.** Không giá trị nào mang nghĩa "xe đang có
sẵn" — `apps/web` bị cấm hứa điều đó. `CHECK` nằm ở DB để lần ai đó thêm `'available'` thì Postgres
từ chối.

Giá hiển thị là **một** `price_per_day` + `deposit`; chưa làm bảng giá bậc thang (chính sách giá là
việc `PRODUCT.md` ghi là chưa quyết). `plate` (biển số) là **nội bộ** — không endpoint công khai nào
được trả.

`vehicle_photos.file_id` trỏ tới `directus.directus_files(id)` nhưng **cố ý không có foreign key**:
bảng đó chỉ tồn tại sau khi Directus boot lần đầu.

## Index partial + `NULLS LAST` — mất index trong im lặng nếu viết tắt

Index chỉ chứa hàng `published`, đánh trên cột dùng để **sắp xếp** (đánh trên `status` là vô dụng:
bên trong index này nó là hằng số). Index sinh ra là `("sort","created_at" DESC NULLS LAST)`.

Service **phải viết đúng nguyên văn** `ORDER BY sort, created_at DESC NULLS LAST`. Thiếu `NULLS
LAST` là mất index **không lỗi, không cảnh báo, chỉ chậm** — mặc định Postgres cho `DESC` là `NULLS
FIRST` và planner không coi hai thứ đó thay thế được, kể cả khi cột là `NOT NULL`. Đo bằng EXPLAIN
trên 20k hàng: `Incremental Sort` (cost 24.17) vs `Index Scan` (cost 0.29).

Có test khoá nguyên văn chuỗi này (`apps/api/src/services/vehicles.test.ts:92`). Chi tiết họ bẫy
này: `mem:process/verification-traps`.

## Đường đi dữ liệu của `apps/web`

**JSON đi qua `apps/api` (Eden typed); ảnh đi qua `/assets/<file_id>?key=web` của Directus.**

API trả **`fileId`, KHÔNG trả URL** — web tự dựng URL từ `NEXT_PUBLIC_DIRECTUS_URL`
(`apps/web/lib/directus.ts` → `assetUrl(fileId)`).

Lý do: đổi domain Directus sau này là sửa **một biến môi trường**, không phải đi sửa dữ liệu đã nướng
vào hàng chục trang HTML tĩnh — `apps/web` là SSG/ISR.

Luôn đi qua preset `web`; **không** `?width=` tuỳ ý (đã bị chặn ở Directus, mở lại là mở vòi CPU cho
bot). `next/image` tự sinh các cỡ responsive từ ảnh đó.

Ranh giới quyền Public và preset: `mem:architecture/directus`.

## ⚠️ Một tiền đề của ADR gốc đã bị đảo — kiểm 2026-09-01

Bản ghi sản phẩm cùng đợt (2026-08-05, agentmemory) khẳng định *"`apps/web` nhận ĐẶT XE ONLINE ĐẦY
ĐỦ… khách cuối chạm trực tiếp vào exclusion constraint"*.

**Sai ở thời điểm hiện tại.** `PRODUCT.md:26` chốt: khách **xem mẫu xe và gửi yêu cầu thuê**, **không
tự chốt đơn**; nhân viên tiếp nhận và chốt trong `apps/staff`. `PRODUCT.md:61` ghi rõ đây là một lần
đổi ý của người dùng ngay trong 2026-08-05 (xem §1.1 `docs/plans/2026-08-05-round2-directus-staff-design.md`).

Hệ quả đúng: va chạm đặt trùng **vẫn xảy ra thật**, luật `23P01 → 409` **vẫn bắt buộc**, chỉ là nó
lộ ra với **nhân viên** chứ không với khách cuối. Skill `v9-web` giữ luật này.

Liên quan: `mem:architecture/migrations` · `mem:architecture/postgres-and-search`
