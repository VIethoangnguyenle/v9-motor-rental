# Màu trạng thái: HUE mang mức khẩn, CÁCH TÔ mang "xe đã ra khỏi cửa hàng chưa"

Quyết định 2026-09-01, sau khi một vòng review trả về **Needs work**.
**Sửa 2026-09-02** (đợt hệ thị giác): tách hue của `ONGOING`, hạ L của `COMPLETED`, và bổ sung phát
hiện lớn nhất — §"Mù màu là thuộc tính CẤU TRÚC" ở cuối.

## Luật

Hai trục **trực giao**, cả hai đọc được **không cần hover**:

| hue | nền đặc | viền + không tint |
| --- | --- | --- |
| **teal 200** | `ONGOING` — xe đang ngoài đường | — |
| **lam 255** | — | `BOOKED` — chưa giao |
| **đỏ 27** | `isOverdue` — xe **trễ về** | `isPickupOverdue` — **chưa ai lấy** |
| **xám** | `COMPLETED` — đã trả | `CANCELLED` — đã huỷ |

⚠️ **`ONGOING` và `BOOKED` không còn cùng hue.** Bản 2026-09-01 xếp cả hai vào "xanh", phân biệt
bằng cách tô. Lý do tách: `--color-status-ongoing` khi đó là `oklch(52% 0.19 255)` — **trùng khít
`--color-accent`**, tức "đơn đang thuê" và "hành động chính của app" tô cùng một màu, trong một app
dạy người dùng rằng màu có nghĩa. Nút `+ Lên đơn` và thanh "đang thuê" đứng cạnh nhau trên lịch.

Trục *hue = mức khẩn* vẫn nguyên: teal và lam đều là nửa lạnh, đều đọc là "không cần xử lý gấp".
Thứ đổi là hai nghĩa khác nhau thôi dùng chung một giá trị.

**Không thêm token màu trạng thái thứ năm.** (Đợt 2026-09-02 có thêm `border-strong`, `ink-soft`,
`surface-sunken` và nhóm `--ease-*`/`--duration-*` — không cái nào là token **trạng thái**.) Người
đọc là nhân viên cầm một tay, ngoài nắng, giữa việc — họ giải mã **một** câu hỏi nhị phân *"dòng này
có cần tôi không"*. Màu là công cụ **thu hút**, không phải công cụ **phân loại**; phân loại là việc
của nhãn và hình, sau khi mắt đã bị kéo tới.

## Giá trị hiện hành và vì sao chúng KHÔNG có biên

| token | giá trị | ràng buộc |
| --- | --- | --- |
| `status-ongoing` | `oklch(55.5% 0.094 200)` | L giải ngược từ "chữ trắng ≥ 4,5:1" → **4,5550:1**. Đổi L là trượt AA |
| `status-completed` | `oklch(42% 0 255)` | hạ từ 46% để tách khỏi `ongoing` dưới CVD, xem dưới |
| `border-strong` | `oklch(66.9% 0.012 255)` | giải ngược từ SC 1.4.11 → **3,00:1** chẵn |

⚠️ **`status-ongoing` từng là `L=55.7%`** — "mức sáng nhất còn đạt", đo 4,5121:1 trên **số thực
liên tục**. Trình duyệt lượng tử hoá về 8 bit và vẽ `rgb(4,132,137)`: **4,4998:1** trên pixel thật —
**trượt AA trong khi hàng rào xanh**. `contrast()` ở `apps/staff/src/lib/color-math.ts` nay lượng tử
hoá trước khi đo. Xem `mem:process/lessons-2026-09-02` §"Công cụ đo cũng phải bị đo".

## ⚠️ Đơn thuốc "viền + `bg-.../15`" KHÔNG chép được giữa các token

`border border-status-overdue bg-status-overdue/15 text-status-overdue` đo được **4,03:1** — **trượt
AA 4,5**. Công thức tương tự của `BOOKED` qua được (**4,63:1**) chỉ vì token của nó tối hơn và ít
chroma hơn.

Dải đã quét cho overdue: tint 15%→4,03 · 10%→4,38 · 8%→4,55 (mỏng manh) · **0%→5,19 canvas / 5,41
surface**. Ship bản **không tint**.

**Luật này cắn lại lần hai ngày 2026-09-02, ở dạng khác:** vòng sáng "vừa đổi trạng thái" ban đầu tô
`--color-accent-soft` ở `opacity 0.55` **phủ lên chip**. Chip `ONGOING` là chữ trắng trên nền đặc ở
đúng 4,51:1 — **không biên**. Màu ghép đo được **2,02:1** ở 55%, và **3,89:1 ngay cả ở 10%**: không
mức opacity nào cứu được, vì vấn đề ở *hình thức* (tô đè) chứ không ở *liều lượng*. Tệ hơn, dưới
`prefers-reduced-motion` trạng thái đó **giữ nguyên 2 giây** thay vì nháy qua.

Lời giải: **vòng viền ngoài mép** (`outline` + `outline-offset: 3px`), không tô đè. Chọn `outline`
chứ không `inset: -3px` vì outline bám `border-radius` và tự nở theo offset — đúng ở mọi bán kính
chip mà không ghép tay với `--radius-card`.

**Đo bằng canvas pixel readback**, không bằng `getComputedStyle`: Chromium trả `oklch()` nguyên văn
nên parser ngây thơ cho ra 1,00:1 cho mọi cặp.

## Vì sao KHÔNG dùng nhãn để phân biệt

Lập luận "chip luôn kèm nhãn nên nhãn phân biệt được" **đúng trên hai màn Khách hàng** và **sai trên
lịch**: `calendar-timeline.tsx` hiện tên khách, `calendar-month.tsx` hiện tên xe, và `STATUS_LABEL`
chỉ nằm trong `title=` — **hover-only**. `apps/staff` là PWA chạy điện thoại, mà điện thoại **không
có hover**.

**Đã vá 2026-09-02**: thanh/chip trên cả hai chế độ lịch nay mang **icon trạng thái** (`statusIconOf`
ở `lib/rental-status.ts`), nên trạng thái đọc được không cần hover. Hai bảng Khách hàng **cố ý không
thêm icon** — chúng đã render `STATUS_LABEL` thành chữ nhìn thấy được, thêm icon ở đó là trang trí.

⚠️ Còn nợ: `isPickupOverdue` **nhìn thấy được nhưng không được đếm ở đâu**. Cần một dòng riêng trong
`attention-list.tsx` + count thứ hai trong `stats.ts`.

## 🔑 Mù màu là thuộc tính CẤU TRÚC, không phải lỗi chọn màu

Phát hiện lớn nhất của đợt 2026-09-02, và nó đổi cách đọc toàn bộ file này.

Đo cả sáu màu trạng thái × bốn kiểu nhìn (Machado 2009): **12 cặp/kiểu-nhìn va chạm ở bảng sáng, 14
ở bảng tối** (ngưỡng ΔE 0,12 trong OKLab).

Nguyên nhân **không nằm ở chỗ chọn màu**: sáu trạng thái đều tô nền đặc + chữ đè, nên ràng buộc
"chữ ≥ 4,5:1" **ghim cả sáu vào dải `L ∈ [0,42; 0,557]`**. Mù màu xoá hue, nên chỉ còn ~0,14 đơn vị
độ sáng chia cho sáu màu.

Chứng minh sạch nhất là **achromatopsia** (chỉ còn độ sáng), đo trên bản build:

| trạng thái | xám |
| --- | --- |
| `đã trả` | 77/255 |
| `đã đặt` | 99 |
| `cảnh báo` | 103 |
| `quá hạn` | 106 |
| `đang thuê` | 118 |

**Bốn trong năm nằm trong 7/255 của nhau.** Cặp chặt nhất `cảnh báo ↔ quá hạn` = **3/255** — và đó
đúng là hai dòng nằm sát nhau trong `AttentionList`.

Quét vét cạn (L 25–75% × 360 hue × chroma tới trần gamut): nghiệm an toàn dưới **mọi** kiểu nhìn
**có** tồn tại — nhưng **tất cả đòi `L ≤ 0,39`**, tức bắt "đang thuê" tối hơn "đã trả". Đó là đảo
ngược thứ bậc ngữ nghĩa của hệ để đổi lấy một chỉ số.

**Hệ quả cho thiết kế:**

> Đuổi theo từng cặp màu là **sai hướng**. Kênh **hình dạng** (`STATUS_ICON` — sáu trạng thái, sáu
> silhouette) mới là thứ gánh, và nó gánh cho **mọi** cặp cùng lúc.

Vì vậy `STATUS_ICON` **không phải một hạng mục có thể cắt để tiết kiệm** — cắt nó là hệ màu mất kênh
thứ hai ở *mọi* cặp. `theme-tokens.test.ts` giữ 26 ngoại lệ CVD với điều kiện tường minh ghi ngay
trong file: chúng hết hiệu lực nếu kênh hình bị cắt.

**Hai chỗ vẫn sửa bằng màu** — ngoại lệ dành cho thứ không sửa được, không dành cho thứ ngại sửa:
- `đang thuê ↔ đã trả` — **hồi quy do chính đợt này gây ra** (0,131 → 0,100), chữa bằng
  `status-completed` L 46% → **42%**; cải thiện cả ba chỉ số cùng lúc, không đánh đổi gì.
- `đã trả ↔ cảnh báo` — qua ngưỡng theo cùng thay đổi đó.

**Một chỗ cố ý KHÔNG chữa**: `quá hạn ↔ đã trả` (0,073). Chữa được, nhưng đòi `L ≤ 0,33` — mà
"đã trả" là trạng thái xuất hiện **nhiều nhất** (mọi đơn quá khứ), làm nó tối đi khiến *lịch sử*
trông khẩn cấp hơn *hiện tại*. Kênh gánh: `check` vs `alert-triangle` là **cặp hình khác nhau nhất
trong bộ sáu** — chọn cặp đó không ngẫu nhiên, chọn **vì** cặp màu này là cặp yếu nhất còn lại.

## Hàng rào

| file | canh gì |
| --- | --- |
| `lib/rental-status.test.ts` | ma trận 4 trạng thái × 4 quan hệ thời gian, bằng **chuỗi class literal** (không import hằng, để không xanh rỗng) |
| `lib/theme-tokens.test.ts` | 22 tên token × 3 khối · 16 cặp tương phản × 2 theme · gamut sRGB · va chạm CVD với ngoại lệ khoá `kiểu nhìn\|A\|B`, canh **hai chiều** |
| `lib/status-icon.test.ts` | sáu trạng thái → sáu **hình** (so component, không so tên) · màu ↔ hình **song ánh** |

⚠️ Ngoại lệ CVD khai ở mức `kiểu nhìn|A|B`, **không** ở mức cặp: ngoại lệ mức cặp tha luôn những kiểu
nhìn mà cặp đó thật ra vẫn ổn, và một suppression rộng hơn mức cần **đã** che mất đúng hồi quy
`đang thuê ↔ đã trả` một lần.

Liên quan: `mem:process/lessons-2026-09-02` · `mem:process/lessons-2026-09-01` ·
`mem:process/verification-traps` · `docs/plans/2026-09-01-staff-visual-system-design.md` §2.5
