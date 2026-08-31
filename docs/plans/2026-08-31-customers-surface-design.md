# Màn Khách hàng — design doc

**Ngày:** 2026-08-31 · **Nhánh:** `feat/auth-hardening` · **Trạng thái:** đã duyệt, chờ plan

Đợt này biến màn Khách hàng từ code chưa nối dây thành công cụ vận hành thật, và chốt bốn quyết
định nghiệp vụ về model khách hàng mà `docs/ROADMAP.md` đã đánh dấu "cần brainstorm riêng trước
khi code".

## 1. Vì sao có đợt này

`/impeccable critique` chấm màn Khách hàng **18/40**, 1 P0 + 4 P1 + 1 P2. Snapshot đầy đủ:
`apps/staff/.impeccable/critique/2026-08-31T16-35-17Z__src-pages-customers-list-page-tsx.md`.

Phát hiện đứng trước mọi thứ khác: **surface chưa được nối vào app**. `router.tsx:28-29` import hai
page nhưng `routeTree` không khai route nào, `app-nav.tsx:35` vẫn là `{ kind: "soon" }`, và
`bun run --filter @v9/staff typecheck` **exit 2** với bốn lỗi TS2322/TS2353. Vì
`build = tsc --noEmit && vite build`, nhánh này hiện không build được — hỏng CI cho cả những thay
đổi không liên quan.

Ba phát hiện nữa đáng ghi vì chúng sửa lại giả định của chính bản critique:

- **`customers.phone` đã là `UNIQUE`** (`packages/db/src/schema/rentals.ts:23`, kèm `CHECK`
  `^0[0-9]{8,10}$`). Hồ sơ trùng theo số điện thoại **không tạo được**. Critique cho rằng hồ sơ
  trùng là "chuyện chắc chắn xảy ra" — mạnh hơn thực tế.
- **Đường tìm theo số điện thoại đã chuẩn hoá hai vế** (`normalizePhone` cả khi đọc), và comment ở
  `services/customers.ts:36-38` trích thẳng bài học email trong `DEBT.md`. Tác giả đã biết nguyên
  tắc và áp đúng cho phone; **chỉ đường `fullName` là lọt**. Đây là một chỗ sót cụ thể, không phải
  cẩu thả toàn diện.
- **`detect.mjs` trả `[]` không có nghĩa "sạch".** Đã kiểm chứng bằng positive control: file `.tsx`
  chứa `font-family: Inter` + bounce easing ra 2 findings, exit 2 — nên `.tsx` có được quét thật.
  Nhưng file không phải HTML chỉ đi qua engine `regex`; phần lớn 59 luật thuộc scope
  `element`/`page`/`layout`/`visual-contrast`, **chỉ chạy khi có URL sống**. Detector mù với vùng
  chạm, overflow, async state và a11y — đúng nơi mọi vấn đề thật của surface này nằm.

## 2. Bốn quyết định nghiệp vụ

| # | Câu hỏi | Quyết định | Lý do |
|---|---------|-----------|-------|
| 1 | Giấy tờ tùy thân đang giữ sống ở đâu? | **`rentals`** | Giấy tờ được giữ cho MỘT lượt thuê rồi trả lại. `rentals` đã có `handedOverAt`/`returnedAt`/`depositAmount` — vòng đời khớp sẵn. PII bị khoá trong phạm vi một đơn, xoá được theo đơn. |
| 2 | Lưu sâu tới đâu? | **Loại + đã trả chưa, KHÔNG lưu số** | Trả lời được câu vận hành duy nhất thật sự cần ("đơn này còn giữ giấy gì"). Bằng chứng đối chiếu để ảnh chụp lo (MinIO), giống ảnh tình trạng xe. |
| 3 | Địa chỉ giao xe? | **`rentals.delivery_address`**, "lần gần nhất" là **truy vấn dẫn xuất** | Khách du lịch đổi chỗ ở mỗi chuyến — một `default_address` trên `customers` sẽ nói dối. Dẫn xuất thì không có cột nào phải đồng bộ. |
| 4 | `customers.note` xử thế nào? | **Giữ tự do, đổi sang textarea**, cộng **chỉ số trả trễ suy ra từ `rentals`** | Quyết định 1 và 3 đã hút mất hai trong bốn loại dữ liệu đang lẫn trong `note`. Phần còn lại là chữ người viết cho người đọc. "Trả trễ N lần" tính từ `returned_at > ends_at` — không thêm cột, và không bao giờ lệch với thực tế như ghi chú tay. |

## 3. Hai ngã rẽ kỹ thuật

### 3.1 Chuẩn hoá tìm kiếm — wrapper `IMMUTABLE` + `pg_trgm` GIN

Hai cái bẫy khiến việc chép nguyên mẫu migration `0011` sang đây **không chạy**:

1. **`unaccent()` là `STABLE`, không `IMMUTABLE`** (nó phụ thuộc một dictionary có thể đổi), nên
   Postgres từ chối dùng nó trong biểu thức index. Phải bọc một wrapper ghim `regdictionary`.
2. **btree index không phục vụ được `LIKE '%term%'`** — wildcard đứng đầu. Một expression btree
   index kiểu `0011` sẽ được tạo ra và **không bao giờ được dùng**.

Vì vậy: `pg_trgm` + GIN. Extension đã có sẵn trong `postgres:17-alpine` (đã kiểm:
`pg_available_extensions` liệt `unaccent` 1.1 và `pg_trgm` 1.6, cả hai chưa cài), và `0000` đã tạo
tiền lệ cài extension bằng migration.

Phương án bị loại: chuẩn hoá không index (để lại nợ đúng loại repo hay ghi rồi quên); cột
`GENERATED STORED` (vẫn cần wrapper `IMMUTABLE`, lại thêm một cột trùng lặp).

### 3.2 Tín hiệu vận hành — `LEFT JOIN LATERAL` trong list query

20 dòng mỗi trang nên lateral rất rẻ, một round trip, không state trùng lặp.

Phương án bị loại: endpoint `signals` riêng (tạo lại đúng vấn đề "hai trạng thái tải trên một
bảng" mà đợt này đang sửa); cột denormalized + trigger (trigger là state ẩn không nằm trong diff,
và sẽ lệch).

> **Sửa 2026-09-01, lúc lập plan:** implementation **không dùng LATERAL**. `listCustomers` đã có
> sẵn một truy vấn phụ khoanh theo đúng trang đang xem (`services/customers.ts:204-216`), kèm
> comment giải thích vì sao. Ba phương án trên phân biệt nhau ở **hình dạng API** — truy vấn phụ
> sẵn có vẫn là một round trip HTTP, không state trùng lặp, nên nó nằm TRONG phương án đã chọn,
> chỉ khác cách viết SQL. Mở rộng khuôn đã có (thêm một aggregate `FILTER` cho `lateReturnCount`,
> thêm một `DISTINCT ON` cho `activeRental`) thắng việc dựng LATERAL mới: giữ nguyên tối ưu
> khoanh-theo-trang, không viết lại một hàm đang chạy đúng. Kết quả ra ngoài y hệt.

## 4. Data model — một migration `db:custom`

`drizzle-kit` không sinh được `CREATE FUNCTION`, `CREATE EXTENSION` lẫn GIN index có biểu thức,
nên đây là migration viết tay, giống `0010` và `0011`.

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() là STABLE chứ không IMMUTABLE, nên KHÔNG dùng thẳng trong index
-- được. Wrapper này ghim regdictionary nên nó immutable THẬT — không phải khai
-- bừa cho qua planner rồi để index sai lặng lẽ khi dictionary đổi.
CREATE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- GIN + gin_trgm_ops chứ KHÔNG phải btree: btree không phục vụ được
-- LIKE '%term%'. Chép nguyên mẫu 0011 sang đây sẽ tạo một index chết.
CREATE INDEX customers_full_name_search_idx
  ON customers USING gin (f_unaccent(lower(full_name)) gin_trgm_ops);

ALTER TABLE rentals
  ADD COLUMN document_type text,
  ADD COLUMN document_returned_at timestamptz,
  ADD COLUMN delivery_address text;

ALTER TABLE rentals
  ADD CONSTRAINT rentals_document_type_valid
    CHECK (document_type IS NULL OR document_type IN ('CCCD','PASSPORT')),
  ADD CONSTRAINT rentals_document_return_needs_type
    CHECK (document_returned_at IS NULL OR document_type IS NOT NULL);
```

**Ba cột mới chưa có ai ghi vào** cho tới khi luồng bàn giao xe được dựng. Cố ý — chúng là hợp
đồng dữ liệu cho đợt sau, không phải cột bị quên. Người đọc sau đừng tưởng là lỗi.

`f_unaccent` là hàm riêng chứ không inline vì **index và query phải dùng chung một biểu thức**,
nếu không index vô dụng. Đó chính là bài học đã ghi ở `0011`.

## 5. API

### 5.1 Sửa tìm kiếm ở **cả hai** hàm

`services/customers.ts`: thay `like(fullName, '%term%')` bằng
`f_unaccent(lower(full_name)) LIKE f_unaccent(lower(:term))` trong **`listCustomers` VÀ
`searchCustomers`**.

Bắt buộc cả hai: `searchCustomers` phục vụ ô tìm tự động của `rental-form.tsx`, `listCustomers`
phục vụ màn danh sách. Sửa một bên là tạo ra hai kết quả khác nhau cho cùng một từ khoá — đúng lớp
lỗi mà comment ở `services/customers.ts:36-38` đã cảnh báo.

Đường số điện thoại **giữ nguyên** — nó đã chuẩn hoá hai vế và đã đúng.

### 5.2 Tín hiệu vận hành

`LEFT JOIN LATERAL` trong `listCustomers`, thêm vào `CustomerListRow`:

- `activeRental: { id, status, endsAt } | null` — chọn theo đúng thứ tự này, lấy **một** dòng:
  (1) đơn `ONGOING` (theo `CHECK` hiện có, tối đa một đơn `ONGOING` mỗi xe, nhưng một khách có thể
  thuê nhiều xe ⇒ lấy đơn có `ends_at` **sớm nhất**, vì đó là đơn sắp tới hạn nhất);
  (2) nếu không có `ONGOING`, lấy đơn `BOOKED` có `starts_at` **gần nhất trong tương lai**;
  (3) nếu không có gì, `null`. `CANCELLED` và `COMPLETED` không bao giờ được chọn.
- `lateReturnCount: number` — đếm đơn có `returned_at > ends_at`; **suy ra, không lưu**

Hình dạng `{ status, endsAt }` là cố ý: nó khớp đúng tham số structural của
`isOverdue(r: { status; endsAt }, now)` (`packages/shared/src/domain/rental.ts:56`), nên UI tô màu
"quá hạn" bằng chính hàm đó.

Giữ nguyên hình dạng response `{ customers, total }` và trần `CUSTOMERS_PAGE_SIZE_MAX = 50`.

## 6. UI — `apps/staff`

### 6.1 Nối dây (đóng P0)

- Khai `customersListRoute` (`/customers`) và `customerDetailRoute` (`/customers/$id`) dưới
  `protectedLayoutRoute`; thêm cả hai vào `addChildren`.
- `app-nav.tsx:35`: `{ kind: "soon" }` → `{ kind: "link", to: "/customers" }`, nới union `to` ở
  `app-nav.tsx:26`.
- `validateSearch` cho `{ q?: string; page?: number }` theo khuôn `validateCalendarSearch`
  (`router.tsx:206-212`); đọc bằng `useSearch`, ghi bằng `navigate({ search })`. Đóng luôn P1
  "state không ở URL": Back giữ được trang và từ khoá, F5 không mất, share link được.
- **Done-criteria:** `bun run --filter @v9/staff typecheck` exit 0.

### 6.2 Layout (đóng P1)

Bỏ `<main className="p-6">` ở `customers-list-page.tsx:42` và `customer-detail-page.tsx:37` →
`<div className="flex flex-col gap-4">`, đúng khuôn `stats-page.tsx:24` và `calendar-page.tsx:12`.
Bỏ luôn các `mt-3`/`mt-4` rải rác — `gap-4` lo việc đó.

`AppShell` đã bọc `children` trong chính một `<main className="page-gutter flex-1 py-4">`
(`app-shell.tsx:52`). Lặp `<main>` gây ba thiệt hại: hai landmark cho cùng nội dung; padding cộng
dồn 40px mỗi bên và **vứt bỏ hệ ba breakpoint** của `page-gutter`; trên 375px chỉ còn 295px hữu
dụng cho bảng `min-w-[560px]`. `stats-page.tsx:19-23` đã ghi luật này thành văn.

### 6.3 Tín hiệu vận hành (đóng P1)

- Cột trạng thái trên `customer-table.tsx`, tô bằng `rentalChipClass()` (`lib/rental-status.ts:26-47`).
  Token `status-ongoing`/`status-overdue` đã có sẵn và đã đo contrast — dùng lại, không khai mới.
- Số điện thoại thành **hành động**: `<a href={"tel:"+phone}>` + nút `zalo.me/<phone>`, ở **cả**
  bảng lẫn trang chi tiết. Shop chạy bằng Zalo (`PRODUCT.md` dòng 20, 86).
- `customer-rental-history.tsx:52` hiện in trạng thái bằng **chữ trần** — nơi duy nhất trong app
  hiển thị trạng thái đơn thuê mà không dùng màu. Sửa bằng cách **nới tham số của
  `rentalChipClass`** từ `CalendarRental` thành structural `{ status: RentalStatus; endsAt: Date }`,
  khớp đúng chữ ký `isOverdue`. **Không** export `STATUS_CLASS` (hiện là `const` nội bộ, cố ý) và
  **không** viết lại điều kiện "quá hạn" — comment ở `lib/rental-status.ts:38-44` ghi rõ rằng viết
  tay lại điều kiện đó chính là lỗi mà `isOverdue` sinh ra để tránh.
- Badge "trả trễ N lần" khi `lateReturnCount > 0`.

### 6.4 Vùng chạm (đóng P2)

- `min-h-11` vào `ui/text-field.tsx:16-19` — hiện cao thực 38px, dưới chuẩn 44px mà chính
  `ui/button.tsx:12,16` tuyên bố "áp ở MỌI breakpoint". Vá này chạm mọi form trong app.
- `customer-table.tsx:30-36`: `<td className="p-0">` + `<Link className="card-pad block">` để cả ô
  thành vùng bấm (hiện vùng bấm là line box của `<a>`, ~20px).

### 6.5 Ghi chú

`note` từ `TextField` một dòng → textarea có `maxlength`.

## 7. Hỏng im lặng (đóng P1) — sửa ở tầng dùng chung

Cả ba query hiện chỉ xử lý `res.error` (lỗi HTTP gói trong discriminated union). Nếu `queryFn`
**reject** (mạng chết, api down), `isPending` false và `data` undefined ⇒ **không nhánh nào render
gì**. Nhân viên thấy tiêu đề, ô tìm, header bảng rỗng, không một thông báo. Kiểm chứng cơ học:
`isError` **không xuất hiện một lần nào** trong toàn `apps/staff/src/`.

- Thêm nhánh `isError` + nút "Thử lại" gọi `refetch()` cho cả ba query.
- `placeholderData: keepPreviousData` và đổi chỉ báo tải sang `isFetching` (khớp
  `rental-form.tsx:348`) — bảng hết trắng mỗi lần đổi trang/gõ tìm.
- **`role="alert"` + `aria-live="polite"` vào `ui/alert.tsx:23`** — hiện là `<p>` trần, nên mọi
  thông báo lỗi và thành công của app im lặng với screen reader. Một dòng vá sáu màn hình.
- `update.reset()` trong `onChange` của form — hiện `update.isSuccess` không bao giờ tự tắt, nên
  "Đã lưu thay đổi." nằm cạnh những trường đang bẩn.
- Ẩn `<thead>` khi `rows.length === 0`; tách số tổng khỏi điều kiện phân trang
  (`customers-list-page.tsx:71` hiện ẩn hoàn toàn khi `total <= 20`, nên shop 18 khách không bao
  giờ thấy mình có bao nhiêu khách).

## 8. Test

`packages/shared/src/domain/**` TDD nghiêm. Phần infra/UI dùng verification-before-completion.

Bắt buộc có:

1. **Gõ thường-không-dấu ra đúng hồ sơ** — `nguyen` → `Nguyễn`, `tran` → `Trần`. Đóng đúng lỗ mà
   `customers.test.ts:65` bỏ sót (nó chỉ test bằng đúng chuỗi hoa/thường gốc).
2. **`EXPLAIN` xác nhận query đi qua `customers_full_name_search_idx`.** Một index không được dùng
   còn tệ hơn không có index: nó tốn ghi, tốn dung lượng, và tạo ảo giác đã tối ưu. Đây là luật
   "hàng rào phải được probe, không được tin" của root `CLAUDE.md` áp cho index.
3. **Hai CHECK mới** — `rentals_document_type_valid` từ chối giá trị lạ;
   `rentals_document_return_needs_type` từ chối "đã trả một thứ chưa từng giữ".
4. **`searchCustomers` và `listCustomers` trả cùng kết quả cho cùng từ khoá** — hàng rào chống việc
   sửa một bên quên bên kia.

## 9. Không làm trong đợt này — và vì sao

**Không có chức năng gộp hồ sơ trùng.** `customers.phone` đã `UNIQUE` nên trùng chỉ xảy ra khi một
người dùng hai số khác nhau — hiếm, và sau khi sửa tìm kiếm thì nhân viên sẽ **tìm ra** hồ sơ cũ
thay vì tạo mới. Quan trọng hơn, migration `0011` đã ghi thành văn lập trường của repo: *"gộp ngầm
hai hồ sơ trùng — có thể là hai vai trò, hai lịch sử duyệt khác nhau — là quyết định nghiệp vụ,
không phải thứ một migration tự động nên tự ý làm."* Ghi vào `DEBT.md` kèm điều kiện mở lại: khi
xuất hiện ca trùng thật.

**Không có trường giảm giá / hạng khách quen.** `PRODUCT.md` liệt chính sách tính ngày thuê và bảng
giá vào mục "Chưa quyết — đừng bịa".

**Không lưu số giấy tờ.** Quyết định §2.2. Ảnh chụp giấy tờ để dành đợt bàn giao (MinIO), cùng chỗ
với ảnh tình trạng xe.

**Không sort / lọc / nhảy trang / hành động hàng loạt.** Persona Alex trong critique nêu đúng
(`services/customers.ts:150` tự nhắc kịch bản "shop 12.000 khách": tới trang 300 là 300 cú click),
nhưng đó là tính năng mới, không phải lỗi. Ghi `ROADMAP.md`.

**Không đổi thứ tự mặc định `asc(fullName)`.** Critique đặt câu hỏi hay — thứ tự có ích cho một
shop là *quá hạn → đang thuê → gần nhất* — nhưng đổi nó là đổi hình dạng sản phẩm (danh sách
duyệt → danh sách cần chú ý), xứng đáng một brainstorm riêng.

## 10. Rủi ro đã biết

- **Ba cột mới không có writer** cho tới đợt bàn giao. Chấp nhận có ý thức; đã ghi ở §4.
- **`CREATE EXTENSION` cần quyền superuser.** Migration chạy bằng role owner nên được, nhưng
  `0001_service_roles.sql` đã chặn DDL của Directus/SuperTokens trên `public` — cần xác nhận
  migrator vẫn đủ quyền trước khi land. Kiểm bằng `bun run db:migrate` trên DB dev sạch.
- **GIN index làm chậm đường ghi.** Không đáng kể ở quy mô một shop, nhưng nếu `bun run bench`
  báo vượt budget thì đây là nghi phạm đầu tiên.
- **Đợt này chạm `ui/text-field.tsx`, `ui/alert.tsx` và `lib/rental-status.ts`** — ba module dùng
  chung. `text-field` và `alert` chạm sáu màn auth; `rental-status` chạm `calendar-timeline.tsx` và
  `calendar-month.tsx`. Phải kiểm lại tất cả sau khi sửa, không chỉ màn Khách hàng.
- **Nới tham số `rentalChipClass` là thay đổi signature của một hàm exported.** Theo root
  `CLAUDE.md`, bắt buộc chạy `find_referencing_symbols` trước khi đổi — blast radius của CodeGraph
  không đủ thay thế.
