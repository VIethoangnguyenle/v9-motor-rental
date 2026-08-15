# apps/staff — màn Thống kê, lịch thuê xe, và hệ thiết kế

**Ngày:** 2026-08-15 · **Trạng thái:** design, chưa implement
**Liên quan:** [`2026-08-10-fleet-catalogue-design.md`](2026-08-10-fleet-catalogue-design.md) · [`2026-08-13-staff-auth-fix-design.md`](2026-08-13-staff-auth-fix-design.md) · [`../ROADMAP.md`](../ROADMAP.md) · [`../DEBT.md`](../DEBT.md)

---

## §1 · Vì sao đợt này tồn tại

`apps/staff` hôm nay có sáu màn xác thực, một bảng nhân viên, và một trang health đứng ở `/`.
Không có màn hình nghiệp vụ nào. Chủ shop đăng nhập được nhưng không làm được việc gì.

Đợt này dựng **hai màn hình nghiệp vụ đầu tiên** và **hệ thiết kế** mà `apps/staff/CLAUDE.md` đã
hẹn từ đầu ("`src/index.css` cố ý không khai `@theme` riêng — khi làm lịch/thống kê/bàn giao thì
mới thêm"). Đây là lúc đó.

Ba thứ trong repo được viết từ đợt scaffold cho đúng ngày hôm nay, và design này bám vào chúng
chứ không dựng lại:

| Đã có sẵn                                       | Vì sao nó ở đó                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `migrations/0000_btree_gist.sql`                | extension bật sẵn **chỉ để** `EXCLUDE USING gist (vehicle_id WITH =, …)` chạy được |
| Comment trong `packages/db/src/schema/index.ts` | ghi **nguyên văn** câu exclusion constraint mà `rentals` phải kèm                  |
| `packages/shared/domain/interval.ts`            | `overlaps()` dùng biên `[start, end)`, cố ý khớp `tstzrange` mặc định của Postgres |

### Phạm vi

| Workspace         | Việc                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `packages/db`     | migration `0009`: `customers`, `rentals` + ràng buộc chống đặt trùng                            |
| `packages/shared` | `domain/rental.ts` — trạng thái đơn, chuyển trạng thái, quá hạn, ngày ghi nhận doanh thu        |
| `apps/api`        | `routes/rentals.ts`, `routes/stats.ts`, `services/rentals.ts`, `services/customers.ts`, `/fleet` |
| `apps/staff`      | `@theme` token · app shell responsive · `/` thống kê · `/calendar` lịch · form lên đơn · retrofit |
| gốc repo          | sub-type `frontend-ui` trong `eslint.config.js` (trả nợ đã ghi ở `DEBT.md`)                     |

### Ngoài phạm vi — nói rõ để sau này không ai tưởng là quên

Chính sách tính giá/cọc tự động (giá **nhập tay** trong đợt này) · `booking_requests` từ
`apps/web` · bàn giao xe và ảnh tình trạng xe · biểu đồ doanh thu · màn khách hàng riêng · vai
trò `SALES`.

**Biểu đồ là quyết định, không phải bỏ sót.** Sáu con số và ba dòng "cần chú ý" đã trả lời đúng
câu chủ shop hỏi. Biểu đồ đòi một quyết định riêng về kỳ và cách so sánh, và nó không chặn gì.

### Một chỗ phạm vi tự nở ra, có chủ ý

Lịch chỉ-đọc thì không có gì để đọc. Không có `POST /rentals` và một form lên đơn, sau khi land
vẫn phải `INSERT` bằng SQL mới thấy được cái lịch chạy. Nên **form lên đơn tối thiểu** nằm trong
phạm vi: chọn xe, chọn khách (hoặc tạo nhanh), chọn khoảng ngày, nhập tổng tiền và cọc. Không có
bước bàn giao, không có ảnh, không tính giá.

---

## §2 · Quyết định đã chốt

| Quyết định           | Nội dung                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| Home                 | **Thống kê** — doanh thu và số đơn theo ngày · tuần · tháng                          |
| Lịch                 | Tính năng riêng ở `/calendar`, **hai chế độ có nút chuyển**: Timeline theo xe ↔ Tháng |
| Ghi nhận doanh thu   | Theo **ngày giao xe**                                                                 |
| Backend              | `customers` + `rentals` tối thiểu, giá **nhập tay**                                  |
| Thiết bị             | Điện thoại · tablet · desktop **ngang nhau**, ba breakpoint thật                      |
| Hệ thiết kế          | Phủ **toàn app**: `@theme`, shell mới, retrofit 6 màn auth + bảng nhân viên           |
| Tính năng chưa làm   | Nav hiện đủ, đánh dấu rõ "sắp có"                                                     |
| Hàng rào `ui/`       | Trả nợ `frontend-ui` trong `eslint.config.js` **trong đợt này**                       |

---

## §3 · Dữ liệu

### 3.1 `customers`

| Cột                       | Kiểu          | Ghi chú                                    |
| ------------------------- | ------------- | ------------------------------------------ |
| `id`                      | `uuid` PK     |                                            |
| `full_name`               | `text` NOT NULL |                                          |
| `phone`                   | `text` NOT NULL **UNIQUE** | lưu đã chuẩn hoá                |
| `note`                    | `text`        |                                            |
| `created_at`/`updated_at` | `timestamptz` |                                            |

`phone` lưu **đã chuẩn hoá** — chỉ chữ số, dạng `0xxxxxxxxx` — và chuẩn hoá **cả đường ghi lẫn
đường đọc**. `CHECK (phone ~ '^0[0-9]{8,10}$')` ép ở tầng DB, để một hàng chưa chuẩn hoá không
lọt vào được bằng bất cứ đường nào.

Đây đúng là bài học đã ghi trong [`../DEBT.md`](../DEBT.md) về email phân biệt hoa thường: cùng
lớp lỗi, cùng cách hỏng im lặng. Khách gõ `+84…`, `0…`, hay `0912 345 678` sẽ đẻ ra ba hồ sơ cho
một người, `UNIQUE` không chặn được gì, và **không có lỗi ở đâu cả** — chỉ có một danh sách khách
hàng bẩn dần theo tháng.

### 3.2 `rentals`

| Cột                                | Kiểu                    | Ghi chú                                    |
| ---------------------------------- | ----------------------- | ------------------------------------------ |
| `id`                               | `uuid` PK               |                                            |
| `vehicle_id`                       | `uuid` NOT NULL         | → `vehicles(id)` ON DELETE RESTRICT        |
| `customer_id`                      | `uuid` NOT NULL         | → `customers(id)` ON DELETE RESTRICT       |
| `starts_at` / `ends_at`            | `timestamptz` NOT NULL  | **kế hoạch**                               |
| `period`                           | `tstzrange` **sinh**    | `tstzrange(starts_at, ends_at, '[)')`      |
| `status`                           | `text` NOT NULL         | `BOOKED`·`ONGOING`·`COMPLETED`·`CANCELLED` |
| `handed_over_at`                   | `timestamptz`           | **thực tế** — mốc ghi nhận doanh thu       |
| `returned_at`                      | `timestamptz`           | thực tế                                    |
| `total_amount` / `deposit_amount`  | `integer` NOT NULL      | Vnd nguyên, nhập tay                       |
| `created_by`                       | `text` NOT NULL         | → `staff_users(id)`                        |
| `note`                             | `text`                  |                                            |
| `created_at` / `updated_at`        | `timestamptz` NOT NULL  |                                            |

**`period` là cột sinh (`GENERATED ALWAYS AS … STORED`), không ghi tay được.** Nếu ghi tay được
thì nó lệch được với `starts_at`/`ends_at`, và lúc đó ràng buộc chống trùng đang bảo vệ **một
khoảng thời gian không phải khoảng người dùng nhìn thấy** — hỏng theo kiểu tệ nhất: hàng rào vẫn
đứng đó, vẫn chạy, và bảo vệ nhầm thứ.

**`created_by` là `text`, không phải `uuid`** — vì `staff_users.id` là `text` (id do SuperTokens
sinh, xem `packages/db/src/schema/staff.ts`). Đây chính là FK mà [`../ROADMAP.md`](../ROADMAP.md)
đòi: ai chốt đơn.

**`starts_at` là kế hoạch, `handed_over_at` là thực tế, và doanh thu dùng cái thứ hai.** Khách hẹn
9h sáng nhưng 4h chiều mới tới lấy xe là chuyện thường; giao trễ sang hôm sau cũng có. Tính doanh
thu theo `starts_at` thì đơn đó nằm sai ngày vĩnh viễn, và không ai phát hiện vì con số vẫn "có
vẻ đúng".

**"Quá hạn" KHÔNG phải một trạng thái.** Nó là `status = 'ONGOING' AND ends_at < now()`, suy ra
lúc đọc. Nếu là trạng thái thì phải có một job đi đổi nó, và trong khoảng job chưa chạy thì
database đang nói dối.

#### Ràng buộc

```sql
CHECK (ends_at > starts_at)
CHECK (status IN ('BOOKED','ONGOING','COMPLETED','CANCELLED'))
CHECK (total_amount >= 0 AND deposit_amount >= 0)

-- Cột dấu thời gian phải khớp trạng thái, ép ở DB chứ không ở service.
-- Bốn CHECK, không phải hai: chúng đi thành cặp để quan hệ thành HAI CHIỀU.
CHECK (status <> 'ONGOING'   OR handed_over_at IS NOT NULL)
CHECK (status <> 'COMPLETED' OR (handed_over_at IS NOT NULL AND returned_at IS NOT NULL))
CHECK (handed_over_at IS NULL OR status IN ('ONGOING','COMPLETED'))
CHECK (returned_at    IS NULL OR status = 'COMPLETED')

-- Trả xe không xảy ra trước khi giao xe.
CHECK (returned_at IS NULL OR handed_over_at IS NULL OR returned_at >= handed_over_at)

-- Hàng rào chống đặt trùng. KHÔNG phải một câu SELECT kiểm trước khi insert —
-- câu đó luôn thua race condition.
ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)
  WHERE (status <> 'CANCELLED');
```

Bốn `CHECK` về dấu thời gian không phải phòng thủ thừa, và **phải đi đủ cả hai chiều**. Doanh thu
tính bằng `SUM(total_amount) WHERE handed_over_at IS NOT NULL`, **không lọc trạng thái**. Vậy có
hai kiểu hỏng, ngược nhau:

| Hàng sai                                     | Hậu quả                                              |
| -------------------------------------------- | ---------------------------------------------------- |
| `ONGOING` mà `handed_over_at IS NULL`        | **biến mất** khỏi báo cáo                            |
| `BOOKED`/`CANCELLED` mà có `handed_over_at`  | **được đếm vào tiền** — thổi phồng doanh thu, im lặng |

Bản đầu của thiết kế này chỉ chặn kiểu thứ nhất, và biện minh kiểu thứ hai bằng "`transition()`
cấm `ONGOING → CANCELLED`". Đó là **luật của ứng dụng đi bảo vệ một truy vấn ở tầng database** —
nó không đứng trước một câu `UPDATE` sửa tay, đúng mối đe doạ mà `CHECK` số điện thoại ở
`customers` đã viện ra để tồn tại. Hai chỗ phải được đối xử như nhau, nên quan hệ được ép thành
tương đương:

```
handed_over_at IS NOT NULL  ⟺  status IN ('ONGOING','COMPLETED')
returned_at    IS NOT NULL  ⟺  status = 'COMPLETED'
```

⚠️ **`CHECK (ends_at > starts_at)` canh ít hơn tên nó gợi ý.** Cột sinh `period` tính
`tstzrange(starts_at, ends_at, '[)')` **trước** khi CHECK chạy, và chính hàm dựng range đã từ chối
`lower > upper` với SQLSTATE `22000`. Nghĩa là ca "ngày kết thúc trước ngày bắt đầu" bị chặn ở
tầng kiểu dữ liệu, không phải bởi CHECK này; phần CHECK thật sự còn canh là ca **bằng nhau**
(range rỗng — hợp lệ với Postgres, vô nghĩa với một đơn thuê).

Đo được, không suy luận: viết test cho CHECK này bằng dữ liệu đảo ngược thì nó xanh vì `22000` chứ
không vì `23514`. Giữ CHECK vì ca bằng nhau là ca thật, nhưng đừng ghi vào tài liệu rằng nó là thứ
chặn khoảng thời gian ngược.

Đơn `CANCELLED` không chặn chỗ — đó là lý do có mệnh đề `WHERE`.

#### Index

- Exclusion constraint **tự tạo** GiST index trên `(vehicle_id, period)`. Truy vấn lịch
  (`period && tstzrange($from,$to)`) dùng chính index đó — **không thêm index nào cho lịch**.
- `CREATE INDEX rentals_revenue_idx ON rentals (handed_over_at) WHERE handed_over_at IS NOT NULL;`
  — partial, cho truy vấn thống kê.

---

## §4 · Domain thuần — `packages/shared/src/domain/rental.ts`

**TDD nghiêm, test trước, luôn luôn.** Đây là luật của repo cho `packages/shared/src/domain/`.

```ts
export type RentalStatus = "BOOKED" | "ONGOING" | "COMPLETED" | "CANCELLED";

export function transition(from: RentalStatus, to: RentalStatus):
  | { ok: true }
  | { ok: false; reason: "INVALID_TRANSITION" };

export function isOverdue(r: { status: RentalStatus; endsAt: Date }, now: Date): boolean;
export function toInterval(r: { startsAt: Date; endsAt: Date }): Interval;

/** Đơn này tính vào doanh thu của thời điểm nào. `null` = chưa tính. */
export function revenueAt(r: { status: RentalStatus; handedOverAt: Date | null }): Date | null;
```

### Chuyển trạng thái được phép — đúng ba đường

| Từ        | Sang        | Nghĩa                       | Đóng dấu                |
| --------- | ----------- | --------------------------- | ----------------------- |
| `BOOKED`  | `ONGOING`   | giao xe                     | `handed_over_at = now()` |
| `BOOKED`  | `CANCELLED` | huỷ **trước khi** giao      | —                       |
| `ONGOING` | `COMPLETED` | trả xe                      | `returned_at = now()`   |

Mọi đường khác trả `{ ok: false, reason: "INVALID_TRANSITION" }`.

**`ONGOING → CANCELLED` bị cấm có chủ ý.** Xe đã ra khỏi cửa hàng rồi thì không có chuyện "chưa
từng xảy ra"; khách trả sớm vẫn là `COMPLETED`. Cấm đường đó cho một hệ quả sạch ở tầng dữ liệu:
**đơn `CANCELLED` không bao giờ có `handed_over_at`**, nên truy vấn doanh thu chỉ cần lọc
`handed_over_at IS NOT NULL` mà không phải kiểm trạng thái, và mệnh đề `WHERE status <> 'CANCELLED'`
của exclusion constraint không thể vô tình bỏ sót tiền đã thu.

Bốn điểm:

- **Trả discriminated union, không throw** — pattern 3 của repo. Route dịch sang HTTP.
- **`isOverdue` nhận `now` làm tham số**, không tự gọi `Date.now()`. Đó là điều kiện để test
  không phải đóng băng đồng hồ.
- **`revenueAt` là định nghĩa duy nhất** của "đơn này tính vào ngày nào". API dùng nó, frontend
  dùng nó. Hai định nghĩa là hai con số khác nhau cho cùng một tháng.
- Frontend dùng **chính** `isOverdue` để tô màu thanh trên lịch — không viết lại điều kiện trong
  JSX.

Hằng số múi giờ của shop (`SHOP_TIMEZONE = "Asia/Ho_Chi_Minh"`) cũng export từ đây, để SQL và
frontend không mỗi bên giữ một bản.

---

## §5 · API

Tất cả nằm sau `staff-guard`. Không có endpoint công khai nào trong đợt này.

| Endpoint                    | Ghi chú                                        |
| --------------------------- | ---------------------------------------------- |
| `GET /fleet`                | Mọi xe **kèm biển số**, trừ `archived`         |
| `GET /rentals?from=&to=`    | Đơn giao với khoảng, tối đa `MAX_RANGE_DAYS`   |
| `POST /rentals`             | Tạo đơn                                        |
| `POST /rentals/:id/status`  | Đổi trạng thái                                 |
| `GET /customers?q=`         | Tìm theo tên hoặc số điện thoại                |
| `POST /customers`           | Tạo nhanh                                      |
| `GET /stats/summary`        | Sáu số doanh thu + ba dòng "cần chú ý"         |

### 5.1 `GET /fleet` là route mới, KHÔNG phải thêm field vào `/vehicles`

`routes/vehicles.ts` có comment nói thẳng: `plate` vắng mặt trong `summarySchema` **chính là** cơ
chế chặn, vì Elysia cắt mọi field không được khai. Nới schema đó để staff dùng ké là tháo hàng rào
của một route công khai. Lịch cần biển số để phân biệt hai chiếc cùng mẫu, nên nó cần đường riêng.

### 5.2 `23P01` → 409, và cái bẫy phải viết đúng

Lỗi bị bọc **hai lần**, và mỗi tầng giấu SQLSTATE một kiểu khác nhau. Đo được, không suy luận:

| Bạn viết                         | Qua Bun.SQL trần              | Qua `db.insert(...)` (Drizzle) |
| -------------------------------- | ----------------------------- | ------------------------------ |
| `e.code`                         | `"ERR_POSTGRES_SERVER_ERROR"` | `undefined`                    |
| `e.errno`                        | `"23P01"` ✅                  | **`undefined`**                |
| `e instanceof SQL.PostgresError` | `true`                        | **`false`**                    |
| `e.cause.errno`                  | —                             | `"23P01"` ✅                   |

```ts
function isOverlapViolation(e: unknown): boolean {
  const cause = e instanceof Error ? e.cause : undefined;
  const pg = e instanceof SQL.PostgresError ? e : cause instanceof SQL.PostgresError ? cause : null;
  return pg !== null && pg.errno === "23P01" && pg.constraint === "rentals_no_overlap";
}
```

Cả hai tầng đều cho ra **một điều kiện không bao giờ đúng** nếu viết thiếu, và cả hai đều xanh dưới
`tsc` lẫn mọi test mock. Va chạm booking khi đó rơi ra **500 thay vì 409**.

Kiểm `.constraint` chứ không chỉ SQLSTATE: một exclusion constraint thứ hai trên cùng bảng cũng cho
`23P01`, và dịch nó thành "xe đã có đơn" là trả sai lý do cho người dùng.

⚠️ **Test schema ở `packages/db` không thay thế được test service.** Nó insert bằng tagged template
thẳng qua Bun.SQL nên không bao giờ đi qua tầng bọc của Drizzle: nó chứng minh *database* phát
`23P01`, không chứng minh *service* nhìn thấy hình dạng nào.

Transaction boundary thuộc **service**, không thuộc route. Câu insert có thể lỗi được bọc trong
`tx.savepoint(...)`, vì một lỗi trong transaction làm hỏng cả transaction.

### 5.2b Khoảng thời gian của `GET /rentals`

`MAX_RANGE_DAYS = 92` — hằng **có tên**, khai một chỗ, không rải số trong route. Cửa sổ rộng nhất
mà UI xin là 14 ngày (§9); 92 để chừa chỗ cho chế độ tháng và cho việc điều hướng nhanh nhiều
tháng, mà vẫn chặn được một request quét cả bảng.

Vượt ngưỡng, `from >= to`, hoặc thiếu tham số → **400 `INVALID_RANGE`**, không phải cắt bớt trong
im lặng. Tự cắt là trả về dữ liệu thiếu dưới vỏ một response 200 — client không có cách nào biết.

### 5.3 `POST /customers` trùng số điện thoại

Trả **409 kèm `id` của khách đã có**, để form dùng lại hồ sơ đó. Trả 409 trống là đẩy việc cho
người dùng đi tự tìm.

### 5.4 `GET /stats/summary` — một endpoint, không phải năm

```ts
{
  revenue: {
    today:     { amount: Vnd; orders: number; prevAmount: Vnd },
    thisWeek:  { amount: Vnd; orders: number; prevAmount: Vnd },
    thisMonth: { amount: Vnd; orders: number; prevAmount: Vnd },
  },
  attention: {
    overdue: number,
    dueToday: number,
    pendingStaff?: number,   // CHỈ OWNER
  }
}
```

Home cần cả sáu số và ba dòng cùng lúc. Tách ra thành nhiều request là năm spinner lệch nhau và
năm vòng mạng cho một màn hình. `pendingStaff` là field tuỳ chọn — service kiểm role, vì `STAFF`
không được thấy nó.

**`prevAmount` so với kỳ liền trước cùng độ dài**, không phải "cùng kỳ năm ngoái":

| Kỳ          | Cắt như thế nào                       | So với                        |
| ----------- | ------------------------------------- | ----------------------------- |
| `today`     | 00:00 → 24:00 hôm nay, giờ VN         | cùng khung của **hôm qua**    |
| `thisWeek`  | **Thứ Hai** 00:00 → nay, giờ VN       | trọn tuần trước (T2 → CN)     |
| `thisMonth` | ngày 1 lúc 00:00 → nay, giờ VN        | trọn tháng trước              |

Tuần bắt đầu **Thứ Hai** (quy ước Việt Nam), không phải Chủ Nhật. `thisWeek` và `thisMonth` là kỳ
**đang chạy dở**, còn kỳ so sánh là kỳ **đã trọn** — nên đầu tháng con số `−4%` là bình thường,
không phải sụt. Nhãn dưới thẻ phải nói rõ điều đó, nếu không chủ shop đọc sai mỗi đầu kỳ.

`orders` đếm số đơn có `handed_over_at` rơi vào kỳ, cùng bộ lọc với `amount` — hai con số trên
cùng một thẻ không được đếm hai tập khác nhau.

### 5.5 ⚠️ Múi giờ — chỗ hỏng im lặng của cả mục này

"Hôm nay" của shop là ngày theo **giờ Việt Nam**, không phải UTC. Cắt kỳ bằng UTC thì từ 0h đến
7h sáng giờ VN, mọi đơn giao trong khoảng đó bị đếm vào **ngày hôm trước**:

- số sai mỗi sáng, **tự đúng lại lúc 7h**, nên không ai bắt được bằng cách nhìn;
- không có exception, không có log, không có gì đỏ.

Mọi phép cắt kỳ đi qua `AT TIME ZONE 'Asia/Ho_Chi_Minh'`, và có **một test cố định đồng hồ vào 2h
sáng giờ VN** để chứng minh. Test đó là hàng rào; câu SQL viết cẩn thận thì không.

Quyền: `OWNER` và `STAFF` **đều** tạo đơn và đổi trạng thái được — shop nhỏ, và mọi đơn đã có
`created_by` để truy. `pendingStaff` và trang `/staff` vẫn chỉ OWNER.

---

## §6 · Hệ thiết kế và thang cách

`src/index.css` khai `@theme` — đúng thời điểm `apps/staff/CLAUDE.md` đã hẹn.

### 6.1 Màu

Nhóm quan trọng nhất là **màu trạng thái**, vì lịch sống bằng nó:
`booked` · `ongoing` · `overdue` · `completed`.

⚠️ [`../ROADMAP.md`](../ROADMAP.md) chặn cứng "**đừng bịa màu**, chờ logo thật". Luật đó viết cho
[`../DESIGN.md`](../DESIGN.md), tức cho `apps/web`. `apps/staff` **không dùng `DESIGN.md`**, và
màu trạng thái ở đây là **chức năng** (đỏ = quá hạn), không phải nhận diện thương hiệu. Accent
dùng một màu hệ thống trung tính, **có comment trong CSS ghi rõ nó không phải màu thương hiệu**,
để lần có logo thật không ai phải đoán chỗ nào được đổi.

### 6.2 Thang cách — ba breakpoint, không phải hai

|                        | Điện thoại `<768`                | Tablet `768–1279`  | Desktop `≥1280`   |
| ---------------------- | -------------------------------- | ------------------ | ----------------- |
| Gutter nội dung        | **16px**                         | **20px**           | **24px**          |
| Padding trong thẻ      | 12 / 14                          | 12 / 14            | 14 / 16           |
| Khoảng cách giữa thẻ   | 8px                              | 10px               | 12px              |
| Điều hướng             | bottom nav 4 ô, cao **56px**     | sidebar 168px      | sidebar 208px     |
| Thẻ doanh thu          | 1 cột                            | 3 cột              | 3 cột             |
| Cỡ chữ thân            | 13–14px                          | 13px               | 12–13px           |
| Vùng chạm tối thiểu    | **44 × 44px** — mọi ô nav, nút, và dòng bấm được, ở mọi breakpoint       |||

**Tablet có breakpoint riêng vì nó không phải điện thoại phóng to.** Ở 768px còn đủ chỗ cho
sidebar, và dòng "cần chú ý" có chỗ ghi thêm tên xe — thông tin mà bản điện thoại phải cắt. Không
tách ra thì tablet rơi vào nhánh mobile và phí một nửa màn hình.

**Mật độ thông tin cao là đặc quyền của desktop.** Trên điện thoại chữ phải to lên và hàng phải
thưa ra. Áp thẳng luật "ưu tiên mật độ" của app này xuống màn 375px là được một app không bấm
trúng và không đọc nổi ngoài nắng gara.

### 6.3 ⚠️ `viewport-fit=cover` đang thiếu — PWA sẽ vẽ đè lên home indicator

`apps/staff/index.html` hiện khai:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

Thiếu `viewport-fit=cover`, nên `env(safe-area-inset-bottom)` **luôn trả `0`**. Trong PWA
standalone trên iPhone, bottom nav sẽ nằm dưới thanh home indicator — bấm không trúng ô ngoài
cùng.

Không hỏng ở `vite dev`, không hỏng trên desktop, không hỏng trong tab trình duyệt. Chỉ hỏng đúng
lúc chủ shop **cài app vào máy** — tức đúng lúc không ai đang test.

Sửa: thêm `viewport-fit=cover`, và đáy màn dùng
`padding-bottom: calc(56px + env(safe-area-inset-bottom))`.

### 6.4 Padding phải là token, và có hàng rào chạy được

Thang trên khai bằng `@theme` + `@utility` (giống `apps/web` đã làm với `py-section`,
`btn-shape`), rồi **cấm arbitrary value cho khoảng cách** trong `apps/staff`: không `p-[13px]`,
không `gap-[7px]`, không `mt-[22px]`.

Luật đó không tự sống bằng kỷ luật đọc code — repo này đã đếm được bốn lần một hàng rào suy thoái
trong im lặng. Hàng rào ở đây là **một test**, vì `bun test` đã nằm sẵn trong CI:

`apps/staff/src/lib/spacing-fence.test.ts` quét mọi `.tsx` trong `src/` và fail nếu thấy
arbitrary value cho các nhóm khoảng cách (`p`, `px`, `py`, `m`, `gap`, `space`).

Chọn test thay vì thêm plugin ESLint là có lý do: plugin thêm một phụ thuộc mới vào đúng file
(`eslint.config.js`) mà mỗi lần đụng vào là phải chạy lại bốn probe của skill `v9-fences`. Một
test không đụng gì tới hàng rào kiến trúc đang có.

---

## §7 · App shell và điều hướng

Shell đặt ở `component` của `protectedLayoutRoute` — **không phải** ở từng page.

Hôm nay `health-page` tự render `<AppNav>` còn `staff-list-page` thì không, nên nó phải tự chế một
link "← Trang chủ". Đó đúng là lớp lỗi mà cây route hai nhánh sinh ra để diệt: đưa shell lên layout
route thì trang mới **tự có** nav, không phải nhớ bọc. Cùng lý lẽ với việc `getParentRoute` là chỗ
duy nhất treo route.

```
layout/app-shell.tsx    sidebar ≥768 · bottom nav <768 · vùng nội dung cuộn riêng
layout/app-nav.tsx      nhận `me`, hiện đủ mục, mục chưa làm ở trạng thái vô hiệu hoá có nhãn
```

Sáu màn auth đứng **ngoài** shell (chúng ở nhánh `public`) và giữ `PageShell` hẹp như cũ.

### Điều hướng

| Mục                     | Desktop / tablet | Bottom nav (điện thoại) |
| ----------------------- | ---------------- | ----------------------- |
| Thống kê (`/`)          | ✅               | ✅                      |
| Lịch (`/calendar`)      | ✅               | ✅                      |
| Đơn thuê — *sắp có*     | ✅ vô hiệu hoá   | ✅ vô hiệu hoá          |
| Khách hàng — *sắp có*   | ✅ vô hiệu hoá   | trong **Thêm**          |
| Bàn giao — *sắp có*     | ✅ vô hiệu hoá   | trong **Thêm**          |
| Nhân viên (OWNER)       | ✅               | trong **Thêm**          |
| Đổi mật khẩu · Đăng xuất | chân sidebar     | trong **Thêm**          |

**Bottom nav đúng bốn ô, không phải sáu.** Sáu ô trên màn 375px cho ra chữ 8,5px và vùng chạm
62px — nhỏ hơn ngưỡng 44px theo chiều ngang khi tính cả khoảng đệm, và không ai đọc nổi. Bốn ô cho
mỗi ô ~85px, chữ 11px, cao 56px. Phần còn lại nằm sau **Thêm**.

---

## §8 · Màn Thống kê (`/`)

```
Thống kê                                              [+ Lên đơn]

DOANH THU
┌ Hôm nay ────────┬ Tuần này ───────┬ Tháng này ──────┐
│ 2.400.000 ₫     │ 14.900.000 ₫    │ 48.200.000 ₫    │
│ 3 đơn · +18%    │ 11 đơn · +6%    │ 37 đơn · −4%    │
└─────────────────┴─────────────────┴─────────────────┘

CẦN CHÚ Ý
● 1 xe quá hạn chưa trả · Yamaha MT-07              ›
● 1 xe phải trả hôm nay · KTM Duke 390             ›
● 2 nhân viên chờ duyệt                            ›
```

Trên điện thoại ba thẻ doanh thu **xếp dọc** — "48.200.000 ₫" không sống nổi trong một cột rộng
100px.

**Mỗi dòng "cần chú ý" bấm được**, dẫn tới đúng chỗ xử lý: quá hạn và trả-hôm-nay sang
`/calendar` đã lọc sẵn, chờ duyệt sang `/staff`. Một con số không bấm được thì chủ shop phải tự đi
tìm — đó chính là điểm yếu cố hữu của dashboard, và chỗ này vá nó.

```
pages/stats-page.tsx
components/stats/revenue-cards.tsx
components/stats/attention-list.tsx
```

---

## §9 · Trang Lịch (`/calendar`)

Hai chế độ, một nút chuyển.

**Timeline theo xe** — hàng là xe, cột là ngày, mỗi thanh là một đơn. Trả lời cùng lúc hai câu
chủ shop hỏi nhiều nhất: "xe nào đang bận tới ngày nào" và "khách muốn thuê 24–27/8 thì còn con
nào". **Khoảng trắng chính là xe còn trống**, nên không phải đọc, chỉ cần nhìn. Đây là mô hình
chuẩn của phần mềm cho thuê tài sản.

**Lịch tháng** — ô ngày quen mắt. Nó *không* cho thấy xe rảnh (thứ trống thì không xuất hiện trên
lịch tháng) và cắt một đơn 5 ngày thành 5 dòng rời. Có mặt vì nó cho cảm giác thời gian mà timeline
không cho, và vì có nút chuyển nên không phải chọn một cái rồi chịu thiệt.

### Cửa sổ thời gian

| Breakpoint         | Số ngày hiển thị | Cột xe            |
| ------------------ | ---------------- | ----------------- |
| `<768`             | 7                | dính trái, 88px   |
| `768–1279`         | 10               | 112px             |
| `≥1280`            | 14               | 130px             |

Cột xe **dính trái** khi vuốt ngang trên điện thoại — mất ngữ cảnh "dòng này là xe nào" là mất cả
màn hình.

### State nằm ở URL, không nằm trong component

`?view=timeline|month` và `?from=YYYY-MM-DD`, validate bằng đúng khuôn `validateSearch` mà
`/login?reason=` đã dùng: chỉ nhận giá trị trong danh sách trắng, **lấy từ hằng chứ không chép
tay** — thêm một chế độ mà quên sửa danh sách là lỗi biên dịch, không phải một cú rơi im lặng về
mặc định.

Được ba thứ miễn phí: F5 không mất chỗ đang xem, nút back hoạt động, và gửi link "xem tuần này"
cho nhau được. **Không dùng `localStorage`** — hai nguồn sự thật cho một thứ là cách chúng lệch
nhau.

### `lib/calendar-layout.ts` là hàm THUẦN, và đó là chủ ý

"Đơn thuê 13→17/8, cửa sổ đang xem 15–28/8 → thanh bắt đầu ở cột nào, dài mấy cột" đầy lỗi lệch-một
ở biên: đơn bắt đầu trước cửa sổ, kết thúc sau cửa sổ, nằm trọn ngoài, dài đúng một ngày. Nhét
trong JSX thì chỉ test được bằng cách dựng cả React; tách ra thì test bằng một bảng ca như
`guard-decision.test.ts`.

Đây là bắt chước có ý thức: nhánh `DISABLED` chết trong `beforeLoad` đã lọt đúng vì logic quyết
định nằm lẫn trong component (xem [`2026-08-13-staff-auth-fix-design.md`](2026-08-13-staff-auth-fix-design.md)).

```
pages/calendar-page.tsx
components/rentals/rental-calendar.tsx     vỏ: khoảng ngày, nút chuyển, loading/error
components/rentals/calendar-timeline.tsx
components/rentals/calendar-month.tsx
components/rentals/rental-form.tsx
lib/calendar-layout.ts                     THUẦN
```

---

## §10 · Rỗng, tải, lỗi

| Ca                    | Xử lý                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| Chưa có đơn nào       | Lịch vẫn vẽ đủ lưới xe, mỗi hàng ghi "trống cả kỳ". Không phải màn hình trắng      |
| Chưa có xe nào        | Câu khác hẳn: "Chưa có xe trong đội. Thêm xe trong Directus."                       |
| Doanh thu bằng 0      | Hiện `0 ₫` thật, kèm "chưa có đơn nào giao trong kỳ" — không hiện dấu gạch          |
| 409 trùng lịch        | "Xe này đã có đơn trong khoảng đó", kèm link xem lịch của chính chiếc xe đó        |
| Đang tải              | Khung xám giữ đúng chiều cao lưới, không để layout nhảy                             |
| Lỗi tải               | `Alert` đã có, dùng `errorMessage()` của `lib/errors.ts`                            |

Gộp "chưa có đơn" và "chưa có xe" vào một câu là làm người dùng đi sửa nhầm chỗ.

---

## §11 · Trả nợ: hàng rào cho `components/ui/`

[`../DEBT.md`](../DEBT.md) ghi: ranh giới "`components/ui/` không biết domain" **không được lint
ép** — `eslint.config.js` khai đúng một type `frontend` khớp `apps/{web,staff}/**`, và
`frontend → frontend` được cho phép vô điều kiện.

Đợt này thêm `button` · `dialog` · `select` · `date-field` vào `ui/`, tức là lúc rủi ro cao nhất.
Thêm sub-type `frontend-ui` với luật riêng: `ui/` **không được** import `lib/api`, `lib/me`, hay
bất cứ gì trong `components/{auth,staff,rentals,stats}/`.

⚠️ Đụng `eslint.config.js` thì **bắt buộc** chạy lại bốn probe của skill `v9-fences` và **đọc tên
luật trong thông báo lỗi**. Probe exit 1 chưa chứng minh gì nếu không biết nó nổ vì luật nào.

---

## §12 · Test và verify

| Tầng                              | Cách                                                              |
| --------------------------------- | ----------------------------------------------------------------- |
| `packages/shared/domain/rental.ts` | **TDD nghiêm** — test trước, luôn luôn                           |
| `lib/calendar-layout.ts`          | Bảng ca thuần: trước cửa sổ · sau cửa sổ · trọn ngoài · dài 1 ngày |
| `lib/spacing-fence.test.ts`       | Quét `.tsx`, fail khi thấy arbitrary value cho khoảng cách        |
| `apps/api` services               | Unit test cho luồng thường                                        |
| **Chống đặt trùng**               | **Test tích hợp chạm Postgres thật** — bắt buộc                   |
| **Cắt kỳ theo giờ VN**            | Test cố định đồng hồ vào **2h sáng giờ VN**                       |

Hai dòng in đậm không thương lượng được, và vì cùng một lý do: cả hai lỗi đều **xanh trong unit
test**.

- Cái bẫy `.errno`/`.code` chỉ lộ ra khi có Postgres thật. Một unit test mock database sẽ **xác
  nhận đoạn code sai là đúng**. Phải có test tạo hai đơn chồng nhau trên cùng một xe và khẳng định
  nhận được **409**.
- Lỗi múi giờ tự biến mất lúc 7h sáng. Test chạy lúc 10h sáng sẽ xanh mãi mãi.

**Trước khi tuyên bố xong:**

```bash
bun test
bun run typecheck        # HAI lệnh nối bằng &&, nửa sau kiểm scripts/
bun run lint
bun run bench            # xem phân loại ngân sách ngay dưới
bun run --filter @v9/staff build && bun run --filter @v9/staff preview   # CHỖ DUY NHẤT kiểm PWA
```

**Phân loại ngân sách perf.** `CLAUDE.md` gốc khai ba mốc: `/health` < 5 ms · đọc một record theo
id < 25 ms · availability < 50 ms (p95). Hai endpoint mới không rơi sẵn vào mốc nào, nên xếp
tường minh ở đây thay vì để người sau đoán:

| Endpoint             | Mốc         | Vì sao                                                                     |
| -------------------- | ----------- | -------------------------------------------------------------------------- |
| `GET /rentals`       | **< 50 ms** | truy vấn khoảng thời gian trên GiST — cùng lớp với availability            |
| `GET /stats/summary` | **< 50 ms** | ba cặp tổng hợp trên partial index, chạy một lần cho cả màn hình            |
| `GET /fleet`         | **< 25 ms** | quét một bảng nhỏ, không join                                              |

Đây là **đề xuất phân loại, không phải số đo**. Đo thật lúc implement; nếu `/stats/summary` không
vào được 50 ms thì đó là tín hiệu thiết kế truy vấn sai, không phải tín hiệu nới ngân sách.
`CLAUDE.md` gốc đã ghi rõ lý lẽ này ở mục baseline: ghi đè ngân sách bằng số đo trên máy đang ồn
là rửa số liệu.

Cộng bốn probe của skill `v9-fences` (vì §11 đụng `eslint.config.js`), và **đọc tên luật** trong
output chứ không nhìn exit code.

Kiểm safe-area (§6.3) phải làm trên **bản build đã cài như PWA**, không phải trong tab trình duyệt.

---

## §13 · Rủi ro đã biết

| Rủi ro                                                                     | Giảm thiểu                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Giá nhập tay → gõ nhầm một số 0 là doanh thu sai một bậc                    | `CHECK >= 0` không bắt được. Form cảnh báo khi lệch > 3× `price_per_day × số ngày` |
| Timeline chật khi đội xe lên 40 chiếc                                       | Ngoài phạm vi. Ghi vào `DEBT.md` khi land: cần lọc/phân trang theo xe           |
| `GET /rentals` tối đa 92 ngày là hằng số chọn tay                           | Đặt thành hằng có tên, không rải số trong route                                 |
| Chủ shop đọc "doanh thu" thành tiền đã thu thật, trong khi đó là tiền đã chốt | Nhãn ghi rõ "theo ngày giao xe" ngay dưới tiêu đề khu doanh thu                 |
| Icon PWA vẫn là ô màu đặc (`ROADMAP.md`)                                    | Chặn ở người, không chặn ở code. Không thuộc đợt này                            |

---

## §14 · Thứ tự triển khai

1. `packages/shared/domain/rental.ts` — **test trước**
2. Migration `0009` + probe ràng buộc chống trùng bằng SQL tay
3. `apps/api`: `/fleet`, `/rentals`, `/customers`, `/stats/summary` + test tích hợp
4. `apps/staff`: `@theme` + thang cách + `spacing-fence.test.ts` + `viewport-fit=cover`
5. App shell + nav (retrofit `health-page`, `staff-list-page` vào shell)
6. `/` Thống kê
7. `/calendar` + `lib/calendar-layout.ts` (test trước) + form lên đơn
8. Retrofit 6 màn auth
9. `eslint.config.js`: sub-type `frontend-ui` + bốn probe `v9-fences`

Bước 1 và 2 trước là có lý do: nếu ràng buộc chống đặt trùng không hành xử như kỳ vọng thì mọi
thứ phía trên nó phải thiết kế lại, và biết điều đó ở bước 2 rẻ hơn nhiều so với ở bước 7.
