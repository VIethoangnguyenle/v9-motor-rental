# Model khách hàng — bốn quyết định nghiệp vụ (2026-08-31)

Chốt trong brainstorm trước đợt màn Khách hàng. Design doc:
`docs/plans/2026-08-31-customers-surface-design.md`.

## 1. Giấy tờ tùy thân thuộc `rentals`, KHÔNG thuộc `customers`

Giấy tờ được giữ cho **một lượt thuê** rồi trả lại. `rentals` đã có `handed_over_at`/`returned_at`
nên vòng đời khớp sẵn. PII bị khoá trong phạm vi một đơn, xoá được theo đơn.

## 2. KHÔNG lưu số giấy tờ — chỉ loại + đã trả chưa

`rentals.document_type` (`CCCD`/`PASSPORT`) + `document_returned_at`. Trả lời được câu vận hành duy
nhất thật sự cần: *"đơn này shop còn giữ giấy gì"*. Không cần đẩy số CCCD của mọi khách từng thuê
vào Postgres lẫn mọi bản backup. Bằng chứng đối chiếu khi tranh chấp là **ảnh chụp** (MinIO).

## 3. Địa chỉ giao thuộc `rentals`, "lần gần nhất" là TRUY VẤN

`rentals.delivery_address`. Khách du lịch đổi chỗ ở mỗi chuyến nên một `default_address` trên
`customers` sẽ nói dối. Dẫn xuất thì không có cột nào phải đồng bộ.

⚠️ **Ba cột trên chưa có ai ghi vào** cho tới khi luồng bàn giao xe được dựng. Cố ý — hợp đồng dữ
liệu cho đợt sau, không phải cột bị quên.

## 4. KHÔNG có chức năng gộp hồ sơ trùng

`customers.phone` đã `UNIQUE` (+ CHECK `^0[0-9]{8,10}$`) nên trùng chỉ xảy ra khi **một người dùng
hai số khác nhau** — hiếm. Và từ khi tìm kiếm bỏ dấu (`mem:architecture/postgres-and-search`), nhân
viên sẽ **tìm ra** hồ sơ cũ thay vì tạo mới.

Tiền lệ thành văn ở migration `0011`: *"gộp ngầm hai hồ sơ trùng — có thể là hai vai trò, hai lịch
sử duyệt khác nhau — là quyết định nghiệp vụ, không phải thứ một migration tự động nên tự ý làm."*

**Điều kiện mở lại:** xuất hiện ca trùng thật.

## 5. Tín hiệu vận hành SUY RA, không lưu

`GET /customers/list` trả `activeRental` + `lateReturnCount`, tính từ `rentals` mỗi lần query. Không
cột denormalized, không trigger — bản sao sẽ trôi khỏi thực tế, và trigger là state ẩn không nằm
trong diff.

Chọn `activeRental`: (1) `ONGOING` có `ends_at` sớm nhất → (2) `BOOKED` có `starts_at` gần nhất →
(3) `null`. Tie-break cuối bằng `id` — **không có nó thì 3/6 lần chạy đảo kết quả**, đã đo.

## 6. Nhánh `BOOKED` KHÔNG lọc `now()` — cố ý

Một `BOOKED` đã quá `starts_at` thường nghĩa là khách bỏ hẹn mà không ai huỷ, **hoặc nhân viên đã
giao xe thật nhưng quên bấm "giao xe"**. Ca thứ hai độc: `revenueAt` (đòi `handed_over_at`) không
tính tiền đơn đó, trong khi `rentals_no_overlap` vẫn khoá chiếc xe. Shop mất doanh thu trong sổ mà
không màn nào báo.

Lọc `now()` là **giấu**, không phải **lọc**: nếu đó là đơn mở duy nhất của khách thì `activeRental`
thành `null` và màn hình khẳng định "không có gì đang chờ" trong khi một xe đang bị khoá.
