# Màn Đội xe (`/fleet`) cho `apps/staff` — thiết kế

**Trạng thái:** đã chốt với chủ dự án 2026-09-07. Hai việc nền và toàn bộ đường API đã thi công, xem §8.

**Phạm vi:** một màn mới trong `apps/staff`, chỉ vai `OWNER`, cho phép xem và sửa toàn bộ đội xe.
Kèm theo là các đường API mới ở `apps/api` và một thay đổi ranh giới với Directus.

---

## 1. Vấn đề

Đội xe là dữ liệu gốc của cả hệ thống, và hôm nay chủ shop không sửa được nó từ `apps/staff`. Muốn
đổi giá một chiếc xe, thêm xe mới, hay gỡ một chiếc khỏi trang công khai, chủ shop phải mở Data
Studio của Directus. `apps/staff` chỉ đọc đội xe ở đúng một chỗ: form lên đơn tra giá qua
`GET /fleet`.

Mỗi lần đổi một con số, chủ shop phải rời công cụ vận hành và mở một công cụ khác. Directus vẫn cần
cho việc quản trị sâu như sửa cấu trúc bảng hay cứu dữ liệu, và đó là vai nó giữ sau đợt này.

## 2. Người dùng và bối cảnh

Chủ shop, vai `OWNER`, làm việc một mình. Hai bối cảnh khác nhau đủ để đòi hai hình dạng giao diện:

Ngồi ở shop với máy tính, công việc là quản trị: nhập xe mới, sửa giá, đẩy xe lên web, xem chiếc nào
đang lỗ chỗ. Đang đi với điện thoại, công việc là tra cứu: khách hỏi còn xe nào trống, và câu trả lời
phải ra trong vài giây.

Nhân viên vai `STAFF` không thấy màn này trên thanh điều hướng và không mở được URL của nó.

## 3. Quyết định đã chốt

**Toàn quyền CRUD cho `OWNER` trong `apps/staff`. Directus lùi về vai super admin.** Đây là đảo
ngược so với `PRODUCT.md` §Operating Context, vốn ghi Directus giữ danh mục, ảnh và bảng giá còn
`apps/staff` chỉ làm vận hành. `PRODUCT.md` phải được sửa trong cùng đợt này; để nguyên thì tài liệu
nói sai về chính hệ thống nó mô tả.

**Ảnh xe đi qua proxy tới Directus Files API.** `apps/staff` gửi file lên `apps/api`, `apps/api` gọi
tiếp Files API của Directus bằng một token máy, nhận `file_id` thật rồi mới ghi hàng vào
`vehicle_photos`. Đường vòng này là bắt buộc: `apps/web` render ảnh bằng
`${DIRECTUS_URL}/assets/${fileId}?key=web` (`apps/web/lib/directus.ts:8`), nên một `file_id` không có
hàng tương ứng trong `directus_files` sẽ hiện ra là ảnh vỡ trên trang công khai. Ghi thẳng vào MinIO
là bỏ qua toàn bộ hệ sinh thái file của Directus, gồm cả preset biến đổi ảnh `key=web`.

**Xoá xe nghĩa là chuyển sang `archived`, và doanh thu của nó ở lại.** Hàng vẫn nằm trong bảng, nên
đơn thuê cũ vẫn tra ra được tên xe và số tiền. Xoá cứng làm vỡ khoá ngoại `rentals.vehicle_id` và
mất luôn lịch sử. Thao tác bị chặn khi chiếc xe đang có đơn hiệu lực.

**Doanh thu một xe tính theo đơn đã hoàn tất**, tổng `total_amount` của các đơn ở trạng thái
`COMPLETED`, neo vào mốc `returned_at`.

Quyết định này tạo ra một chênh lệch với màn Thống kê, và chênh lệch đó phải hiện ra trên màn hình
chứ không được giấu. `getStatsSummary` tính doanh thu bằng điều kiện `handed_over_at IS NOT NULL`, cố
ý không lọc theo trạng thái (`apps/api/src/services/stats.ts:79`), nên nó đếm cả đơn đang chạy. Cộng
cột doanh thu của mọi xe sẽ luôn nhỏ hơn con số ở màn Thống kê, đúng bằng phần các đơn chưa trả xe.
Chủ shop cộng tay một lần là thấy, và kết luận đầu tiên sẽ là một trong hai màn bị sai.

Cách xử lý là ghi rõ phạm vi ngay trên nhãn. Nhãn đầy đủ là "Doanh thu — đơn đã hoàn tất", không phải "Doanh
thu" trần. Ngay cạnh là một số thứ hai nhỏ hơn cho phần đang chạy, dạng "đang chạy: N đơn · X ₫".
Cùng với số tiền là số đơn hoàn tất và tổng số ngày đã cho thuê, vì một xe đắt chạy hai đơn có thể ra
doanh thu bằng một xe rẻ chạy chín đơn.

## 4. Hình dạng giao diện

Hệ thị giác đối chiếu là `apps/staff/src/index.css` cộng `components/ui/*`. Không phải `DESIGN.md`,
file đó của `apps/web`. Không thêm token mới.

Màn này gánh ba câu hỏi cùng lúc: đội xe có gì, chiếc nào đang ở đâu, và chiếc nào đẻ ra tiền. Cách
sắp thông thường là dựng một bảng rồi bóp nhỏ lại thành thẻ ở màn hẹp, khuôn mà `StaffTable` và
`StaffCards` đang dùng. Khuôn đó đúng ở màn nhân viên vì màn đó chỉ có một việc. Ở đây nó sai, vì ba
câu hỏi không cùng độ quan trọng ở hai bối cảnh của §2.

Màn này đi theo tiền lệ của `field-page`: một hình dạng riêng cho mỗi bối cảnh, không phải một hình
dạng thu nhỏ.

| Bề rộng    | Câu hỏi dẫn          | Hình dạng                           | Chi tiết một xe         |
| ---------- | -------------------- | ----------------------------------- | ----------------------- |
| `<768`     | chiếc nào đang ở đâu | danh sách chia nhóm theo tình trạng | sheet toàn màn          |
| `768–1023` | đội xe có đúng chưa  | bảng đầy đủ, không panel cạnh       | sheet phủ lên           |
| `≥1024`    | đội xe có đúng chưa  | bảng cộng panel cố định bên phải    | tại chỗ, không che bảng |

Ở màn hẹp, bốn nhóm là Đang ở ngoài, Trống, Chưa lên web, Lưu kho. Đây là cách trình bày; ba giá trị
trong cột `status` vẫn là `draft`, `published`, `archived`.

Tablet không phải hình dạng thứ ba phải thiết kế từ đầu. Nó là bảng của desktop cộng cách mở chi tiết
của mobile. Bố cục hai cột ở 768px hỏng trước khi được dựng: sidebar của `AppShell` chiếm 168px, nên
vùng nội dung còn 600px, hẹp hơn cả `min-w-[640px]` mà một bảng sáu cột đang phải khai để chữ không
chồng nhau.

Thứ cầm trịch màn hình là nhãn tình trạng. Đây là giá trị duy nhất trên màn mà cơ sở dữ liệu cố ý
từ chối lưu. `vehicles.status` là trạng thái danh mục, và có một `CHECK` chặn ai đó thêm giá trị
`available` (`packages/db/src/schema/vehicles.ts:39`). Tình trạng rảnh hay bận phải suy ra từ các đơn
trong `rentals` chồng lấn thời điểm hiện tại. Ở màn hẹp nó cầm trịch cả bố cục; ở màn rộng nó là một
chip trong cột đầu.

### Phản mục tiêu

Không mở đầu bằng một hàng ô số liệu. Màn `/` đã là màn đó, và lặp lại sẽ đẩy bảng xuống dưới nếp
gấp.

Không lấy lưới ảnh làm hình dạng chính. `PRODUCT.md` §Evidence on Hand ghi shop chưa có ảnh thật, nên
hôm nay lưới đó là một tấm lưới ô xám.

Không bịa nhãn trạng thái mới.

## 5. Luật hợp lệ dùng chung

Cho phép ghi từ hai cửa nghĩa là luật hợp lệ phải sống ở một chỗ. Trước đợt này mỗi cửa tự biết luật
theo cách riêng: `scripts/directus-setup.ts` chép tay ba giá trị `status` kèm một comment tự nhắc
"PHẢI khớp CHECK trong DB", còn `slug` chỉ có một dòng gợi ý và không chặn gì.

Luật giờ nằm ở `packages/shared/src/domain/vehicle.ts`, và ba tầng có ba vai khác nhau:

`CHECK` trong Postgres là hàng rào, không ai vòng được, kể cả `psql`. Module domain là luật viết một
lần để hai cửa nói cùng một câu. Còn `validation` của Directus và form của `apps/staff` là lời giải
thích: chúng chạy ở tầng ứng dụng, nên việc của chúng là biến một lỗi Postgres thô thành câu người
đọc hiểu, trước khi người dùng bấm Lưu.

Phân vai này có một ngoại lệ đã đo. Với dữ liệu tiền, Postgres không phải
hàng rào: một giá trị lẻ ghi vào cột `integer` không bị từ chối mà bị làm tròn im lặng, và chế độ làm
tròn còn khác nhau tuỳ giá trị đi vào câu lệnh dưới dạng literal hay tham số. Ràng buộc
`price_per_day >= 0` vẫn đúng với con số đã bị đổi, nên nó xanh trong khi dữ liệu đã khác thứ người
dùng nhập. Ở trường hợp này `Number.isInteger` trong module domain là thứ duy nhất đứng giữa. Số đo
đầy đủ ở `apps/api/src/services/vehicle-rules-parity.test.ts`.

### Điều đã đo về Directus

Đo trên Directus 11, ngày 2026-09-07:

Filter-rule `_regex` có hiệu lực ở tầng API, không phải chỉ trang trí trong Data Studio. Một
`POST /items/vehicles` với slug sai bị từ chối bằng `400 FAILED_VALIDATION`.

Engine regex là JS chứ không phải POSIX của Postgres, nên negative lookahead chạy được. Đây là điều
kiện để luật `alt`, vốn là một phủ định, diễn đạt được ở đây.

Directus không có chỗ truyền cờ regex. Hệ quả đã đo: dùng mẫu cần cờ `i` thì `IMG_2481.jpg` bị chặn
đúng còn `IMG_2481.JPG` lọt qua Directus rồi đâm vào `CHECK vehicle_photos_alt_meaningful`, hiện ra
dưới dạng một câu SQL thô. Vì vậy field `alt` dùng `VEHICLE_PATTERNS.photoAltValid`, bản tự gói tính
không phân biệt hoa thường vào trong chính regex.

`validation_message` được lưu nhưng không xuất hiện trong thân lỗi REST; API trả câu mặc định kèm
`extensions.type = "regex"`. Suy luận chưa kiểm bằng trình duyệt: Data Studio mới là nơi đọc trường
đó và hiện nó cạnh ô nhập. `apps/staff` lấy câu thông báo thẳng từ `VEHICLE_MESSAGES`, không đi qua
Directus.

## 6. Đường API phải dựng

| Đường                                                                                            | Ghi chú                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /fleet` mở rộng                                                                             | thêm tình trạng suy ra, `year`, `engineCc`, `odoKm`, `color`, số ảnh. Bổ sung thuần: `rental-form.tsx` đang dùng route này, không được đổi trường cũ |
| `GET /fleet/:id`                                                                                 | chi tiết kèm ảnh và mô tả                                                                                                                            |
| `POST /fleet`, `POST /fleet/:id`                                                                 | `requireRole(staff, "OWNER")`. Đường đọc vẫn mở cho mọi nhân viên                                                                                    |
| `POST /fleet/:id/archive`                                                                        | chặn khi xe đang có đơn hiệu lực                                                                                                                     |
| `POST /fleet/:id/photos`, `POST /fleet/:id/photos/:photoId`, `DELETE /fleet/:id/photos/:photoId` | proxy sang Directus Files API                                                                                                                        |
| `GET /stats/vehicles`                                                                            | doanh thu và số ngày cho thuê theo từng xe                                                                                                           |

`POST` chứ không `PATCH`: không route nào trong repo dùng `PATCH`, và `POST /staff/users/:id/*` là
khuôn sửa tài nguyên đã có. Mở một verb mới cho một route duy nhất là tạo tiền lệ không có lý do.

Biển số không được lọt vào bất kỳ response công khai nào. `GET /vehicles` giữ nguyên schema hiện tại;
cơ chế chặn là chính schema TypeBox, vì Elysia cắt mọi field không được khai
(`apps/api/src/routes/vehicles.ts:9`).

Token máy của Directus là một secret mới. Nó phải được khai trong `.env.example`,
`compose.prod.yaml` và `deploy.yml`. Chưa có gì trong repo cấp token này.

## 7. Ràng buộc và quyết định còn treo

Ba hàng rào test đang canh `apps/staff` và sẽ đỏ nếu làm ẩu: `theme-tokens.test.ts` với token mới,
`spacing-fence.test.ts` với arbitrary value cho nhóm khoảng cách, `motion-budget.test.ts` với thời
lượng quá 400ms.

URL giữ trạng thái của màn: `?q=`, `?status=`, `?sort=`, `?id=`. Giá trị lạ bị lọc chứ không ném, cùng
khuôn `validateCalendarSearch` và `validateRentalsSearch`.

Vùng chạm tối thiểu 44px ở mọi breakpoint, kể cả desktop.

**Ghi đè hai cửa — đã đóng, xem §8.** `POST /fleet/:id` nhận kèm `expectedUpdatedAt` mà client đang
cầm; lệch thì trả `409 VEHICLE_STALE`. Mục này từng ghi rằng `vehicles.updated_at` "không ai đọc lúc
UPDATE" và rằng Directus sẽ nằm ngoài cơ chế. Cả hai đều sai: database đã có sẵn trigger
`vehicles_set_updated_at` (BEFORE UPDATE) từ trước đợt này, nên MỌI lệnh UPDATE đều bump mốc, kể cả
lệnh đến từ Data Studio hay từ `psql`. Cơ chế vì thế phủ được đúng ca nó sinh ra để bắt.

**Còn treo — vai `SALES`.** `PRODUCT.md` ghi vai này đã đặt chỗ nhưng chưa quyết làm gì. Màn này
không mở cho nó.

## 8. Đã thi công

Hai việc nền đã xong và đã kiểm.

**Ngưỡng bố cục ba nhánh.** `useLayoutVariant()` trả `mobile` dưới 768, `tablet` từ 768 đến 1023,
`desktop` từ 1024. Trong sáu chỗ gọi hiện có, năm chỗ so với `"mobile"` nên giữ nguyên hành vi. Chỗ
thứ sáu ở `stats-page.tsx` so với `"desktop"` và đã đổi thành `!== "mobile"`: ranh giới thật ở đó là
"trang đang dùng sidebar hay bottom nav", mà `AppShell` đổi sang sidebar từ 768, nên tablet cũng dùng
sidebar. Để nguyên thì tablet mất đường vào "Lên đơn" duy nhất của nó ở màn Thống kê, và không có gì
kêu.

Ba file test trước đó mỗi file chép tay chuỗi `"(min-width: 768px)"`, và comment ở hai trong ba file
tự ghi rằng đổi ngưỡng ở hook mà quên đổi ở test thì test sai âm. Thêm ngưỡng thứ hai làm món nợ đó
phát tác ngay: `staff-table.test.tsx` stub một query, nên query còn lại rơi xuống happy-dom, vốn mặc
định rộng 1024 và khớp. Stub giờ nằm ở `use-layout-variant.testing.ts` và đọc ngưỡng thẳng từ hook.

**Các đường API của §6.** `services/fleet.ts` và `routes/fleet.ts` cho đọc, tạo, sửa, lưu kho;
`getVehicleRevenue` trong `services/stats.ts` đặt cạnh `getStatsSummary` để hai định nghĩa doanh thu
nhìn thấy được nhau. Đã kiểm đầu-cuối qua HTTP thật với phiên `OWNER`.

**Màn hình ba hình dạng.** `pages/fleet-page.tsx` chọn hình dạng bằng `useLayoutVariant()`, và
`components/fleet/*` giữ bảng, danh sách chia nhóm, form, ảnh và doanh thu. Mục nav `Đội xe` mang cờ
`ownerOnly`; route kiểm `role !== "OWNER"` ở `beforeLoad`. Đã chụp màn ở cả ba bề rộng qua Chrome
CDP với một phiên `OWNER` thật.

**Luật hợp lệ dùng chung.** `packages/shared/src/domain/vehicle.ts` theo TDD nghiêm như luật của
`packages/shared/src/domain/**` đòi hỏi. `scripts/directus-setup.ts` sinh `validation` và
`validation_message` từ module đó, và script vẫn giữ được tính chạy lại vô hại. Phép kiểm parity với
Postgres thật nằm ở `apps/api/src/services/vehicle-rules-parity.test.ts`, đặt ở `apps/api` vì
`boundaries/dependencies` chỉ cho `packages/db` import chính nó.

### Ba chỗ hỏng im lặng gặp lúc dựng API

Ghi lại vì cả ba đều biên dịch được, không ném lỗi, và chỉ lộ ra qua bài kiểm thử.

Drizzle không ném thẳng lỗi của driver. Nó bọc lại thành `DrizzleQueryError` và cất bản gốc ở
`.cause`, nên `e instanceof SQL.PostgresError` luôn trượt và slug trùng nổi lên thành `500` thay vì
`SLUG_TAKEN`. Phải đi theo chuỗi `cause`.

`timestamptz` của Postgres có độ chính xác micro giây, `Date` của JavaScript chỉ có mili giây. Mốc
đọc về đã mất phần dư ngay lúc đi qua driver, nên `updated_at = $1` không bao giờ khớp và mọi lần
sửa đều trả `VEHICLE_STALE`. Phép so dùng `date_trunc('milliseconds', ...)`.

Nội suy `${schema.vehicles.id}` vào một `sql` template cho ra `"id"` trần, không phải
`"vehicles"."id"`. Bên trong subquery tương quan chạy trên `rentals r`, `"id"` khớp vào `rentals.id`,
nên điều kiện thành `r.vehicle_id = r.id`: không bao giờ đúng, không lỗi, chỉ trả `NULL` cho mọi
hàng. Một chiếc xe đang nằm ngoài đường hiện ra là trống. Tham chiếu cột bảng ngoài phải viết đầy đủ
tên bảng, lấy từ `getTableName`.

### Hai chỗ chỉ lộ ra khi nhìn màn hình

Không bài kiểm thử nào bắt được hai chỗ dưới đây trước khi có ảnh chụp thật.

Một dòng trong bảng vừa ghi "Trống" vừa ghi "+1 đơn đang chạy". Điều kiện
`starts_at <= now AND ends_at > now` bỏ sót đơn `ONGOING` đã quá hạn, mà đó chính là ca chiếc xe
đang nằm ngoài đường và chưa ai đòi về. `ONGOING` nay luôn tính là bận bất kể `ends_at`, còn
`BOOKED` vẫn hỏi khoảng thời gian, và giao diện gọi tên ca quá hạn bằng chữ đỏ.

Ở 1440px với panel chi tiết mở, bảy cột chỉ còn khoảng 780px và mọi ô bị bẻ hai dòng. Bảng bỏ hai
cột `Biển số` và `Danh mục` khi panel mở, vì panel đã hiện cả hai ở dạng ô nhập sửa được. Nới
`min-w` chỉ đổi cái bóp thành cuộn ngang ngay cạnh một panel.

## 9. Còn phải làm

Không còn việc nào trong phạm vi đợt này. `PRODUCT.md` §Operating Context đã sửa theo quyết định ở
§3.

Một bước người trước lần deploy đầu, ngoài phạm vi mã: điền `DIRECTUS_API_TOKEN` vào `.env` trên VPS
rồi chạy `bun run directus:setup`. Thiếu bước đó thì `apps/api` không khởi động được, vì `env.ts`
khai biến này `required()`.
