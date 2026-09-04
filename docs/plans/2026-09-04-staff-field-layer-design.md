# `apps/staff` — tầng vận hành cho điện thoại: màn Hiện trường

Ngày 2026-09-04. Nối tiếp [`2026-09-03-staff-mobile-views-design.md`](2026-09-03-staff-mobile-views-design.md),
và cố ý giải một bài khác.

## 0. Vì sao có đợt này

Đợt 2026-09-03 giải bài **"vừa màn và bấm được"**: đo bằng probe, sửa chỗ tràn, đổi bảng thành thẻ
ở hai màn. Nó cố ý KHÔNG giải bài "dùng sướng", và §9 của nó liệt kê sáu màn "đã đo sạch — không
đụng". _Đo sạch_ nghĩa là **không vỡ**; nó chưa bao giờ nghĩa là **tốt**.

Đợt này giải bài còn lại, và phạm vi do người dùng chốt: mobile được phép có **tầng vận hành
riêng**, không phải bản thu nhỏ của desktop.

## 1. Bối cảnh dùng, và nó ép ra cái gì

Người dùng xác nhận: **ngoài đường là chính**. `PRODUCT.md` §Operating Context chống lưng — shop
mang xe tới khách sạn khách, không bắt khách tới cửa hàng. Nên phần lớn thời gian app này được mở,
nhân viên đang:

- đứng cạnh một chiếc xe, không ngồi trước bàn;
- dùng **một tay**, tay kia giữ xe hoặc giấy tờ;
- ngoài nắng, và trên 4G chập chờn;
- làm đúng một việc: **ghi bằng chứng bàn giao**.

Ba hệ quả trực tiếp, không phải sở thích:

1. Màn hình chỉ được hỏi **một** câu tại một thời điểm.
2. Hành động chính phải nằm **trên nếp gấp**, không phải sau một lần cuộn.
3. Số điện thoại phải **bấm gọi được**, không phải chữ để chép tay.

## 2. Cấu trúc đã chọn, và hai cấu trúc bị loại

Ba cấu trúc được đưa lên bàn quyết định; người dùng chốt **"Ống kính là màn chính"**.

| Cấu trúc | Luận đề | Kết quả |
| --- | --- | --- |
| **Ống kính là màn chính** | Ghi bằng chứng là màn chính, mọi thứ khác treo quanh nó | ✅ **chọn** |
| Bảng việc phải dọn hết | Danh sách việc hôm nay xếp theo giờ, phải rỗng trước khi hết ca | không chọn |
| Sổ tay bàn giao | Thủ tục có thứ tự, không cho nhảy bước | không chọn |

Lý do ghi lại cả hai cái bị loại: **"Sổ tay bàn giao" là cái nguy hiểm nhất** và nếu đợt sau ai đó
định làm lại nó thì đây là chỗ đọc trước. Cưỡng chế thứ tự bước gãy ngay ở ca thường gặp nhất —
khách tới trễ, khách quên giấy tờ, khách đổi ý về ngày trả — và một quy trình không cho nhảy bước
sẽ bị nhân viên bỏ qua bằng cách ghi ra giấy, tức mất luôn dữ liệu.

Cấu trúc được chọn còn mang một kỷ luật mượn: **một trục dọc duy nhất chi phối cả màn, mỗi tấm ảnh
ghim vào đúng pha và đúng mốc giờ**, không tấm nào trôi tự do.

## 3. ⚠️ Không có khung ngắm trong trang, và đó là quyết định

Tên cấu trúc dễ đọc nhầm. App **không** dựng viewfinder trong trang.

`handover-photos.tsx` dùng `<input type="file" capture="environment">`, tức camera của **hệ điều
hành** chiếm trọn màn hình rồi trả ảnh về. Giữ nguyên cơ chế đó thay vì chuyển sang `getUserMedia`:

- không phải xin quyền camera riêng, thứ hỏng theo từng đời iOS Safari trong PWA;
- ảnh của camera HĐH tốt hơn hẳn khung hình `getUserMedia`;
- ít mã hơn, và mã đó đã chạy thật.

Cái giá: camera HĐH **cướp màn hình rồi trả người dùng về**. Nên màn này là **bệ dàn dựng và điểm
quay về**, không phải khung ngắm — và toàn bộ cách bày trạm phục vụ đúng điều đó: trạm đang nợ mở
sẵn, mọi trạm khác thu nhỏ, để chỗ đứng còn nguyên lúc họ quay lại.

## 4. Bằng chứng nợ theo BƯỚC CHUYỂN, không theo "đơn này đáng lẽ có ảnh gì"

`packages/shared/src/domain/rental-evidence.ts` — TDD nghiêm, mutation test hai đột biến đều bị bắt.

| Trạng thái | Nợ trước bước chuyển kế tiếp |
| --- | --- |
| `BOOKED` (sắp bấm "Đã giao xe") | `DOCUMENT`, `HANDOVER` |
| `ONGOING` (sắp bấm "Đã nhận lại xe") | `RETURN` |
| `COMPLETED` · `CANCELLED` | — |

Ghép theo bước chuyển chứ không theo "đơn này đáng lẽ có ảnh gì": xe đã giao rồi mà thiếu ảnh lúc
giao là lỗ hổng có thật, nhưng nó thuộc quá khứ và **không** chặn việc nhận lại xe. Trộn hai câu
chuyện vào một danh sách là bắt người đứng ở lề đường đi sửa một việc đã trôi qua.

**Đây là hướng dẫn, không phải hàng rào.** Sản phẩm chưa bao giờ nói thiếu ảnh thì cấm giao xe, nên
màn hình không được tự dựng ra luật đó: nút đổi trạng thái luôn bấm được. Ngày nào muốn biến nó
thành ràng buộc thật thì chỗ sửa là `availableTransitions` ở domain và route tương ứng, không phải
tầng trình bày.

## 5. Hai hình dạng, chọn bằng `useLayoutVariant()`

| Bề rộng | Hình dạng |
| --- | --- |
| < 768px | một cột; việc đang mở nở ra **tại chỗ** trong danh sách, nên trục độ gấp không bị cắt đôi |
| ≥ 768px | hai cột `minmax(0,18rem) / minmax(0,1fr)`: danh sách trái, việc đang mở phải |

Hình dạng thứ hai **không** phải để lấp chỗ trống. Đo ở 820px trước khi sửa: một cột đơn kéo nút
"Chụp giấy tờ" ra **1160px**. Cột phải bị chặn bề rộng là thứ đang sửa lỗi đó; chỗ trống chỉ là hệ quả.

Dùng `useLayoutVariant()` (một hình dạng) chứ không dựng cả hai rồi ẩn bằng CSS — cùng lý do đợt
trước đã ghi cho bảng nhân viên: dựng cả hai là nhân đôi số request ảnh.

## 6. Bottom nav: Hiện trường thay Thống kê ở ô đầu

Bảng mục của đợt 2026-09-03 gán Thống kê cho ô trực tiếp thứ nhất — đúng ở thời điểm đó, vì màn
Hiện trường chưa tồn tại. Trên điện thoại, thứ cần trong một chạm là việc đang phải làm ngoài
đường, không phải doanh thu tháng. Thống kê lùi vào "Thêm". Vẫn đúng 3 ô.

Sửa luôn hai chỗ giòn lộ ra khi đụng vào: bản cũ lấy hai ô bằng `const [home, lich, ...rest] =
NAV_ITEMS` (chèn một mục vào đầu bảng là bottom nav lặng lẽ đổi ô, không lỗi biên dịch) và
hard-code `nav-stats`/`nav-calendar` thay vì đọc `item.icon` (đổi đích mà quên đổi hình cho ra một
ô mang hình của trang khác). Giờ chọn theo **ý định** (`BOTTOM_DIRECT`) và icon đến từ chính mục đó.

Mục `{ kind: "soon", label: "Bàn giao" }` thành link thật tới `/field`.

## 7. Đã đo được gì

Chụp thật qua CDP bằng `scripts/mobile-probe/screens.mjs` (đã thêm `/rentals` và `/field` vào danh
sách route — thiếu tên ở đó là một màn không ai nhìn, probe vẫn xanh và vẫn mù):

| Đo | Kết quả |
| --- | --- |
| Tràn ngang ở 360 · 390 · 820px | **0px** ở cả ba |
| `scrollHeight` của `/field` ở 360 và 390 | **780px** = đúng chiều cao khung nhìn |
| Hành động nằm dưới nếp gấp | **0** — cả nút chụp lẫn nút đổi trạng thái đều trên nếp gấp |
| `typecheck` · `lint` · `bun test` | xanh; 557 pass / 0 fail |
| Probe hồi quy (`sheet-actions`, `staff-table`, `calendar-geometry`, `vehicle-column`) | trả đúng số cũ — không hồi quy |

Con số "0 hành động dưới nếp gấp" đáng đặt cạnh món nợ đang mở của sheet chi tiết đơn: ở đó vẫn là
**3/7** (`DEBT.md`). Hai màn giải cùng một bài theo hai cách, và cách của màn này là **không có gì
để cuộn**.

## 8. Hạn chế đã biết

- **Hàng đợi chỉ đọc trang 1.** `rentalsQueueQuery(1)`, 20 dòng. Một `?rental=` trỏ vào đơn nằm ở
  trang 2 sẽ rơi về việc gấp nhất thay vì mở đúng đơn đó. Cố ý: màn này không có phân trang vì
  nhân viên đứng ngoài đường không lật trang. Ngày hàng đợi thường xuyên quá 20 dòng thì đó là tín
  hiệu của một vấn đề vận hành, không phải của màn hình này — nhưng khi đó cần `GET /rentals/:id`,
  thứ API hiện **không có**.
- **Không có `GET /rentals/:id`.** Đây là lý do màn này lấy đơn từ hàng đợi thay vì tự tải. Nếu đợt
  sau thêm route đó, chỗ sửa là `open` trong `field-page.tsx`.
- **Bốn món nợ của đợt 2026-09-03 vẫn nguyên**: đầu trang Lịch 22%, sheet chi tiết 3/7 dưới nếp
  gấp, `--veh-col` không đơn điệu, `ToggleGroup` lệch `gap`. Đợt này không đụng tới chúng.
- **Chưa làm** trong tầng mobile: Cài đặt và Đổi mật khẩu vẫn dùng hình dạng cũ (cả hai đã đo sạch
  ở đợt trước và là màn ít dùng ngoài đường nhất).

## 9. Đợt hai — bốn surface còn lại (cùng ngày)

Đây là **mở rộng surface đã có** trong thế giới thị giác đã chốt, không phải hướng mới, nên không
có vòng quyết định nào.

- **Khách hàng → thẻ ở màn hẹp** (`components/customers/customer-cards.tsx`). Bảng khoanh vùng cuộn
  ngang bằng `min-w-[780px]`, nên ở 390px người dùng chỉ thấy hai cột đầu — cột **Tình trạng**, thứ
  mà JSDoc của chính bảng gọi là "lý do màn này tồn tại", nằm ngoài khung nhìn. Tín hiệu vận hành
  CÓ tồn tại và người dùng điện thoại không bao giờ thấy nó. Đo bằng ảnh chụp, không phải suy. Ba
  hằng dùng chung (`WHEN_LABEL`, `whenOf`, `WHEN_FMT`) chuyển sang `lib/customer-activity.ts` để
  hai hình dạng không lệch nhau.
- **Yêu cầu → bộ lọc vào URL** (`lib/requests-search.ts`). Màn danh sách cuối cùng còn giữ bộ lọc ở
  `useState`; F5 và Back đều mất chỗ. ⚠️ Bẫy đã cắn: biểu diễn "xem tất cả" bằng việc THIẾU
  `?status=` **không chạy được** — `validateSearch` của TanStack Router luôn trả đủ khoá, nên page
  không phân biệt được "URL chưa nói gì" với "chọn Tất cả", và mặc định tụt từ "Chưa xử lý" xuống
  "Tất cả". Phải có sentinel `?status=ALL`. Khoá bằng test, đã qua mutation test.
- **Trạng thái rỗng của Yêu cầu** giờ nói ba thứ theo thứ tự người cần: đang lọc gì · yêu cầu tới
  từ đâu · làm gì tiếp — thay cho một dòng chữ xám trên 1000px khoảng trắng.
- **Nhân viên**: `—` trần thành "Chưa có số điện thoại", và số có thật thành link `tel:`. Trong
  bảng, `—` nằm dưới một `<th>` nên đọc được là "cột này rỗng"; trên thẻ không có tiêu đề cột nào,
  nên cùng ký tự đó đọc ra như dữ liệu hỏng.
- **Thống kê: KHÔNG đụng.** Bản nháp đầu định nén ba thẻ doanh thu vì tưởng chúng đẩy "Cần chú ý"
  xuống dưới nếp gấp. Đo lại thì sai: ảnh chụp ở `deviceScaleFactor: 2`, nên thẻ cao ~95px CSS chứ
  không phải 190px, và "Cần chú ý" bắt đầu ở ~485px — trên nếp gấp. Việc xếp dọc cũng đã có lý lẽ
  đo được ("48.200.000 ₫" không sống nổi trong cột 100px). Ghi lại vì đây là một lần suýt sửa thứ
  không hỏng.

## 10. Đợt ba — thanh điều hướng và màn Lịch (cùng ngày)

### Bottom nav: năm ô, "Lên đơn" ở giữa

Thanh có **năm ô**, số LẺ để ô hành động rơi đúng giữa:
`Thống kê · Lịch · [＋ Lên đơn] · Yêu cầu · Thêm`. Ô giữa là `<button>` nền accent, không phải
`<Link>` — bốn ô kia dẫn tới một nơi, ô này TẠO RA dữ liệu, và nhầm hai loại đó là nhầm thứ không
quay lại được với thứ quay lại được. Tạo xong thì điều hướng sang `/rentals`: thanh nav nằm trên
mọi trang nên nó không có chỗ đặt câu "đã tạo xong", mà im lặng sau một hành động không quay lại
được là tệ nhất — chính màn hình đó là lời xác nhận.

⚠️ **Ô đầu đã đổi hai lần trong cùng ngày — đọc git history mà không có đoạn này thì tưởng là trôi
ngẫu nhiên.** Bản đầu của đợt này đặt **Hiện trường** ở ô đầu, lý lẽ: thứ cần trong một chạm là
việc đang phải làm ngoài đường, không phải doanh thu tháng. Người dùng quyết định ngược lại — **trang
chủ là Thống kê** — và đó là quyết định sản phẩm, không phải kỹ thuật. Hiện trường lùi vào "Thêm"
(đã kiểm: sheet chứa `Đơn thuê · Khách hàng · Hiện trường · Nhân viên`, link trỏ đúng `/field`).

Việc đưa "Lên đơn" vào thanh nav thì GIỮ NGUYÊN, và giờ nó có lý lẽ mạnh hơn chứ không yếu đi: nút
đó từng sống trên đầu màn Thống kê, tức nó phụ thuộc vào việc màn nào đang chiếm ô đầu — một sự phụ
thuộc vừa chứng minh là mong manh. Ở thanh nav nó tới được từ MỌI trang.

Hệ quả phải xử: màn Thống kê ở mobile giờ có "Lên đơn" hai lần (đầu trang + thanh nav). Nút đầu
trang ẩn ở màn hẹp, giữ ở màn rộng — sidebar desktop không có ô hành động nào, nên ở đó nó vẫn là
đường vào duy nhất.

Sheet "Thêm" thêm tay nắm kéo và tiêu đề nhìn thấy được; mỗi hàng có mũi tên để đọc ra là "đi tới"
chứ không phải một nhãn không bấm được.

Đo ở 360px: năm ô, không nhãn nào vỡ dòng, không tràn ngang.

### Lịch trên màn hẹp: bảng MỘT NGÀY, không phải lưới nén

Lưới timeline cần **974px** để vẽ 7 ngày × 6 xe, màn 390px chỉ hiện **356px**. Đợt 2026-09-03 đã
làm việc cuộn ngang đó *nhìn thấy được* (`ScrollHint`) — nhưng nhìn thấy một thao tác dở không biến
nó thành tốt.

Đổi CÂU HỎI thay vì nén lưới. Lưới trả lời "cả kỳ trông thế nào"; nhân viên cầm điện thoại hỏi
"hôm nay xe nào đi, xe nào về". `CalendarDay` trả lời câu thứ hai: xe có việc xếp theo mốc giờ ở
trên, xe trống gom thành một khối gọn phía dưới (đó là câu trả lời cho "còn con nào cho khách đang
đứng đây không"). Cuộn DỌC, không cuộn ngang. Câu thứ nhất không mất — nó còn nguyên ở chế độ
Tháng và ở màn rộng.

Chọn hình dạng bằng `useLayoutVariant()` (matchMedia trên CỬA SỔ), KHÔNG bằng `useCalendarDayCount`
(ResizeObserver trên vùng lưới): đây là câu hỏi "trang này mang hình dạng nào", cùng loại với
nav dưới ↔ sidebar. Nhãn nút chế độ đổi theo: ở màn hẹp `timeline` hiện là **"Ngày"**, vì giữ chữ
"Timeline" cho một thứ không phải timeline là để nút nói sai thứ nó mở ra.

⚠️ **Bẫy đã cắn:** bản đầu của `dutyOn` trả "Đang ngoài đường cả ngày" cho MỌI đơn phủ trọn ngày,
nên một đơn `BOOKED` hiện chip "Đã đặt" ngay cạnh dòng chữ nói xe đang chạy ngoài đường — hai kênh
trên cùng một thẻ nói ngược nhau. Chỉ thấy được bằng ảnh chụp. Động từ giờ rẽ theo `status`.

### Probe phải học hình dạng mới

`calendar-geometry.mjs` truy vấn thẳng `.overflow-x-auto`; ở màn hẹp phần tử đó không còn tồn tại,
nên nó đọc `getBoundingClientRect()` của `null`, in ra `undefined` và **không thoát khác 0** — probe
mù mà vẫn trông như chạy được, đúng lớp lỗi `README.md` của thư mục đó liệt kê. Nay nó nhận biết cả
hai hình dạng và báo `LỖI:` tường minh khi không thấy gì.

Đo lại sau khi đổi: phần đầu **124px/780px (16%)**, tràn ngang **0px**, cuộn ngang biến mất hoàn toàn.

### Ba món nợ 2026-09-03 đã đóng

- `--veh-col` đơn điệu trở lại (120/120/130): bỏ `md:[--veh-col:7rem]` — 112px là giá trị DUY NHẤT
  trong dãy không đủ cho tên xe rộng nhất (cần 119px), nên bỏ đi vừa làm dãy đơn điệu vừa xoá chỗ
  hẹp nhất.
- `ToggleGroup` đổi `gap-2` → `gap-1`, khớp toolbar bọc ngoài nó.
- Đầu trang Lịch: 22% → 16% (xem `docs/DEBT.md`).

## 11. Chuyển động (cùng ngày)

Hệ chuyển động đã có sẵn và có **hàng rào**: `--ease-enter/exit/standard`, ba thang thời lượng
(120/180/280ms), trần CỨNG 400ms với đúng một ngoại lệ đã khai (`just-changed` 600ms), và
`motion-budget.test.ts` đọc thẳng `index.css` để bắt. Đợt này thêm **ba** chỗ, không thêm cho có.

| Chỗ | Việc nó giải thích | Thời lượng |
| --- | --- | --- |
| `@utility pinned` | Ảnh vừa chụp đáp xuống và ghim vào trạm của nó | `--duration-quick` 180ms |
| `@utility day-enter-next/prev` | Lật ngày trên Lịch có HƯỚNG | `--duration-quick` 180ms |
| Nút "Lên đơn" ở giữa thanh | Cú bấm được ghi nhận trong lúc chunk form đang nạp | `--duration-instant` 120ms |

**Khoảnh khắc dàn dựng là `pinned`.** Nhân viên bấm chụp, camera của hệ điều hành CHIẾM TRỌN màn
hình, rồi trả họ về. Không có gì đánh dấu thì tấm mới chỉ lặng lẽ xuất hiện trong một hàng đã có
vài tấm, và câu "tấm vừa chụp đã lưu chưa" không có câu trả lời nào ngoài đếm lại. `PRODUCT.md`
nguyên tắc #3 coi ảnh bàn giao là bằng chứng bảo vệ cả hai phía — "đã ghi được chưa" đáng được trả
lời bằng chuyển động.

Nó chỉ chạy cho ảnh vừa upload TRONG PHIÊN (`justPinned` là state cục bộ, không suy từ dữ liệu).
Không có ràng buộc đó, hiệu ứng chạy mỗi lần trục được dựng lại và thôi là phản hồi.

**Không thêm ms nào vào `index.css`** — cả ba dùng token có sẵn, nên trần 400ms và bảng ngoại lệ
không phải đụng tới.

### Đo, không suy

`motion-budget.test.ts` tự ghi rõ nó KHÔNG canh việc hiệu ứng có chạy hay không, và `index.css`
cảnh báo Tailwind bỏ qua utility sai tên trong im lặng. Nên đo bằng CDP trên trang thật:

| Đo | Kết quả |
| --- | --- |
| `.pinned` | `animation-name: v9-pinned` · `0.18s` |
| `.day-enter-next` | `animation-name: v9-day-enter` · `0.18s` · `cubic-bezier(0.16, 1, 0.3, 1)` |
| Bấm ‹ | class đổi sang `day-enter-prev`, `--v9-day-from: -0.75rem` |
| `prefers-reduced-motion: reduce` | cả hai về **1ms** — bỏ quãng đường, giữ đích đến |

⚠️ Lần quét đầu tôi kết luận nhầm rằng `.pinned` không sinh ra rule nào, vì probe dò `selectorText`
sai cách. Dựng một phần tử mang class rồi đọc `getComputedStyle` mới là phép đo đúng — ghi lại vì
đây là cách kiểm duy nhất không phụ thuộc Tailwind emit rule theo hình dạng nào.

## 12. Nhận diện trên trang chủ `apps/staff`

Trang chủ (Thống kê) mang khoá nhận diện: mark + chữ "V9 MOTOR RENTAL", trên tiêu đề trang.

### Vì sao là bản MỘT MÀU, không phải mark gốc

Mark gốc (`apps/web/public/brand/v9-mark.svg`, chốt 2026-09-03) vẽ **trắng** cho thế giới tối của
`apps/web` — dán nguyên vào nền `canvas` (#f8fafc) là một hình vô hình. Ba răng nhấn của nó là
`#f72b28`, tức accent **thương hiệu**, khác `--color-accent` (#0067c8) vốn là accent **giao diện**
của app này. Hai đường đi hỏng:

- tô lại ba răng bằng xanh = tự ý đổi nhận diện đã chốt;
- giữ nguyên đỏ = nhét một hex ngoài hệ token vào một app có hàng rào token (`theme-tokens.test.ts`).

Đường thứ ba do chính `DESIGN.md` §9 mở ra: *"Ba răng đỏ không mang thông tin nào: bỏ hết màu thì
mark vẫn đọc đủ. Đây là điều kiện để nó sống ở chỗ in một màu và ở chế độ tương phản cao."* Bản một
màu vì vậy **không phải bản rút gọn** — nó là một trong hai cách dùng đã được khai.

`currentColor` chứ không token cứng: app có BA trạng thái theme, nên mark đi theo màu chữ của chỗ
nó đứng. Một `fill="var(--color-ink)"` đúng ở bản sáng và chìm ở bản tối.

Ba răng ở 120° giữ thành một `<path>` RIÊNG dù màu đang giống 21 răng kia: ngày shop quyết đưa
accent thương hiệu vào app này thì chỗ sửa là đúng một thuộc tính.

### Đo

| Đo | Kết quả |
| --- | --- |
| Bản sáng | 32×32 · `color: oklch(0.4 0.016 255)` = `ink-soft` |
| Bản tối | 32×32 · `color: oklch(0.82 0.012 255)` = `ink-soft` của bản tối |
| Tràn ngang ở 360px | 0px |

Khớp `DESIGN.md` §9 ("đọc được ở 32px — đã đo"): vành vẫn ra răng cưa và số 9 vẫn đọc được.

### Còn treo, không đụng

`apps/staff/public/icon-{192,512}.png` vẫn là hai file chưa rõ nội dung (`DESIGN.md` §9 "Còn
treo": `ROADMAP.md` ghi chúng đã xong bằng "logo mô tô thật", nhưng shop không có logo thật). Giờ
mark đã có mặt trong app, việc hai icon PWA mang một hình khác là một bất nhất **nhìn thấy được**
khi người dùng cài app — nhưng đổi chúng cần biết thứ đang nằm trong đó là gì, nên vẫn không đụng.

## 13. Lịch tháng — vẽ SỰ KIỆN, không vẽ trạng thái lặp lại

### Cái rối, đo được

Dựng đúng trạng thái người dùng phàn nàn: sáu xe (cả đội) cùng bận, đơn lệch nhau vài ngày. Chụp ở 390px:

| Đo (bản cũ) | |
| --- | --- |
| Ô có chip | **22/35** |
| Chỗ "+k nữa" | 5 |
| Bề rộng chip | **42px** → nhãn xe còn một chữ cái (`K…`, `D…`, `H…`) |
| Cao ô | 117px |

Nguyên nhân KHÔNG phải "quá nhiều dữ liệu". Bản cũ vẽ một chip cho **mọi ngày một đơn phủ**, nên
một đơn sáu ngày sinh sáu chip ở sáu ô liền nhau — cả tuần 21–27 là **cùng sáu đơn vẽ lại bảy
lần**. Lưới cao hơn màn hình mà không trả lời được ngày nào bận hơn ngày nào.

### Sửa: một đơn sáu ngày cần người đúng HAI lần

Ô ngày giờ đếm **sự kiện** — lượt giao và lượt nhận lại — và đẩy những ngày ở giữa (xe đã ra khỏi
shop, không ai phải làm gì) vào một **thanh độ bận** thay vì thành chip.

| Đo (bản mới, cùng dữ liệu) | |
| --- | --- |
| Nút LỒNG trong một ô | **0** (cả ô là một `<button>`) |
| Cao ô | 117px → **81px** |
| Tràn ngang | 0px |

Thanh độ bận nằm sát đáy ô (`mt-auto`) nên cả tuần xếp thành một đường thẳng — quét mắt theo hàng
ngang là so được ngày nào bận hơn. Ở màn rộng có thêm chữ ("1 giao"/"1 nhận") và số ("2/6 → 6/6");
ở màn hẹp chỉ hình và con số, còn `aria-label` của ô đọc đủ câu.

**Cả ô là MỘT nút.** Bản cũ cho mỗi chip một `<button>` 24px — dưới ngưỡng 44px mà chính app tự
đặt, và "+k nữa" là nút thứ tư chen vào ô 51px. Ở tầm THÁNG thì thứ người ta chọn là một NGÀY;
chọn đúng một đơn là việc của màn ngày, nơi mỗi đơn có trọn 44px. Prop `onSelect` vì vậy bị gỡ khỏi
`CalendarMonth`.

### Một định nghĩa, hai màn lịch

`dayRole` (`lib/rental-day.ts`) — hàm thuần trả `start` · `end` · `start-end` · `span` · `none`.
Bảng một ngày và lịch tháng dùng chung; mỗi màn tự dịch vai đó thành câu chữ của mình. Trước đó
phép này nằm trong `calendar-day.tsx` và màn Tháng không có nó — nên màn Tháng vẽ mọi đơn PHỦ ngày
thành chip. Bẫy biên MỞ của `endsAt` giờ đóng ở đúng MỘT chỗ. Test + mutation test: bỏ
`lastMomentOf` → 4 ca đỏ; chỉ kiểm một phía cho `span` → 2 ca đỏ.

### Hai thứ dọn theo

- `gridEdgeClip` (`lib/calendar-layout.ts`) và test của nó đã **xoá**: nó chỉ phục vụ mũi tên ‹› trên
  chip đơn của lịch tháng, mà chip đó không còn. Timeline dùng `clippedStart`/`clippedEnd` của
  `placeBar`, không dùng hàm này.
- JSDoc đầu `calendar-month.tsx` từng khẳng định "không có dữ liệu xe trống nào truyền vào component
  này" — **sai** kể từ khi `vehicles` được thêm vào props để tra tên xe. Thanh độ bận tính từ chính
  nó.

### ⚠️ Bẫy đã cắn: `<button>` mang `display:flex` KHÔNG `stretch`

Chromium áp `align-items: center` cho `<button>` từ UA stylesheet, khác `<div>` (mặc định
`stretch`). Hệ quả đo được: thanh độ bận dùng `flex-1` trong một hàng bề rộng 0 → render ra
`0x4px`, **biến mất hoàn toàn**, trong khi `aria-label` vẫn đọc đúng "5 trên 6 xe đang thuê". Một
khiếm khuyết chỉ thấy bằng mắt hoặc bằng `getBoundingClientRect` — typecheck, lint và test đều xanh
suốt. Sửa bằng `items-stretch` tường minh.

### Probe phải học hình dạng mới (lần thứ ba)

Ô ngày đổi từ `<div>` chứa nút sang `<button>`, nên mọi selector `.grid-cols-7 > div` mù. Đây là
lần thứ ba trong ngày một probe mù vì hình dạng đổi — dấu hiệu rằng probe nên bám vào **vai trò**
(`#main`, `role=list`, `aria-label`) chứ không bám cấu trúc thẻ.

## 14. `apps/staff` ở màn LỚN (tablet / desktop)

Mọi đợt trên làm cho điện thoại. Đo lại ở 1024 / 1440 / 1920px lộ ra ba thứ chưa ai soi.

### 1. Không có trần bề rộng nội dung

Đo ở 1920px trước khi sửa: `main` rộng **1712px**, dòng văn xuôi dài nhất chạy **1664px ≈ 208ch**
(ngưỡng đọc được 65–75ch). Hệ quả không chỉ ở chữ — hàng "Cần chú ý" kéo ngang 1650px với mũi tên
mắc kẹt tận mép phải, ba thẻ doanh thu phình ~550px cho một con số, hộp trạng thái rỗng của màn
Hiện trường giãn 1650px cho hai dòng chữ.

Sửa ở `AppShell`, một chỗ, mọi trang hưởng: `mx-auto w-full max-w-app`. Token `--container-app:
90rem` khai ở `index.css` — **1440px, cùng con số `DESIGN.md` §5 đặt cho `apps/web`**: hai app khác
hệ thị giác nhưng không có lý do gì để khác nhau ở "một trang rộng tối đa bao nhiêu".

### 2. Trần khổ trang KHÔNG phải trần văn xuôi

1440px vẫn là ~148ch. Các khối văn xuôi thật nhận thêm `max-w-prose` (65ch): đoạn giải thích doanh
thu, và ba hộp trạng thái rỗng. Đo lại: **434px ≈ 54ch** ở mọi bề rộng.

⚠️ Lần sửa đầu tôi gắn `max-w-prose` nhầm dòng — file có HAI `<p className="mt-1 text-xs
text-muted">` và bản vá rơi vào cái nằm trong thẻ doanh thu. Chỉ phát hiện vì đo lại thấy vẫn 154ch,
rồi hỏi DOM xem phần tử nào đang rộng.

### 3. Lịch Timeline luôn cuộn ngang, kể cả trên màn 1920

`min-w-max` ép lưới giữ bề rộng MAX-CONTENT, tức mỗi cột ngày nở theo tên khách dài nhất trong nó.
Đo ở 1920: khung 1392px, lưới cần 1841px → **cuộn 449px**, bốn ngày cuối của kỳ 14 ngày không bao
giờ thấy nếu không kéo. Và càng nhiều ngày càng tệ: ở 1440 (10 ngày) cuộn 169px, ở 1920 (14 ngày)
cuộn 449px.

`min-w-max` từng ĐÚNG — nó bảo vệ ca màn hẹp, nơi cột ngày bị bóp dưới ngưỡng đọc được. Nhưng từ
khi màn hẹp chuyển sang bảng một ngày (§10), component này chỉ còn chạy ở ≥768px, và ở đó
`minmax(2.75rem, 1fr)` một mình đã giữ sàn 44px (14 ngày trong 1392px = ~99px/cột). Thứ nó bảo vệ
đã không còn tồn tại.

Bỏ nó: cột co về `1fr`, tên khách trong thanh dùng `truncate` vốn đã có sẵn, và **cả kỳ 14 ngày
nhìn thấy cùng lúc, không cuộn**. Đo lại ở 1920: phần "cuộn" còn lại là một `<span>` 32px — đó là
chữ bị `truncate` cắt, đúng thiết kế, không phải lỗi layout.

### Số đo trước / sau

| | Trước | Sau |
| --- | --- | --- |
| `main` ở 1920 | 1712px | **1440px** |
| Dòng văn xuôi dài nhất | 1664px (~208ch) | **434px (~54ch)** |
| Lịch cuộn ngang ở 1440 | 169px | **0** |
| Lịch cuộn ngang ở 1920 | 449px | **0** |
| Tràn ngang trang | 0px | 0px |

### ⚠️ Một chú thích tôi viết ra rồi phải tự bác

Khi khai token tôi viết "1440 cho lưới 1392px, tức gần như vừa khít" — giả định 10 ngày. Đo mới bác
bỏ: ở vùng lưới ≥1280 thì `dayCountForWidth` chuyển sang **14** ngày, nên nó cuộn 449px chứ không
vừa. Thứ làm lưới vừa khung là bỏ `min-w-max`, không phải con số 1440. Chú thích đã sửa, và giữ lại
câu bác bỏ — một con số đúng kèm lý do sai vẫn là một cái bẫy cho người đọc sau.
