# Hệ thị giác cho `apps/staff` — màu, theme sáng/tối, chuyển động, icon, component

Ngày: 2026-09-01 · Phạm vi: `apps/staff` · Không đụng `apps/web`, không đụng `apps/api`.

Đây là **design doc**, không phải plan. Plan thi công viết sau, ở file riêng.

---

## 0. Việc này là gì, và không là gì

Người dùng yêu cầu: _"kết hợp với impeccable để make color cho giao diện, theme sáng tối, thêm
animation, thêm icon, các component thuận mắt người xem"_.

**Là:** nâng cấp hệ thị giác của app — bảng màu, hai theme, chuyển động, mở rộng icon, dọn
component.

**Không là:** đổi kiến trúc thông tin. Một hướng tái cấu trúc màn `/` thành "bảng đội xe" đã được
dựng, đưa ra, và **bỏ** — vì đội xe thật ≥26 chiếc, ở quy mô đó bảng mất vai trò kiểm kê và luận
điểm sụp. Bố cục và nội dung mọi màn giữ nguyên.

> ⚠️ `docs/workspaces/staff.md` ghi `impeccable: audit nhẹ, **không polish trừ khi được yêu cầu**`.
> Đợt này **được yêu cầu trực tiếp**, nên dòng đó cần cập nhật khi doc này land.

### 0.1 Hai "mặc định của thể loại" cố ý giữ lại

Craft floor của impeccable liệt hai thứ dưới đây là mặc định nên từ chối. Đợt này **giữ cả hai**, và
ghi ra đây để đó là một quyết định chứ không phải một chỗ bỏ sót:

| Mặc định bị liệt                                  | Vì sao vẫn giữ                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| _"khuôn hero-metric: số to, nhãn nhỏ, số phụ"_    | Nội dung thật của màn này **đúng là ba con số doanh thu**. Đây không phải khuôn dán lên nội dung khác — nó là chính nội dung. |
| _"card cùng cỡ làm cấu trúc trang"_               | Người dùng yêu cầu rõ: **không đổi kiến trúc thông tin**. Bố cục card là thứ đang có và được giữ nguyên có chủ ý.           |

Craft floor tự nói: _"đây là mặc định của thể loại, không phải lệnh cấm — chính lời của brief có thể
giành lại bất cứ cái nào"_. Brief ở đây giành lại cả hai. Cái **không** được giành lại là _eyebrow /
kicker phía trên tiêu đề_ — đó là cấm tuyệt đối, và bản nháp hướng A của tôi có vi phạm
(`Doanh thu · Hôm nay` đặt trên con số hero). Hướng đó đã bị bỏ; luật này áp cho mọi thứ dựng sau.

---

## 1. Bốn lỗi màu — ba nằm trong code, một nằm trong chính công cụ đo

Đo bằng oklch → sRGB → tỉ lệ tương phản WCAG, script ở phần §7.

Ba lỗi đầu **đã tồn tại trước đợt này**; không cái nào do thiết kế mới sinh ra. Lỗi thứ tư (§1.4) thì
ngược lại — **chính đợt này sinh ra nó**, nó nằm trong hàm dùng để sinh ra bảng màu, và nó chỉ lộ ra
ở vòng review chứ không lộ ra ở bất kỳ test nào.

### 1.1 `--color-accent` vượt gamut sRGB — token nói dối về màu nó vẽ

`oklch(52% 0.19 255)`. Trần chroma trong gamut ở `L=52%`, `hue=255` đo được là **0.171** (chính xác 0,17124). Ở 0.19,
kênh đỏ tuyến tính rơi xuống âm và trình duyệt **kẹp về 0** — màu render ra không phải màu token
khai.

Đây đúng là lớp lỗi mà chính `index.css` đã tự cảnh báo cho nhóm `*-soft`:

> _"Chroma là mức LỚN NHẤT không tràn gamut sRGB ở L đó — cao hơn thì trình duyệt tự cắt, và token
> sẽ nói dối về màu nó vẽ ra."_

Luật đã có, chỉ là chưa áp cho `accent`. **Sửa: `oklch(52% 0.171 255)`.** Về mắt gần như không đổi
(cả hai render ra `#0067c8`/`#0065d2`); về tính đúng đắn thì token thôi nói dối.

### 1.2 `--color-status-ongoing` trùng khít `--color-accent`

Cả hai đang là `oklch(52% 0.19 255)`. Nghĩa là **"đơn đang thuê"** và **"hành động chính của app"**
tô cùng một màu.

App này dạy người dùng rằng màu có nghĩa — `rental-status.ts` xây cả một hệ hai chiều (hue = có cần
xử lý không, cách tô = xe đã rời shop chưa). Để hai nghĩa khác hẳn nhau dùng chung một màu là phá
chính hệ đó, ở chỗ đắt nhất: nút `+ Lên đơn` và thanh "đang thuê" trên lịch cạnh nhau, cùng màu.

**Sửa: `--color-status-ongoing: oklch(55.7% 0.094 200)`** — teal. Giải ngược từ ràng buộc "chữ
trắng phải đạt 4.5:1": `L=55.7%` là mức sáng nhất còn đạt, đo được **4,51:1**.

Hue 200 chọn vì nó xa 255 đủ để phân biệt, nhưng vẫn nằm trong nửa lạnh — không đọc thành "cảnh
báo" như hue vàng/đỏ vốn đã có nghĩa riêng trong hệ.

⚠️ **Hue 200 không gỡ được va chạm dưới tritanopia** (ΔE 0,040 với `accent`) — tritanopia gộp trục
lam–lục, mà `accent` là lam. Quét vét cạn cho thấy nghiệm an toàn dưới **mọi** kiểu nhìn đều đòi
`L ≤ 0,39`, tức bắt "đang thuê" phải tối hơn "đã trả" — đảo ngược thứ bậc ngữ nghĩa của hệ. Giữ hue
200 và để **kênh hình dạng** gánh phần còn lại; lý lẽ đầy đủ ở §2.5b.

Điều này vẫn là cải thiện lớn, không phải hoà: trước đợt này ΔE là **0,000 ở cả bốn kiểu nhìn** —
hai nghĩa dùng chung đúng một màu với **mọi** người xem. Nay chỉ còn một kiểu nhìn hiếm gặp bị ảnh
hưởng, và ở đó hai token cũng không bao giờ đứng cạnh nhau (một là nút, một là chip).

### 1.3 `--color-border` 1,35:1 — nhưng sửa bằng cách **tách token**, không phải làm đậm

Critique 2026-09-01 ghi mọi viền trong app đo được 1,35:1 trên trắng và gọi đó là lỗi. Chỉ đúng một
nửa: SC 1.4.11 đòi 3:1 cho **ranh giới cần thiết để nhận ra một control** — nó **không** đòi điều đó
cho đường chia trang trí. Làm đậm mọi viền lên 3:1 sẽ biến bảng dữ liệu thành lưới kẻ ô nặng trịch,
tức chữa một lỗi bằng cách gây một lỗi khác.

**Sửa: giữ `--color-border` cho đường chia, thêm `--color-border-strong` cho viền control**
(`text-input`, nút `ghost`). Giải ngược từ 3:1: `oklch(66.9% 0.012 255)` → đo được **3,00:1** trên
`surface`.

### 1.4 ⚠️ Lỗi thứ tư — nằm trong chính công cụ đo, phát hiện lúc review Task 1

Ba lỗi trên tìm ra bằng phép đo. **Lỗi này nằm trong phép đo.**

Hàm `maxChroma` dùng để sinh **toàn bộ** bảng §2 ban đầu hỏi "màu này có ngoài gamut không" với dung
sai **±0.002**, kèm chú thích biện minh rằng đó là để chịu sai số dấu phẩy động của phép biến đổi.

**Lý do đó không có thật.** Đo trên ba màu sRGB thuần:

| Màu       | Sai lệch lớn nhất khỏi `[0,1]` |
| --------- | ------------------------------ |
| `#FF0000` | 0                              |
| `#00FF00` | 6,7×10⁻⁷                       |
| `#0000FF` | 1,3×10⁻⁷                       |

Dung sai lỏng hơn mức cần khoảng **ba nghìn lần**. Hậu quả:

| Token                       | Bảng ban đầu ghi | Trần gamut thật | Kênh tuyến tính              |
| --------------------------- | ---------------- | --------------- | ---------------------------- |
| `accent` sáng               | 0.174            | **0,17124**     | đỏ = **−0,001655** ⛔        |
| `accent-hover` sáng         | 0.155            | 0,15148         | ⛔                            |
| `accent-active` sáng        | 0.137            | 0,13172         | ⛔                            |
| `warning` sáng              | 0.111            | 0,1098          | ⛔                            |
| `status-ongoing` sáng       | 0.095            | 0,0948          | ⛔                            |
| `status-overdue-soft` sáng  | 0.02             | 0,0198          | ⛔                            |
| `status-booked-soft` sáng   | 0.02             | 0,0198          | ⛔                            |
| `accent` tối                | 0.16             | 0,1598          | ⛔                            |
| `accent-hover` tối          | 0.125            | 0,1249          | ⛔                            |

**Chín token.** Trong đó `accent = 0.174` là giá trị §1.1 đưa ra để _sửa_ lỗi tràn gamut — nó cũng
tràn gamut. Và một hàng rào ở §7 với tên nguyên văn _"không token nào vượt gamut sRGB — token không
được nói dối về màu nó vẽ"_ sẽ **xanh** trên cả chín.

**Sửa:** dung sai `1e-4` — vẫn chịu được hằng số oklch làm tròn 3–4 chữ số trong test và tài liệu
(ca `#FF0000` lệch 0), mà bắt được vi phạm nhỏ nhất trong hệ này (`accent` lệch 1,66×10⁻³, cách
ngưỡng 16 lần). Bảng §2.2/§2.3 dưới đây **đã là bảng đã sửa**.

Kiểm lại sau khi hạ chín chroma: **14/14 cặp vẫn đạt ở cả hai theme**, gồm cả ba cặp không có biên
(4,51:1 và 3,00:1 không đổi). ΔE `đang thuê` vs `hành động` = **0,145** sáng · **0,139** tối. Không
có hồi quy — độ lệch màu là ΔE 0,0013, bằng **1%** ngưỡng phân biệt.

**Bài học, và lý do nó nằm trong tài liệu chứ không nằm trong một dòng commit:** chú thích ở đầu
module đo cảnh báo đừng tin `getComputedStyle` vì nó trả số sai một cách tự tin. Chỗ hỏng lại nằm
trong chính hàm viết ra để thay thế nó. **Công cụ đo cũng phải bị đo** — và ở đây thứ bắt được nó
không phải một test, mà là một vòng review đọc lại lý lẽ của chú thích và thấy nó không khớp thực tế.

---

## 2. Hệ màu

### 2.1 Neutral nhuốm hue 255

Neutral hiện tại có **chroma = 0** — xám tuyệt đối. Đổi sang chroma 0.003–0.026 ở **hue 255**, đúng
sắc xanh của logo.

Nhìn từng ô riêng lẻ gần như không phân biệt được. Nhìn cả màn hình thì đây là khác biệt giữa một
giao diện **được thiết kế** và một giao diện **để mặc định** — nền, viền và chữ phụ cùng nghiêng về
một phía của bánh xe màu, nên accent không còn đứng như vật thể lạ dán lên nền xám.

Chi phí: 0. Cùng số lượng token, cùng số dòng CSS.

### 2.2 Bảng token — SÁNG (mặc định)

| Token                       | oklch                    | sRGB      | Vai trò                     |
| --------------------------- | ------------------------ | --------- | --------------------------- |
| `--color-canvas`            | `oklch(98.4% 0.003 255)` | `#f8fafc` | nền trang                   |
| `--color-surface`           | `oklch(100% 0 255)`      | `#ffffff` | card, ô nhập                |
| `--color-surface-sunken`    | `oklch(96.2% 0.005 255)` | `#f0f3f6` | nền chìm, hover hàng        |
| `--color-border`            | `oklch(87.8% 0.008 255)` | `#d3d7dc` | đường chia (trang trí)      |
| `--color-border-strong`     | `oklch(66.9% 0.012 255)` | `#90959c` | viền control — **3,00:1**   |
| `--color-ink`               | `oklch(22% 0.02 255)`    | `#141b24` | chữ chính                   |
| `--color-ink-soft`          | `oklch(40% 0.016 255)`   | `#424850` | chữ phụ đậm                 |
| `--color-muted`             | `oklch(52% 0.014 255)`   | `#646971` | metadata, placeholder       |
| `--color-accent`            | `oklch(52% 0.171 255)`   | `#0067c8` | hành động chính             |
| `--color-accent-ink`        | `oklch(100% 0 255)`      | `#ffffff` | chữ trên accent             |
| `--color-status-overdue`    | `oklch(55% 0.21 27)`     | `#d01d21` | quá hạn — _giữ nguyên_      |
| `--color-warning`           | `oklch(52% 0.109 75)`    | `#8d5e02` | cảnh báo — chroma vào gamut |
| `--color-status-ongoing`    | `oklch(55.7% 0.094 200)` | `#048489` | đang thuê — **đổi hue**     |
| `--color-status-booked`     | `oklch(50% 0.09 255)`    | —         | đã đặt — _giữ nguyên_       |
| `--color-status-completed`  | `oklch(42% 0 255)`       | `#4d4d4d` | đã trả — **L 46% → 42%**, xem §2.5b |
| `--color-status-overdue-soft` | `oklch(96% 0.019 27)`   | `#ffedeb` | nền chip quá hạn            |
| `--color-warning-soft`      | `oklch(96% 0.032 75)`    | `#ffefdb` | nền chip cảnh báo           |
| `--color-accent-soft`       | `oklch(96% 0.019 255)`   | `#eaf3ff` | nền chip accent             |

### 2.3 Bảng token — TỐI

Nền lấy **từ chính logo** (`public/icon-512.png`: nền đen–navy cắt chéo), không phải từ một thang
xám bất kỳ.

| Token                       | oklch                    | sRGB      |
| --------------------------- | ------------------------ | --------- |
| `--color-canvas`            | `oklch(17.5% 0.022 255)` | `#0a111a` |
| `--color-surface`           | `oklch(22.5% 0.024 255)` | `#141c27` |
| `--color-surface-sunken`    | `oklch(14% 0.02 255)`    | `#050911` |
| `--color-border`            | `oklch(32% 0.026 255)`   | `#2a3440` |
| `--color-border-strong`     | `oklch(51.2% 0.03 255)`  | `#5b6878` |
| `--color-ink`               | `oklch(96.5% 0.006 255)` | `#f1f4f7` |
| `--color-ink-soft`          | `oklch(82% 0.012 255)`   | `#bfc5cc` |
| `--color-muted`             | `oklch(70% 0.018 255)`   | `#979faa` |
| `--color-accent`            | `oklch(70% 0.159 255)`    | `#53a0ff` |
| `--color-accent-ink`        | `oklch(17.5% 0.022 255)` | `#0a111a` |
| `--color-status-overdue`    | `oklch(70% 0.17 27)`     | `#f66d62` |
| `--color-warning`           | `oklch(78% 0.14 75)`     | `#eba941` |
| `--color-status-ongoing`    | `oklch(74% 0.12 200)`    | `#24c1c9` |
| `--color-status-booked`     | `oklch(68% 0.08 255)`    | —         |
| `--color-status-completed`  | `oklch(66% 0 255)`       | —         |
| `--color-status-overdue-soft` | `oklch(30% 0.05 27)`   | `#442320` |
| `--color-warning-soft`      | `oklch(30% 0.05 75)`     | `#3c2a0e` |
| `--color-accent-soft`       | `oklch(30% 0.05 255)`    | `#1c2f46` |

⚠️ **`accent-ink` ở theme tối là màu NỀN, không phải trắng.** Chữ trắng trên `#53a0ff` chỉ đạt
~2,5:1. Đây là chỗ dễ sai nhất khi bê bảng sáng sang tối bằng cách đảo ngược.

⚠️ **Nhóm `*-soft` ở theme tối là L=30%, không phải L=96%.** Không có cách nào "tự động" suy ra —
mỗi cái phải đo lại. `warning` cũng đổi cả chroma (0.109 → 0.14) vì trần gamut ở L cao thì rộng hơn.

### 2.3b `accent-hover` / `accent-active` — luật cũ giữ nguyên, chiều thực thi **đảo ngược**

`index.css` đã có lập luận cho hai token này, và nó vẫn đúng nguyên văn:

> _"pha alpha trên nền trang làm nút SÁNG lên khi rê chuột […] tức đi ngược trực giác 'nhấn xuống
> thì đậm hơn' […] Cả hai đều ĐẬM hơn trạng thái thường, nên tương phản chỉ tăng."_

Điều bất biến thật nằm ở vế cuối: **tương phản chỉ được tăng.** "Đậm hơn" chỉ là cách vế đó biểu
hiện _trên nền sáng_. Trên nền tối, accent **sáng hơn** nền, nên đậm đi là đi về phía nền — tương
phản _giảm_.

| Theme | accent                   | hover                    | active                   |
| ----- | ------------------------ | ------------------------ | ------------------------ |
| Sáng  | `oklch(52% 0.171 255)`   | `oklch(46% 0.151 255)`   | `oklch(40% 0.132 255)`   |
| Tối   | `oklch(70% 0.160 255)`   | `oklch(76% 0.124 255)`   | `oklch(82% 0.091 255)`   |

Số đo với chữ trên nút (sáng: trắng · tối: `accent-ink` = màu nền):

| Trạng thái | Sáng    | Tối       |
| ---------- | ------- | --------- |
| thường     | 5,59:1  | 7,06:1    |
| hover      | 7,22:1  | 8,83:1    |
| active     | 9,30:1  | **10,89:1** |

**Phản chứng, đo được:** nếu theme tối làm hover/active đậm đi theo đúng bản sáng, `active` rơi
xuống **4,39:1** — trượt AA cho chính chữ của nó, và chỉ còn 3,95:1 với `surface`. Chép nguyên bảng
sáng sang tối rồi giảm L là cách hỏng cụ thể ở đây.

Chroma cũng phải giảm dần khi L tăng (0.160 → 0.125 → 0.091): đó là trần gamut sRGB ở từng mức L,
không phải lựa chọn thẩm mỹ.

### 2.4 Số đo — 14/14 cặp đạt ở cả hai theme

| Cặp                          | Sáng      | Tối       | Ngưỡng |
| ---------------------------- | --------- | --------- | ------ |
| `ink` / `surface`            | 17,30:1   | 15,45:1   | 4.5    |
| `ink` / `canvas`             | 16,53:1   | 17,14:1   | 4.5    |
| `muted` / `surface`          | 5,50:1    | 6,41:1    | 4.5    |
| `muted` / `canvas`           | 5,26:1    | 7,11:1    | 4.5    |
| `ink-soft` / `surface`       | 9,20:1    | 9,80:1    | 4.5    |
| `accent` / `surface`         | 5,59:1    | 6,37:1    | 4.5    |
| `accent-ink` / `accent`      | 5,59:1    | 7,06:1    | 4.5    |
| `accent-ink` / `overdue`     | 5,40:1    | 6,59:1    | 4.5    |
| `accent-ink` / `warning`     | 5,62:1    | 9,29:1    | 4.5    |
| `accent-ink` / `ongoing`     | **4,51:1**| 8,62:1    | 4.5    |
| `border-strong` / `surface`  | **3,00:1**| **3,00:1**| 3.0    |
| `overdue` / `overdue-soft`   | 4,78:1    | 4,83:1    | 4.5    |
| `warning` / `warning-soft`   | 4,99:1    | 6,73:1    | 4.5    |
| `accent` / `accent-soft`     | 4,99:1    | 5,08:1    | 4.5    |

Ba cặp in đậm là **giải ngược từ ngưỡng** — chọn L nhỏ nhất còn đạt, để màu đậm nhất có thể mà
không trượt. Chúng không có biên; đổi L của chúng là trượt AA.

### 2.5 ⛔ Mù màu — lỗi nặng nhất của đợt này, và nó **đã nằm sẵn trong code**

Mô phỏng Machado 2009 (severity 1.0) trên linear RGB, rồi đo ΔE trong OKLab. Ngưỡng phân biệt được
lấy ở **ΔE ≥ 0,12**.

| Cặp                          | Nhìn thường | Protanopia | **Deuteranopia** | Tritanopia |
| ---------------------------- | ----------- | ---------- | ---------------- | ---------- |
| `quá hạn` ↔ `cảnh báo`       | 0,162       | 0,062      | **0,040**        | 0,151      |

**Deuteranopia là dạng phổ biến nhất (~6% nam giới).** Ở đó hai màu này coi như **một**. Và đó đúng
là hai màu đắt nhất trong app: `AttentionList` xếp _"N xe quá hạn chưa trả"_ ngay trên _"N xe phải
trả hôm nay"_, mỗi dòng một chấm màu — hai chấm cạnh nhau, cùng một màu.

Nguyên nhân là **độ sáng**, không phải hue: `overdue` L=0,55 và `warning` L=0,52 gần bằng nhau. CVD
xoá hue, nên chỉ còn L để phân biệt, mà L thì không chênh.

#### Không có màu nào sửa được — đã quét, không đoán

Quét toàn bộ `L ∈ [0,50; 0,80] × hue ∈ [60; 105]` ở chroma trần gamut, tìm giá trị thoả **đồng thời**
hai ràng buộc:

1. chữ trắng trên nền đó ≥ 4,5:1
2. ΔE với `quá hạn` ≥ 0,12 ở **cả bốn** kiểu nhìn

**Kết quả: rỗng.** Hai ràng buộc chọi trực tiếp — điều kiện (1) ép màu phải đủ tối, tức ghim cả hai
vào một dải L hẹp; điều kiện (2) đòi L phải chênh nhau nhiều. Không có giao.

#### Kết luận: màu không đủ, phải có **kênh thứ hai**

Đây là chỗ mục §5 (icon) **thôi là trang trí và trở thành chịu lực**. Mọi chip trạng thái và mọi chấm
chú ý phải mang một **hình dạng riêng biệt**, không chỉ một màu riêng biệt:

| Trạng thái          | Icon             | Hình dạng nền |
| ------------------- | ---------------- | ------------- |
| quá hạn chưa trả    | `alert-triangle` | tam giác      |
| chưa ai lấy xe      | `clock`          | tròn          |
| phải trả hôm nay    | `calendar-check` | vuông         |
| đang thuê           | `bike`           | (đã có sẵn)   |
| đã đặt              | `calendar-days`  | vuông         |
| đã trả              | `check`          | dấu kiểm      |

Chọn theo **độ khác nhau của hình**, không theo mức dễ thương của biểu tượng: tam giác / tròn /
vuông phân biệt được kể cả khi màu biến mất hoàn toàn.

Việc này cũng đóng luôn một phát hiện khác của critique (Recognition 2/10): lịch có sáu trạng thái
màu, không có chú giải ở đâu, và `STATUS_LABEL` chỉ tới màn hình qua `title=` — thứ **không bao giờ
bắn khi chạm**, trên chính thiết bị mà PWA này nhắm tới.

#### 2.5b Bản chất cấu trúc — không phải một danh sách ngoại lệ lẻ

⚠️ Mục này viết lại sau khi thi công Task 2. Bản đầu ghi cặp `quá hạn ↔ cảnh báo` như một ca cá
biệt. **Nó không cá biệt.** Đo cả sáu màu trạng thái × bốn kiểu nhìn cho thấy nhiều cặp dưới ngưỡng,
và nguyên nhân chung không nằm ở chỗ chọn màu.

**Sáu trạng thái đều tô nền đặc + chữ trắng.** Ràng buộc "chữ trắng ≥ 4,5:1" ghim cả sáu vào dải
`L ∈ [0,42; 0,557]`. Mù màu xoá hue, nên thứ duy nhất còn lại để phân biệt là **độ sáng** — và chỉ
còn ~0,14 đơn vị L chia cho sáu màu. **Không cách chọn màu nào nhét vừa sáu màu phân biệt được vào
đó.**

Quét vét cạn xác nhận: nghiệm an toàn dưới mọi kiểu nhìn **có tồn tại** (1375 nghiệm khi ràng buộc
với cả bảng), nhưng **tất cả nằm ở `L ≤ 0,39`** — tức đòi "đang thuê" phải tối hơn "đã trả". Đó là
đảo ngược thứ bậc ngữ nghĩa của hệ để đổi lấy một chỉ số. Không đánh đổi.

**Hệ quả cho thiết kế — và đây là điều đáng giá nhất của cả §2.5:**

> Đuổi theo từng cặp màu là sai hướng. Kênh **hình dạng** (§5, `STATUS_ICON`, sáu icon phân biệt)
> mới là thứ gánh, và nó gánh cho **mọi** cặp cùng lúc chứ không riêng cặp nào.

Vì vậy §5 **không phải một hạng mục có thể cắt để tiết kiệm**. Cắt nó là hệ màu mất kênh thứ hai ở
mọi cặp, không phải ở một cặp.

**Hai chỗ đã sửa được bằng màu thì vẫn phải sửa** — ngoại lệ dành cho thứ không sửa được, không dành
cho thứ ngại sửa:

| Cặp                       | Trước  | Sau    | Xử lý                                        |
| ------------------------- | ------ | ------ | -------------------------------------------- |
| `đang thuê` ↔ `hành động` | 0,000  | 0,040  | đổi hue 255 → 200 (§1.2). Còn dưới ngưỡng ở tritanopia; hai token này **không bao giờ đứng cạnh nhau** — một là nút, một là chip |
| `đang thuê` ↔ `đã trả`    | 0,131  | 0,138  | **hồi quy do đợt này gây ra** (tụt còn 0,100), đã chữa bằng `status-completed` L 46% → **42%** |

Cặp thứ hai là bài học riêng: nó **đang ở trên ngưỡng** và bị chính đợt này đẩy xuống dưới. Nó cũng
là cặp nguy hiểm nhất trong bảng — `ONGOING` và `COMPLETED` **đều tô nền đặc** và **đứng cạnh nhau**
trong `customer-rental-history.tsx` và `customer-table.tsx`, nơi màu là kênh duy nhất. Hạ `completed`
xuống L=42% cải thiện cả ba chỉ số cùng lúc (ΔE 0,138 · chữ trắng 8,46:1 · trên `*-soft` 7,53:1),
không đánh đổi gì.

`đã đặt` ↔ `hành động` (ΔE=0,086 ngay ở nhìn thường, cùng hue 255) **giữ nguyên**: **cách tô đã tách
chúng** — `booked` là viền + nền nhạt, `accent` là nền đặc. Đó đúng là luật hai chiều mà
`rental-status.ts` đã dựng (hue = có cần xử lý không · cách tô = xe rời shop chưa). Không thêm token
thứ bảy để chữa thứ mà cách tô đã chữa.

**Luật cho hàng rào:** ngoại lệ ghi ở mức `kiểu nhìn | màu A | màu B`, **không** ở mức cặp. Ngoại lệ
mức cặp tha luôn những kiểu nhìn mà cặp đó thật ra vẫn ổn — và một suppression rộng hơn mức cần là
một suppression sẽ che mất hồi quy sau này. Nó vừa che mất đúng cặp `đang thuê ↔ đã trả` ở trên.

Hàng rào cũng canh **hai chiều**: một cặp đã khai ngoại lệ mà nay qua ngưỡng thì test **cũng đỏ**,
kèm yêu cầu xoá khỏi bảng. Một bảng suppression chỉ an toàn chừng nào nó không mục được.

#### 2.5b-bis Achromatopsia — phép thử chứng minh luận điểm, đo trên bản build

Ba kiểu mù màu ở §2.5b giữ lại **một phần** thông tin màu. **Achromatopsia** (mù màu toàn phần,
~1/30.000) không giữ gì: chỉ còn **độ sáng**. Đó cũng là ca chứng minh sạch nhất, vì ràng buộc "chữ
trắng ≥ 4,5:1" **chính là** một ràng buộc lên độ sáng.

Đo trên bản build thật (Task 4b, lấy pixel nền bằng `feColorMatrix` của Blink), và tái lập được
bằng phép tính từ token:

| Trạng thái  | Xám    |
| ----------- | ------ |
| `đã trả`    | 77/255 |
| `đã đặt`    | 99     |
| `cảnh báo`  | 103    |
| `quá hạn`   | 106    |
| `đang thuê` | 118    |

**Bốn trong năm màu nằm trong 7/255 của nhau.** Bảng màu sụp thành đúng **hai nhóm**: `đã trả`, và
tất cả những màu còn lại. Cặp chặt nhất là `cảnh báo ↔ quá hạn` ở **3/255 (1,2%)** — và đó chính là
hai dòng nằm sát nhau trong `AttentionList`.

> ⚠️ **Đính chính §2.5c:** dưới ba kiểu mù màu thông thường, cặp chặt nhất là `quá hạn ↔ đã trả`
> (ΔE 0,073, protanopia). Dưới achromatopsia thì **ngược lại** — `đã trả` là màu **dễ** phân biệt
> nhất, còn `quá hạn ↔ đang thuê` mới sát (12/255). Hai kết luận không mâu thuẫn: chúng đo hai thứ
> khác nhau, và `đang thuê` sát `quá hạn` **do chính cách nó được giải ra** (L=55,7% là mức sáng nhất
> còn đạt 4,5:1 với chữ trắng; `quá hạn` ở L=55%).

Đây là chỗ luận điểm §2.5b thôi là suy luận và thành phép đo: **không cách chọn màu nào cứu được**,
vì thứ ghim độ sáng lại chính là ràng buộc tương phản. Ở chế độ Tháng 390px dưới achromatopsia, chip
là những ô xám trơn — **chỉ còn icon** phân biệt được chúng. Không có §5 thì màn đó là năm khối xám
không đọc được.

#### 2.5c Một cặp cố ý KHÔNG đuổi theo — `quá hạn` ↔ `đã trả` (ΔE 0,073)

Cặp này **chữa được bằng màu**, và vẫn quyết định không chữa. Ghi ra vì im lặng ở đây sẽ đọc thành
chỗ bỏ sót.

Đo được: hạ `status-completed` xuống `L ≤ 0,33` là cặp này qua ngưỡng (`L=32%` → ΔE 0,136). Nhưng:

- **`đã trả` là trạng thái xuất hiện nhiều nhất trong sản phẩm** — mọi đơn trong quá khứ đều mang
  nó. Bảng lịch sử thuê của một khách quen gần như toàn chip `đã trả`.
- Ở `L=32%` chip đó thành một mảng xám đậm. Một bảng đầy chip xám đậm nặng thị giác hơn hẳn, và nó
  làm _lịch sử_ trông khẩn cấp hơn _hiện tại_ — ngược hẳn thứ bậc mà màn hình cần.
- Đây đúng là ca mà §2.5b nói tới: **đổi một thứ bậc ngữ nghĩa để lấy một chỉ số.**

Kênh gánh: `check` (đã trả) và `alert-triangle` (quá hạn) là **cặp hình khác nhau nhất trong bộ sáu
icon** — dấu kiểm mảnh vs tam giác đặc. Chọn cặp icon này không phải ngẫu nhiên; nó được chọn **vì**
cặp màu này là cặp yếu nhất còn lại.

`status-completed` dừng ở **L=42%**: đó là mức chữa được `đang thuê ↔ đã trả` (hồi quy thật, §2.5b)
và `đã trả ↔ cảnh báo`, mà chưa phải trả giá thị giác nào — nó còn cải thiện cả tương phản chữ trắng
(7,13 → 8,46:1). Đi xa hơn mới bắt đầu phải trả giá.

---

## 3. Cơ chế theme (quyết định A: theo hệ điều hành + gạt tay, mặc định sáng)

Ba trạng thái, không phải hai:

| Trạng thái | Đánh dấu                   | Nghĩa                      |
| ---------- | -------------------------- | -------------------------- |
| sáng ép    | `<html data-theme="light">`| người dùng chọn sáng       |
| tối ép     | `<html data-theme="dark">` | người dùng chọn tối        |
| theo hệ    | **không có thuộc tính**    | mặc định — nghe `prefers-` |

```css
@theme {
  /* bảng SÁNG — §2.2 */
}

@layer base {
  :root { color-scheme: light; }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { color-scheme: dark; /* bảng TỐI */ }
  }

  :root[data-theme="dark"] { color-scheme: dark; /* bảng TỐI */ }
}
```

Bảng tối khai **hai lần** — một trong `@media`, một trong `[data-theme="dark"]` — để nút gạt thắng
được ở **cả hai chiều**: máy đang tối mà người dùng chọn sáng cũng phải ra sáng.

### Bốn cái bẫy

1. ⛔ **Không được dùng `@theme inline`.** `inline` nội suy _giá trị_ thẳng vào utility thay vì tham
   chiếu `var()`. Utility sẽ ngừng phản ứng với việc ghi đè biến, và theme tối **im lặng không có
   tác dụng** — CSS vẫn build, không lỗi ở đâu cả.
2. **`color-scheme` là bắt buộc**, không phải trang trí: nó điều khiển màu mặc định của thanh cuộn,
   `<select>`, ô date, và ô nhập tự động điền. Thiếu nó thì lịch của `<input type="date">` trong
   `RentalForm` hiện nền trắng giữa app tối.
3. **Chống nháy trắng lúc tải.** Phải đặt `data-theme` **trước khi vẽ khung hình đầu tiên**, bằng
   một script đồng bộ nội tuyến trong `<head>` của `index.html` đọc `localStorage`. Đặt trong React
   là muộn — người dùng thấy một nháy trắng mỗi lần mở app, và trên PWA khởi động lạnh thì rõ.
4. **`theme-color` phải đổi theo.** `index.html` và `vite.config.ts` đang khai cứng `#fafafa` ở hai
   chỗ (đã khớp nhau — phát hiện `#111111` trong critique nay đã cũ). Theme tối cần cập nhật thẻ
   `<meta name="theme-color">` bằng JS khi gạt, vì thuộc tính `media` chỉ theo được hệ điều hành,
   không theo được lựa chọn tay.

### Nút gạt đặt ở đâu

Chân sidebar và trong sheet **Thêm** — cạnh `Đổi mật khẩu` / `Đăng xuất`, đúng nhóm "thiết lập tài
khoản" đã có. Không thêm điểm đến mới trong `NAV_ITEMS`.

---

## 4. Chuyển động

### 4.0 Điểm xuất phát — **một** animation, không phải không có cái nào

`ui/skeleton.tsx` dùng `animate-pulse` của Tailwind, kèm `motion-reduce:animate-none`. Đó là toàn bộ
chuyển động của app hôm nay. Không có `transition` nào ở bất kỳ đâu — nút, hàng, lớp phủ đều đổi
trạng thái bằng một bước nhảy tức thì.

⚠️ Chú thích trong `skeleton.tsx` tự khai: _"`animate-pulse` là animation DUY NHẤT trong app, nên
đây cũng là chỗ duy nhất phải tôn trọng `prefers-reduced-motion`"_. Câu đó **thành sai ngay khi đợt
này land** — phải sửa trong cùng commit, không để lại một chú thích nói dối về hệ thống.

### 4.1 Luận điểm

**Chuyển động ở đây tồn tại để _chứng minh có chuyện vừa xảy ra_, không để trang trí.**

Lý do cụ thể, không phải khẩu hiệu: lỗi P0 nặng nhất theo critique là ảnh chụp màn hình ngay sau khi
tạo đơn thành công **trùng khít từng byte** (cùng MD5) với ảnh trước đó. App làm xong việc mà không
nói gì.

Hệ quả của luận điểm: mỗi hiệu ứng dưới đây phải trả lời được câu _"nó nói cho người dùng điều gì mà
không có nó thì họ không biết?"_. Cái nào không trả lời được thì không vào.

#### Khoảnh khắc được dàn dựng: **bàn giao xe**

Tám hiệu ứng rời rạc không phải một luận điểm chuyển động — chúng là tám lần đổi trạng thái. Đợt này
có **đúng một** khoảnh khắc được dàn dựng, và nó phải tới từ chính sản phẩm này:

**Nhân viên bấm `Đã giao xe`.** Đó là nhịp kịch tính thật của app: `handed_over_at` được đặt, đơn
chuyển `BOOKED → ONGOING`, chiếc xe rời cửa hàng, và **doanh thu thôi đứng ở `0 ₫`** — bốn thứ xảy
ra cùng lúc ở bốn chỗ khác nhau trên màn hình. Đây cũng đúng là hành động mà critique đo được là
_không sinh ra phản hồi nào_.

Dàn dựng, 600ms, một chuỗi chứ không phải một hiệu ứng:

1. Nút `Đã giao xe` xác nhận cú bấm (120ms).
2. Chip trạng thái **đổi cả hình lẫn màu** — `calendar-days` → `bike`, viền nhạt → nền đặc. Đổi
   hình là phần bắt buộc, không phải phần trang trí: xem §2.5.
3. Sheet đóng, và **hàng vừa đổi sáng lên một nhịp** ở màn phía sau — người dùng nhìn thấy đúng chỗ
   mình vừa tác động, không phải đi tìm.

Ba mục còn lại của §4.4 (hover, nút, focus) là **trạng thái nền**, cố ý yên tĩnh. Một khoảnh khắc
được dàn dựng chỉ nổi lên được khi xung quanh nó im.

**Ngân sách:** chuỗi này chạy vài chục lần mỗi ca, mỗi lần trên một phần tử. Rẻ. Không có hiệu ứng
nào chạy lặp vô hạn, không có hiệu ứng nào gắn vào cuộn.

### 4.2 Token — khai một chỗ, không rắc số vào component

```css
@theme {
  --ease-enter:    cubic-bezier(0.16, 1, 0.3, 1);   /* giảm tốc — thứ đang vào */
  --ease-exit:     cubic-bezier(0.4, 0, 1, 1);      /* tăng tốc — thứ đang đi  */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);      /* đổi trạng thái tại chỗ  */

  --duration-instant: 120ms;  /* hover, focus, đổi màu     */
  --duration-quick:   180ms;  /* chip, badge, alert vào    */
  --duration-panel:   280ms;  /* modal / sheet             */
}
```

**Trần cứng 400ms.** App này được dùng hàng trăm lần mỗi ca; hoạt ảnh dài là thuế thu ở mỗi lần dùng.
Vào nhanh hơn ra (`enter` 280ms / `exit` 180ms): thứ người dùng vừa gọi ra phải tới nhanh, thứ họ vừa
bỏ đi phải biến mất nhanh hơn nữa.

### 4.3 Ngân sách theo **số lần lặp**, không phải một danh sách cấm phẳng

Luật không phải _"chỉ `transform` và `opacity`"_ — đó là tự trói. Luật là: **chi phí của một hiệu
ứng nhân với số phần tử chạy nó phải nằm trong ngân sách của một điện thoại Android rẻ tiền.**

| Nhóm                                                | Được dùng                                                     |
| --------------------------------------------------- | ------------------------------------------------------------- |
| **Phần tử lặp lại** (hàng bảng, thanh lịch, chip)   | chỉ `transform` · `opacity` · `background-color` · `border-color` |
| **Phần tử đơn lẻ** (modal, alert, badge)            | thêm `filter`, `backdrop-filter`, `clip-path`, `mask`         |
| **Khoảnh khắc dàn dựng** (§4.1, một phần tử, một lần) | toàn bộ bảng màu, miễn còn mượt khi đo                        |

Cụ thể ở đây: nền mờ của `ui/modal.tsx` được phép dùng `backdrop-filter: blur(2px)` — **một** phần
tử, mở vài chục lần mỗi ca. Cùng hiệu ứng đó rắc lên 30 hàng bảng khách hàng thì không.

**Cấm ở mọi nhóm:** `height` · `width` · `top`/`left` · `margin`/`padding` · `font-weight`. Chúng
sinh layout, và layout thì không có nhóm nào đủ rẻ.

`font-weight` nằm trong danh sách vì một lý do cụ thể trong repo này: `app-nav.tsx` đánh dấu mục
đang mở bằng `activeProps={{ className: "bg-canvas font-semibold" }}`. Đổi weight làm **đổi bề rộng
chữ**, nên animate nó là bảy mục nav co giãn mỗi lần điều hướng. Giữ nguyên đổi tức thì.

**Nội dung phải nhìn thấy được ở trạng thái mặc định.** Hiệu ứng vào chạy từ một thứ _đã hiển thị_,
không phải từ `opacity: 0` — script hỏng thì trang vẫn đọc được, không trắng trơn.

Vòng sáng của mục 6 (§4.4) chạy trên một hàng **trong danh sách**, tức thuộc nhóm phần tử lặp lại —
nên nó dùng một `::after` phủ lên animate `transform: scale()` + `opacity`, **không** dùng
`box-shadow`. Cùng hiệu ứng thị giác, chi phí compositor.

### 4.4 Bảng kê — từng chỗ, ánh xạ vào file thật

| #   | Chỗ                       | File                                                | Animate                        | Thời lượng | Easing     | Nói điều gì                             |
| --- | ------------------------- | --------------------------------------------------- | ------------------------------ | ---------- | ---------- | --------------------------------------- |
| 1   | hàng bấm được             | `stats/attention-list.tsx`, `customers/customer-table.tsx`, `layout/app-nav.tsx` | `background-color`, `border-color` | 120ms | standard | hàng này bấm được                       |
| 2   | nút                       | `ui/button.tsx`                                     | `background-color`             | 120ms      | standard   | nút nhận được cú bấm                    |
| 3   | vòng tiêu điểm            | `index.css :focus-visible`                          | **không animate**              | 0          | —          | vòng focus trễ là lỗi, không phải hiệu ứng |
| 4   | modal / sheet vào–ra      | `ui/modal.tsx`                                      | `transform`, `opacity`, nền mờ | 280 / 180ms | enter / exit | lớp phủ tới từ đâu, đi về đâu           |
| 5   | skeleton → nội dung       | `ui/skeleton.tsx` + trang gọi                       | `opacity`, `transform`         | 180ms      | enter      | nối "đang tải" với "đã có"              |
| 6   | đơn vừa đổi trạng thái    | `rentals/rental-detail-sheet.tsx`, lịch             | `::after` scale + opacity      | 600ms ×1   | exit       | **hàng nào** vừa đổi                    |
| 7   | badge số yêu cầu          | `layout/app-nav.tsx` `NewRequestBadge`              | `transform: scale`             | 180ms      | enter      | số vừa đổi khi không ai nhìn            |
| 8   | alert xuất hiện           | `ui/alert.tsx`                                      | `opacity`, `transform`         | 180ms      | enter      | đây là thứ MỚI, không phải vốn có       |

Mục 6 là mục quan trọng nhất của cả đợt — nó là thứ trực tiếp chữa lỗi P0 ở §4.1. Nó **không** chạy
lặp: một nhịp rồi tắt. Vòng xung lặp mãi là một cảnh báo, không phải một lời xác nhận.

### 4.5 ⚠️ Bẫy lớn nhất: `<dialog>` không animate được bằng `transition` thường

`ui/modal.tsx` dùng `<dialog>` gốc + `showModal()` (có lập luận đầy đủ trong file: top layer, bẫy
Tab, `inert`, Esc, trả tiêu điểm — bốn thứ miễn phí). Cái giá là animate nó cần ba thứ mà một
`transition` thông thường không có:

```css
dialog[open] > div { /* panel */
  transition:
    transform var(--duration-panel) var(--ease-enter),
    opacity   var(--duration-panel) var(--ease-enter),
    display   var(--duration-panel) allow-discrete,
    overlay   var(--duration-panel) allow-discrete;
}
@starting-style { dialog[open] > div { transform: translateY(12px); opacity: 0; } }
```

- **`@starting-style`** — thiếu nó thì không có hiệu ứng VÀO. Phần tử vừa được tạo không có giá trị
  cũ để nội suy từ đó; `@starting-style` cấp giá trị đó.
- **`transition-behavior: allow-discrete` cho `display`** — thiếu nó thì `display: none` áp ngay lập
  tức và hiệu ứng RA bị cắt cụt, không thấy gì.
- **`overlay`** — thuộc tính điều khiển việc phần tử còn nằm trong top layer hay không. Thiếu nó thì
  dialog rơi khỏi top layer trước khi chạy xong hiệu ứng ra, và panel **nhảy xuống dưới** lớp mờ
  trong một khung hình.

Ba `ModalPlacement` cần ba hướng vào khác nhau, vì hướng phải khớp nơi nó neo:

| Placement  | Dùng ở                      | Vào từ                                       |
| ---------- | --------------------------- | -------------------------------------------- |
| `bottom`   | sheet **Thêm** (bottom nav) | `translateY(100%)` — trượt lên từ đáy         |
| `adaptive` | sheet chi tiết đơn          | `translateY(100%)` <640px · `scale(.98)` ≥640px |
| `top`      | form lên đơn                | `translateY(-12px)` + fade                    |

Sheet trượt lên từ đáy là quy ước gốc của điện thoại; hộp thoại giữa màn thì phóng nhẹ. Dùng chung
một hướng cho cả ba là chỗ dễ làm ẩu nhất.

⚠️ **Chỉ kiểm được trên bản build.** `docs/workspaces/staff.md` ghi rõ PWA không chạy ở `vite dev`;
mà lớp phủ này là nơi hành vi PWA (safe-area, `dvh`, bàn phím ảo) giao với hiệu ứng. Kiểm bằng
`bun run --filter @v9/staff build && preview`.

### 4.6 `prefers-reduced-motion` — bỏ đường đi, giữ đích đến

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

`1ms` chứ không `0s`: `0s` khiến một số trình duyệt **không bắn** `transitionend`/`animationend`, và
bất kỳ logic nào chờ sự kiện đó sẽ treo. Đây là bẫy đã biết của khuôn reset này.

Nhưng quét toàn cục **không đủ** — nó xoá cả thông tin, không chỉ xoá chuyển động. Ba chỗ phải xử lý
riêng:

| Chỗ                 | Bản thường          | Bản reduced-motion                                     |
| ------------------- | ------------------- | ------------------------------------------------------ |
| xung "vừa đổi" (#6) | vòng scale + mờ dần | **nền tô nhạt giữ 2s rồi bỏ** — vẫn chỉ ra đúng hàng đó |
| modal (#4)          | trượt + mờ          | hiện ngay, không transform                             |
| badge (#7)          | scale pop           | đổi số ngay                                            |

Mục 6 là chỗ **bắt buộc** phải có bản thay thế: nếu reduced-motion làm nó biến mất hoàn toàn thì
người bật cờ đó quay lại đúng lỗi P0 ban đầu — app làm xong việc mà không nói gì.

### 4.7 Không làm

Parallax · hiệu ứng kích hoạt lúc cuộn · chuyển cảnh giữa trang (View Transitions của TanStack
Router) · hover phóng to · spinner thay cho skeleton · **stagger cho danh sách**.

Stagger bị loại bằng số, không bằng khẩu vị: bảng khách hàng và lịch có hàng chục hàng; 30 hàng ×
30ms trễ = **900ms** trước khi hàng cuối xuất hiện, tức vượt trần 400ms gấp đôi cho đúng thứ người
dùng đang chờ để đọc.

### 4.8 Cách kiểm

1. DevTools → Rendering → **Emulate `prefers-reduced-motion: reduce`**, đi lại cả tám mục ở §4.4.
2. Performance panel khi mở/đóng modal và khi cuộn bảng khách hàng: **không được có** mục
   `Layout`/`Recalculate Style` nào trong lúc hiệu ứng chạy. Có nghĩa là §4.3 bị phá.
3. Bản build thật (`build` + `preview`), không phải `vite dev` — xem §4.5.
4. Throttle CPU 4× để mô phỏng điện thoại rẻ tiền.

---

## 5. Icon — **chịu lực**, không phải trang trí

Đã có nền tốt: `ui/icon.tsx` bọc **lucide-react**, ghim `strokeWidth={2.5}` và cỡ 20px cố định, có
lập luận đo đạc đầy đủ. **Không đụng vào lớp bọc đó.**

⛔ **Mục này là điều kiện để §2 đứng được.** §2.5 đo được rằng `quá hạn` và `cảnh báo` không phân biệt
nổi dưới deuteranopia (ΔE≈0,040), và **không giá trị màu nào sửa được**. Icon là kênh thứ hai duy
nhất còn lại. Cắt mục này đi thì hệ màu ở §2 mang một lỗi tiếp cận đã biết mà không có gì đỡ.

Vì vậy thứ tự thi công là: **icon trước, hoặc cùng lúc với màu — không phải sau.**

| Việc                     | Nội dung                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Chip trạng thái          | sáu hình dạng riêng (§2.5). Đây là phần chịu lực.                                            |
| Chấm ở `AttentionList`   | `StatusDot` hiện là hình tròn tô màu cho **cả ba** dòng — thay bằng icon theo loại việc.     |
| `Alert` theo tone        | `error` / `warning` / `info` hiện chỉ khác nhau bằng màu → trượt SC 1.4.1.                   |
| Trạng thái rỗng          | mỗi màn rỗng một icon lớn nhạt. Hiện là chữ trần.                                            |
| Nút gạt theme            | mặt trời / mặt trăng.                                                                        |

Bổ sung vào `ICONS`: `alert-triangle`, `calendar-check`, `info`, `moon`, `sun`, `filter`.
(`bike`, `calendar-days`, `check`, `clock` đã có sẵn.)

---

## 6. Component

Đợt này **không tạo primitive mới**. Việc là đóng khoảng cách đã có.

1. **Hai hệ thiết kế song song** — critique đo được: `rentals`/`customers`/`calendar` dùng `ui/`,
   còn `auth`/`staff` **bỏ qua hoàn toàn**. Kéo `auth/*` và `staff/*` về dùng `ui/` primitive.
2. **`<main>` lồng nhau** — `staff-list-page.tsx:70` và `health-page.tsx:15` mỗi cái lồng một
   `<main>` thứ hai bên trong `AppShell`. Hệ quả đo được: `h1` cao **40px** ở `/staff` so với
   **16px** ở `/customers`. Luật này viết rõ trong chú thích của **bốn** file khác và bị phá ở hai.
3. **Chip trạng thái thành component** — `rental-status.ts` trả về chuỗi class; mỗi chỗ gọi tự dựng
   `<span>`. Gói thành `ui/status-chip.tsx` để icon (mục §5) và cách tô có đúng một chỗ để sửa.
4. **`Alert` nhận icon** theo tone.
5. **`ui/theme-toggle.tsx`** — primitive mới duy nhất của đợt này.

---

## 7. Cách kiểm chứng

**Không tin `getComputedStyle`.** `index.css` đã ghi hai lần rằng Chromium trả về chuỗi `oklch()`
thô hoặc màu kế thừa, và một parser ngây thơ cho ra `16,69:1` cho cặp thật ra là `4,38:1`.

Cách đúng: tô màu vào `<canvas>` rồi đọc pixel, và **hiệu chuẩn bằng cách tái lập các số đã công bố
trong `index.css`** trước khi tin số mới.

Script đo dùng cho doc này: oklch → OKLab → sRGB tuyến tính → kẹp gamut → độ sáng tương đối → tỉ lệ
WCAG, kèm hai hàm giải ngược (`maxChroma` tìm trần gamut, `solveL` giải L nhỏ nhất đạt ngưỡng). Nó
phải được đưa vào repo thành test, không để ở scratchpad — nếu không thì bảng §2.4 là ảnh chụp một
lần, không phải hàng rào.

**Hàng rào đề xuất:** một test dựng lại toàn bộ §2.4 từ token thật trong `index.css` và đỏ khi bất
kỳ cặp nào trượt. Ba cặp không có biên (§2.4) làm hàng rào này bắt buộc chứ không phải tuỳ chọn.

---

## 8. Ngoài phạm vi

- Kiến trúc thông tin của mọi màn — **không đổi**.
- `apps/web` và `DESIGN.md` — không đụng. Hai hệ thị giác **cố ý** khác nhau.
- Bốn lỗi khác trong critique không thuộc thị giác (focus không vào modal, `/requests` không lọc
  theo xe, mã 6 số khó đọc qua điện thoại, lỗi lệch ngày cuối ở lịch sử thuê) — ghi nhận, không làm
  ở đợt này.
- Màu thương hiệu thật của shop: **vẫn chưa có.** Logo đã land nhưng nó được vẽ _từ_
  `--color-accent`, không phải rút _ra từ_ nhận diện thật. `ROADMAP.md` §"chặn ở người" vẫn đúng cho
  `apps/web`; với `apps/staff` thì `index.css` đã lập luận accent ở đây là màu **chức năng**, nên
  đợt này không bị chặn.

## 9. Trôi tài liệu — báo, không tự sửa

Ba chỗ tài liệu lệch với code, phát hiện khi đọc để làm đợt này:

| File                       | Ghi                                          | Thực tế                       |
| -------------------------- | -------------------------------------------- | ----------------------------- |
| `docs/workspaces/staff.md` | `index.css` "cố ý không khai `@theme` riêng" | khai rất nhiều từ Plan B      |
| `docs/workspaces/staff.md` | icon "là ô màu đặc"                          | logo đã land 2026-09-01       |
| `apps/staff/index.html`    | chú thích "vẫn là ô màu đặc, chờ logo thật"  | logo đã land                  |

Sửa ba chỗ này là việc riêng, không gộp vào đợt thị giác.
