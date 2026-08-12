# Việc còn để lại

Tách khỏi `CLAUDE.md` để file đó không phình theo mỗi đợt — roadmap đổi thường xuyên, luật thì
không. Nợ kỹ thuật ở [`DEBT.md`](DEBT.md); thiết kế của từng đợt ở [`plans/`](plans/).

**Đợt kế tiếp:** `booking_requests` + form gửi yêu cầu thuê trên `apps/web`. Đó là mảnh còn thiếu
để đội xe đang hiển thị sinh ra được việc — hiện khách xem xong không có đường nào gửi yêu cầu.
Ràng buộc copy của form nằm ở [`../apps/web/AGENTS.md`](../apps/web/AGENTS.md) (không hứa xe còn trống).

**Nghiệp vụ (cần brainstorm riêng trước khi code):** chính sách tính ngày thuê và bảng giá ·
schema `customers`, `rentals`, `booking_requests` — `rentals` kèm exclusion constraint chống đặt
trùng **và FK tới `staff_users`** (ai chốt đơn, ai bàn giao xe; đó chính là lý do role và hồ sơ
nhân viên nằm ở `public` chứ không ở schema của SuperTokens) · bốn tính năng của `apps/staff`:
lịch, thống kê, lên đơn/bàn giao, quản lý khách hàng · vai trò `SALES` làm gì.

`vehicles` và `vehicle_photos` **đã xong** (migration `0002`–`0004`, đợt 3); `staff_users` và
`password_reset_codes` **đã xong** (migration `0005`–`0007`, đợt auth).

**Kỹ thuật:** `next-intl` khi thật sự có tiếng Anh · upload ảnh lên MinIO · năm món nợ ở [`DEBT.md`](DEBT.md).
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
