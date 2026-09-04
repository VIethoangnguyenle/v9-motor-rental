# Màn Đơn thuê (`/rentals`) — design doc

**Ngày:** 2026-09-04 · **Nhánh:** `main` (chưa tách nhánh) · **Trạng thái:** đã duyệt qua
`/impeccable shape`, chờ thi công

Đợt này mở khoá mục nav **"Đơn thuê"** — mục duy nhất còn `kind: "soon"` cùng với "Bàn giao"
(`apps/staff/src/components/layout/app-nav.tsx:46`) — thành một màn thật.

## 1. Vì sao có đợt này

Hôm nay `apps/staff` **không có đường nào để hỏi "đơn nào cần đụng tới hôm nay"**. Đơn thuê chỉ
chạm được ở hai chỗ, và cả hai đều sắp theo trục khác:

| Chỗ                     | Sắp theo                            | Trả lời được câu                          |
| ----------------------- | ----------------------------------- | ----------------------------------------- |
| `/calendar`             | **xe × thời gian**                  | "chiếc CB500X tuần sau ai thuê"           |
| `/customers/$id`        | **một khách × thời gian**           | "anh Nam từng thuê những gì"              |
| _(không có)_            | **độ gấp**                          | "sáng nay tôi phải giao xe cho những ai"  |

Cột thứ ba là màn này. Nó không thay được bằng cách sửa lịch: lịch **phải** sắp theo xe vì đó là
thứ cho thấy khoảng trống giữa hai đơn, và đó là lý do nó tồn tại.

Bằng chứng rằng khoảng trống này đã được cảm thấy trước đợt này, nằm ngay trong code:
`components/stats/attention-list.tsx` có bốn dòng "Cần chú ý" bấm được, và ba trong bốn dòng đó
điều hướng sang `/calendar` kèm một mốc neo — với một cảnh báo tự viết ra:

> ⚠️ Neo ở mốc sớm nhất KHÔNG bảo đảm nhìn thấy đủ cả nhóm: timeline chỉ vẽ 7–14 ngày kể từ
> `from`, nên hai đơn quá hạn cách nhau ba tuần thì bấm vào chỉ thấy đơn cũ hơn.

Đó là mô tả của một cái đích **sai loại**, không phải một tham số cần chỉnh. Bấm vào "3 xe quá hạn
chưa trả" phải ra một **danh sách 3 đơn**, không phải một khung nhìn 7–14 ngày hy vọng chứa đủ cả
ba. §7 đóng luôn cảnh báo này.

## 2. Người dùng và mode

`OWNER` và `STAFF`, **cùng một trang, không gate theo role** — khác `/staff` (ownerOnly). Xem §8
cho quyết định về tiền.

Hai bối cảnh tới khác nhau rõ rệt:

- **Điện thoại**, đang ở gara hoặc trên đường giao xe — hỏi _"giờ tôi phải làm gì"_.
- **Màn lớn ở quầy** — hỏi _"đơn của khách đang gọi điện này ra sao"_ và _"tháng vừa rồi thế nào"_.

Mode (theo `impeccable`): **Operate**. Quét được và nhất quán thắng biểu cảm.

Thẩm quyền thị giác: **hệ thị giác `apps/staff`** —
[`2026-09-01-staff-visual-system-design.md`](2026-09-01-staff-visual-system-design.md) +
`apps/staff/src/index.css`. **Không phải `DESIGN.md` ở gốc repo**: file đó tự khai chỉ áp cho
`apps/web`.

## 3. Hình dạng — một danh sách, hai chế độ

Bốn việc người dùng xác nhận là có thật (hàng đợi trong ngày · tra cứu một đơn · sổ cái/đối soát ·
chốt đơn từ yêu cầu web) kéo trang về hai hướng ngược nhau. Giải bằng **hai chế độ trên một
trang**, chế độ sống ở URL:

| Chế độ                       | Hình dạng                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `?mode=queue` (mặc định) | Không cần chọn ngày. **Nhóm theo độ gấp**, mỗi nhóm một tiêu đề chữ.                             |
| `?mode=ledger&from=&to=`     | Bảng phẳng sắp `startsAt` giảm dần, **có đơn `CANCELLED`**, có tổng tiền đã thu của khoảng.      |

Ô tìm **cắt ngang cả hai**: có `q` thì bỏ nhóm, bỏ ràng buộc ngày, ra một danh sách kết quả phẳng —
tức nó đi qua **endpoint sổ cái không có `from`/`to`**, chứ không phải một đường tìm kiếm thứ ba.
Vì vậy `/rentals/queue` **không nhận `q`**: một hàng đợi đã lọc theo từ khoá thì không còn là hàng đợi.

**Khoảnh khắc tiêu điểm: nhóm đầu tiên, và không có gì phía trên nó.** Không thẻ số liệu, không
hàng bộ lọc chiếm hết màn đầu. Trang này **là** câu trả lời, không phải công cụ để đi tìm câu trả
lời. Thẻ số liệu đã có ở Thống kê; dựng lại ở đây là dựng bản sao thứ hai của cùng một con số.

**Nhóm rỗng thì biến mất, không hiện "0"** — cùng luật `attention-list.tsx` đã viết cho
`pendingStaff` ("một STAFF thấy '0 nhân viên chờ duyệt' sẽ tưởng đúng là 0").

## 4. Năm nhóm của chế độ hàng đợi

Thứ tự **là** thiết kế, và nó khớp thứ tự `attention-list.tsx` đã sắp — không đẻ định nghĩa "gấp"
thứ hai:

| # | Nhóm                    | Vị từ                                             | Sắp trong nhóm  |
| - | ----------------------- | ------------------------------------------------- | --------------- |
| 1 | **Quá hạn trả**         | `ONGOING` và `ends_at < now`                      | `ends_at` tăng  |
| 2 | **Chưa lấy xe**         | `BOOKED` và `starts_at < now`                     | `starts_at` tăng |
| 3 | **Nhận lại hôm nay**    | `ONGOING` và `ends_at ∈ [now, dayEnd)`            | `ends_at` tăng  |
| 4 | **Giao hôm nay**        | `BOOKED` và `starts_at ∈ [now, dayEnd)`           | `starts_at` tăng |
| 5 | **Sắp tới (7 ngày)**    | `BOOKED` và `starts_at ∈ [dayEnd, dayEnd + 7d)`   | `starts_at` tăng |

`COMPLETED` và `CANCELLED` **không có nhóm nào** — chúng rơi khỏi chế độ hàng đợi hoàn toàn. Đó là
điều kiện để "hàng đợi" đúng nghĩa hàng đợi: một đơn đã xong không còn là việc.

**Mốc sắp xếp trong nhóm là `whenOf` của `customer-table.tsx`**, không phải một luật mới:
`ONGOING → endsAt` ("bao giờ khách phải trả xe"), `BOOKED → startsAt` ("bao giờ khách tới lấy").
Cùng câu hỏi thì cùng cột.

### 4.1 Ba điều bắt buộc, không phải sở thích

**(a) Năm nhóm loại trừ nhau, và thứ tự kiểm là thứ ép điều đó.** Nhóm 1 và nhóm 3 **giao nhau
trong `stats.ts`**: `overdue` là `ends_at < now`, còn `due_today` là `ends_at ∈ [day_start,
day_start + 1 day)` — một đơn đáo hạn 09:00 sáng nay, xem lúc 15:00, thoả **cả hai**. Ở màn Thống
kê đó là hai con số đứng cạnh nhau nên chồng nhau vô hại. Ở đây một đơn chỉ được đứng **một chỗ**,
nên nhóm 3 bị siết cận dưới thành `ends_at >= now`.

> **Hệ quả phải nói ra, không được giấu:** số đơn ở nhóm "Nhận lại hôm nay" của trang này **nhỏ
> hơn hoặc bằng** `attention.dueToday` ở Thống kê, chênh đúng bằng số đơn đã rơi sang "Quá hạn
> trả". Hai con số **không sai** — chúng trả lời hai câu khác nhau ("hôm nay có bao nhiêu đơn tới
> hạn" vs "còn bao nhiêu đơn tới hạn mà chưa trễ"). Nhãn của nhóm phải chịu được điều đó, và test
> ở §6 khoá quan hệ `≤` này lại để nó không âm thầm đảo chiều.

**(b) Nhóm 1 và 2 phải khớp TUYỆT ĐỐI với `stats.attention`.** `overdue` và `pickupOverdue` không
có phần chồng lấn nào, nên bấm "3 xe quá hạn chưa trả" ở Thống kê mà sang đây thấy 4 dòng là một
mâu thuẫn thật — đúng loại mâu thuẫn mà `lib/rental-status.ts` đã dành nguyên một đoạn để dập tắt
ở tầng màu. Khoá bằng test.

**(c) Nhóm 4 ("Giao hôm nay") không có số đối chứng ở Thống kê.** `stats.ts` không đếm `BOOKED`
`starts_at` trong hôm nay. Đây là **thêm**, không phải lệch — nhưng ghi ra để người sau không đi
tìm con số tương ứng rồi tưởng mình làm mất nó.

## 5. Hai endpoint, không phải một

`GET /rentals` hiện tại **bắt buộc `from`+`to`**, trần 92 ngày (`MAX_RANGE_DAYS`), **lọc bỏ
`CANCELLED`**, không phân trang, không tìm kiếm. Cả bốn đều chặn màn này. Nó **giữ nguyên** — lịch
đang dùng đúng hình dạng đó và không có lý do gì bắt lịch trả giá.

Thêm **hai** route mới, không phải một route mang tham số `mode`:

```
GET /rentals/queue?page&pageSize
    → { rentals: (RentalWithVehicle & { group })[], total, page, pageSize, groupCounts }

GET /rentals/ledger?q&status&from&to&page&pageSize
    → { rentals: RentalWithVehicle[], total, page, pageSize, collectedAmount }
```

Vì sao tách: hai câu hỏi khác nhau cho **hai hình dạng response khác nhau** (`groupCounts` vs
`collectedAmount`), và Eden Treaty suy kiểu response union rất tệ — một route trả union sẽ đẩy
`RentalQueueRow | RentalLedgerRow` vào mọi call site ở frontend. Đây đúng là tiền lệ repo đã lập
với `GET /customers` (ô tìm của form, `q` rỗng → `[]`) và `GET /customers/list` (màn danh sách, `q`
rỗng → cả bảng, có phân trang), kèm comment giải thích ngay trên route.

**Không cần `GET /rentals/:id` ở đợt này**: sheet chi tiết mở từ dữ liệu đã có trong danh sách. Nó
thành bắt buộc ngày nào sheet được gắn vào URL (`?don=<id>`) — chưa làm, xem §9.

### 5.1 Row schema dùng lại `rentalWithVehicleSchema` — và sheet chạy không cần sửa

`rentalWithVehicleSchema` (`apps/api/src/routes/rentals.ts`) đã là `rentalSchema` + `vehicleMake` +
`vehicleModel` + `vehiclePlate`. `RentalDetailSheet` nhận `rental: CalendarRental`, mà
`CalendarRental` chính là `Static<typeof rentalSchema>`. Một hàng của danh sách mới là **tập cha
cấu trúc** của nó ⇒ gán được, **`rental-detail-sheet.tsx` không phải sửa một dòng nào.**

Điều đó được **ép chứ không hứa**: `lib/rentals-list.ts` khai một hàm chỉ tồn tại lúc biên dịch
(khuôn `_statusSchemaMatchesDomain` đã có ở `routes/rentals.ts`), đỏ ngay khi ai đó bỏ một field
khỏi row schema.

`vehicle` prop của sheet lấy từ `fleetQuery` — **cùng `queryKey: ["fleet"]`** mà lịch đang dùng,
nên mở `/rentals` sau khi đã mở `/calendar` không tốn thêm vòng mạng nào.

### 5.2 Ranh giới ngày tính trong SQL, luật nhóm có hai bản được ép khớp

`getStatsSummary` đã quyết định — và ghi lý do — rằng phép cắt kỳ theo múi giờ shop làm **trong
Postgres**: "đó là chỗ duy nhất trong stack này biết chắc múi giờ". Đợt này **không** đảo quyết
định đó.

Nên: `queueBoundaries(now)` chạy một câu một dòng lấy `dayEnd` và `horizon` từ Postgres, rồi truyền
chúng vào câu chính như tham số. Kết quả là luật nhóm có đúng hai bản, **cùng nhận một bộ biên**:

- `CASE` trong SQL — thứ thật sự chạy.
- `queueGroupOf()` ở `packages/shared/src/domain/rental.ts` — bản thuần, test được không cần DB.

Và một test đối chứng chạy cả hai trên cùng bộ hàng, so từng dòng. Đây là **đúng khuôn hàng rào đã
có** cho `isOverdue`/`isPickupOverdue` (commit `abd0a81`, "hàng rào hợp đồng SQL ↔ TS"), không phải
một cơ chế mới.

## 6. Hàng rào

Ba test phải đỏ khi hợp đồng vỡ, và mỗi cái phải được chứng minh là đỏ vì đúng lý do trước khi tin:

1. **SQL ↔ TS.** `listRentalsQueue` và `queueGroupOf` gán cùng một nhóm cho mọi hàng seed, ở nhiều
   mốc `now` khác nhau **kể cả sát biên** (đúng `now`, đúng `dayEnd`, `dayEnd - 1ms`).
2. **Khớp Thống kê.** `groupCounts.overdue === attention.overdue` và
   `groupCounts.pickupOverdue === attention.pickupOverdue`, cùng một `now`. Cộng thêm
   `groupCounts.dueToday <= attention.dueToday` (§4.1a).
3. **Phân trang ổn định.** Duyệt hết N trang cho ra đúng `total` id **không trùng, không sót**.
   `ORDER BY` phải có `id` làm khoá phụ, nếu không hai hàng cùng mốc thời gian có thể đổi chỗ giữa
   hai request và một hàng lọt qua khe.

## 7. Đóng cảnh báo của `attention-list.tsx`

Ba dòng `overdue` / `pickupOverdue` / `dueToday` đổi đích từ `/calendar` + mốc neo sang `/rentals`
chế độ hàng đợi. Không cần `search` nào cả — hàng đợi **luôn** mở ở nhóm gấp nhất.

Cảnh báo "neo ở mốc sớm nhất KHÔNG bảo đảm nhìn thấy đủ cả nhóm" **hết hiệu lực** và phải được xoá
cùng lúc, không để lại. Hai field `overdueFrom` / `pickupOverdueFrom` của `GET /stats/summary`
**giữ nguyên** — dòng thứ tư và mọi đường sang lịch vẫn dùng chúng; bỏ field ở API là việc riêng,
không nhét vào đợt này.

## 8. Quyết định nghiệp vụ

| #   | Câu hỏi                          | Quyết định                                                              | Lý do                                                                                                                                                                              |
| --- | -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tiền hiện cho `STAFF` không?     | **Có** — không gate role                                                | `GET /stats/summary` đã trả `revenue` cho cả hai role; chỉ `pendingStaff` mới gate `OWNER`. Gate ở đây là dựng luật thứ hai mâu thuẫn với luật đang chạy.                          |
| 2   | Ô tổng của sổ cái tên là gì?     | **`collectedAmount`** — "Đã thu (đơn đã giao xe)"                        | Cộng đúng `handed_over_at IS NOT NULL`, cùng vị từ doanh thu của `stats.ts`. Nhưng cửa sổ lọc khác (giao nhau với khoảng thuê, không phải mốc giao xe) ⇒ **không** được gọi là "Doanh thu", nếu không nó sẽ bị đối chiếu với Thống kê rồi báo là bug. |
| 3   | Trang này có nút Huỷ đơn không?  | **Không**                                                               | Huỷ đơn + hoàn cọc nằm trong "Chưa quyết — đừng bịa" của `PRODUCT.md`. Đường huỷ đã có sẵn trong sheet qua `availableTransitions`; thêm nút thứ hai ở tầng danh sách là mở rộng phạm vi nghiệp vụ chưa ai duyệt. |
| 4   | Có tính lại tiền không?          | **Không** — chỉ hiện `totalAmount` đã nhập tay                          | Chính sách giá và cách tính ngày thuê chưa chốt (`PRODUCT.md`). Plan A cố ý để giá nhập tay.                                                                                        |
| 5   | Chốt đơn từ yêu cầu web?         | **Ngoài phạm vi đợt này**                                               | Việc đó thuộc `/requests` (nút "Chốt thành đơn" prefill form), không thuộc màn danh sách. `/rentals` là **đích đến** của luồng đó, nên phải tồn tại trước. Xem §9.                  |

## 9. Ngoài phạm vi — cố ý

- **`?don=<id>` gắn sheet vào URL.** Cần `GET /rentals/:id` vì deep-link không có sẵn dữ liệu
  trong danh sách. Đáng làm, nhưng nó là một trục riêng (chia sẻ link) chứ không phải điều kiện để
  màn này chạy.
- **Chuyển yêu cầu web → đơn thuê bằng một cú bấm.** `docs/ROADMAP.md` đã ghi là món chưa làm. Nó
  sống ở `/requests`.
- **Mục nav "Bàn giao"** vẫn `soon`. Bàn giao đã sống trong sheet; một màn riêng cho nó là một
  quyết định chưa ai đưa ra.
- **Sắp xếp/lọc tuỳ ý ở sổ cái, hành động hàng loạt, xuất Excel.** Cùng nhóm việc mà
  `ROADMAP.md` đã treo cho màn Khách hàng ("sort/lọc/nhảy trang và hành động hàng loạt").
- **Tiếng Anh.** Nợ đã biết ở `PRODUCT.md`; `apps/staff` không có `next-intl`, đừng dựng nửa vời.

## 10. Responsive — chọn một trong hai khuôn đang có

App đang mang **hai** khuôn cho cùng một bài toán "bảng không vừa màn hẹp":

| Màn         | Khuôn                                                     |
| ----------- | --------------------------------------------------------- |
| `/customers` | `overflow-x-auto` + `<table class="min-w-[780px]">`        |
| `/staff`     | đổi hẳn sang **thẻ** dưới `md`, qua `useLayoutVariant()`   |

**Chọn khuôn thẻ của `/staff`.** Dòng đơn thuê mang 6 trường (trạng thái · khách · xe · mốc · tiền
· cọc), và chế độ hàng đợi **là** chế độ điện thoại — bắt cuộn ngang để đọc cột "trả lúc mấy giờ"
trên màn 375px là trả giá đúng ở nơi dùng nhiều nhất. `staff-table.tsx` đã ghi sẵn lý do chọn
_một_ hình dạng thay vì dựng cả hai rồi ẩn bằng CSS.

Phân cấp trong một dòng: **trạng thái (hình + màu) → khách + xe → mốc thời gian → tiền.** Tiền
đứng cuối vì không ai quét mắt tìm nó.

Icon trạng thái từ `statusIconOf()` là **bắt buộc**: `status-icon.test.ts` khoá song ánh màu ↔
hình vì sáu trạng thái không phân biệt được bằng màu dưới deuteranopia.

**Không bao giờ in `endsAt` trần** — biên mở, sai một ngày. Dùng `lastMomentOf(endsAt)`.

## 11. Trạng thái phải có

- Đang tải — skeleton **đúng hình dạng thứ sắp thay nó** (tiêu đề nhóm + ba dòng), khuôn
  `stats-page.tsx`. Từ lần tải thứ hai, `keepPreviousData` làm `isPending` luôn false ⇒ chỉ báo
  duy nhất còn nghĩa là `isFetching` (đã ghi ở `lib/customers.ts`).
- **Lỗi mạng khác lỗi máy chủ** — `connectionFailed()` đã có, hai câu khác nhau, chỉ một cái đáng
  có nút thử lại.
- **Rỗng vì chưa có đơn nào** khác **rỗng vì bộ lọc không khớp** — hai câu khác nhau. Ở chế độ hàng
  đợi, rỗng là **tin tốt**: "Không có đơn nào cần xử lý."
- Trang vượt quá số trang — quay về trang 1, không màn trắng.

## 12. Quy mô giả định

Người dùng khai "nhiều xe, nhiều đơn". Lấy **20–40 xe, 100–200 đơn/tháng** ⇒ sổ cái một năm vượt
1.000 dòng. Hai hệ quả cứng, đã nằm trong §5:

- **Phân trang phía server.** `pageSize` mặc định 20, khớp `CUSTOMERS_PAGE_SIZE`.
- **`collectedAmount` do server tính.** Cộng mảng ở frontend cho ra tổng của 20 dòng đang xem —
  trông đúng và sai.

Nếu số thật nhỏ hơn nhiều (dưới 10 xe): mọi thứ vẫn đúng, chỉ nên nới nhóm "Sắp tới" từ 7 lên 30
ngày. Đó là **một hằng số**, và nó được khai một chỗ chính vì lý do này.

---

## 13. Còn phải kiểm bằng mắt — chưa ai làm

Đợt này dựng và kiểm bằng máy: 546 test, typecheck, lint, và hai lời gọi HTTP có phiên đăng nhập
thật vào `/rentals/queue` và `/rentals/ledger` (xác nhận `groupCounts` đủ năm khoá và
`collectedAmount` về dạng **số**, không phải chuỗi).

**Tám ý dưới đây chưa ai bấm thử**, xếp theo rủi ro giảm dần. Bốn ý đầu không có hàng rào tự động
nào che:

1. **Màn 375px đổi sang hình dạng thẻ, không cuộn ngang.** Rủi ro cao nhất, và là ý duy nhất
   **không có hàng rào tự động nào cả**: `useLayoutVariant()` trả `"desktop"` dưới headless, còn
   test thẻ chỉ stub `matchMedia` để chứng minh **nhánh** render — nó không chứng minh được thẻ vừa
   màn 375px hay không có gì tràn ngang. Toàn bộ quyết định bố cục của §10 đứng trên ý này.
2. **Sheet chạy hết hiệu ứng ra rồi mới đóng sau khi đổi trạng thái.** Đoạn ghim `useRef` là code
   **chết** cho tới khi lỗi cache key được sửa (refetch chưa từng chạy), nên nó chỉ sống lần đầu
   sau đợt sửa cuối. Phải kiểm **sau** khi sửa, không phải trước.
3. **Gõ ô tìm → tự chuyển sổ cái, thấy được đơn `CANCELLED`.** DB dev không có đơn đã huỷ nào, nên
   đường này chưa từng chạy đầu-cuối ngoài test của service.
4. **Bấm "Sau →" rồi Back giữ nguyên chữ trong ô tìm.** Ngữ nghĩa lịch sử (`push` cho phân trang,
   `replace` cho debounce) mới chỉ được khẳng định bằng cách đọc code.

Bốn ý còn lại có bằng chứng gián tiếp mạnh, không đáng chặn: hàng đợi mở đúng nhóm gấp nhất · nhóm
rỗng không hiện "(0)" · bấm dòng mở sheet có nút đổi trạng thái và ảnh bàn giao · con số ở Trang chủ
khớp số dòng của nhóm (đã đo trên DB dev: `attention.overdue` = `groupCounts.OVERDUE` = 1, cùng một đơn).
