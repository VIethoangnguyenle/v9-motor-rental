# Việc còn để lại

Tách khỏi `CLAUDE.md` để file đó không phình theo mỗi đợt — roadmap đổi thường xuyên, luật thì
không. Nợ kỹ thuật ở [`DEBT.md`](DEBT.md); thiết kế của từng đợt ở [`plans/`](plans/).

**Đã xong — đợt màn Thống kê + lịch thuê xe cho `apps/staff`.** Thiết kế ở
[`plans/2026-08-15-staff-home-stats-calendar-design.md`](plans/2026-08-15-staff-home-stats-calendar-design.md),
chia làm ba plan nối tiếp:

| Plan | Nội dung                                                                                  | Trạng thái                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A    | `customers` + `rentals` + API (`/fleet`, `/rentals`, `/customers`, `/stats/summary`)      | ✅ **xong** — [`plans/2026-08-15-staff-data-foundation-plan.md`](plans/2026-08-15-staff-data-foundation-plan.md) |
| B    | Hệ thiết kế `apps/staff`: `@theme`, thang cách, app shell responsive, retrofit 6 màn auth | ✅ **xong** — [`plans/2026-08-16-staff-design-system-plan.md`](plans/2026-08-16-staff-design-system-plan.md)     |
| C    | Màn Thống kê (`/`) và trang Lịch (`/calendar`), form lên đơn                              | ✅ **xong** — [`plans/2026-08-16-staff-stats-calendar-plan.md`](plans/2026-08-16-staff-stats-calendar-plan.md)   |

Bốn tính năng của `apps/staff` mà `CLAUDE.md` liệt kê: **lịch** và **thống kê** đã xong; **lên đơn**
xong phần tạo đơn (chưa có bàn giao và ảnh tình trạng xe); **quản lý khách hàng** mới có tìm và tạo
nhanh trong form, chưa có màn riêng.

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

**Sau đó:** `booking_requests` + form gửi yêu cầu thuê trên `apps/web`. Đó là mảnh còn thiếu để đội
xe đang hiển thị sinh ra được việc — hiện khách xem xong không có đường nào gửi yêu cầu. Ràng buộc
copy của form nằm ở [`../apps/web/AGENTS.md`](../apps/web/AGENTS.md) (không hứa xe còn trống).

**Nghiệp vụ (cần brainstorm riêng trước khi code):** chính sách tính ngày thuê và bảng giá ·
schema `customers`, `rentals`, `booking_requests` — `rentals` kèm exclusion constraint chống đặt
trùng **và FK tới `staff_users`** (ai chốt đơn, ai bàn giao xe; đó chính là lý do role và hồ sơ
nhân viên nằm ở `public` chứ không ở schema của SuperTokens) · bốn tính năng của `apps/staff`:
lịch, thống kê, lên đơn/bàn giao, quản lý khách hàng · vai trò `SALES` làm gì.

`vehicles` và `vehicle_photos` **đã xong** (migration `0002`–`0004`, đợt 3); `staff_users` và
`password_reset_codes` **đã xong** (migration `0005`–`0007`, đợt auth); `customers` và `rentals`
**đã xong** (migration `0009`–`0010`, Plan A) — kèm exclusion constraint `rentals_no_overlap` và FK
`created_by` tới `staff_users`, đúng hai thứ mục này đòi.

Còn lại trong nhóm nghiệp vụ: chính sách tính ngày thuê và bảng giá (Plan A **cố ý** để giá nhập
tay) · `booking_requests` · bàn giao xe và ảnh tình trạng xe · vai trò `SALES`.

**Kỹ thuật:** `next-intl` khi thật sự có tiếng Anh · upload ảnh lên MinIO · các món nợ ở [`DEBT.md`](DEBT.md).
**Chặn ở người, không chặn ở code** — hai việc này không tự làm được, cần asset/quyết định từ shop:

Cả hai đều chờ **đúng một** thứ: **file logo thật của shop**.

- **Màu accent của `DESIGN.md`.** Hệ thiết kế đã chốt (nền BMW M, adapt 7 chỗ) nhưng cố ý để
  trống đúng một ô: màu thương hiệu. Bản gốc dùng M tricolor của BMW — ta không dùng được, và
  `PRODUCT.md` cấm vẽ lại nhận diện. **Đừng bịa màu**: dựng đơn sắc trắng-đen cho tới khi có
  asset. Xem §9 của `DESIGN.md`.
- **Icon thật cho `apps/staff`.** `public/icon-{192,512}.png` đang là ô màu đặc. Thiếu icon thì
  trình duyệt **im lặng** không mời cài app.

**Deploy:** đang gác. Secret SSH đã đặt; còn thiếu `ssh-copy-id` lên VPS, `ROOT_DOMAIN` +
`CADDY_EMAIL`, bootstrap `~/v9-motor-rental`, và `docker login ghcr.io` trên VPS (repo private nên
image cũng private). Chi tiết trong Agent Memory.
