# Bộ đo màn hẹp của `apps/staff`

Sinh ra ở đợt 2026-09-03. Đây là **phương tiện nghiệm thu** của
[`docs/plans/2026-09-03-staff-mobile-views-design.md`](../../../../docs/plans/2026-09-03-staff-mobile-views-design.md)
§10 — không phải công cụ dùng một lần.

Lý do vendor vào repo thay vì để ở thư mục tạm: mọi con số trong design doc đều
do mấy script này đo ra. Không có chúng thì "đã sửa xong" không kiểm lại được, và
điều kiện nghiệm thu trở thành lời hứa suông.

## Chạy

Cần: Postgres + MinIO + SuperTokens đang chạy, `bun run seed:dev` đã chạy, và
**hai dev server** (`apps/api` cổng 3001, `apps/staff` cổng 3003).

⚠️ `apps/staff` cần **Node ≥ 22** — `rolldown` gọi `util.styleText` với mảng và
Node 21 ném `ERR_INVALID_ARG_VALUE`. `nvm use 22` trước khi `bun run dev`.

```bash
google-chrome --headless=new --no-sandbox --remote-debugging-port=9222 \
  --user-data-dir=/tmp/v9-chrome about:blank &

nvm use 22
node screens.mjs ./out 390        # chụp toàn bộ route ở 390px
node calendar-geometry.mjs        # #4, #5, #8 — bề rộng lưới và chiều cao đầu trang
node modal-submit-hit.mjs         # #3 — nút Tạo đơn có bấm được không
node sheet-actions.mjs            # #1 — hành động nào nằm dưới nếp gấp
node staff-table.mjs              # #2 — cột và nút của bảng nhân viên
node vehicle-column.mjs           # #7 — tên xe có bị cắt không
```

Lần chạy đầu cần đăng nhập; `screens.mjs` tự điền form bằng tài khoản OWNER của
`bun run staff:bootstrap`. Các script sau dùng lại cookie trong `--user-data-dir`.

## Cách chúng đo

Không đọc class, không đọc code. Chỉ hỏi trình duyệt ba thứ:

- `getBoundingClientRect()` — vị trí và kích thước thật sau layout.
- `elementFromPoint(x, y)` — chạm vào điểm này thì TRÚNG cái gì. Đây là phép đo
  duy nhất phân biệt được "nút hiển thị" với "nút bấm được".
- `scrollWidth` vs `clientWidth` — có nội dung nào đang bị giấu không.

Đợt sinh ra chúng có năm lần kết luận sai vì đọc tín hiệu gián tiếp (đếm class
Tailwind, đọc danh sách tên model, grep tên trong file test, đọc ảnh chụp, đọc
`sticky` trong source). Ba phép đo trên là thứ bắt được cả năm.
