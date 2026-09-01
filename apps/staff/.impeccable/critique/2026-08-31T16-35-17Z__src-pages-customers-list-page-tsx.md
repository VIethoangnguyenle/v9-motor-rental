---
target: apps/staff Khách hàng surface (customers list + detail)
total_score: 18
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 4
timestamp: 2026-08-31T16-35-17Z
slug: src-pages-customers-list-page-tsx
---

Method: dual-agent (A: design review, isolated · B: detector + evidence, isolated). A không thấy output của B; B không thấy output của A. Claim P0 được tổng hợp viên kiểm lại first-hand.

Phạm vi: surface **Khách hàng** của `apps/staff` — `customers-list-page.tsx`, `customer-detail-page.tsx`, `components/customers/{customer-table,customer-edit-form,customer-rental-history}.tsx`, `lib/customers.ts`, `router.tsx`. Mode: **Operate**. Hệ thị giác đối chiếu là `apps/staff/src/index.css` + `components/ui/*`, KHÔNG phải `DESIGN.md` (file đó của `apps/web`).

> **⚠️ Đính chính 2026-09-01, sau khi đo:** mục P1 _"Hỏng im lặng"_ dưới đây mô tả sai cơ chế.
> Eden Treaty nuốt rejection của `fetch` và trả `{ error: EdenFetchError(503, exception) }` thay vì
> để promise reject, nên `isError` là nhánh chết và **màn hình chưa bao giờ trắng** — nó hiện câu
> fallback chung chung không kèm đường thử lại. Vẫn đáng sửa, nhưng nhẹ hơn mô tả gốc. Điểm số
> không đổi vì các phát hiện khác đứng vững. Chi tiết ở
> `docs/plans/2026-08-31-customers-surface-design.md` §7.

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                                                              |
| --------- | ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 2         | `isPending` (không `isFetching`, không `placeholderData`) ⇒ bảng trắng hoàn toàn mỗi lần đổi trang/gõ tìm. Query reject ⇒ không render gì cả.                          |
| 2         | Match System / Real World       | 2         | Từ vựng của database (`Số đơn`), không phải của gara (đang giữ xe · giấy tờ đang giữ · địa chỉ giao).                                                                  |
| 3         | User Control and Freedom        | 1         | `q`/`page` ở `useState` chứ không ở URL ⇒ Back mất chỗ, F5 mất tìm kiếm, không share link. Ngược pattern `calendarRoute` mà repo cố ý dựng.                            |
| 4         | Consistency and Standards       | 1         | `<main className="p-6">` lặp đúng cái sai mà `stats-page.tsx:19-23` viết ra để cấm trang mới lặp.                                                                      |
| 5         | Error Prevention                | 2         | Có `required`, chuẩn hoá SĐT server-side, 409 kèm `existing`, cố ý không có nút Xoá. Nhưng không guard "chưa lưu", và ô tìm trả âm tính giả.                           |
| 6         | Recognition Rather Than Recall  | 2         | Danh sách không mang tín hiệu vận hành ⇒ phải mở chi tiết rồi tự nhớ; Back mất trang ⇒ phải nhớ đang ở trang mấy.                                                      |
| 7         | Flexibility and Efficiency      | 1         | Không sort, không lọc, không nhảy trang (chỉ ±1), không Enter-để-tìm, không deep-link, không primary action.                                                           |
| 8         | Aesthetic and Minimalist Design | 3         | Thật sự tiết chế, đúng token, 0 hex cứng, 0 màu ngoài hệ. Trừ vì `<thead>` vẫn hiện trên khoảng trống ở trạng thái rỗng/lỗi, và cột số canh trái không `tabular-nums`. |
| 9         | Error Recovery                  | 2         | Câu 409 gọi tên khách kia là UX writing tốt nhất surface này. Nhưng mọi lỗi là ngõ cụt: `refetch` không được gọi ở đâu trong cả `apps/staff`.                          |
| 10        | Help and Documentation          | 2         | `placeholder="Để trống để xem tất cả"` là hướng dẫn inline tốt. Nhưng không nói khách được tạo ở đâu, cũng không nói vì sao không có nút Xoá.                          |
| **Total** |                                 | **18/40** | **Critical — sửa nền trước, chưa tới lượt polish**                                                                                                                     |

Áp dụng cả 10 heuristic, không có `n/a`.

## Design Specificity Verdict

**LLM assessment — 3/10: một CRUD admin generic mặc đúng token của repo.**

Công bằng trước: nó khớp ngôn ngữ thị giác đang có tới mức đáng khen. `customer-table.tsx:16-17` sao đúng khuôn `staff-table.tsx:24-25`; `customer-rental-history.tsx:4` import `STATUS_LABEL` thay vì gõ lại bộ nhãn tiếng Việt thứ hai. Không gradient tím, không card lồng card, không bịa token.

Nhưng khớp ≠ được tác giả hoá. Phép thử: đổi bốn tiêu đề cột thành _Name / Email / Tag / Orders_, đổi `formatVnd` thành `formatUsd` — màn hình chạy nguyên xi trong bất kỳ SaaS backoffice nào. Không dòng nào biết nó phục vụ một shop cho thuê mô tô ở TP.HCM.

Bốn sự thật **đã xác nhận** trong `PRODUCT.md` không để lại dấu vết:

| Sự thật trong PRODUCT.md                    | Dấu vết trên surface                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Giữ CCCD/hộ chiếu (dòng 40)                 | **Không có.** Model chỉ `fullName · phone · note`.                                                                 |
| Giao xe tận nơi (dòng 42)                   | **Không có.** Không lưu địa chỉ giao lần trước.                                                                    |
| Shop chạy bằng Zalo (dòng 20, 86)           | **Không có.** SĐT là text trần; ở trang chi tiết nó nằm _bên trong_ một `<input>`. Không `tel:`, không `zalo.me/`. |
| Khách nước ngoài là user thật (Principle 4) | **Không có.** Không phân biệt được khách Việt/nước ngoài ở đâu cả.                                                 |

Và câu hỏi vận hành số một — _"khách này có đang giữ xe của shop không?"_ — surface không trả lời được. Trớ trêu: `index.css:31-43` đã khai sẵn bốn token trạng thái có đo contrast, `lib/rental-status.ts:26-47` đã có `rentalChipClass()`, và đây là **nơi duy nhất trong app hiển thị trạng thái đơn thuê mà không dùng màu nào** (`customer-rental-history.tsx:52` in chữ trần).

**Deterministic scan:** `detect.mjs` trên 3 target → `[]`, exit 0, 0 findings. Quét rộng `src public` → cũng `[]`.

Con số đó **không** có nghĩa "sạch", và đây là chỗ dễ đọc sai nhất trong cả báo cáo. B đã kiểm chứng coverage bằng ba tầng thay vì tin: `SCANNABLE_EXTENSIONS` có `.tsx` (`detector/node/file-system.mjs:26-30`); positive control (file `.tsx` chứa `font-family: Inter` + bounce easing) → **2 findings, exit 2**; directory-walk control (file thật và file control cùng thư mục) → control ra 2, `customer-table.tsx` ra 0. Vậy traversal có chạm file thật, và nó im vì sạch.

Nhưng sạch trong một **dải luật hẹp**. `detector/registry/antipatterns.mjs:559-564`: file không phải HTML chỉ đi qua engine `regex` — line-based matcher, không model layout, không resolve CSS variable. Phần lớn trong 59 luật thuộc scope `element`/`page`/`layout`/`visual-contrast`, tức **chỉ chạy khi có URL sống**. Control thứ hai đo đúng vùng mù: detector bắt `gray-on-color` nhưng **bỏ qua** `bg-[#8b5cf6]`, `p-[7px]`, `h-5` (touch target 20px), `<img>` thiếu `alt`, `<input>` thiếu label, `<table>` thiếu `<thead>`.

Kết luận đúng: `[]` = "không có anti-pattern loại slop/typography mà regex đọc được". Nó không nói gì về vùng chạm, overflow, async state, hay a11y — và đó chính là nơi mọi vấn đề thật của surface này nằm.

**Visual overlays: không có.** Không phải vì lỗi kỹ thuật — vì không có gì để phủ lên. B dựng được dev server thật (`:3003` staff, `:3001` api trả `{"status":"ok"}`), điều hướng tới `/customers`, nhận **HTTP 200 render `<p>Not Found</p>`** kèm `Warning: A notFoundError was encountered on the route with ID "__root__"`. Screenshot desktop 1440px có thật nhưng nội dung là trang Not Found. Mobile 390px và overlay bị **bỏ qua với lý do cụ thể: không có DOM nào để đo**. Mọi tiến trình nền đã dừng, ports 3000/3001/3003 xác nhận trống.

Đáng ghi: auth **không** phải rào cản. B xác minh thay vì suy đoán — `/login` render bình thường, có OWNER ACTIVE `chu-shop-dev@v9rental.dev` do `scripts/staff-bootstrap.ts` tạo, dev OTP `999999` gắn `NODE_ENV` ở `apps/api/src/env.ts:78`. Đăng nhập được. Vẫn không tới được `/customers` vì route chưa đăng ký.

## Overall Impression

Đây là code **có kỷ luật cao ở tầng vi mô và chưa được quyết định ở tầng vĩ mô**. Nó tôn trọng mọi ranh giới máy ép được của repo: 0 hex cứng, 0 màu ngoài token, sao đúng khuôn bảng của tiền lệ, mượn lại `STATUS_LABEL`, và từ chối nút Xoá vì `ON DELETE RESTRICT` — có ghi lý do. Người viết nó đọc repo trước khi gõ.

Nhưng nó dừng lại ở "đúng khuôn" và không đi tiếp tới "đúng việc". Nó là một bảng CRUD trên bảng `customers`, không phải một công cụ trả lời câu hỏi mà nhân viên thật sự mang tới màn hình này. Và ngay lúc này nó **không tồn tại trong ứng dụng đang chạy** — hai import chết, `typecheck` đỏ 4 lỗi, nav vẫn ghi "sắp có".

**Cơ hội lớn nhất, một câu:** surface này đã có sẵn mọi nguyên liệu để trở nên đặc thù — bốn token trạng thái đã đo contrast, `rentalChipClass()`, một shop chạy bằng Zalo, một model đã biết `rentals` của từng khách — mà chưa dùng cái nào. Nối chúng lại thì nó thành công cụ của gara này; để nguyên thì nó là backoffice của bất kỳ ai.

## What's Working

**1. Nó từ chối phát minh bộ từ vựng thị giác thứ hai.** `customer-table.tsx:16-17` sao đúng `overflow-x-auto` + `min-w-[560px]` + `card-pad` + `border-border` của `staff-table.tsx:24-25`. **Vì sao hiệu quả:** app này được dùng nhiều giờ mỗi ngày; mọi độ lệch nhỏ giữa các bảng là thuế thị giác cộng dồn. Một surface mới hoàn toàn mà đọc như đã ở đó từ đầu là thành tựu thật.

**2. Câu 409 gọi đúng tên người kia** (`customer-edit-form.tsx:44-51`): _"Số điện thoại này đã thuộc về khách hàng khác: Trần Văn A (0912345678)"_ thay vì "Số điện thoại đã tồn tại". **Vì sao hiệu quả:** nó biến một lỗi thành một sự thật hành động được — và nó đắt hơn vẻ ngoài, phải có hợp đồng API cố ý trả `existing` mới viết được câu đó. Đây là thiết kế xuyên tầng, không phải may mắn.

**3. Kỷ luật từ chối, có ghi lý do.** Không nút Xoá (`customer-edit-form.tsx:27-29`) vì `rentals.customer_id` là `ON DELETE RESTRICT` và luật ẩn/gộp khách chưa chốt. Trạng thái rỗng phân biệt hai ca: _"Chưa có khách hàng nào."_ vs _"Không tìm thấy khách hàng nào khớp."_ (`customers-list-page.tsx:65-68`). **Vì sao hiệu quả:** một nút Xoá thỉnh thoảng vỡ bằng lỗi DB thô còn tệ hơn không có nút; và phần lớn team gộp hai trạng thái rỗng đó làm một.

## Priority Issues

### [P0] Surface chưa được nối vào app, và app không build được

- **Why it matters:** Không phải "khó dùng" — là **không tồn tại**. Và vì `build = tsc --noEmit && vite build`, nó làm hỏng CI cho cả những thay đổi không liên quan. Mọi đánh giá UX ở đây là đánh giá code chưa từng chạy.
- **Fix:** Khai `customersListRoute` (`/customers`) và `customerDetailRoute` (`/customers/$id`) dưới `protectedLayoutRoute`, thêm vào `addChildren`. Đổi `app-nav.tsx:35` thành `{ kind: "link", label: "Khách hàng", to: "/customers" }` và nới union `to` ở `app-nav.tsx:26`. Chạy tới khi `typecheck` exit 0.
- **Where:** `router.tsx:28-29,248-263` · `app-nav.tsx:26,35` · `customer-table.tsx:31-32` · `customer-detail-page.tsx:16,38`
- **Command:** `/impeccable harden src/router.tsx`

### [P1] Ô tìm trả về âm tính giả — và nói rất tự tin

- **Why it matters:** Tìm kiếm **là** màn hình này. `services/customers.ts:186` dùng `like(fullName, '%term%')` — Postgres `LIKE` phân biệt hoa thường, không xử lý dấu. `nguyen`, `trần`, `NGUYỄN` đều không khớp `Nguyễn`. Nhân viên gõ không dấu (hành vi mặc định) trong lúc khách đứng chờ, nhận lại _"Không tìm thấy khách hàng nào khớp."_ Đây là loại lỗi tệ nhất: không phải thông báo lỗi, mà là **một câu trả lời sai được nói chắc nịch**. Kết cục: tạo hồ sơ trùng — mà repo không có chức năng gộp. `customers.test.ts:65` chỉ test bằng đúng chuỗi gốc nên không bắt được.
- **Fix:** `ilike` + `unaccent()` (hoặc cột `full_name_search` chuẩn hoá + index) ở **cả** `listCustomers` và `searchCustomers`, để dropdown lên đơn không lệch với danh sách. Thêm test gõ thường-không-dấu.
- **Where:** `apps/api/src/services/customers.ts:46,186` · `customers.test.ts:65` · `packages/db/src/schema/rentals.ts:19`
- **Command:** `/impeccable clarify src/pages/customers-list-page.tsx` (phần copy) + sửa service

### [P1] `<main className="p-6">` phá đúng luật repo đã viết ra để cấm — và ăn mất một nửa bảng trên điện thoại

- **Why it matters:** `AppShell` đã bọc `children` trong `<main className="page-gutter flex-1 py-4">` (`app-shell.tsx:52`). `stats-page.tsx:19-23` ghi nguyên văn rằng `HealthPage`/`StaffListPage` cũ lỡ mắc lỗi này và **"trang MỚI thì không lặp"**. Hai trang Khách hàng là trang mới và đã lặp. Ba thiệt hại đo được: (1) hai landmark `main` lồng nhau — HTML không hợp lệ, điều hướng landmark của screen reader thành mơ hồ; (2) padding cộng dồn **40px mỗi bên, 80px tổng**, và vứt bỏ hệ 3 breakpoint mà `index.css:59-72` cố ý dựng (`p-6` là 24px cố định); (3) trên 375px còn **295px** hữu dụng cho bảng `min-w-[560px]` — hơn nửa bảng nằm ngoài màn hình.
- **Fix:** Đổi cả hai thành `<div className="flex flex-col gap-4">` đúng khuôn `stats-page.tsx:24` và `calendar-page.tsx:12`. Bỏ luôn các `mt-3`/`mt-4` rải rác.
- **Where:** `customers-list-page.tsx:42` · `customer-detail-page.tsx:37`
- **Command:** `/impeccable layout src/pages/customers-list-page.tsx src/pages/customer-detail-page.tsx`

### [P1] Hỏng im lặng: khi mạng chết, màn hình không nói gì cả

- **Why it matters:** Đây là chỗ hai assessment gặp nhau từ hai hướng. Cả ba query chỉ xử lý `res.error` (lỗi HTTP gói trong discriminated union). Nếu `queryFn` **reject** (mạng chết, api down), TanStack đặt `status: "error"` ⇒ `isPending` false, `data` undefined ⇒ nhánh `:54` (`data?.ok === false`) và `:63` (`data?.ok`) **đều false, không branch nào render gì**. Nhân viên thấy tiêu đề, ô tìm, header bảng rỗng, không một thông báo. Kiểm chứng cơ học: `isError` **không xuất hiện một lần nào** trong toàn `apps/staff/src/`; `main.tsx:13` dùng `new QueryClient()` mặc định, không `throwOnError`, không error boundary. Cộng thêm: `refetch` cũng không được gọi ở đâu ⇒ mọi lỗi là ngõ cụt, không nút "Thử lại". Và `ui/alert.tsx:23` là `<p>` trần, **không `role="alert"`, không `aria-live`** ⇒ mọi phản hồi lỗi/thành công im lặng với screen reader.
- **Fix:** Thêm nhánh `isError` cho cả ba query kèm nút "Thử lại" gọi `refetch()`. Thêm `role="alert"` + `aria-live="polite"` vào `ui/alert.tsx` — một dòng vá được sáu màn hình, món hời a11y rẻ nhất trong repo. Thêm `placeholderData: keepPreviousData` và đổi chỉ báo tải sang `isFetching` (khớp `rental-form.tsx:348`) để bảng hết trắng mỗi thao tác.
- **Where:** `customers-list-page.tsx:36,54-69` · `customer-detail-page.tsx:20-21,42-67` · `ui/alert.tsx:23` · `main.tsx:13`
- **Command:** `/impeccable harden src/components/customers src/pages/customers-list-page.tsx`

### [P1] Không có tín hiệu vận hành nào; số điện thoại là dữ liệu chết

- **Why it matters:** Hai câu hỏi duy nhất khiến người ta mở màn "Khách hàng" giữa ca làm là _"khách này đang giữ xe nào?"_ và _"gọi cho khách này"_. Bốn cột `Họ tên · Điện thoại · Ghi chú · Số đơn` không trả lời câu đầu — `Số đơn` là con số đếm trong database, không phải sự thật vận hành. Và SĐT là text trần ở `customer-table.tsx:38`, còn ở trang chi tiết nó nằm **bên trong một `<input>`** — muốn gọi phải giữ-chọn-copy một chuỗi số bên trong ô nhập. Shop này chạy bằng Zalo và không có một link Zalo nào. Đây cũng chính là lý do surface đọc như CRUD generic.
- **Fix:** Thêm cột trạng thái vận hành tô bằng `rentalChipClass` (`status-ongoing`/`status-overdue` đã có sẵn, đã đo contrast). Bọc SĐT thành `<a href={"tel:"+phone}>` ở cả bảng lẫn chi tiết, cộng nút Zalo `https://zalo.me/<phone>`. Dùng `STATUS_CLASS` ở `customer-rental-history.tsx:52`.
- **Where:** `customer-table.tsx:20-23,38` · `customer-rental-history.tsx:52` · `customer-edit-form.tsx:83-89`
- **Command:** `/impeccable colorize src/components/customers/customer-table.tsx`

### [P2] Vùng chạm dưới chính chuẩn 44px mà repo tự tuyên bố

- **Why it matters:** `ui/button.tsx:12,16` đặt chuẩn `min-h-11` = 44px và ghi "áp ở MỌI breakpoint". Ba chỗ trên surface này ở dưới: `ui/text-field.tsx:16-19` chỉ có `px-3 py-2`, **không `min-h`** ⇒ chiều cao thực **38px** (line-height 20 + 8 + 8 + border 2), ảnh hưởng 4 input gồm ô tìm kiếm; `customer-table.tsx:30-36` — `<td className="card-pad">` cao 44px nhưng vùng bấm là line box của chính `<a>`, **~20px**, bấm vào padding của ô không kích hoạt link; `customer-detail-page.tsx:38` link back ~20px. Trên điện thoại trong gara, một tay, đây là khác biệt giữa bấm được và bấm trượt.
- **Fix:** Thêm `min-h-11` vào `text-field.tsx` (vá mọi form trong app). Đổi `<td>` thành `<td className="p-0">` với `<Link className="card-pad block">` để cả ô thành vùng bấm.
- **Where:** `ui/text-field.tsx:16-19` · `customer-table.tsx:30-36` · `customer-detail-page.tsx:38`
- **Command:** `/impeccable adapt src/components/customers/customer-table.tsx`

## Persona Red Flags

**Alex (power user — chủ shop, mở màn này 30 lần/ngày)**: `customers-list-page.tsx:73-91` chỉ có `← Trước`/`Sau →` — không nhảy trang, không đổi `pageSize`, không sort. Chính `services/customers.ts:150` nhắc kịch bản "shop 12.000 khách": tới trang 300 là **300 cú click**. Debounce 300ms là đường duy nhất, không có Enter-để-tìm — Alex gõ xong nhấn Enter theo phản xạ, không gì xảy ra. Không bookmark được `/customers?q=0912`. Thứ tự cố định `asc(fullName)` (`services/customers.ts:190`) trong khi thứ tự có ích là _quá hạn → đang thuê → thuê gần nhất_.

**Sam (screen reader / bàn phím)**: `ui/alert.tsx:23` là `<p>` trần — Sam bấm "Lưu thay đổi", server trả 409, câu _"Số điện thoại này đã thuộc về khách hàng khác…"_ hiện lên màn hình và **không được đọc ra**. Sam nghe thấy con số không. Bảng bị thay nội dung im lặng sau mỗi lần debounce, không `aria-live`, không thông báo số kết quả. `<th>` thiếu `scope="col"` ở `customer-table.tsx:20-23` và `customer-rental-history.tsx:36-39` (kế thừa từ `staff-table.tsx:28-32` — sửa thì sửa cả hai). Hai landmark `main` lồng nhau. Nhãn nút `← Trước` bị đọc thành "leftwards arrow Trước".

**Hằng (nhân viên giao xe tới khách sạn quận 1, một tay, giữa nắng trưa)** — rút từ `PRODUCT.md` dòng 42, 20, 86: Mở sheet "Thêm", thấy **"Khách hàng · sắp có"**, nút `disabled` (`app-nav.tsx:35`). Trên điện thoại màn hình này không tồn tại — chỗ vỡ đầu tiên và vỡ tuyệt đối. Giả sử vào được: SĐT là text trần hoặc nằm trong `<input>`, muốn gọi phải copy bằng một tay; shop chạy bằng Zalo mà không có link Zalo. Bảng 560px trong khung nhìn ~295px ⇒ cột `Số đơn` và `Tổng tiền` luôn ngoài màn hình, phải cuộn ngang một vùng cuộn lồng trong trang đang cuộn dọc, bằng ngón cái. Mọi phản hồi trạng thái là `text-sm text-muted` 14px — dưới nắng trực xạ đó là thứ biến mất đầu tiên, và nó chính là chữ nói cho Hằng biết bảng đang tải hay đang rỗng. Gõ nửa ghi chú, khách gọi tới, vuốt back theo phản xạ — mất sạch, không cảnh báo.

## Minor Observations

- `customers-list-page.tsx:60` render `<CustomerTable>` vô điều kiện, **trước cả dòng loading ở `:62`** ⇒ 4 tiêu đề cột hiện trên khoảng trắng ở cả trạng thái rỗng lẫn lỗi. Ẩn `<thead>` khi `rows.length === 0`.
- Cột số và cột tiền canh trái, không `tabular-nums` (`customer-table.tsx:40`, `customer-rental-history.tsx:53`). Trong bảng mật độ cao, cột tiền canh phải + chữ số đều chiều rộng là khác biệt giữa quét được và đọc từng dòng.
- `customers-list-page.tsx:71` — dòng `Trang 1/3 · 47 khách hàng` bị ẩn hoàn toàn khi `total <= 20`. Shop 18 khách **không bao giờ thấy mình có bao nhiêu khách**. Tách số tổng khỏi điều kiện phân trang.
- Không có nút xoá nội dung (×) ở ô tìm — trên điện thoại phải bôi đen rồi Delete.
- Không có **primary action** nào trên trang danh sách. `stats-page.tsx:27` có `+ Lên đơn`; `/customers` không có gì, và cũng không có câu nào nói khách chỉ được tạo trong form lên đơn.
- `customer-edit-form.tsx:96` — nút Lưu luôn enabled kể cả khi không có gì đổi; kết hợp `update.isSuccess` không bao giờ tự tắt (`:93`), form nói dối: "Đã lưu thay đổi." nằm cạnh những trường đang bẩn. Gọi `update.reset()` trong `onChange`.
- `customer-detail-page.tsx:42` — lúc tải, trang không có tiêu đề (`h1` nằm trong nhánh `detail.data?.ok`). Mạng chậm ⇒ trang gần như trắng chỉ có "← Khách hàng" và "Đang tải…".
- `updatedAt` được server ghi (`services/customers.ts:126`) nhưng UI không bao giờ đọc. SĐT một khách đổi được mà không để lại dấu vết nhìn thấy được.
- `Ghi chú` là `TextField` một dòng, không giới hạn độ dài, hiện nguyên văn trong ô bảng ⇒ ghi chú dài làm vỡ nhịp hàng cả bảng.
- `errors.ts:errorCode()` tồn tại và `customer-edit-form.tsx:15` giữ `code`, nhưng **không nơi nào rẽ nhánh theo `code`**. Ca `404 CUSTOMER_NOT_FOUND` (mở bằng URL cũ) hiện như lỗi đỏ chung chung thay vì một trang có đường đi tiếp.
- Không có `<main>` thứ hai ở `stats-page.tsx`/`calendar-page.tsx` — hai trang đó làm đúng. Đây là bằng chứng luật có hiệu lực và surface này là ngoại lệ, không phải chuẩn mực mới.

## Questions to Consider

1. **Nếu shop giữ CCCD/hộ chiếu của khách — hôm nay thông tin đó nằm ở đâu?** `PRODUCT.md:40` xếp nó vào mục _đã xác nhận_, nhưng model chỉ có `fullName · phone · note`. Có phải câu trả lời thật là "nhân viên sẽ gõ vào ô Ghi chú"? Nếu đúng, ta vừa dựng một kho PII không cấu trúc, hiện thẳng trong một cột bảng — và dựng nó bằng cách **không quyết định gì cả**.
2. **Ai thật sự mở màn này, và để hỏi gì?** Nếu câu hỏi gần như luôn là _"khách vừa gọi tới, họ là ai, đang giữ xe nào"_, hình dạng đúng có lẽ không phải danh sách A→Z có phân trang, mà là **ô tìm theo SĐT đặt ở mọi nơi trong app**. Ta có đang xây một trang chỉ vì bảng `customers` tồn tại không?
3. **Sắp theo `fullName` A→Z đang phục vụ ai?** Không ai duyệt danh sách khách theo bảng chữ cái để tìm việc phải làm. Nếu đổi mặc định sang _quá hạn → đang thuê → gần nhất_, phân trang có còn đúng hình dạng, hay nó nên thành một danh sách "cần chú ý" giống `attention-list.tsx`?
4. **Nếu phần lớn lượt dùng là trên điện thoại ngoài hiện trường, vì sao hình dạng chủ đạo là `<table>` 560px cuộn ngang?** Dưới 768px, một danh sách thẻ một cột (tên + trạng thái + nút gọi/Zalo) chở đúng cùng lượng thông tin mà không cuộn ngang. Cái bảng đang phục vụ desktop hay đang phục vụ thói quen?
5. **`Ghi chú` thật sự chứa gì?** _"Khách quen giảm 10%"_, _"trả xe trễ 2 lần"_, _"giữ hộ chiếu UK"_, _"giao ở Liberty Central"_ — bốn loại dữ liệu, bốn vòng đời, đang bị nhồi vào một `<input type="text">`. Cái nào xứng đáng là trường riêng, và cái nào sẽ khiến ta hối hận nhất sau hai năm?
6. **Không nút Xoá là quyết định đúng và đã ghi lý do — nhưng còn "gộp hai hồ sơ trùng một người"?** Với ô tìm phân biệt hoa thường và dấu như hiện tại, hồ sơ trùng không phải rủi ro, nó là **chuyện chắc chắn xảy ra**. Ta đang thiết kế cho ngày đó, hay chờ nó tự thành nợ?
