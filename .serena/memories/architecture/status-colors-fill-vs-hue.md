# Màu trạng thái: HUE mang mức khẩn, CÁCH TÔ mang "xe đã ra khỏi cửa hàng chưa"

Quyết định 2026-09-01, sau khi một vòng review trả về **Needs work**.

## Luật

Hai trục **trực giao**, cả hai đọc được **không cần hover**:

| | nền đặc | viền + không tint |
| --- | --- | --- |
| **xanh** | `ONGOING` — xe đang ngoài đường | `BOOKED` — chưa giao |
| **đỏ** | `isOverdue` — xe **trễ về** | `isPickupOverdue` — **chưa ai lấy** |
| **xám** | `COMPLETED` — đã trả | `CANCELLED` — đã huỷ |

Nguồn: `apps/staff/src/index.css` đã tự viết luật này cho `BOOKED` vs `ONGOING` — *"phân biệt bằng
CÁCH TÔ (nền nhạt + viền vs nền đặc), không bằng độ sáng"*. Đợt này mở rộng nó cho đỏ và xám.

**Không thêm token màu thứ năm.** Bốn token trong `index.css` đều đã đo tương phản; thêm một token
chưa đo là undo việc đó. Người đọc là nhân viên cầm một tay, ngoài nắng, giữa việc — họ giải mã
**một** câu hỏi nhị phân *"dòng này có cần tôi không"*. Màu là công cụ **thu hút**, không phải công
cụ **phân loại**; phân loại là việc của nhãn, sau khi mắt đã bị kéo tới.

## ⚠️ Đơn thuốc "viền + `bg-.../15`" KHÔNG chép được giữa các token

`border border-status-overdue bg-status-overdue/15 text-status-overdue` đo được **4,03:1** — **trượt
AA 4,5**. Công thức tương tự của `BOOKED` qua được (**4,63:1**) chỉ vì token của nó tối hơn và ít
chroma hơn (L50% C0.09 vs overdue L55% C0.21).

Dải đã quét cho overdue: tint 15%→4,03 · 10%→4,38 · 8%→4,55 (mỏng manh) · **0%→5,19 canvas / 5,41
surface**. Ship bản **không tint**; ở cỡ chip thì 15% tint gần như không nhìn thấy nên bỏ đi gần
như miễn phí.

`CANCELLED` (`border + bg-status-completed/15 + text-status-completed`): **5,44:1 canvas / 5,70
surface** — chữ trên chính lớp tint của nó, không phải trên nền trang. Hai số khác nhau, đừng dùng
lẫn.

**Đo bằng canvas pixel readback**, không bằng `getComputedStyle`: Chromium trả `oklch()` nguyên văn
nên parser ngây thơ cho ra 1,00:1 cho mọi cặp. Mô hình đã được xác thực bằng cách tái tạo cả ba con
số `index.css` tự công bố (3,95 / 3,66 / 3,50 vs 3,95 / 3,66 / 3,49).

## Vì sao KHÔNG dùng nhãn để phân biệt

Lập luận "chip luôn kèm nhãn nên nhãn phân biệt được" **đúng trên hai màn Khách hàng** và **sai
trên lịch**: `calendar-timeline.tsx` hiện tên khách, `calendar-month.tsx` hiện tên xe, và
`STATUS_LABEL` chỉ nằm trong `title=` — **hover-only**. `apps/staff` là PWA chạy điện thoại, mà
điện thoại **không có hover**.

Ngoài ra `stats.ts` đếm `overdue` **chỉ** bằng `isOverdue` rồi render *"N xe quá hạn chưa trả"*
link thẳng sang `/calendar`. Nếu hai loại đỏ giống hệt nhau, nhân viên bấm "3 xe quá hạn" rồi thấy
5 thanh đỏ. Cách tô khác nhau **giải quyết** mâu thuẫn đó thay vì giấu.

⚠️ Còn nợ: `isPickupOverdue` **nhìn thấy được nhưng không được đếm ở đâu**. Muốn xử lý thật cần một
dòng riêng trong `attention-list.tsx` + count thứ hai trong `stats.ts`.

Hàng rào: `apps/staff/src/lib/rental-status.test.ts` ghim cả ma trận 4 trạng thái × 4 quan hệ thời
gian bằng chuỗi class literal (không import hằng, để không xanh rỗng).
