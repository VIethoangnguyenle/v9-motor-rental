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
> chỗ xảy ra. Và chính vì cùng lớp lỗi, hai chỗ được sửa bằng hai mức khác nhau, do người dùng
> chọn: bảng nhân viên đổi **cấu trúc** (thành thẻ, §5), lịch giữ cấu trúc và chỉ thêm **dấu hiệu**
> (§4). Ít dòng thì thẻ đáng công; một lưới nhiều cột thì không.

### Hai lỗi đỏ chung một gốc

Lỗi #1 và #3 không phải lỗi bố cục. Cả hai là **hành động chính nằm cuối một panel cuộn được, không
được neo**. Sheet "Thêm" sạch vì nội dung của nó ngắn hơn khung — cùng component `Modal`, khác kết
quả. Nên `Modal` là chỗ sửa, không phải từng màn.

## 2. Quyết định: hình dạng thứ hai ĐÚNG MỘT CHỖ

Quyết định đi qua hai vòng, và vòng sau đúng hơn vì dữ liệu đúng hơn.

Vòng đầu, khi tôi còn đang báo sai rằng bảng nhân viên **mất** cột, người dùng chọn tách view
riêng cho mobile ở cả lịch lẫn bảng. Tôi đề xuất hướng nhẹ hơn và người dùng vẫn chọn tách.

Vòng sau, sau khi đo lại và biết không có gì bị mất, người dùng chọn lại: **thẻ cho Nhân viên, báo
cuộn cho Lịch**. Nên đợt này chỉ sinh **một** hình dạng thứ hai — bảng nhân viên — chứ không phải
hai. Ghi lại cả hai vòng vì bản thân việc đó là bài học: một chẩn đoán sai không dừng ở chỗ nó
sai, nó kéo theo cả lựa chọn kiến trúc.

Giá phải trả, nói trước: một hình dạng thứ hai vẫn là hai thứ phải giữ đúng cùng lúc, và
`apps/staff` hiện có **0 test component** (`DEBT.md:335`). Vì vậy §8 không phải phần thêm cho đẹp
— nó là điều kiện để lựa chọn này không tự bắn vào chân.

## 3. Cách chọn hình dạng

Theo đúng khuôn đã có trong repo (`AppNav.variant`), không phát minh cơ chế mới.

Nhưng `AppNav` dựng **cả hai** biến thể rồi ẩn bằng CSS. Bảng nhân viên không làm vậy được: mỗi
dòng gọi `useAvatarUrl` (xem `StaffNameCell`), nên dựng cả hai hình dạng là **nhân đôi số request
ảnh đại diện**. Nên dùng một hook chọn **một** hình dạng:

```ts
useLayoutVariant(): "mobile" | "desktop"; // ngưỡng md = 768px
```

Dựng bằng `useSyncExternalStore` + `matchMedia`, **không** `useEffect` + `useState`.
`rental-calendar.tsx` đã ghi lý do và đã trả giá cho nó: effect chạy SAU lần vẽ đầu, nên hình dạng
sai kịp xuất hiện một khung hình.

Hook này có **đúng một** chỗ dùng: bảng nhân viên (§5). Lịch **không** dùng nó — xem §4.

## 4. Lịch — giữ lưới, làm cho việc cuộn nhìn thấy được

> **Đổi so với bản đầu.** Bản đầu thay Timeline bằng danh sách theo ngày ở mobile. Bỏ. Lý do:
> chẩn đoán #2 sai đã kéo theo cả hướng — khi biết không có gì bị mất mà chỉ là nội dung nằm sau
> một vùng cuộn không có dấu hiệu, thì thứ phải sửa là **dấu hiệu**, không phải cấu trúc. Người
> dùng chọn lại với dữ liệu đúng: thẻ cho Nhân viên, báo cuộn cho Lịch.

> ⚠️ **Sửa lần hai.** Bản trước của mục này liệt "ghim cột Xe" thành việc phải làm. **Việc đó đã
> có sẵn**: `calendar-timeline.tsx:117` và `:144` đều mang `sticky left-0`, và đo hành vi xác nhận
> — cuộn hết sang phải thì ô tên xe vẫn đứng nguyên ở `left = 17px`. Tôi lại kết luận từ một tấm
> ảnh thay vì đọc code và đo. Bỏ khỏi phạm vi.

Timeline giữ nguyên ở mọi bề rộng. Hai việc:

1. **Dấu hiệu còn nội dung bên phải** — đổ bóng hoặc vệt mờ ở mép, chỉ hiện khi còn phần chưa xem
   và tắt khi đã cuộn hết. Đây là thứ đóng #4: vùng lưới **vẫn** cuộn được như hôm nay, nhưng thôi
   im lặng về điều đó.
2. **Đầu trang gộp còn một hàng** ở màn hẹp: điều hướng ngày + `Hôm nay` + chuyển chế độ. Đóng #8
   (đang chiếm 29% màn hình).

### #7 — cột xe cụt: bài toán bề rộng, và không nới ra được

Cột đã ghim rồi, nên #7 không phải chuyện trôi mất mà là chỗ quá hẹp. Đo ở 390px
(`--veh-col: 5.5rem` = 88px):

| Xe                   | Chữ cần | Đủ chỗ? |
| -------------------- | ------- | ------- |
| BMW G310GS           | 121px   | ❌      |
| Ducati Scrambler 800 | 163px   | ❌      |
| Honda CB500X         | 125px   | ❌      |
| Honda Rebel 500      | 137px   | ❌      |
| Kawasaki Z900        | 124px   | ❌      |
| Yamaha MT-07         | 123px   | ❌      |

**Cả sáu đều cụt**, không phải vài dòng cá biệt.

Cách sửa hiển nhiên — nới cột lên 163px — **bị chính số liệu bác**: khung nhìn ở 390px chỉ có
356px, nên cột ghim sẽ ăn **46%** màn hình cho riêng cái tên, còn lại ~1,6 cột ngày. Đổi một lỗi
lấy một lỗi nặng hơn.

Nên: **giữ cột hẹp, cho chữ xuống hai dòng** (bỏ `truncate`, ô đã có `min-h-12` nên có chỗ), và nới
vừa phải lên `7.5rem` = 120px để dòng dài nhất (`Scrambler 800`) không phải cắt tiếp. Điều kiện
nghiệm thu là **không tên xe nào bị cắt ở 390px**, không phải một con số bề rộng cụ thể — con số
là phương tiện, chữ đọc được mới là đích.

Không đóng được bằng cách này: lưới vẫn cần cuộn để xem hết 7 ngày ở 390px. Đó là đánh đổi đã
chọn — cuộn có báo, thay vì một cấu trúc thứ hai phải bảo trì.

Chế độ **Tháng giữ nguyên** — đã đo sạch: không tràn, 0 nút không bấm được. #6 (17 phần tử <40px)
là đánh đổi `calendar-month.tsx` đã khai bằng văn bản: _"Tháng là mặt phẳng để QUÉT; mặt phẳng để
LÀM là Timeline"_. Lý lẽ đó **vẫn đứng vững** sau thay đổi này, vì Timeline vẫn còn ở mobile —
khác với bản đầu, nơi bỏ Timeline đi sẽ làm câu đó thành vô nghĩa.

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

- `Modal` — khi nội dung dài hơn khung, hành động vẫn nằm trong vùng thấy được
- `StaffTable` — hình dạng thẻ mang đủ năm trường và cả ba nút; hình dạng bảng giữ nguyên sáu cột
- `useLayoutVariant` — đổi khi ngưỡng đổi, và **không** dựng sai hình dạng ở lần vẽ đầu
- Lịch — cột "Xe" giữ `position: sticky`, và dấu hiệu mép phải **hiện khi còn phần chưa xem, tắt
  khi đã cuộn hết**. Hai chiều, không chỉ một: một dấu hiệu luôn bật thì không mang tin gì.

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

| Điều kiện đạt                                                     | Đối chiếu với     |
| ----------------------------------------------------------------- | ----------------- |
| Sheet chi tiết: 0/7 hành động nằm dưới nếp gấp                    | #1 (đang 4/7)     |
| `/staff` ở 390px: không vùng cuộn ngang, 3/3 nút trong khung nhìn | #2 (đang 0/3)     |
| `Tạo đơn` bấm được trên toàn bộ 44px chiều cao                    | #3 (đang 19/44)   |
| Lịch 390px: cột "Xe" ghim, không trôi khi cuộn ngang              | #4, #7            |
| Lịch 390px: dấu hiệu mép phải hiện khi còn nội dung chưa xem      | #4 (đang im lặng) |
| Đầu trang Lịch ≤ 15% chiều cao màn ở 390px                        | #8 (đang 29%)     |
| Lưới desktop: `scrollWidth ≤ clientWidth` ở 1280px                | #4, #5            |
| Tràn ngang cấp trang vẫn 0px ở 360 và 390                         | không hồi quy     |
| `bun run typecheck` và `bun test` đều exit 0                      |                   |

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
