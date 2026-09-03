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
node modal-submit-hit.mjs --self-test  # tự chèn/gỡ lớp che, khẳng định probe báo đúng cả hai chiều
node sheet-actions.mjs            # #1 — hành động nào nằm dưới nếp gấp
node staff-table.mjs              # #2 — cột và nút của bảng nhân viên
node vehicle-column.mjs           # #7 — tên xe có bị cắt không
```

Lần chạy đầu cần đăng nhập; `screens.mjs` tự điền form bằng tài khoản OWNER của
`bun run staff:bootstrap`. Các script sau dùng lại cookie trong `--user-data-dir`.

## Cách chúng đo

Không đọc class, không đọc code. Chỉ hỏi trình duyệt ba thứ:

- `getBoundingClientRect()` — vị trí và kích thước thật sau layout, đọc lại MỖI
  LẦN CHẠY. Không chốt toạ độ tuyệt đối vào script: một bản trước từng hardcode
  y của nút "Tạo đơn" rồi mất tác dụng ngay khi nút đổi vị trí ở đợt sau —
  probe vẫn "chạy được" nhưng đo một khoảng trống, không đo cái nút.
- `elementFromPoint(x, y)` — chạm vào điểm này thì TRÚNG cái gì. Đây là phép đo
  duy nhất phân biệt được "nút hiển thị" với "nút bấm được". `modal-submit-
hit.mjs` và `sheet-actions.mjs` quét theo LƯỚI 5×5 (5 phân suất như nhau cho
  cả x lẫn y) trên mỗi nút, không chỉ một điểm ở tâm — một đường/điểm tâm bỏ
  sót vùng chết theo CHIỀU NGANG. Lưới kẹp điểm quét cách mép ít nhất 3px
  (`MIN_EDGE_PX`) để không tự báo "chết" ở chính góc bo tròn `rounded-card`
  (6px) của mọi nút trong hệ này — đo tay xác nhận cách mép <2px thỉnh thoảng
  trượt dù nút hoàn toàn lành, bất kể nút nào.
- `scrollWidth` vs `clientWidth` — có nội dung nào đang bị giấu không.

`modal-submit-hit.mjs --self-test` tự chứng minh phép quét lưới còn tác dụng:
chèn một lớp che 30% đáy nút NGAY BÊN TRONG `<dialog>` (một lớp che gắn ngoài
top layer, vd. lên `document.body`, sẽ không bao giờ che được `<dialog>` mở
bằng `showModal()` — top layer vẽ trên mọi z-index thường, đo tay xác nhận),
khẳng định probe báo TRƯỢT ở đó, gỡ lớp che rồi khẳng định probe báo TRÚNG lại
toàn bộ. Hai chiều — một probe luôn báo trượt vô dụng y như một probe không
bao giờ báo. Thoát mã khác 0 nếu một trong hai chiều sai.

Đợt sinh ra chúng có năm lần kết luận sai vì đọc tín hiệu gián tiếp (đếm class
Tailwind, đọc danh sách tên model, grep tên trong file test, đọc ảnh chụp, đọc
`sticky` trong source). Ba phép đo trên là thứ bắt được cả năm.
