# Việc còn để lại

Tách khỏi `docs/ARCHITECTURE.md` để file đó không phình theo mỗi đợt — roadmap đổi thường xuyên, luật thì
không. Nợ kỹ thuật ở [`DEBT.md`](DEBT.md); thiết kế của từng đợt ở [`plans/`](plans/).

**Đã xong — đợt màn Thống kê + lịch thuê xe cho `apps/staff`.** Thiết kế ở
[`plans/2026-08-15-staff-home-stats-calendar-design.md`](plans/2026-08-15-staff-home-stats-calendar-design.md),
chia làm ba plan nối tiếp:

| Plan | Nội dung                                                                                  | Trạng thái                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A    | `customers` + `rentals` + API (`/fleet`, `/rentals`, `/customers`, `/stats/summary`)      | ✅ **xong** — [`plans/2026-08-15-staff-data-foundation-plan.md`](plans/2026-08-15-staff-data-foundation-plan.md) |
| B    | Hệ thiết kế `apps/staff`: `@theme`, thang cách, app shell responsive, retrofit 6 màn auth | ✅ **xong** — [`plans/2026-08-16-staff-design-system-plan.md`](plans/2026-08-16-staff-design-system-plan.md)     |
| C    | Màn Thống kê (`/`) và trang Lịch (`/calendar`), form lên đơn                              | ✅ **xong** — [`plans/2026-08-16-staff-stats-calendar-plan.md`](plans/2026-08-16-staff-stats-calendar-plan.md)   |

Bốn tính năng của `apps/staff` mà `docs/ARCHITECTURE.md` liệt kê: **lịch**, **thống kê** và **quản lý
khách hàng** đã xong (màn Khách hàng land 2026-08-31). **Lên đơn/bàn giao** cũng đã xong
(2026-09-01): chạm vào thanh đơn trên lịch mở sheet chi tiết có nút `Đã giao xe`/`Đã nhận lại xe`
nên `handed_over_at` được đặt và doanh thu hết đứng yên ở `0 ₫`; cùng sheet đó ghi giấy tờ shop
đang giữ, địa chỉ giao xe, và **ảnh** — ba nhóm `DOCUMENT`/`HANDOVER`/`RETURN` lưu vào MinIO bucket
`checkins` (migration `0015`). Đó là thứ `PRODUCT.md` nguyên tắc #3 dựa vào khi có tranh chấp xước
xát. **Bốn tính năng `apps/staff` mà `ARCHITECTURE.md` liệt kê nay đủ cả bốn.**

**Đã xong — đợt trả nợ kỹ thuật 2026-08-18.** Bốn món nợ đóng, cách chứng minh từng món ghi ở
[`DEBT.md`](DEBT.md): `getStatsSummary` nhận bộ lọc nên `stats.test.ts` hết cần xoá trắng bảng
`rentals` · hàng rào (test) buộc `RENTAL_STATUSES` khớp `CHECK` của Postgres, đóng nốt bản sao thứ
ba của bốn literal trạng thái · email so sánh không phân biệt hoa/thường (migration `0011`, unique
index trên `lower(email)`) · mã đặt lại mật khẩu hết hạn giờ tự dọn khi có ai xin mã mới. Nợ
`mode: "full"` trong `eslint.config.js` được **đo lại**, không đổi được — vẫn giữ nguyên, xem mục
"Nợ có hạn" trong `DEBT.md` cho số đo mới nhất.

**Màn Khách hàng — đã land 2026-08-31**, xem
[`plans/2026-08-31-customers-surface-design.md`](plans/2026-08-31-customers-surface-design.md).
Chưa làm, cần brainstorm riêng: sort/lọc/nhảy trang và hành động hàng loạt (một shop 12.000 khách
tới trang 300 là 300 cú click) · đổi thứ tự mặc định từ `asc(fullName)` sang _quá hạn → đang thuê →
gần nhất_ (đổi nó là đổi hình dạng sản phẩm: danh sách duyệt → danh sách cần chú ý) · ảnh chụp giấy
tờ lên MinIO cùng đợt bàn giao.

**Đã xong — luồng gửi yêu cầu thuê, 2026-09-01.** Mảnh này từng là thứ khiến đội xe đang hiển thị
không sinh ra được việc: khách xem xong không có đường nào gửi yêu cầu, và nút "Gửi yêu cầu thuê" ở
băng CTA là `<a href="#gui-yeu-cau">` nằm bên trong chính `<section id="gui-yeu-cau">` — nó cuộn
tới đúng chỗ nó đang đứng.

⚠️ **Bảng tên là `rental_requests`, KHÔNG phải `booking_requests`** như mục này dự kiến trước đây.
Đổi tên có chủ ý: `booking` trong ngữ cảnh app này nghĩa là đơn ĐÃ CHỐT (`rentals.status = BOOKED`),
nên `booking_requests` đọc ra "yêu cầu về một đơn đã chốt" — ngược hẳn ý nghĩa. Đi tìm
`booking_requests` trong repo sẽ không thấy gì.

Bốn tầng, migration `0013`: bảng · `POST /requests` công khai + route nhân viên · `/gui-yeu-cau?xe=<slug>`
trên `apps/web` (Server Action, không fetch thẳng sang API — xem comment CORS ở `apps/api/src/index.ts`) ·
màn tiếp nhận `/requests` trên `apps/staff` kèm badge số chưa xử lý. Ràng buộc copy vẫn ở
[`../apps/web/AGENTS.md`](../apps/web/AGENTS.md) (không hứa xe còn trống) và được tôn trọng: mọi CTA
dùng `messages.booking.cta`, câu xác nhận dùng `booking.afterSubmit`.

`rental_requests` **cố ý không có** exclusion constraint dù cũng mang xe + khoảng ngày — web không
đọc availability, nên hai khách xin cùng một xe cùng một khoảng ngày là bình thường và phải ghi được
cả hai. Lý do đầy đủ ở `packages/shared/src/domain/rental-request.ts` và `docs/workspaces/db.md`.

**Chưa làm ở luồng này:** chuyển một yêu cầu thành đơn thuê thật bằng một cú bấm (hiện nhân viên đọc
yêu cầu rồi tự mở form Lên đơn gõ lại) · thông báo cho nhân viên khi có yêu cầu mới ngoài giờ (badge
chỉ hiện khi app đang mở).

**Nghiệp vụ (cần brainstorm riêng trước khi code):** chính sách tính ngày thuê và bảng giá ·
schema `customers`, `rentals`, `rental_requests` — `rentals` kèm exclusion constraint chống đặt
trùng **và FK tới `staff_users`** (ai chốt đơn, ai bàn giao xe; đó chính là lý do role và hồ sơ
nhân viên nằm ở `public` chứ không ở schema của SuperTokens) · bốn tính năng của `apps/staff`:
lịch, thống kê, lên đơn/bàn giao, quản lý khách hàng · vai trò `SALES` làm gì.

`vehicles` và `vehicle_photos` **đã xong** (migration `0002`–`0004`, đợt 3); `staff_users` và
`password_reset_codes` **đã xong** (migration `0005`–`0007`, đợt auth); `customers` và `rentals`
**đã xong** (migration `0009`–`0010`, Plan A) — kèm exclusion constraint `rentals_no_overlap` và FK
`created_by` tới `staff_users`, đúng hai thứ mục này đòi.

`rental_requests` **đã xong** (migration `0013`, đợt 2026-09-01).

Ảnh bàn giao **đã xong** (migration `0015`, bảng `rental_photos`).

Còn lại trong nhóm nghiệp vụ: chính sách tính ngày thuê và bảng giá (Plan A **cố ý** để giá nhập
tay) · huỷ đơn và hoàn cọc · bảo hiểm · vai trò `SALES`. Bốn món sau đều nằm trong mục "Chưa quyết — đừng bịa" của `PRODUCT.md`: chúng chặn ở một
quyết định nghiệp vụ, không chặn ở code.

**Kỹ thuật:** `next-intl` khi thật sự có tiếng Anh · các món nợ ở [`DEBT.md`](DEBT.md).
**Chặn ở người, không chặn ở code** — ba việc này không tự làm được, cần asset từ shop:

Hai việc đầu chờ **đúng một** thứ: **file logo thật của shop**. Việc thứ ba chờ **ảnh xe thật**.

- **Màu accent của `DESIGN.md`.** Hệ thiết kế đã chốt (nền BMW M, adapt 7 chỗ) nhưng cố ý để
  trống đúng một ô: màu thương hiệu. Bản gốc dùng M tricolor của BMW — ta không dùng được, và
  `PRODUCT.md` cấm vẽ lại nhận diện. **Đừng bịa màu**: dựng đơn sắc trắng-đen cho tới khi có
  asset. Xem §9 của `DESIGN.md`.
- **Icon thật cho `apps/staff`.** `public/icon-{192,512}.png` đang là ô màu đặc. Thiếu icon thì
  trình duyệt **im lặng** không mời cài app.
- ⚠️ **Ảnh xe trong Directus đang là ảnh giả, và không có nhãn nào nói ra.** Phát hiện 2026-09-01
  bằng cách nhìn trang render, không phải bằng đọc code. File `honda-cb500x-01.png` — mang đúng
  tên xe, title "Honda Cb500x 01", alt "Honda CB500X 471cc màu đỏ, nhìn nghiêng bên phải" — thực
  chất là một **bảng màu kiểm tra**. Nó hiện ở lưới xe, ở `/xe`, và tràn viền 1440px trên trang
  chi tiết.

  Chỗ đau nằm ở việc **kỷ luật trung thực có một lỗ đúng chỗ đã tin là an toàn**: `hero.jpg` là
  ảnh AI và mang nhãn "Ảnh AI tạm — chưa phải xe của shop"; `public/placeholder/README.md` lập
  luận đúng rằng gắn nhãn đó lên một ảnh Directus thật sẽ là nói dối theo chiều ngược lại — nên
  pipeline **tin mọi thứ đến từ Directus**. Kết quả: ảnh giả duy nhất không nhãn lại nằm trong
  kênh được tin.

  CHECK `vehicle_photos_alt_meaningful` (migration `0014`) chỉ chặn được alt rỗng và alt là tên
  file. **Không ràng buộc kỹ thuật nào bắt được ảnh sai nội dung** — thay ảnh là việc của người
  đăng. `PRODUCT.md` nguyên tắc #2 đặt toàn bộ khác biệt của shop lên đúng câu này, nên đây là
  asset chặn thật, không phải việc dọn dẹp.

**Deploy:** đang gác. Secret SSH đã đặt; còn thiếu `ssh-copy-id` lên VPS, `ROOT_DOMAIN` +
`CADDY_EMAIL`, bootstrap `~/v9-motor-rental`, và `docker login ghcr.io` trên VPS (repo private nên
image cũng private). Chi tiết trong Agent Memory.
