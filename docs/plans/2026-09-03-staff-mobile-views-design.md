# `apps/staff` — hình dạng riêng cho màn hẹp

Thiết kế đợt 2026-09-03. Thi công ở plan riêng, chưa viết.

Ràng buộc sản phẩm: [`PRODUCT.md`](../../PRODUCT.md). Hệ thiết kế của `apps/web`:
[`DESIGN.md`](../../DESIGN.md) — **không** áp cho app này.

---

## 0. Vì sao có đợt này, và vì sao nó KHÔNG phải "làm responsive"

Yêu cầu ban đầu là "refactor `apps/staff` cho mobile". Phép đo đầu tiên của tôi — đếm số lần
xuất hiện `sm:`/`md:` trong class — cho ra "9/51 file có breakpoint" và kết luận app là
desktop-first. **Kết luận đó sai.** App không làm responsive bằng cách rắc class, nó làm bằng
cấu trúc, nên phép đếm mù đúng chỗ quan trọng:

- `AppNav` đã có hai biến thể `"sidebar" | "bottom"`; `AppShell` dựng cả hai.
- `rental-calendar.tsx` đã đổi số cột theo bề rộng bằng `matchMedia` + `useSyncExternalStore`.
- Vùng chạm 44×44 đã là luật cưỡng chế (`TOUCH` trong `app-nav.tsx`, cùng ngưỡng với `Button`).
- `index.html` đã có `viewport-fit=cover`.

Ghi lại vì đây là một lớp sai lặp lại được: **đếm tên định danh rồi kết luận về hành vi**. Cách
duy nhất tránh được là dựng app lên và nhìn.

## 1. Đã đo gì, bằng cách nào

Chrome headless qua CDP (`Emulation.setDeviceMetricsOverride`, `mobile: true`), dữ liệu thật từ
`bun run seed:dev` (6 xe, 4 khách, 5 đơn, 3 yêu cầu), đăng nhập bằng tài khoản OWNER thật. Ba bề
rộng: **360** (sàn Android phổ biến), **390**, **1280** (đối chứng desktop).

Phép đo dùng cho từng màn: chiều cao tài liệu · tràn ngang cấp trang · tràn ngang **bên trong**
từng phần tử · số nút mà `elementFromPoint` tại tâm **không** trả về chính nó ("nút không bấm
được") · số phần tử tương tác cao dưới 40px.

> ⚠️ Vòng đo đầu báo "7/10, 7/13, 13/16 nút bị che". **Sai** — nó đếm cả nút của trang nằm sau
> modal, và đo ở vị trí chưa cuộn. Số trong bảng dưới là bản đã sửa, đo trong phạm vi `dialog` và
> đo cả trước lẫn sau khi cuộn hết.

### Kết quả

| #   | Lỗi                                                           | Số đo                                         | Nặng |
| --- | ------------------------------------------------------------- | --------------------------------------------- | ---- |
| 1   | Sheet chi tiết đơn: 4/7 hành động nằm dưới nếp gấp, không báo | thừa 260px (276px ở 360)                      | 🔴   |
| 2   | `Nhân viên`: 0/3 nút hành động nằm trong khung nhìn ở 390px   | wrap 358/640 · 3/3 ở 1280px                   | 🔴   |
| 3   | `Tạo đơn` không bấm được ở vị trí mở                          | nút 705–749, nav 724–780 → 19/44px sống       | 🔴   |
| 4   | Timeline giấu phần lớn nội dung                               | 390: 356/942 (62%) · 1280: 1022/1839 (44%)    | 🟠   |
| 5   | `currentDayCount()` canh theo bề rộng CỬA SỔ, không phải LƯỚI | đổi sang 14 ngày ở 1280px, lưới chỉ có 1022px | 🟠   |
| 6   | Lịch Tháng: 17 phần tử tương tác cao <40px                    | đánh đổi đã ghi trong `calendar-month.tsx`    | 🟡   |
| 7   | Cột tên xe cụt mất danh tính                                  | hai dòng cùng đọc `Honda…`                    | 🟡   |
| 8   | Đầu trang Lịch chiếm 29% màn hình trước dòng dữ liệu đầu      | 228/780px (desktop 120/780)                   | 🟡   |

**Đo sạch, không đụng tới:** Thống kê · Yêu cầu · Cài đặt · Đổi mật khẩu · sheet "Thêm" (0/6 nút,
không cần cuộn) · nav dưới · tràn ngang cấp trang **0px** ở cả 360 và 390.

Điểm đáng chú ý nhất của bảng trên: **#4 và #5 là lỗi desktop**, không phải lỗi mobile. Ở 1280px
lưới vẫn giấu 44% nội dung.

> ⚠️ **Sửa chẩn đoán #2.** Bản đầu của tài liệu này ghi bảng `Nhân viên` **mất** các cột Vai trò,
> Trạng thái và hai nút ở màn hẹp. Sai — kết luận đó rút ra từ một tấm ảnh chụp. Đo thật: `thead`
> có đủ sáu `<th>` ở cả 390px lẫn 1280px, `tbody` có đủ ba nút `[Duyệt, Phát mã, Phát mã]`. Thứ
> xảy ra là `StaffTable` đặt `min-w-[640px]` trong một khối `overflow-x-auto`, nên ở 390px khối đó
> là **358/640** và **0/3 nút nằm trong khung nhìn**. Không có gì bị bỏ; mọi thứ nằm sau một vùng
> cuộn ngang không có dấu hiệu.
>
> Hệ quả: **#2 và #4 là CÙNG một lớp lỗi** — nội dung bị giấu sau cuộn ngang không báo — chỉ khác
> chỗ xảy ra. Hai bản sửa vẫn khác nhau (bảng thành thẻ; lưới thành danh sách theo ngày), nhưng
> điều kiện nghiệm thu của cả hai là một: **không còn vùng cuộn ngang nào ở hình dạng mobile.**

### Hai lỗi đỏ chung một gốc

Lỗi #1 và #3 không phải lỗi bố cục. Cả hai là **hành động chính nằm cuối một panel cuộn được, không
được neo**. Sheet "Thêm" sạch vì nội dung của nó ngắn hơn khung — cùng component `Modal`, khác kết
quả. Nên `Modal` là chỗ sửa, không phải từng màn.

## 2. Quyết định: hai hình dạng, không phải một hình co lại

Người dùng chọn **tách view riêng cho mobile**. Tôi đề xuất hướng nhẹ hơn (sửa tại tầng component,
giữ một đường code) vì số liệu cho thấy 6/8 màn đã sạch và lỗi nặng nhất nằm ở một component dùng
chung. Người dùng cân nhắc rồi vẫn chọn tách view. Ghi lại để người sau biết đây là **lựa chọn đã
biết giá**, không phải mặc định trôi vào.

Giá phải trả, nói trước: hai hình dạng nghĩa là hai thứ phải giữ đúng cùng lúc, và `apps/staff`
hiện có **0 test component** (`DEBT.md:335`). Vì vậy §6 không phải phần thêm cho đẹp — nó là điều
kiện để lựa chọn này không tự bắn vào chân.

## 3. Cách chọn hình dạng

Theo đúng khuôn đã có trong repo (`AppNav.variant`), không phát minh cơ chế mới.

Nhưng `AppNav` dựng **cả hai** biến thể rồi ẩn bằng CSS. Lịch không làm vậy được: hai hình dạng gọi
query khác nhau và dựng vài trăm node — dựng cả hai là trả giá hai lần ở mọi lần vẽ. Nên dùng một
hook chọn **một** hình dạng:

```ts
useLayoutVariant(): "mobile" | "desktop"; // ngưỡng md = 768px
```

Dựng bằng `useSyncExternalStore` + `matchMedia`, **không** `useEffect` + `useState`.
`rental-calendar.tsx` đã ghi lý do và đã trả giá cho nó: effect chạy SAU lần vẽ đầu, nên hình dạng
sai kịp xuất hiện một khung hình. Một nguồn sự thật cho cả lịch lẫn bảng nhân viên.

## 4. Lịch — bản mobile là danh sách theo ngày

Ở `"mobile"`, chế độ Timeline (lưới ngang) **không dựng**. Thay bằng danh sách nhóm theo ngày: mỗi
nhóm một ngày, mỗi dòng một đơn mang **tên xe đầy đủ + biển số**, tên khách, trạng thái, khoảng
thời gian.

**Cửa sổ thời gian: đúng 7 ngày kể từ ngày neo**, cùng cửa sổ mà `timelineWindow(anchor, 7)` đang
trả cho mobile hôm nay. Chọn vậy để **không đổi hợp đồng dữ liệu**: cùng một query, cùng một
`GridWindow`, chỉ khác cách vẽ. Đổi số ngày là việc riêng, không gộp vào đợt này.

**Ngày không có đơn nào vẫn hiện**, mang dòng "trống cả kỳ" — giống ô trống của Timeline. Bỏ ngày
trống đi thì danh sách ngắn hơn nhưng người đọc mất mốc, và "không có đơn" là thông tin có ích với
người đang xếp lịch.

**Đổi hình dạng giữa phiên** (xoay máy, đổi cỡ cửa sổ) phải giữ nguyên ngày neo và chế độ
Timeline/Tháng đang chọn — cả hai đã nằm ở URL (`rental-calendar.tsx` sở hữu URL), nên điều này
đạt được bằng cách **không** đụng vào state đó, chứ không phải bằng code thêm.

Đóng #4 (không còn vùng cuộn ngang nào để giấu 62% nội dung), #7 (tên xe không còn cụt), #8 (đầu
trang gộp còn một hàng: điều hướng ngày + `Hôm nay` + chuyển chế độ).

Chế độ **Tháng giữ nguyên** ở cả hai hình dạng — đã đo sạch: không tràn, 0 nút không bấm được. #6
(17 phần tử <40px) là đánh đổi `calendar-month.tsx` đã khai bằng văn bản: _"Tháng là mặt phẳng để
QUÉT; mặt phẳng để LÀM là Timeline"_. Không đụng. Nhưng ở mobile, "mặt phẳng để LÀM" giờ là danh
sách theo ngày, nên **danh sách đó phải mang vùng chạm 44px đầy đủ** — nó thừa kế vai trò cũ của
Timeline.

## 5. Nhân viên — bản mobile là thẻ

Mỗi nhân viên một thẻ: avatar + họ tên · email · **vai trò** · **trạng thái** · và **cả hai nút
`Duyệt` / `Phát mã`**. Desktop giữ nguyên bảng.

Thẻ **không phải** để thêm lại thứ đã mất — không có gì mất. Nó để mọi trường và mọi nút nằm
trong khung nhìn mà không đòi ai phải phát hiện ra là bảng cuộn ngang được. Ở 390px hiện tại,
**0/3 nút hành động** nằm trong khung nhìn.

Điều đó quan trọng vì `PRODUCT.md` giải thích luồng phát mã tồn tại **vì** _"nhân viên shop dùng
Zalo nhiều hơn email"_ — một việc sinh ra để làm trên điện thoại. Nút vẫn có trong DOM, chỉ là
người cầm điện thoại không thấy nó.

## 6. `Modal` — neo chân hành động

Áp cho cả hai hình dạng, và cần thiết bất kể chọn hướng nào.

`Modal` nhận thêm khe `footer`. Nội dung cuộn ở giữa; hành động chính nằm ở chân **cố định**, luôn
trên nếp gấp, `padding-bottom` theo `env(safe-area-inset-bottom)`, và không bao giờ bị nav dưới đè.

Đóng #1 và #3. Lưu ý khi thi công: cuộn hết panel hiện tại làm nút đóng `✕` trôi khỏi vùng thấy
được — chân cố định phải không tạo ra phiên bản mới của chính lỗi đó ở đầu panel.

## 7. Bug desktop #5

`currentDayCount()` đo `window.matchMedia`. Thứ quyết định số cột vừa hay không là bề rộng **vùng
lưới**, mà vùng đó nhỏ hơn cửa sổ đúng bằng bề rộng sidebar. Sửa: `ResizeObserver` trên chính phần
tử lưới.

Nằm ngoài phạm vi mobile, nhưng cùng file và cùng nguyên nhân — sửa rời ra sẽ đắt hơn.

## 8. Lưới test — làm TRƯỚC, không làm sau

`happy-dom` + `@testing-library/react`. Viết test cho **hành vi hiện tại** trước khi đổi bất cứ gì,
để mỗi thay đổi sau đó có đối chứng:

- `Modal` — hành động nằm trong vùng thấy được khi nội dung dài hơn khung
- `StaffTable` — ở hình dạng mobile, năm trường và hai nút đều có mặt
- `useLayoutVariant` — đổi khi ngưỡng đổi, và **không** dựng sai hình dạng ở lần vẽ đầu
- Lịch mobile — không sinh phần tử nào có `overflow-x` cuộn được

Mỗi test phải **thấy đỏ vì đúng lý do** trước khi có implementation, theo `.claude/CLAUDE.md` §4:
một test xanh chứng minh ít hơn vẻ ngoài của nó.

Đóng nợ ⛔ `DEBT.md:335`.

## 9. Không nằm trong phạm vi

Thống kê · Yêu cầu · Cài đặt · Đổi mật khẩu · sheet "Thêm" · nav dưới. Cả sáu đã đo sạch ở 360 và
390 — không đụng.

Cũng không nằm trong đợt này: `DEBT.md:308` (Eden Treaty nuốt rejection ở `rental-form.tsx`,
`stats-page.tsx`, `staff-list-page.tsx`) và `DEBT.md:126` (chưa test Eden bọc lỗi thật). Hai món đó
chạm đúng các file này nhưng là lớp lỗi khác; gộp vào sẽ làm diff không review được.

## 10. Nghiệm thu — chạy lại đúng bộ đo của §1

| Điều kiện đạt                                                     | Đối chiếu với   |
| ----------------------------------------------------------------- | --------------- |
| Sheet chi tiết: 0/7 hành động nằm dưới nếp gấp                    | #1 (đang 4/7)   |
| `/staff` ở 390px: không vùng cuộn ngang, 3/3 nút trong khung nhìn | #2 (đang 0/3)   |
| `Tạo đơn` bấm được trên toàn bộ 44px chiều cao                    | #3 (đang 19/44) |
| Lịch mobile: không phần tử nào có vùng cuộn ngang                 | #4              |
| Lưới desktop: `scrollWidth ≤ clientWidth` ở 1280px                | #4, #5          |
| Dòng lịch mobile: mọi vùng chạm ≥ 44px                            | §4              |
| Tràn ngang cấp trang vẫn 0px ở 360 và 390                         | không hồi quy   |
| `bun run typecheck` và `bun test` đều exit 0                      |                 |

Đo bằng chính script CDP đã dựng ở đợt này, không đo bằng mắt.

## 11. Cạm bẫy khi thi công

- **Serena báo sai trong repo này** (`DEBT.md:127`): `find_referencing_symbols` từng trả **0 tham
  chiếu** cho một hàm có **25 chỗ dùng trên 8 file**; `rename_symbol` báo thành công nhưng bỏ sót
  import. `.claude/CLAUDE.md` bắt buộc dùng `find_referencing_symbols` trước khi đổi tên export —
  đọc luật đó thành **Serena VÀ grep**, đừng tin một mình "0 reference".
- **Dev server của `apps/staff` không chạy được trên Node 21.7.1** (mặc định của máy này):
  `rolldown` gọi `util.styleText` với mảng `['underline','gray']`, chỉ Node ≥22 nhận. Dùng
  `nvm use 22`.
- `scripts/seed-dev-images.sh` cần `ffmpeg`, máy này không có. Ảnh mẫu của đợt đo được sinh bằng
  PIL, **giữ nguyên nhãn `ANH MAU - DEV ONLY`** — nhãn đó là điểm của script, không phải trang trí.
