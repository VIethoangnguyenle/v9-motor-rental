# Kế hoạch thi công — màn Đơn thuê (`/rentals`) cho `apps/staff`

> **Cho người thi công:** dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc
> `superpowers:executing-plans` để chạy từng task. Mỗi bước là một ô `- [ ]`.

**Goal:** Mở khoá mục nav "Đơn thuê" thành một màn thật với hai chế độ — **hàng đợi** (nhóm theo độ
gấp, không cần chọn ngày) và **sổ cái** (bảng phẳng có đơn đã huỷ và tổng tiền đã thu) — dùng lại
`rental-detail-sheet` nguyên trạng.

**Architecture:** Luật nhóm hàng đợi có đúng **hai bản được ép khớp bằng test**: một `CASE` trong
SQL (thứ chạy thật) và `queueGroupOf()` thuần ở `@v9/shared` (test được không cần DB) — cùng khuôn
hàng rào `isOverdue`/`isPickupOverdue` đã có. Ranh giới ngày theo múi giờ shop tính **trong
Postgres**, giữ nguyên quyết định của `getStatsSummary`. Hai endpoint riêng (`/rentals/queue`,
`/rentals/ledger`) vì hai hình dạng response khác nhau, đúng tiền lệ `GET /customers` vs
`GET /customers/list`. Frontend: một trang, chế độ + `q` + trang sống ở URL, khuôn
`customers-list-page.tsx`; hình dạng bảng/thẻ chọn bằng `useLayoutVariant()`, khuôn
`staff-table.tsx`.

**Tech Stack:** Bun · Elysia + TypeBox · Drizzle + Bun.SQL · Postgres 17 · React 19 · TanStack
Router/Query · Tailwind v4 (`@theme` trong `index.css`) · `bun test` + happy-dom +
@testing-library/react

**Spec:** [`2026-09-04-staff-rentals-surface-design.md`](2026-09-04-staff-rentals-surface-design.md)

## Global Constraints

- **Tách nhánh trước khi commit.** Cây đang ở `main`; chín commit của plan này không được rơi
  thẳng vào đó. `git switch -c feat/staff-rentals-surface` trước Task 1.
- **Mỗi commit phải tự dựng được.** Kiểm trước khi commit:
  `git stash push --include-untracked && bun run typecheck && bun test && git stash pop`
- **Chỉ `git add` file thuộc task đang làm.** Không bao giờ `git add -A`. Nhưng nếu file bạn commit
  **import** một symbol nằm trong file chưa commit, phải kéo file đó vào cùng commit.
- **TDD NGHIÊM ở `packages/shared/src/domain/**`** (Task 1): viết test → chạy → thấy **ĐỎ vì đúng
  lý do** → mới implement. Đỏ vì lỗi cú pháp không tính. Các task còn lại:
  verification-before-completion — chạy lệnh thật, dán output thật.
- **Node ≥ 22 cho mọi lệnh chạm Vite.** `nvm use 22` trước `bun run dev`. `bun test` và
  `bun run typecheck` không dính.
- **Test API cần Postgres đang chạy.** `docker compose up -d postgres` trước `bun test` (service tên `postgres`, không phải `db`).
- **Không hard-code hex, không arbitrary value cho màu/spacing.** Token ở `apps/staff/src/index.css`.
  Arbitrary value cho chiều cao/bề rộng thì được (`spacing-fence.test.ts` chỉ khoá p/m/gap).
- **`status` luôn là enum, không bao giờ là số hay chuỗi tự do.**
- **Không `as` ở frontend.** Mọi kiểu suy ra từ `response` schema của API (`lib/rentals.ts` ghi rõ
  lý do). Ép kiểu ở frontend = đã đoán sai hình dạng API.
- **Serena báo sai trong repo này** (`DEBT.md:127`). Đổi tên/signature của symbol export thì kiểm
  **Serena VÀ `grep -rn`**.
- **Không tham chiếu plan/ticket trong code hay migration.** Comment phải tự giải thích.
- **Không đụng:** `rental-detail-sheet.tsx` · `rental-form.tsx` · `rental-calendar.tsx` ·
  `GET /rentals` cũ · mục nav "Bàn giao" · `DESIGN.md` ở gốc repo (chỉ áp cho `apps/web`).

## File Structure

| File                                                              | Trách nhiệm                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/shared/src/domain/rental.ts` (sửa)                      | `QUEUE_GROUPS`, `QueueGroup`, `QueueBoundaries`, `queueGroupOf` |
| `packages/shared/src/domain/rental.test.ts` (sửa)                  | TDD cho `queueGroupOf`                                       |
| `packages/db/src/schema/rentals.ts` (sửa)                          | Hai partial index cho vị từ hàng đợi                         |
| `packages/db/migrations/00XX_*.sql` (sinh)                         | Migration cho hai index đó                                   |
| `apps/api/src/services/rentals-list.ts` (tạo)                     | `queueBoundaries`, `listRentalsQueue`, `listRentalsLedger`   |
| `apps/api/src/services/rentals-list.test.ts` (tạo)                | Ba hàng rào của §6 design doc                                |
| `apps/api/src/routes/rentals.ts` (sửa)                             | `GET /rentals/queue`, `GET /rentals/ledger`                  |
| `apps/staff/src/lib/rentals-list.ts` (tạo)                        | Query + kiểu suy ra + ràng buộc kiểu với sheet               |
| `apps/staff/src/lib/rentals-search.ts` (tạo)                      | `validateRentalsSearch` (URL state), hàm thuần               |
| `apps/staff/src/lib/rentals-search.test.ts` (tạo)                 | Test hàm thuần                                               |
| `apps/staff/src/components/rentals/rental-list.tsx` (tạo)         | Một dòng đơn, hai hình dạng (bảng ≥md / thẻ <md)            |
| `apps/staff/src/components/rentals/rental-list.test.tsx` (tạo)    | Test hai hình dạng + nhãn mốc thời gian                      |
| `apps/staff/src/components/rentals/rental-queue.tsx` (tạo)        | Nhóm + tiêu đề nhóm + số đếm                                 |
| `apps/staff/src/components/rentals/rental-ledger.tsx` (tạo)       | Bộ lọc khoảng ngày + trạng thái + ô tổng đã thu              |
| `apps/staff/src/pages/rentals-page.tsx` (tạo)                     | Chế độ · ô tìm · phân trang · mở sheet                       |
| `apps/staff/src/router.tsx` (sửa)                                  | Đăng ký `rentalsRoute` + `validateSearch`                    |
| `apps/staff/src/components/layout/app-nav.tsx` (sửa)               | `soon` → `link` cho "Đơn thuê"                               |
| `apps/staff/src/components/stats/attention-list.tsx` (sửa)         | Ba dòng đổi đích sang `/rentals`                             |

---

### Task 1: Luật nhóm hàng đợi ở tầng domain

`packages/shared/src/domain/**` là vùng **TDD nghiêm**. Hàm này là bản TS của `CASE` trong SQL ở
Task 3; hàng rào ở Task 3 so hai bản với nhau, nên bản này phải đúng trước.

**Files:**

- Modify: `packages/shared/src/domain/rental.ts`
- Test: `packages/shared/src/domain/rental.test.ts`

**Interfaces:**

- Consumes: `RentalStatus`, `isOverdue`, `isPickupOverdue` (đã có trong chính file này).
- Produces:
  - `QUEUE_GROUPS: readonly ["OVERDUE","PICKUP_OVERDUE","DUE_TODAY","PICKUP_TODAY","UPCOMING"]`
  - `type QueueGroup = (typeof QUEUE_GROUPS)[number]`
  - `interface QueueBoundaries { readonly now: Date; readonly dayEnd: Date; readonly horizon: Date }`
  - `queueGroupOf(r: { status: RentalStatus; startsAt: Date; endsAt: Date }, b: QueueBoundaries): QueueGroup | null`
  - `QUEUE_HORIZON_DAYS: 7`

- [ ] **Bước 1: Viết test ĐỎ**

Thêm vào cuối `packages/shared/src/domain/rental.test.ts`:

```ts
import {
  QUEUE_GROUPS,
  QUEUE_HORIZON_DAYS,
  queueGroupOf,
  type QueueBoundaries,
} from "./rental";

describe("queueGroupOf", () => {
  // Giờ shop UTC+7. `now` 15:00 ngày 04/09 ⇒ hết ngày là 00:00 ngày 05/09.
  const B: QueueBoundaries = {
    now: new Date("2026-09-04T15:00:00+07:00"),
    dayEnd: new Date("2026-09-05T00:00:00+07:00"),
    horizon: new Date("2026-09-12T00:00:00+07:00"),
  };
  const at = (iso: string) => new Date(iso);

  it("ONGOING quá endsAt ⇒ OVERDUE", () => {
    expect(
      queueGroupOf(
        { status: "ONGOING", startsAt: at("2026-09-01T09:00:00+07:00"), endsAt: at("2026-09-04T09:00:00+07:00") },
        B,
      ),
    ).toBe("OVERDUE");
  });

  it("BOOKED quá startsAt ⇒ PICKUP_OVERDUE", () => {
    expect(
      queueGroupOf(
        { status: "BOOKED", startsAt: at("2026-09-04T09:00:00+07:00"), endsAt: at("2026-09-08T09:00:00+07:00") },
        B,
      ),
    ).toBe("PICKUP_OVERDUE");
  });

  it("ONGOING đáo hạn CÒN LẠI trong hôm nay ⇒ DUE_TODAY", () => {
    expect(
      queueGroupOf(
        { status: "ONGOING", startsAt: at("2026-09-01T09:00:00+07:00"), endsAt: at("2026-09-04T20:00:00+07:00") },
        B,
      ),
    ).toBe("DUE_TODAY");
  });

  it("BOOKED lấy xe CÒN LẠI trong hôm nay ⇒ PICKUP_TODAY", () => {
    expect(
      queueGroupOf(
        { status: "BOOKED", startsAt: at("2026-09-04T20:00:00+07:00"), endsAt: at("2026-09-08T09:00:00+07:00") },
        B,
      ),
    ).toBe("PICKUP_TODAY");
  });

  it("BOOKED trong 7 ngày tới ⇒ UPCOMING", () => {
    expect(
      queueGroupOf(
        { status: "BOOKED", startsAt: at("2026-09-09T09:00:00+07:00"), endsAt: at("2026-09-11T09:00:00+07:00") },
        B,
      ),
    ).toBe("UPCOMING");
  });

  it("BOOKED xa hơn chân trời ⇒ không thuộc nhóm nào", () => {
    expect(
      queueGroupOf(
        { status: "BOOKED", startsAt: at("2026-09-20T09:00:00+07:00"), endsAt: at("2026-09-22T09:00:00+07:00") },
        B,
      ),
    ).toBeNull();
  });

  // Đây là cái bẫy thật, không phải ca biên hình thức: một đơn đã trả gần như
  // LUÔN có endsAt trong quá khứ, nên một luật viết tay so `endsAt < now` sẽ
  // gán nó thành OVERDUE và đẩy đơn đã xong vào hàng đợi việc.
  it("COMPLETED và CANCELLED không bao giờ vào hàng đợi", () => {
    const past = { startsAt: at("2026-08-01T09:00:00+07:00"), endsAt: at("2026-08-05T09:00:00+07:00") };
    expect(queueGroupOf({ status: "COMPLETED", ...past }, B)).toBeNull();
    expect(queueGroupOf({ status: "CANCELLED", ...past }, B)).toBeNull();
  });

  // Biên: hai vị từ dùng `<` nên đúng mốc thuộc về nhóm SAU, không phải nhóm trước.
  it("đúng mốc now KHÔNG phải quá hạn; đúng mốc dayEnd KHÔNG phải hôm nay", () => {
    expect(
      queueGroupOf({ status: "ONGOING", startsAt: at("2026-09-01T00:00:00+07:00"), endsAt: B.now }, B),
    ).toBe("DUE_TODAY");
    expect(
      queueGroupOf({ status: "BOOKED", startsAt: B.dayEnd, endsAt: at("2026-09-10T00:00:00+07:00") }, B),
    ).toBe("UPCOMING");
  });

  it("năm nhóm, không trùng, và chân trời là 7 ngày", () => {
    expect(QUEUE_GROUPS).toHaveLength(5);
    expect(new Set(QUEUE_GROUPS).size).toBe(5);
    expect(QUEUE_HORIZON_DAYS).toBe(7);
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ vì đúng lý do**

Run: `bun test packages/shared/src/domain/rental.test.ts`
Expected: FAIL — `queueGroupOf` / `QUEUE_GROUPS` / `QUEUE_HORIZON_DAYS` không tồn tại (lỗi import,
không phải lỗi assert). Nếu đỏ vì lý do khác (gõ nhầm tên file, cú pháp) thì **sửa test trước**,
đừng đi tiếp.

- [ ] **Bước 3: Implement**

Thêm vào cuối `packages/shared/src/domain/rental.ts`:

```ts
/**
 * Số ngày mà nhóm "sắp tới" nhìn về phía trước, tính từ hết ngày hôm nay.
 *
 * Khai một chỗ vì nó là **giả định về quy mô shop**, không phải hằng số kỹ
 * thuật: với đội xe rất nhỏ (dưới 10 chiếc) thì 7 ngày cho ra một nhóm gần như
 * luôn rỗng và con số đúng là 30. Đổi ở đây là đổi cả SQL lẫn bản TS cùng lúc.
 */
export const QUEUE_HORIZON_DAYS = 7;

/**
 * Năm nhóm của màn Đơn thuê, **theo đúng thứ tự độ gấp** — thứ tự của tuple này
 * LÀ thứ tự hiển thị, không phải một chi tiết trình bày ở tầng trên.
 *
 * Cùng khuôn `RENTAL_STATUSES`: tuple RUNTIME, `QueueGroup` dẫn xuất từ nó. Một
 * union type thuần bị xoá lúc biên dịch, không để lại giá trị nào để TypeBox
 * dựng validator hay để test lặp qua.
 *
 * Thứ tự khớp `attention-list.tsx` (xe ngoài đường quá hạn → xe bị giữ chỗ vô
 * ích → việc trong ngày), nên không có định nghĩa "gấp" thứ hai trong app.
 */
export const QUEUE_GROUPS = [
  "OVERDUE",
  "PICKUP_OVERDUE",
  "DUE_TODAY",
  "PICKUP_TODAY",
  "UPCOMING",
] as const;

export type QueueGroup = (typeof QUEUE_GROUPS)[number];

/**
 * Ba mốc cắt kỳ, **tính sẵn ở nơi biết múi giờ** rồi truyền vào — không tự suy
 * trong hàm này.
 *
 * `dayEnd` là 00:00 của NGÀY MAI theo giờ shop, `horizon` là `dayEnd` cộng
 * `QUEUE_HORIZON_DAYS`. Cả hai do Postgres tính (`queueBoundaries` ở
 * `apps/api`), cùng lý lẽ `getStatsSummary` đã ghi: đó là chỗ duy nhất trong
 * stack biết chắc múi giờ. File này cố ý không import gì ngoài `domain/`, nên
 * nó KHÔNG được phép biết `SHOP_TIMEZONE` nghĩa là gì về mặt lịch.
 */
export interface QueueBoundaries {
  readonly now: Date;
  readonly dayEnd: Date;
  readonly horizon: Date;
}

/**
 * Đơn này thuộc nhóm nào của hàng đợi — `null` nghĩa là **không phải việc**.
 *
 * Đây là bản TS của `CASE` trong `listRentalsQueue` (`apps/api/src/services/
 * rentals-list.ts`). Hai bản tồn tại có chủ ý: SQL là thứ chạy thật và phải
 * lọc/sắp ở server, còn bản này test được không cần database và là thứ hàng rào
 * so sánh từng dòng để bắt lúc hai bên trôi khỏi nhau. Cùng cơ chế đã dùng cho
 * `isOverdue`/`isPickupOverdue`.
 *
 * Thứ tự năm nhánh **là** thứ ép năm nhóm loại trừ nhau, và nó có nghĩa: một đơn
 * đáo hạn 09:00 sáng nay, xem lúc 15:00, vừa "tới hạn hôm nay" vừa "đã quá hạn"
 * — ở màn Thống kê hai con số đó chồng nhau vô hại, còn ở một DANH SÁCH thì một
 * đơn chỉ được đứng đúng một chỗ. `OVERDUE` thắng, vì đó là câu trả lời gấp hơn.
 *
 * Gọi lại `isOverdue`/`isPickupOverdue` thay vì tự so mốc: chúng đã lọc theo
 * `status`, nên nhánh "đơn COMPLETED có endsAt trong quá khứ" không tới được.
 */
export function queueGroupOf(
  r: { status: RentalStatus; startsAt: Date; endsAt: Date },
  b: QueueBoundaries,
): QueueGroup | null {
  if (isOverdue(r, b.now)) return "OVERDUE";
  if (isPickupOverdue(r, b.now)) return "PICKUP_OVERDUE";
  if (r.status === "ONGOING") {
    return r.endsAt.getTime() < b.dayEnd.getTime() ? "DUE_TODAY" : null;
  }
  if (r.status !== "BOOKED") return null;
  const startsAt = r.startsAt.getTime();
  if (startsAt < b.dayEnd.getTime()) return "PICKUP_TODAY";
  return startsAt < b.horizon.getTime() ? "UPCOMING" : null;
}
```

- [ ] **Bước 4: Chạy test, xác nhận XANH**

Run: `bun test packages/shared/src/domain/rental.test.ts`
Expected: PASS, tất cả các `it` mới.

- [ ] **Bước 5: Chứng minh test đo được thứ nó tuyên bố đo**

Đảo tạm hai dòng đầu của `queueGroupOf` (đưa `isPickupOverdue` lên trước `isOverdue`) → chạy lại →
**vẫn xanh** (hai vị từ lọc hai `status` rời nhau, đảo là no-op — đúng như `rental-status.ts` đã
ghi). Sau đó đổi `r.endsAt.getTime() < b.dayEnd.getTime()` thành `<=` → chạy lại → **phải ĐỎ** ở ca
biên. Hoàn tác cả hai.

Ghi lại kết quả hai phép thử vào báo cáo task. Nếu phép thử thứ hai **không** đỏ thì ca biên chưa
đo được gì — sửa test trước khi đi tiếp.

- [ ] **Bước 6: Typecheck và commit**

```bash
bun run typecheck && bun test
git add packages/shared/src/domain/rental.ts packages/shared/src/domain/rental.test.ts
git commit -m "feat(shared): năm nhóm hàng đợi đơn thuê, loại trừ nhau theo thứ tự độ gấp"
```

---

### Task 2: Hai partial index cho vị từ hàng đợi

Không có hai index này, mọi lần mở `/rentals` là một seq scan cả bảng `rentals`. Ở quy mô giả định
(§12 design doc: >1.000 dòng/năm) điều đó chưa chết nhưng đã sai, và nó sai ngày càng nhanh.

**Files:**

- Modify: `packages/db/src/schema/rentals.ts`
- Create: `packages/db/migrations/00XX_*.sql` (do `drizzle-kit generate` sinh, tên ngẫu nhiên)

**Interfaces:**

- Produces: index `rentals_queue_ongoing_idx`, `rentals_queue_booked_idx` — Task 3 dựa vào chúng để
  câu `WHERE` của hàng đợi không quét cả bảng.

- [ ] **Bước 1: Khai hai index trong schema**

Trong `packages/db/src/schema/rentals.ts`, thêm ngay **sau** `index("rentals_revenue_idx")` trong
mảng trả về của `(t) => [...]`:

```ts
    // Hai partial index cho màn Đơn thuê, chế độ hàng đợi. Vị từ của nó là
    //   (status = 'ONGOING' AND ends_at < :dayEnd) OR (status = 'BOOKED' AND starts_at < :horizon)
    // — hai nhánh rời nhau theo `status`, nên hai index riêng phục vụ đúng hai
    // nhánh, và mỗi index chỉ chứa những hàng có thể thuộc nhánh đó.
    //
    // Partial chứ không phải index đầy đủ trên `(status, ends_at)`: đơn
    // COMPLETED chiếm phần lớn bảng theo thời gian và KHÔNG BAO GIỜ vào hàng
    // đợi, nên để chúng trong index chỉ làm index to ra. Cùng lý lẽ
    // `rentals_revenue_idx` ngay trên.
    index("rentals_queue_ongoing_idx")
      .on(t.endsAt)
      .where(sql`${t.status} = 'ONGOING'`),
    index("rentals_queue_booked_idx")
      .on(t.startsAt)
      .where(sql`${t.status} = 'BOOKED'`),
```

- [ ] **Bước 2: Sinh migration**

```bash
bun run db:generate
```

Mở file `.sql` vừa sinh trong `packages/db/migrations/` và **đọc nó**. Phải thấy đúng hai
`CREATE INDEX ... WHERE ...`, không thấy `DROP` gì cả. Nếu nó muốn drop/rebuild thứ khác thì
**dừng lại**: nghĩa là snapshot của drizzle đang lệch với DB thật, và đó là một việc riêng.

- [ ] **Bước 3: Chạy migration và xác nhận index tồn tại thật**

```bash
docker compose up -d postgres
bun run db:migrate
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\di rentals_queue*"
```

Expected: hai dòng `rentals_queue_ongoing_idx` và `rentals_queue_booked_idx`.

- [ ] **Bước 4: Xác nhận planner THẬT SỰ dùng index, không chỉ là nó tồn tại**

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "EXPLAIN SELECT id FROM rentals WHERE status = 'BOOKED' AND starts_at < now() + interval '7 days';"
```

(`POSTGRES_USER=v9`, `POSTGRES_DB=v9_rental` — lấy từ `.env`; `set -a; source .env; set +a` trước
khi chạy hai lệnh trên.)

Expected: kế hoạch có `Index Scan using rentals_queue_booked_idx` hoặc `Bitmap Index Scan on
rentals_queue_booked_idx`.

⚠️ Trên một bảng gần rỗng, Postgres cố ý chọn **Seq Scan** vì nó rẻ hơn — đó **không** phải lỗi
index. Nếu thấy Seq Scan, chạy `ANALYZE rentals;` rồi thử lại; nếu bảng dev vẫn quá ít hàng để
planner đổi ý, ghi vào báo cáo task là "chưa đo được trên dữ liệu dev, index đã tồn tại đúng định
nghĩa" — **đừng** khai là đã đo.

- [ ] **Bước 5: Commit**

```bash
bun run typecheck && bun test
git add packages/db/src/schema/rentals.ts packages/db/migrations/
git commit -m "feat(db): hai partial index cho vị từ hàng đợi đơn thuê"
```

---

### Task 3: Service hàng đợi + hàng rào SQL ↔ TS

**Files:**

- Create: `apps/api/src/services/rentals-list.ts`
- Test: `apps/api/src/services/rentals-list.test.ts`

**Interfaces:**

- Consumes: `queueGroupOf`, `QUEUE_GROUPS`, `QueueGroup`, `QueueBoundaries`, `QUEUE_HORIZON_DAYS`,
  `SHOP_TIMEZONE` từ `@v9/shared`; `client`, `db` từ `../db`; `schema` từ `@v9/db`.
- Produces:
  - `queueBoundaries(now: Date): Promise<QueueBoundaries>`
  - `interface RentalListRow` — `Rental` + `customerName` + `customerPhone` + `vehicleMake` +
    `vehicleModel` + `vehiclePlate`
  - `interface RentalQueueRow extends RentalListRow { readonly group: QueueGroup }`
  - `listRentalsQueue(now: Date, input: { page?: number; pageSize?: number }): Promise<{ rentals: RentalQueueRow[]; total: number; groupCounts: Record<QueueGroup, number> }>`
  - `RENTALS_PAGE_SIZE_DEFAULT = 20`, `RENTALS_PAGE_SIZE_MAX = 100`

- [ ] **Bước 1: Viết service**

Tạo `apps/api/src/services/rentals-list.ts`:

```ts
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { schema } from "@v9/db";
import {
  QUEUE_GROUPS,
  QUEUE_HORIZON_DAYS,
  SHOP_TIMEZONE,
  type QueueBoundaries,
  type QueueGroup,
  type RentalStatus,
} from "@v9/shared/domain/rental";
import type { Vnd } from "@v9/shared/domain/money";
import { client, db } from "../db";
import { fullNameMatches, normalizePhone } from "./customers";

export const RENTALS_PAGE_SIZE_DEFAULT = 20;
export const RENTALS_PAGE_SIZE_MAX = 100;

/**
 * Một dòng của hai màn danh sách — đơn + khách + xe, tất cả trong MỘT lượt đọc.
 *
 * Ba trường xe có mặt vì danh sách phải in được tên xe mà không cần đợi
 * `GET /fleet`; ba trường bàn giao (`documentType`…) có mặt vì `RentalDetailSheet`
 * mở thẳng từ hàng này, không có vòng mạng thứ hai. Hình dạng này khớp
 * `rentalWithVehicleSchema` đã có ở `routes/rentals.ts` — dùng lại schema đó,
 * đừng khai schema thứ hai.
 */
export interface RentalListRow {
  readonly id: string;
  readonly vehicleId: string;
  readonly customerId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: RentalStatus;
  readonly handedOverAt: Date | null;
  readonly returnedAt: Date | null;
  readonly totalAmount: Vnd;
  readonly depositAmount: Vnd;
  readonly note: string | null;
  readonly documentType: string | null;
  readonly documentReturnedAt: Date | null;
  readonly deliveryAddress: string | null;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly vehicleMake: string;
  readonly vehicleModel: string;
  readonly vehiclePlate: string | null;
}

export interface RentalQueueRow extends RentalListRow {
  readonly group: QueueGroup;
}

const LIST_COLUMNS = {
  id: schema.rentals.id,
  vehicleId: schema.rentals.vehicleId,
  customerId: schema.rentals.customerId,
  startsAt: schema.rentals.startsAt,
  endsAt: schema.rentals.endsAt,
  status: schema.rentals.status,
  handedOverAt: schema.rentals.handedOverAt,
  returnedAt: schema.rentals.returnedAt,
  totalAmount: schema.rentals.totalAmount,
  depositAmount: schema.rentals.depositAmount,
  note: schema.rentals.note,
  documentType: schema.rentals.documentType,
  documentReturnedAt: schema.rentals.documentReturnedAt,
  deliveryAddress: schema.rentals.deliveryAddress,
  customerName: schema.customers.fullName,
  customerPhone: schema.customers.phone,
  vehicleMake: schema.vehicles.make,
  vehicleModel: schema.vehicles.model,
  vehiclePlate: schema.vehicles.plate,
};

/**
 * Thứ hạng SQL ↔ nhóm domain. Suy TỪ `QUEUE_GROUPS` chứ không gõ tay bảng tra
 * ngược: thứ tự tuple đã LÀ thứ tự độ gấp, nên `index + 1` là hạng, và thêm một
 * nhóm ở domain mà quên ở đây là không thể — không có "ở đây" nào để quên.
 *
 * Hạng bắt đầu từ 1 vì `CASE` không khớp nhánh nào trả `NULL`, và 0 là một giá
 * trị hợp lệ dễ lẫn với `NULL` khi đi qua driver.
 */
const GROUP_OF_RANK: Record<number, QueueGroup> = Object.fromEntries(
  QUEUE_GROUPS.map((g, i) => [i + 1, g]),
);

function emptyGroupCounts(): Record<QueueGroup, number> {
  return Object.fromEntries(QUEUE_GROUPS.map((g) => [g, 0])) as Record<QueueGroup, number>;
}

/**
 * Ba mốc cắt kỳ, tính TRONG POSTGRES.
 *
 * `getStatsSummary` đã quyết định và ghi lý do: Postgres là chỗ duy nhất trong
 * stack biết chắc múi giờ shop. Đợt này không đảo quyết định đó — nếu tính
 * `dayEnd` bằng JS thì hai màn hình cắt ngày theo hai cách, và lỗi loại đó TỰ
 * BIẾN MẤT lúc 7h sáng nên một test chạy lúc 10h sẽ xanh mãi mãi.
 *
 * `make_interval(days => ...)` chứ không phải ghép chuỗi `'N days'::interval`:
 * tham số đi vào đúng chỗ tham số, không đi qua phép nối chuỗi nào.
 */
export async function queueBoundaries(now: Date): Promise<QueueBoundaries> {
  const rows: { day_end: Date; horizon: Date }[] = await client`
    WITH d AS (
      SELECT (date_trunc('day', ${now}::timestamptz AT TIME ZONE ${SHOP_TIMEZONE})
              + interval '1 day') AS local_day_end
    )
    SELECT
      (local_day_end) AT TIME ZONE ${SHOP_TIMEZONE}                                        AS day_end,
      (local_day_end + make_interval(days => ${QUEUE_HORIZON_DAYS})) AT TIME ZONE ${SHOP_TIMEZONE} AS horizon
    FROM d`;

  const row = rows[0];
  if (!row) throw new Error("truy vấn mốc hàng đợi không trả về hàng nào");
  return { now, dayEnd: row.day_end, horizon: row.horizon };
}

/**
 * ⚠️ `CASE` dưới đây là bản SQL của `queueGroupOf` (`@v9/shared/domain/rental`).
 * Sửa một bên mà quên bên kia là lỗi mà `rentals-list.test.ts` bắt được — nó
 * chạy CẢ HAI trên cùng bộ hàng và so từng dòng. Đừng sửa một mình chỗ này.
 *
 * Thứ tự nhánh LÀ thứ ép năm nhóm loại trừ nhau; `CASE` đánh giá theo thứ tự
 * viết, đúng như chuỗi `if` bên domain.
 */
function groupRankSql(b: QueueBoundaries): SQL<number | null> {
  return sql<number | null>`CASE
    WHEN ${schema.rentals.status} = 'ONGOING' AND ${schema.rentals.endsAt}   < ${b.now}     THEN 1
    WHEN ${schema.rentals.status} = 'BOOKED'  AND ${schema.rentals.startsAt} < ${b.now}     THEN 2
    WHEN ${schema.rentals.status} = 'ONGOING' AND ${schema.rentals.endsAt}   < ${b.dayEnd}  THEN 3
    WHEN ${schema.rentals.status} = 'BOOKED'  AND ${schema.rentals.startsAt} < ${b.dayEnd}  THEN 4
    WHEN ${schema.rentals.status} = 'BOOKED'  AND ${schema.rentals.startsAt} < ${b.horizon} THEN 5
  END`;
}

/**
 * Vị từ lọc, viết TÁCH khỏi `CASE` chứ không phải `WHERE <case> IS NOT NULL`.
 *
 * Hai dạng cho ra ĐÚNG cùng một tập hàng — `now < dayEnd` luôn đúng (dayEnd là
 * nửa đêm ngày mai) nên nhánh 1 nằm gọn trong nhánh 3, và nhánh 2 nằm gọn trong
 * nhánh 5 — nhưng chỉ dạng này dùng được hai partial index
 * `rentals_queue_ongoing_idx` / `rentals_queue_booked_idx`: planner không đẩy
 * được điều kiện qua một biểu thức `CASE`.
 */
function queueWhere(b: QueueBoundaries): SQL {
  return sql`(
    (${schema.rentals.status} = 'ONGOING' AND ${schema.rentals.endsAt}   < ${b.dayEnd})
    OR
    (${schema.rentals.status} = 'BOOKED'  AND ${schema.rentals.startsAt} < ${b.horizon})
  )`;
}

/**
 * Mốc dùng để sắp trong nhóm — CÙNG luật `whenOf` ở `customer-table.tsx`:
 * `ONGOING` hỏi "bao giờ phải trả xe" (`endsAt`), `BOOKED` hỏi "bao giờ tới lấy"
 * (`startsAt`). Cùng câu hỏi thì cùng cột; không có luật sắp xếp thứ hai.
 */
const SORT_AT = sql`CASE WHEN ${schema.rentals.status} = 'ONGOING'
  THEN ${schema.rentals.endsAt} ELSE ${schema.rentals.startsAt} END`;

export async function listRentalsQueue(
  now: Date,
  input: { page?: number | undefined; pageSize?: number | undefined },
): Promise<{
  rentals: RentalQueueRow[];
  total: number;
  groupCounts: Record<QueueGroup, number>;
}> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    RENTALS_PAGE_SIZE_MAX,
    Math.max(1, Math.trunc(input.pageSize ?? RENTALS_PAGE_SIZE_DEFAULT)),
  );

  const b = await queueBoundaries(now);
  const rank = groupRankSql(b);
  const where = queueWhere(b);

  // Đếm theo nhóm chạy trên TOÀN BỘ hàng đợi, không chỉ trang đang xem: tiêu đề
  // nhóm phải nói đúng "Quá hạn trả (7)" kể cả khi trang này chỉ chứa 3 trong 7.
  const counts = await db
    .select({ rank: sql<number>`(${rank})`, n: sql<number>`count(*)::int` })
    .from(schema.rentals)
    .where(where)
    .groupBy(sql`(${rank})`);

  const groupCounts = emptyGroupCounts();
  let total = 0;
  for (const c of counts) {
    const group = GROUP_OF_RANK[c.rank];
    if (!group) continue;
    groupCounts[group] = c.n;
    total += c.n;
  }

  const rows = await db
    .select({ ...LIST_COLUMNS, rank: sql<number>`(${rank})` })
    .from(schema.rentals)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.rentals.customerId))
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentals.vehicleId))
    .where(where)
    // `id` là khoá phụ BẮT BUỘC, không phải thừa: hai đơn cùng mốc thời gian mà
    // không có thứ tự xác định thì chúng có thể đổi chỗ giữa hai request, và một
    // hàng lọt qua khe giữa trang 1 và trang 2 — mất dữ liệu, im lặng.
    .orderBy(sql`(${rank})`, SORT_AT, asc(schema.rentals.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const rentals: RentalQueueRow[] = [];
  for (const r of rows) {
    const group = GROUP_OF_RANK[r.rank];
    if (!group) continue;
    const { rank: _rank, ...rest } = r;
    rentals.push({ ...rest, status: rest.status as RentalStatus, group });
  }

  return { rentals, total, groupCounts };
}
```

⚠️ `status: rest.status as RentalStatus` là chỗ **duy nhất** được phép `as` trong file này, và nó
sao chép đúng cách `listRentalsInRange` đã làm: cột `status` khai `text()` ở drizzle vì CHECK
constraint sống ở DB, nên driver trả `string`. Đừng nhân bản kiểu ép này ra chỗ khác.

- [ ] **Bước 2: Viết hàng rào — ba test của §6 design doc**

Tạo `apps/api/src/services/rentals-list.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { queueGroupOf } from "@v9/shared/domain/rental";
import { like } from "drizzle-orm";
import { db } from "../db";
import { getStatsSummary } from "./stats";
import { listRentalsQueue, queueBoundaries } from "./rentals-list";

const P = "ztest-ds-";
/** Đồng hồ cố định của cả file — mọi mốc dưới đây neo vào nó. */
const NOW = new Date("2026-09-04T15:00:00+07:00");
const at = (iso: string) => new Date(iso);

let vehicleId: string;
let customerId: string;
let staffId: string;

async function clean() {
  await db.delete(schema.rentals).where(like(schema.rentals.createdBy, `${P}%`));
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

/**
 * Ghi thẳng bằng `db.insert`, KHÔNG qua `createRental` + `changeRentalStatus`:
 * ở đây ta cần dựng chính xác từng tổ hợp (status × quan hệ thời gian), kể cả
 * những tổ hợp mà đường nghiệp vụ bình thường mất nhiều bước mới tới. Các CHECK
 * của bảng vẫn có hiệu lực, nên một tổ hợp KHÔNG hợp lệ (ONGOING mà
 * `handed_over_at IS NULL`) sẽ nổ ngay tại đây — đó là điều ta muốn.
 */
async function seedRental(input: {
  status: "BOOKED" | "ONGOING" | "COMPLETED" | "CANCELLED";
  startsAt: Date;
  endsAt: Date;
}) {
  const out = input.status === "ONGOING" || input.status === "COMPLETED";
  const [row] = await db
    .insert(schema.rentals)
    .values({
      vehicleId,
      customerId,
      createdBy: staffId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
      handedOverAt: out ? input.startsAt : null,
      returnedAt: input.status === "COMPLETED" ? input.endsAt : null,
      totalAmount: 1_000_000,
      depositAmount: 5_000_000,
    })
    .returning();
  if (!row) throw new Error("seed đơn hỏng");
  return row;
}

beforeAll(async () => {
  await clean();
  const [v] = await db
    .insert(schema.vehicles)
    .values({
      slug: `${P}mt07`,
      make: "Yamaha",
      model: "MT-07",
      engineCc: 689,
      pricePerDay: 600_000,
      deposit: 5_000_000,
      plate: "59X1-12345",
    })
    .returning();
  const [c] = await db
    .insert(schema.customers)
    .values({ fullName: `${P}Trần Quốc Bảo`, phone: "0912000301" })
    .returning();
  const [s] = await db
    .insert(schema.staffUsers)
    .values({
      id: `${P}owner`,
      email: `${P}owner@example.com`,
      fullName: "Chủ shop test",
      role: "OWNER",
      status: "ACTIVE",
    })
    .returning();
  if (!v || !c || !s) throw new Error("seed hỏng");
  vehicleId = v.id;
  customerId = c.id;
  staffId = s.id;

  // Một hàng cho MỖI nhóm, cộng ba hàng cố ý nằm ngoài hàng đợi.
  await seedRental({ status: "ONGOING", startsAt: at("2026-09-01T09:00:00+07:00"), endsAt: at("2026-09-04T09:00:00+07:00") }); // OVERDUE
  await seedRental({ status: "BOOKED",  startsAt: at("2026-09-04T09:00:00+07:00"), endsAt: at("2026-09-08T09:00:00+07:00") }); // PICKUP_OVERDUE
  await seedRental({ status: "ONGOING", startsAt: at("2026-09-02T09:00:00+07:00"), endsAt: at("2026-09-04T20:00:00+07:00") }); // DUE_TODAY
  await seedRental({ status: "BOOKED",  startsAt: at("2026-09-04T20:00:00+07:00"), endsAt: at("2026-09-06T20:00:00+07:00") }); // PICKUP_TODAY
  await seedRental({ status: "BOOKED",  startsAt: at("2026-09-09T09:00:00+07:00"), endsAt: at("2026-09-11T09:00:00+07:00") }); // UPCOMING
  await seedRental({ status: "BOOKED",  startsAt: at("2026-09-25T09:00:00+07:00"), endsAt: at("2026-09-27T09:00:00+07:00") }); // ngoài chân trời
  await seedRental({ status: "COMPLETED", startsAt: at("2026-08-01T09:00:00+07:00"), endsAt: at("2026-08-05T09:00:00+07:00") });
  await seedRental({ status: "CANCELLED", startsAt: at("2026-09-04T08:00:00+07:00"), endsAt: at("2026-09-07T08:00:00+07:00") });
});

afterAll(clean);

describe("listRentalsQueue — hàng rào SQL ↔ TS", () => {
  it("SQL và queueGroupOf gán CÙNG một nhóm cho mọi hàng", async () => {
    const b = await queueBoundaries(NOW);
    const { rentals } = await listRentalsQueue(NOW, { pageSize: 100 });

    expect(rentals.length).toBeGreaterThan(0);
    for (const r of rentals) {
      expect({ id: r.id, group: r.group }).toEqual({ id: r.id, group: queueGroupOf(r, b) });
    }
  });

  it("năm nhóm đủ mặt, và ba hàng ngoài hàng đợi KHÔNG lọt vào", async () => {
    const { rentals, total, groupCounts } = await listRentalsQueue(NOW, { pageSize: 100 });
    expect(groupCounts).toMatchObject({
      OVERDUE: 1,
      PICKUP_OVERDUE: 1,
      DUE_TODAY: 1,
      PICKUP_TODAY: 1,
      UPCOMING: 1,
    });
    expect(total).toBe(5);
    expect(rentals.map((r) => r.status)).not.toContain("COMPLETED");
    expect(rentals.map((r) => r.status)).not.toContain("CANCELLED");
  });

  it("sắp theo độ gấp trước, rồi tới mốc thời gian", async () => {
    const { rentals } = await listRentalsQueue(NOW, { pageSize: 100 });
    expect(rentals.map((r) => r.group)).toEqual([
      "OVERDUE",
      "PICKUP_OVERDUE",
      "DUE_TODAY",
      "PICKUP_TODAY",
      "UPCOMING",
    ]);
  });

  it("phân trang không sót và không trùng", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const r = await listRentalsQueue(NOW, { page, pageSize: 2 });
      seen.push(...r.rentals.map((x) => x.id));
    }
    const { total } = await listRentalsQueue(NOW, { pageSize: 100 });
    expect(seen.length).toBe(total);
    expect(new Set(seen).size).toBe(total);
  });

  it("mang đủ tên khách và tên xe để danh sách in được, không cần vòng mạng thứ hai", async () => {
    const { rentals } = await listRentalsQueue(NOW, { pageSize: 100 });
    const first = rentals[0];
    expect(first?.customerName).toBe(`${P}Trần Quốc Bảo`);
    expect(first?.vehicleMake).toBe("Yamaha");
    expect(first?.vehiclePlate).toBe("59X1-12345");
  });
});

describe("listRentalsQueue ↔ getStatsSummary", () => {
  /**
   * Đây là hàng rào chống MÂU THUẪN NGƯỜI DÙNG NHÌN THẤY: `attention-list.tsx`
   * hiện "N xe quá hạn chưa trả" rồi link thẳng sang màn này. Bấm vào con số 3
   * mà thấy 4 dòng là một cái bug người dùng báo được, không phải chuyện nội bộ.
   *
   * ⚠️ Test này đếm TOÀN BỘ bảng `rentals` (getStatsSummary không lọc theo
   * `created_by` khi không truyền filter), nên nó so hai con số trên cùng một
   * tập dữ liệu chỉ khi database không có đơn nào khác. Vì `bun test` chạy mọi
   * file trong một tiến trình và một database, hãy lọc theo nhân viên seed của
   * chính file này — cùng cách `stats.test.ts` đã làm.
   */
  it("OVERDUE và PICKUP_OVERDUE khớp TUYỆT ĐỐI với attention", async () => {
    const stats = await getStatsSummary(NOW, { createdBy: staffId });
    const { groupCounts } = await listRentalsQueue(NOW, { pageSize: 100 });
    expect(groupCounts.OVERDUE).toBe(stats.attention.overdue);
    expect(groupCounts.PICKUP_OVERDUE).toBe(stats.attention.pickupOverdue);
  });

  it("DUE_TODAY của hàng đợi ≤ dueToday của Thống kê, không bao giờ lớn hơn", async () => {
    const stats = await getStatsSummary(NOW, { createdBy: staffId });
    const { groupCounts } = await listRentalsQueue(NOW, { pageSize: 100 });
    expect(groupCounts.DUE_TODAY).toBeLessThanOrEqual(stats.attention.dueToday);
  });
});
```

⚠️ Test "khớp tuyệt đối" ở trên gọi `getStatsSummary(NOW, { createdBy: staffId })` nhưng
`listRentalsQueue` **không** có bộ lọc đó, nên hai vế chỉ so được khi database dev không chứa đơn
nào khác. **Chạy nó và xem điều gì xảy ra.** Nếu nó đỏ vì dữ liệu seed-dev, đó là phát hiện chứ
không phải phiền toái: thêm tham số `createdBy` tuỳ chọn cho `listRentalsQueue` (cùng lý lẽ đã ghi
ở `StatsFilter`: "doanh thu theo nhân viên là thứ một chủ shop có lý do thật để hỏi"), rồi truyền
nó vào cả hai vế. Ghi vào báo cáo task đường nào đã đi.

- [ ] **Bước 3: Chạy test**

```bash
docker compose up -d postgres
bun test apps/api/src/services/rentals-list.test.ts
```

Expected: PASS toàn bộ.

- [ ] **Bước 4: Chứng minh hàng rào SQL ↔ TS thật sự bắt được drift**

Đổi tạm hạng `3` thành `5` ở nhánh thứ ba của `groupRankSql` (chỉ trong SQL, không đụng domain) →
chạy lại → test "SQL và queueGroupOf gán CÙNG một nhóm" **phải ĐỎ**. Hoàn tác.

Nếu nó vẫn xanh thì hàng rào không canh gì cả — dừng lại và sửa test.

- [ ] **Bước 5: Commit**

```bash
bun run typecheck && bun test
git add apps/api/src/services/rentals-list.ts apps/api/src/services/rentals-list.test.ts
git commit -m "feat(api): service hàng đợi đơn thuê, kèm hàng rào SQL ↔ TS cho luật nhóm"
```

---

### Task 4: Service sổ cái

**Files:**

- Modify: `apps/api/src/services/rentals-list.ts`
- Test: `apps/api/src/services/rentals-list.test.ts`

**Interfaces:**

- Produces:
  `listRentalsLedger(input: { q?: string; statuses?: RentalStatus[]; from?: Date; to?: Date; page?: number; pageSize?: number }): Promise<{ rentals: RentalListRow[]; total: number; collectedAmount: Vnd }>`

- [ ] **Bước 1: Thêm hàm vào `rentals-list.ts`**

```ts
/**
 * Sổ cái — **có** đơn `CANCELLED`, khác hẳn `listRentalsInRange` (lịch, lọc bỏ
 * chúng). Đó không phải thiếu nhất quán: trên lịch một đơn đã huỷ không chiếm
 * chỗ nên vẽ nó ra là nói dối về chỗ trống; trong sổ cái nó là một dòng có thật
 * của tháng đó.
 *
 * `from`/`to` rỗng KHÔNG bị chặn: `tstzrange(NULL, NULL, '[)')` là khoảng vô
 * hạn hai đầu và khớp mọi hàng, nên ô tìm chạy được mà không cần người dùng
 * chọn ngày trước. Đó là toàn bộ lý do vị từ này viết bằng range chứ không bằng
 * hai phép so `>=`/`<`: một hình dạng câu duy nhất cho cả bốn tổ hợp có/không
 * của hai biên. Ép `::timestamptz` là bắt buộc — không có nó, tham số `null`
 * không có kiểu và Postgres lỗi `could not determine data type of parameter`.
 */
export async function listRentalsLedger(input: {
  q?: string | undefined;
  statuses?: readonly RentalStatus[] | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}): Promise<{ rentals: RentalListRow[]; total: number; collectedAmount: Vnd }> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    RENTALS_PAGE_SIZE_MAX,
    Math.max(1, Math.trunc(input.pageSize ?? RENTALS_PAGE_SIZE_DEFAULT)),
  );

  const conditions: SQL[] = [
    sql`${schema.rentals.period} && tstzrange(${input.from ?? null}::timestamptz, ${input.to ?? null}::timestamptz, '[)')`,
  ];

  if (input.statuses && input.statuses.length > 0) {
    conditions.push(inArray(schema.rentals.status, [...input.statuses]));
  }

  const term = (input.q ?? "").trim();
  if (term.length > 0) {
    // Chuẩn hoá ĐƯỜNG ĐỌC cho số điện thoại, cùng lý lẽ `searchCustomers`: gõ
    // "+84912…" phải ra đúng khách đó. Thêm biển số vì trên điện thoại nhân
    // viên thường có biển số trong tay chứ không có tên khách.
    const asPhone = normalizePhone(term);
    const byText = or(
      fullNameMatches(term),
      sql`${schema.vehicles.plate} ILIKE ${`%${term}%`}`,
    );
    conditions.push(asPhone ? or(eq(schema.customers.phone, asPhone), byText)! : byText!);
  }

  const where = and(...conditions)!;

  const base = db
    .select({
      n: sql<number>`count(*)::int`,
      // ⚠️ `::int` phải bọc CẢ cụm `COALESCE(SUM(...) FILTER (...), 0)`. Viết
      // `SUM(...)::int FILTER (...)` là lỗi cú pháp; quên hẳn thì Bun trả CHUỖI
      // và `collectedAmount` lặng lẽ thành `string` sau khi đi qua Eden Treaty.
      //
      // Vị từ `handed_over_at IS NOT NULL` là ĐÚNG vị từ doanh thu của
      // `getStatsSummary`, cố ý dùng lại. Nhưng CỬA SỔ lọc thì khác (giao với
      // khoảng thuê, không phải mốc giao xe), nên con số này KHÔNG bằng
      // "Doanh thu tháng" ở Thống kê và không được đặt tên như thế — xem nhãn
      // ở `rental-ledger.tsx`.
      collected: sql<number>`(COALESCE(SUM(${schema.rentals.totalAmount}) FILTER (WHERE ${schema.rentals.handedOverAt} IS NOT NULL), 0))::int`,
    })
    .from(schema.rentals)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.rentals.customerId))
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentals.vehicleId))
    .where(where);

  const [totals] = await base;

  const rows = await db
    .select(LIST_COLUMNS)
    .from(schema.rentals)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.rentals.customerId))
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentals.vehicleId))
    .where(where)
    // Gần nhất lên trước — sổ cái đọc ngược thời gian. `id` là khoá phụ bắt
    // buộc, cùng lý do đã ghi ở `listRentalsQueue`.
    .orderBy(desc(schema.rentals.startsAt), desc(schema.rentals.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rentals: rows.map((r) => ({ ...r, status: r.status as RentalStatus })),
    total: totals?.n ?? 0,
    collectedAmount: totals?.collected ?? 0,
  };
}
```

⚠️ `schema.rentals.period` **có thể không tồn tại** trong khai báo drizzle: `packages/db/src/schema/
rentals.ts` ghi rõ cột `period` và constraint `rentals_no_overlap` sống trong migration viết tay,
không khai ở schema. Kiểm bằng `grep -n "period" packages/db/src/schema/rentals.ts`. Nếu không có,
thay bằng SQL trần đúng như `listRentalsInRange` đang viết:

```ts
    sql`period && tstzrange(${input.from ?? null}::timestamptz, ${input.to ?? null}::timestamptz, '[)')`,
```

- [ ] **Bước 2: Thêm test**

Thêm vào `apps/api/src/services/rentals-list.test.ts`:

```ts
describe("listRentalsLedger", () => {
  it("KHÔNG cần from/to — không chọn ngày vẫn ra kết quả", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, pageSize: 100 });
    expect(r.total).toBe(8);
  });

  it("CÓ đơn đã huỷ — khác hẳn lịch", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, pageSize: 100 });
    expect(r.rentals.map((x) => x.status)).toContain("CANCELLED");
  });

  it("lọc theo trạng thái", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, statuses: ["BOOKED"], pageSize: 100 });
    expect(r.total).toBe(4);
    expect(new Set(r.rentals.map((x) => x.status))).toEqual(new Set(["BOOKED"]));
  });

  it("tìm được theo biển số", async () => {
    const r = await listRentalsLedger({ q: "59X1-12345", pageSize: 100 });
    expect(r.total).toBeGreaterThan(0);
  });

  it("tìm được theo số điện thoại đã chuẩn hoá", async () => {
    const r = await listRentalsLedger({ q: "+84912000301", pageSize: 100 });
    expect(r.total).toBe(8);
  });

  /**
   * Ba đơn có `handed_over_at` trong seed: OVERDUE, DUE_TODAY, COMPLETED —
   * mỗi đơn 1.000.000 ₫. Bốn đơn BOOKED và một đơn CANCELLED không có mốc giao
   * xe nên KHÔNG được cộng: đó chính là vị từ doanh thu, và một đơn huỷ lọt vào
   * tổng tiền là kiểu sai im lặng mà CHECK `rentals_handover_only_when_out`
   * sinh ra để chặn ở tầng dưới.
   */
  it("collectedAmount chỉ cộng đơn ĐÃ GIAO XE", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, pageSize: 100 });
    expect(r.collectedAmount).toBe(3_000_000);
    expect(typeof r.collectedAmount).toBe("number");
  });

  it("sắp gần nhất lên trước", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, pageSize: 100 });
    const times = r.rentals.map((x) => x.startsAt.getTime());
    expect(times).toEqual([...times].sort((a, z) => z - a));
  });

  it("phân trang không sót và không trùng", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 4; page += 1) {
      const r = await listRentalsLedger({ q: `${P}Trần`, page, pageSize: 3 });
      seen.push(...r.rentals.map((x) => x.id));
    }
    expect(seen.length).toBe(8);
    expect(new Set(seen).size).toBe(8);
  });
});
```

Nhớ thêm `listRentalsLedger` vào dòng `import` ở đầu file test.

- [ ] **Bước 3: Chạy test**

Run: `bun test apps/api/src/services/rentals-list.test.ts`
Expected: PASS.

Nếu `collectedAmount` ra `"3000000"` (chuỗi) thay vì số — đó đúng là cái bẫy `::int` mà comment
cảnh báo. Sửa chỗ bọc ngoặc, đừng `Number()` ở phía gọi.

- [ ] **Bước 4: Chứng minh test tiền đo được thứ nó tuyên bố đo**

Bỏ tạm `FILTER (WHERE ... IS NOT NULL)` → chạy lại → test `collectedAmount` **phải ĐỎ** với
8.000.000. Hoàn tác.

- [ ] **Bước 5: Commit**

```bash
bun run typecheck && bun test
git add apps/api/src/services/rentals-list.ts apps/api/src/services/rentals-list.test.ts
git commit -m "feat(api): service sổ cái đơn thuê — có đơn đã huỷ, tổng tiền đã thu tính ở server"
```

---

### Task 5: Hai route

**Files:**

- Modify: `apps/api/src/routes/rentals.ts`

**Interfaces:**

- Consumes: `listRentalsQueue`, `listRentalsLedger`, `RENTALS_PAGE_SIZE_MAX` từ
  `../services/rentals-list`; `QUEUE_GROUPS` từ `@v9/shared/domain/rental`.
- Produces: `GET /rentals/queue`, `GET /rentals/ledger` — hình dạng response ở §5 design doc.

- [ ] **Bước 1: Thêm schema nhóm, ràng buộc hai chiều với domain**

Thêm ngay **sau** khối `_statusSchemaMatchesDomain` đã có trong `apps/api/src/routes/rentals.ts`:

```ts
/**
 * Cùng bài toán và cùng cách giải với `statusSchema` ngay trên: không suy được
 * TypeBox schema THẲNG từ một union type của TypeScript. Khác một điểm quan
 * trọng — `QUEUE_GROUPS` LÀ một tuple runtime, nên `.map()` được và không có
 * bản sao chép tay nào ở đây cả.
 *
 * `t.Union(QUEUE_GROUPS.map(t.Literal))` không dùng được vì TypeBox cần một
 * tuple có độ dài biết trước ở tầng kiểu để suy ra union; `as` một lần ở đây là
 * đổi lấy việc bỏ hẳn danh sách chép tay, và ràng buộc hai chiều bên dưới bắt
 * mọi lệch lạc.
 */
const queueGroupSchema = t.Union(
  QUEUE_GROUPS.map((g) => t.Literal(g)) as [ReturnType<typeof t.Literal<QueueGroup>>],
);
type QueueGroupSchemaValue = Static<typeof queueGroupSchema>;
type QueueGroupSetsMatch = [QueueGroup] extends [QueueGroupSchemaValue]
  ? [QueueGroupSchemaValue] extends [QueueGroup]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tồn tại CHỈ để ép kiểm hai chiều; không đọc lúc chạy.
const _queueGroupSchemaMatchesDomain: QueueGroupSetsMatch = true;

const queueRowSchema = t.Composite([
  rentalWithVehicleSchema,
  t.Object({ group: queueGroupSchema }),
]);

/**
 * Đếm cho CẢ hàng đợi, không chỉ trang đang xem — tiêu đề nhóm phải nói đúng
 * "Quá hạn trả (7)" kể cả khi trang này chứa 3 trong 7. Khai đủ năm khoá bắt
 * buộc (không `t.Optional`): nhóm rỗng gửi `0`, và VIỆC ẨN nó là quyết định của
 * tầng hiển thị, không phải của tầng truyền tải.
 */
const groupCountsSchema = t.Object(
  Object.fromEntries(QUEUE_GROUPS.map((g) => [g, t.Integer()])) as Record<
    QueueGroup,
    ReturnType<typeof t.Integer>
  >,
);
```

Thêm vào khối `import` ở đầu file:

```ts
import { QUEUE_GROUPS, type QueueGroup, type RentalStatus } from "@v9/shared/domain/rental";
import {
  listRentalsLedger,
  listRentalsQueue,
  RENTALS_PAGE_SIZE_MAX,
} from "../services/rentals-list";
```

(`RentalStatus` đã được import sẵn — kiểm rồi hãy thêm, đừng import trùng.)

- [ ] **Bước 2: Thêm hai route**

Chèn **trước** `.get("/rentals", ...)` đã có:

```ts
  /**
   * Hàng đợi việc — mở màn Đơn thuê ra là thấy ngay cái này, KHÔNG cần chọn
   * ngày. Khác `GET /rentals` (lịch) ở đúng chỗ đó: lịch hỏi "khoảng này có gì",
   * hàng đợi hỏi "giờ phải làm gì".
   *
   * KHÔNG nhận `q`: một hàng đợi đã lọc theo từ khoá thì không còn là hàng đợi.
   * Tìm kiếm đi qua `/rentals/ledger` không truyền `from`/`to`.
   *
   * `now` đóng ở server (`new Date()`), không nhận từ client: "quá hạn" phụ
   * thuộc đồng hồ, và một client lệch giờ sẽ tự thấy một hàng đợi khác mọi người.
   */
  .get(
    "/rentals/queue",
    async ({ query }) => {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const r = await listRentalsQueue(new Date(), { page, pageSize });
      return { ...r, page, pageSize };
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: RENTALS_PAGE_SIZE_MAX })),
      }),
      response: {
        200: t.Object({
          rentals: t.Array(queueRowSchema),
          total: t.Integer(),
          page: t.Integer(),
          pageSize: t.Integer(),
          groupCounts: groupCountsSchema,
        }),
      },
    },
  )

  /**
   * Sổ cái + tra cứu. `from`/`to` TUỲ CHỌN — thiếu cả hai nghĩa là "mọi thời
   * điểm", đó là hình dạng mà ô tìm dùng. Không có trần `MAX_RANGE_DAYS` ở đây:
   * trần đó tồn tại để bảo vệ lịch khỏi vẽ 10.000 thanh, còn danh sách này đã
   * phân trang nên nó tự bị chặn.
   *
   * `status` nhận NHIỀU giá trị (`?status=BOOKED&status=ONGOING`). `t.Union` với
   * một phần tử đơn lẻ vì Elysia gộp query trùng khoá thành mảng chỉ khi có ≥2
   * giá trị — một giá trị vào là chuỗi trần.
   */
  .get(
    "/rentals/ledger",
    async ({ query }) => {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const raw = query.status;
      const statuses = raw === undefined ? undefined : Array.isArray(raw) ? raw : [raw];
      const r = await listRentalsLedger({
        q: query.q,
        statuses,
        from: query.from === undefined ? undefined : new Date(query.from),
        to: query.to === undefined ? undefined : new Date(query.to),
        page,
        pageSize,
      });
      return { ...r, page, pageSize };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        status: t.Optional(t.Union([statusSchema, t.Array(statusSchema)])),
        from: t.Optional(t.String({ format: "date-time" })),
        to: t.Optional(t.String({ format: "date-time" })),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: RENTALS_PAGE_SIZE_MAX })),
      }),
      response: {
        200: t.Object({
          rentals: t.Array(rentalWithVehicleSchema),
          total: t.Integer(),
          page: t.Integer(),
          pageSize: t.Integer(),
          collectedAmount: t.Integer(),
        }),
      },
    },
  )
```

⚠️ **Thứ tự đăng ký route quan trọng.** `/rentals/queue` và `/rentals/ledger` phải đứng trước bất
kỳ route `GET /rentals/:something` nào. Hôm nay chưa có `GET /rentals/:id` nên chưa va, nhưng đặt
đúng chỗ ngay bây giờ thì ngày thêm nó vào không sinh ra một bug 404 khó tìm.

- [ ] **Bước 3: Chạy API thật và gọi hai route**

```bash
docker compose up -d postgres
bun run --filter @v9/api dev &
sleep 3
curl -s "http://localhost:3001/rentals/queue?pageSize=3" | head -c 600; echo
curl -s "http://localhost:3001/rentals/ledger?q=&pageSize=3" | head -c 600; echo
```

Expected: cả hai trả JSON có `total`, `page`, `pageSize`; route thứ nhất có `groupCounts` với đủ
**năm** khoá; route thứ hai có `collectedAmount` là **số**, không phải chuỗi.

Nếu chưa đăng nhập thì `staffGuard` trả 401 — đó là **đúng**, và nó chứng minh guard đang bao cả
hai route mới. Lấy cookie phiên từ trình duyệt rồi gọi lại, hoặc kiểm qua `apps/staff` ở Task 8.
Dán output thật vào báo cáo task; **đừng** khai là đã kiểm nếu chỉ thấy 401.

- [ ] **Bước 4: Commit**

```bash
bun run typecheck && bun test
git add apps/api/src/routes/rentals.ts
git commit -m "feat(api): GET /rentals/queue và GET /rentals/ledger"
```

---

### Task 6: Tầng dữ liệu phía `apps/staff`

**Files:**

- Create: `apps/staff/src/lib/rentals-list.ts`
- Create: `apps/staff/src/lib/rentals-search.ts`
- Test: `apps/staff/src/lib/rentals-search.test.ts`

**Interfaces:**

- Produces:
  - `RENTALS_PAGE_SIZE = 20`
  - `type RentalQueueRow`, `type RentalLedgerRow` — **suy ra từ response schema**, không gõ tay
  - `rentalsQueueQuery(page: number)`, `rentalsLedgerQuery(s: RentalsSearch)`
  - `interface RentalsSearch { mode: "queue" | "ledger"; q: string; page: number; from: string; to: string }`
  - `validateRentalsSearch(search: Record<string, unknown>): RentalsSearch`
  - `shouldResyncSearchText` dùng lại từ `lib/customers-search.ts`, **không** viết bản thứ hai

- [ ] **Bước 1: `lib/rentals-search.ts` + test hàm thuần**

```ts
/**
 * `validateSearch` cho `/rentals`, tách khỏi page có chủ ý — cùng lý do
 * `customers-search.ts`: `router.tsx` import file này, page cũng import nó, để
 * hàm trong page thì thành chu trình module.
 *
 * Giá trị lạ bị LỌC, không throw: `?mode=xyz` cho hàng đợi, không cho màn lỗi.
 * `from`/`to` giữ dạng CHUỖI `YYYY-MM-DD` — đó là giá trị thô của
 * `<input type="date">`, và dựng `Date` ở đây chỉ tạo cơ hội lệch một ngày cho
 * một thứ vốn là ngày-theo-lịch chứ không phải một mốc thời gian (cùng lý lẽ
 * `toVnDate` ở `stats-page.tsx`).
 */
export type RentalsMode = "queue" | "ledger";

export interface RentalsSearch {
  readonly mode: RentalsMode;
  readonly q: string;
  readonly page: number;
  readonly from: string;
  readonly to: string;
}

/** `YYYY-MM-DD` và không gì khác. Chuỗi lạ bị bỏ, không sửa chữa. */
function asDateString(v: unknown): string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

export function validateRentalsSearch(search: Record<string, unknown>): RentalsSearch {
  const rawPage = search["page"];
  const page =
    typeof rawPage === "number" && Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  return {
    mode: search["mode"] === "ledger" ? "ledger" : "queue",
    q: typeof search["q"] === "string" ? search["q"] : "",
    page,
    from: asDateString(search["from"]),
    to: asDateString(search["to"]),
  };
}

/**
 * Có `q` thì hàng đợi mất nghĩa — một hàng đợi đã lọc theo từ khoá không còn là
 * hàng đợi. Quyết định đó sống ở ĐÂY, một hàm thuần test được, chứ không nằm rải
 * trong JSX của trang: nó là luật, không phải điều kiện render.
 */
export function effectiveMode(s: RentalsSearch): RentalsMode {
  return s.q.trim().length > 0 ? "ledger" : s.mode;
}
```

Test `apps/staff/src/lib/rentals-search.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { effectiveMode, validateRentalsSearch } from "./rentals-search";

describe("validateRentalsSearch", () => {
  it("mặc định là hàng đợi, trang 1, không lọc gì", () => {
    expect(validateRentalsSearch({})).toEqual({ mode: "queue", q: "", page: 1, from: "", to: "" });
  });

  it("mode lạ rơi về hàng đợi, không throw", () => {
    expect(validateRentalsSearch({ mode: "xyz" }).mode).toBe("queue");
  });

  it("page lạ rơi về 1", () => {
    expect(validateRentalsSearch({ page: "abc" }).page).toBe(1);
    expect(validateRentalsSearch({ page: 0 }).page).toBe(1);
    expect(validateRentalsSearch({ page: 2.5 }).page).toBe(1);
  });

  it("chỉ nhận ngày đúng khuôn YYYY-MM-DD", () => {
    expect(validateRentalsSearch({ from: "2026-09-04" }).from).toBe("2026-09-04");
    expect(validateRentalsSearch({ from: "04/09/2026" }).from).toBe("");
    expect(validateRentalsSearch({ from: 20260904 }).from).toBe("");
  });
});

describe("effectiveMode", () => {
  const base = { mode: "queue", q: "", page: 1, from: "", to: "" } as const;

  it("có từ khoá ⇒ luôn là sổ cái, kể cả khi mode đang là hàng đợi", () => {
    expect(effectiveMode({ ...base, q: "bảo" })).toBe("ledger");
  });

  it("khoảng trắng không tính là từ khoá", () => {
    expect(effectiveMode({ ...base, q: "   " })).toBe("queue");
  });
});
```

- [ ] **Bước 2: Chạy test**

Run: `bun test apps/staff/src/lib/rentals-search.test.ts`
Expected: PASS.

- [ ] **Bước 3: `lib/rentals-list.ts`**

```ts
import { keepPreviousData } from "@tanstack/react-query";
import type { ApiErrorCode } from "@v9/api";
import { api } from "./api";
import { errorCode } from "./errors";
import type { CalendarRental } from "./rentals";
import type { RentalsSearch } from "./rentals-search";

/** Cùng số với `CUSTOMERS_PAGE_SIZE` — hai màn danh sách không có lý do nhảy trang khác nhịp nhau. */
export const RENTALS_PAGE_SIZE = 20;

/**
 * SUY ra từ chính `response` schema của API, khuôn `CustomerListRow` ở
 * `lib/customers.ts`. Gõ tay hai interface này là dựng bản sao thứ hai của hợp
 * đồng API — nó biên dịch được cho tới ngày route đổi một field.
 */
export type RentalQueueRow = NonNullable<
  Awaited<ReturnType<typeof api.rentals.queue.get>>["data"]
>["rentals"][number];

export type RentalLedgerRow = NonNullable<
  Awaited<ReturnType<typeof api.rentals.ledger.get>>["data"]
>["rentals"][number];

/**
 * ⚠️ Hai hàm dưới đây tồn tại CHỈ để ép kiểm lúc BIÊN DỊCH; không đường chạy nào
 * gọi chúng.
 *
 * `RentalDetailSheet` nhận `rental: CalendarRental` (hình dạng của `GET /rentals`),
 * còn hai màn mới trả hàng RỘNG HƠN (thêm xe, thêm `group`). Sheet chạy được mà
 * không phải sửa một dòng nào — nhưng đó là một tính chất CẤU TRÚC dễ vỡ trong
 * im lặng: bỏ một field khỏi row schema phía API thì lỗi nổ ra ở `pages/
 * rentals-page.tsx`, cách xa chỗ thật sự sai. Ép ở đây thì nó nổ ngay tại hợp
 * đồng. Cùng khuôn `_statusSchemaMatchesDomain` ở `apps/api/src/routes/rentals.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ép kiểm lúc biên dịch, không đọc lúc chạy.
const _queueRowFitsSheet: (row: RentalQueueRow) => CalendarRental = (row) => row;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ép kiểm lúc biên dịch, không đọc lúc chạy.
const _ledgerRowFitsSheet: (row: RentalLedgerRow) => CalendarRental = (row) => row;

export type RentalsQueueResult =
  | {
      ok: true;
      rentals: RentalQueueRow[];
      total: number;
      groupCounts: NonNullable<
        Awaited<ReturnType<typeof api.rentals.queue.get>>["data"]
      >["groupCounts"];
    }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

export type RentalsLedgerResult =
  | { ok: true; rentals: RentalLedgerRow[]; total: number; collectedAmount: number }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

/**
 * `keepPreviousData` và nhánh lỗi giữ CẢ `value` gốc: hai quyết định đã có lý lẽ
 * đầy đủ ở `lib/customers.ts` và `lib/rentals.ts` — đọc ở đó, đừng chép lại vào
 * đây. Hệ quả phải nhớ khi đọc trang: từ lần tải thứ hai `isPending` luôn false,
 * `isFetching` là chỉ báo tải duy nhất còn nghĩa.
 */
export const rentalsQueueQuery = (page: number) => ({
  queryKey: ["rentals-queue", page] as const,
  placeholderData: keepPreviousData,
  queryFn: async (): Promise<RentalsQueueResult> => {
    const res = await api.rentals.queue.get({ query: { page, pageSize: RENTALS_PAGE_SIZE } });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, ...res.data };
  },
});

/**
 * `from`/`to` là `YYYY-MM-DD` ở URL nhưng API nhận `date-time`. Đổi ở ĐÂY, một
 * chỗ, và đổi bằng cách ghim giờ shop tường minh: `new Date("2026-09-04")` là
 * nửa đêm **UTC**, tức 07:00 giờ VN — một sổ cái lọc "từ 04/09" sẽ bỏ sót mọi
 * đơn bắt đầu trong bảy tiếng đầu ngày.
 *
 * `to` cộng trọn một ngày vì người dùng chọn "đến 06/09" nghĩa là **hết** ngày
 * 06/09, còn `tstzrange(...,'[)')` có biên phải MỞ. Đây đúng cùng cái bẫy biên
 * mở mà `lastMomentOf` đã đóng ở chiều hiển thị.
 */
function toApiFrom(ymd: string): string | undefined {
  return ymd ? new Date(`${ymd}T00:00:00+07:00`).toISOString() : undefined;
}

function toApiTo(ymd: string): string | undefined {
  if (!ymd) return undefined;
  const end = new Date(`${ymd}T00:00:00+07:00`);
  end.setDate(end.getDate() + 1);
  return end.toISOString();
}

export const rentalsLedgerQuery = (s: RentalsSearch) => ({
  queryKey: ["rentals-ledger", s.q, s.page, s.from, s.to] as const,
  placeholderData: keepPreviousData,
  queryFn: async (): Promise<RentalsLedgerResult> => {
    const res = await api.rentals.ledger.get({
      query: {
        q: s.q,
        page: s.page,
        pageSize: RENTALS_PAGE_SIZE,
        ...(toApiFrom(s.from) === undefined ? {} : { from: toApiFrom(s.from) }),
        ...(toApiTo(s.to) === undefined ? {} : { to: toApiTo(s.to) }),
      },
    });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, ...res.data };
  },
});
```

⚠️ `+07:00` viết cứng ở hai hàm trên là **nợ có ý thức**, không phải cẩu thả: `SHOP_TIMEZONE` là
tên vùng IANA (`Asia/Ho_Chi_Minh`) chứ không phải một độ lệch, và đổi tên vùng thành độ lệch trong
trình duyệt cần `Intl` — quá nặng cho hai dòng này. Việt Nam không có DST nên độ lệch là hằng số.
**Ghi một dòng vào `docs/DEBT.md`** ngay trong task này, đừng để nó chỉ sống trong comment.

- [ ] **Bước 4: Typecheck — đây là bước kiểm thật của task này**

Run: `bun run typecheck`
Expected: PASS. Nếu `_queueRowFitsSheet` đỏ, nghĩa là hàng của API **không** phủ được hình dạng
sheet — dừng lại và so hai schema, đừng chữa bằng `as`.

- [ ] **Bước 5: Commit**

```bash
bun test && bun run typecheck
git add apps/staff/src/lib/rentals-list.ts apps/staff/src/lib/rentals-search.ts \
        apps/staff/src/lib/rentals-search.test.ts docs/DEBT.md
git commit -m "feat(staff): tầng dữ liệu cho màn Đơn thuê, kèm ràng buộc kiểu với sheet chi tiết"
```

---

### Task 7: Một dòng đơn, hai hình dạng

**Files:**

- Create: `apps/staff/src/components/rentals/rental-list.tsx`
- Test: `apps/staff/src/components/rentals/rental-list.test.tsx`

**Interfaces:**

- Consumes: `useLayoutVariant` (`hooks/use-layout-variant`); `STATUS_LABEL`, `rentalChipClass`,
  `statusIconOf`, `lastMomentOf` (`lib/rental-status`); `Icon` (`ui/icon`); `SHOP_TIMEZONE`.
- Produces: `RentalList({ rows, now, onOpen })` — `rows: readonly RentalListItem[]`,
  `onOpen: (id: string) => void`; `interface RentalListItem` là hình dạng **hẹp nhất** mà cả
  `RentalQueueRow` lẫn `RentalLedgerRow` thoả.

- [ ] **Bước 1: Viết component**

```tsx
import { SHOP_TIMEZONE, type RentalStatus } from "@v9/shared/domain/rental";
import { useLayoutVariant } from "../../hooks/use-layout-variant";
import { STATUS_LABEL, lastMomentOf, rentalChipClass, statusIconOf } from "../../lib/rental-status";
import { Icon } from "../ui/icon";

/**
 * Hình dạng HẸP NHẤT một dòng cần để vẽ được — không phải `RentalQueueRow`.
 *
 * Cùng lý lẽ `rentalChipClass` đã ghi khi nó nhận `{ status; startsAt; endsAt }`
 * thay vì `CalendarRental`: hai màn (hàng đợi, sổ cái) đưa hai kiểu hàng khác
 * nhau vào đây, và buộc chúng về một kiểu cụ thể là kéo cả hợp đồng API vào một
 * component trình bày.
 */
export interface RentalListItem {
  readonly id: string;
  readonly status: RentalStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly totalAmount: number;
  readonly customerName?: string | undefined;
  readonly vehicleMake: string;
  readonly vehicleModel: string;
  readonly vehiclePlate: string | null;
}

/**
 * Mốc nào được hiện, và nhãn nào đi kèm — CÙNG luật `whenOf`/`WHEN_LABEL` của
 * `customers/customer-table.tsx`, và cùng lý do: `ONGOING` hỏi "bao giờ phải trả
 * xe", `BOOKED` hỏi "bao giờ tới lấy". Đưa ngày trả cho một đơn chưa giao xe là
 * trả lời sai câu hỏi bằng một con số trông rất đúng.
 *
 * `COMPLETED`/`CANCELLED` không tới được ở chế độ hàng đợi nhưng CÓ ở sổ cái,
 * nên chúng phải có nhánh thật: hiện mốc kết thúc, nhãn "Xong".
 *
 * `lastMomentOf` cho mọi nhánh đọc `endsAt`: `endsAt` là biên MỞ, in nó trần là
 * sai đúng một ngày ở mọi đơn kết thúc lúc nửa đêm.
 */
function whenOf(r: RentalListItem): { label: string; at: Date } {
  if (r.status === "BOOKED") return { label: "Lấy", at: r.startsAt };
  if (r.status === "ONGOING") return { label: "Trả", at: lastMomentOf(r.endsAt) };
  return { label: "Xong", at: lastMomentOf(r.endsAt) };
}

/** GIỜ có mặt vì "9h sáng" và "9h tối" là hai câu trả lời khác hẳn nhau — cùng `WHEN_FMT`. */
const WHEN_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

const MONEY_FMT = new Intl.NumberFormat("vi-VN");

function vehicleLabel(r: RentalListItem): string {
  return r.vehiclePlate ? `${r.vehicleMake} ${r.vehicleModel} · ${r.vehiclePlate}`
    : `${r.vehicleMake} ${r.vehicleModel}`;
}

/**
 * Chip trạng thái — màu VÀ hình, không bao giờ chỉ màu.
 *
 * `statusIconOf` bắt buộc chứ không trang trí: `status-icon.test.ts` khoá song
 * ánh màu ↔ hình vì dưới deuteranopia sáu trạng thái không tách được bằng màu.
 * Nhãn chữ cũng nằm ngay trong chip chứ không trong `title=` — app này là PWA
 * dùng trên điện thoại, và ở đó `title` không bao giờ hiện.
 */
function StatusChip({ rental, now }: { readonly rental: RentalListItem; readonly now: Date }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-card px-2 py-1 text-xs font-medium ${rentalChipClass(rental, now)}`}
    >
      <Icon name={statusIconOf(rental, now)} aria-hidden />
      {STATUS_LABEL[rental.status]}
    </span>
  );
}

interface RentalListProps {
  readonly rows: readonly RentalListItem[];
  readonly now: Date;
  readonly onOpen: (id: string) => void;
}

/**
 * Chọn MỘT hình dạng, không dựng cả hai rồi ẩn bằng CSS — cùng quyết định
 * `staff-table.tsx` đã ghi.
 *
 * Vì sao thẻ (khuôn `/staff`) chứ không phải cuộn ngang (khuôn `/customers`):
 * dòng đơn thuê mang sáu trường, và chế độ hàng đợi LÀ chế độ điện thoại — bắt
 * cuộn ngang để đọc cột "trả lúc mấy giờ" trên màn 375px là trả giá đúng ở nơi
 * app được dùng nhiều nhất.
 */
export function RentalList({ rows, now, onOpen }: RentalListProps) {
  if (useLayoutVariant() === "mobile") {
    return (
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex min-h-11 w-full flex-col items-start gap-1 rounded-card border border-border card-pad text-left transition-[background-color] duration-(--duration-instant) ease-standard hover:bg-canvas"
            >
              <StatusChip rental={r} now={now} />
              <span className="font-semibold text-ink">{r.customerName ?? "—"}</span>
              <span className="text-sm text-muted">{vehicleLabel(r)}</span>
              <span className="text-sm text-ink tabular-nums">
                {whenOf(r).label} {WHEN_FMT.format(whenOf(r).at)}
              </span>
              <span className="text-sm text-muted tabular-nums">
                {MONEY_FMT.format(r.totalAmount)} ₫
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          {/* `scope="col"` ở MỌI ô tiêu đề — thiếu nó, trình đọc màn hình đọc
              bảng này thành một chuỗi giá trị không nhãn. */}
          <tr className="border-b border-border text-muted">
            <th scope="col" className="card-pad">Trạng thái</th>
            <th scope="col" className="card-pad">Khách</th>
            <th scope="col" className="card-pad">Xe</th>
            <th scope="col" className="card-pad">Mốc</th>
            <th scope="col" className="card-pad text-right">Tiền</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const when = whenOf(r);
            return (
              <tr key={r.id} className="border-b border-border align-top">
                <td className="p-0">
                  {/* Nút bọc TRONG `<td>`, không phải `<tr onClick>`: một hàng
                      bấm được mà không phải phần tử tương tác thì bàn phím không
                      tới được, và trình đọc màn hình không thông báo được. */}
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="card-pad flex min-h-11 w-full items-start"
                  >
                    <StatusChip rental={r} now={now} />
                  </button>
                </td>
                <td className="card-pad font-semibold text-ink">{r.customerName ?? "—"}</td>
                <td className="card-pad text-muted">{vehicleLabel(r)}</td>
                <td className="card-pad whitespace-nowrap tabular-nums text-ink">
                  {when.label} {WHEN_FMT.format(when.at)}
                </td>
                <td className="card-pad text-right tabular-nums text-muted">
                  {MONEY_FMT.format(r.totalAmount)} ₫
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Bước 2: Viết test**

```tsx
import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { RentalList, type RentalListItem } from "./rental-list";

const NOW = new Date("2026-09-04T15:00:00+07:00");

const booked: RentalListItem = {
  id: "r1",
  status: "BOOKED",
  startsAt: new Date("2026-09-06T09:00:00+07:00"),
  endsAt: new Date("2026-09-09T00:00:00+07:00"),
  totalAmount: 1_500_000,
  customerName: "Trần Quốc Bảo",
  vehicleMake: "Yamaha",
  vehicleModel: "MT-07",
  vehiclePlate: "59X1-12345",
};

describe("RentalList", () => {
  it("BOOKED hiện mốc LẤY xe, không phải mốc trả", () => {
    render(<RentalList rows={[booked]} now={NOW} onOpen={() => undefined} />);
    expect(screen.getByText(/Lấy 09:00 06-09/)).toBeTruthy();
    expect(screen.queryByText(/Trả/)).toBeNull();
  });

  /**
   * `endsAt` là biên MỞ: đơn kết thúc ngày 08/09 lưu `endsAt = 09/09 00:00`.
   * In trần ra là "Trả 00:00 09-09" — sai đúng một ngày, ở đúng cột mà cột này
   * tồn tại để trả lời.
   */
  it("ONGOING lùi endsAt một mili-giây, không in biên mở ra màn hình", () => {
    render(
      <RentalList
        rows={[{ ...booked, status: "ONGOING", id: "r2" }]}
        now={NOW}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText(/Trả 23:59 08-09/)).toBeTruthy();
  });

  it("chip mang CẢ nhãn chữ, không chỉ màu", () => {
    render(<RentalList rows={[booked]} now={NOW} onOpen={() => undefined} />);
    expect(screen.getByText("Đã đặt")).toBeTruthy();
  });

  it("mọi dòng bấm được bằng bàn phím", () => {
    render(<RentalList rows={[booked]} now={NOW} onOpen={() => undefined} />);
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Bước 3: Chạy test**

Run: `bun test apps/staff/src/components/rentals/rental-list.test.tsx`
Expected: PASS.

⚠️ `useLayoutVariant` trả `"desktop"` trong test (happy-dom chưa cắm `matchMedia`, và server
snapshot của hook là `"desktop"` — đã ghi ở JSDoc của hook). Nên bốn test trên đo **hình dạng
bảng**. Muốn đo hình dạng thẻ thì phải cắm `window.matchMedia` giả trong test; nếu làm, kiểm rằng
nó thật sự đổi hình dạng bằng cách assert vắng mặt `<table>`.

- [ ] **Bước 4: Chứng minh test biên mở đo được thứ nó tuyên bố đo**

Đổi tạm `lastMomentOf(r.endsAt)` thành `r.endsAt` → chạy lại → test thứ hai **phải ĐỎ** với
"Trả 00:00 09-09". Hoàn tác.

- [ ] **Bước 5: Commit**

```bash
bun run typecheck && bun test
git add apps/staff/src/components/rentals/rental-list.tsx \
        apps/staff/src/components/rentals/rental-list.test.tsx
git commit -m "feat(staff): dòng đơn thuê — bảng ở màn rộng, thẻ ở màn hẹp"
```

---

### Task 8: Trang `/rentals`

**Files:**

- Create: `apps/staff/src/components/rentals/rental-queue.tsx`
- Create: `apps/staff/src/components/rentals/rental-ledger.tsx`
- Create: `apps/staff/src/pages/rentals-page.tsx`

**Interfaces:**

- Consumes: `rentalsQueueQuery`, `rentalsLedgerQuery`, `RENTALS_PAGE_SIZE` (`lib/rentals-list`);
  `validateRentalsSearch`, `effectiveMode` (`lib/rentals-search`); `connectionFailed`
  (`lib/customers`); `shouldResyncSearchText` (`lib/customers-search`); `fleetQuery`
  (`lib/rentals`); `RentalDetailSheet`; `RentalList`; `ToggleGroup`, `TextField`, `Alert`,
  `Skeleton`, `Button`, `Icon`.
- Produces: `RentalsPage` (named export — `router.tsx` `lazy()` gọi theo tên).

- [ ] **Bước 1: `rental-queue.tsx`**

```tsx
import { QUEUE_GROUPS, type QueueGroup } from "@v9/shared/domain/rental";
import type { RentalQueueRow, RentalsQueueResult } from "../../lib/rentals-list";
import { RentalList } from "./rental-list";

/**
 * Nhãn tiếng Việt của năm nhóm. `Record` đủ cả năm nhánh chứ không phải một
 * object tự do: thêm một nhóm ở `@v9/shared` mà quên nhãn ở đây là LỖI BIÊN
 * DỊCH, cùng khuôn `STATUS_LABEL`.
 */
const GROUP_LABEL: Record<QueueGroup, string> = {
  OVERDUE: "Quá hạn trả",
  PICKUP_OVERDUE: "Chưa lấy xe",
  DUE_TODAY: "Nhận lại hôm nay",
  PICKUP_TODAY: "Giao hôm nay",
  UPCOMING: "Sắp tới",
};

interface RentalQueueProps {
  readonly rentals: readonly RentalQueueRow[];
  readonly groupCounts: Extract<RentalsQueueResult, { ok: true }>["groupCounts"];
  readonly now: Date;
  readonly onOpen: (id: string) => void;
}

/**
 * Lặp qua `QUEUE_GROUPS` chứ không qua các nhóm CÓ MẶT trong `rentals`: thứ tự
 * hiển thị phải là thứ tự độ gấp đã khai ở domain, không phải thứ tự tình cờ của
 * trang dữ liệu hiện tại. Trang 2 của hàng đợi mà tự sắp lại nhóm theo thứ nó
 * nhận được là một màn hình đổi cấu trúc giữa hai lần bấm.
 *
 * Số đếm lấy từ `groupCounts` (toàn bộ hàng đợi), KHÔNG phải `rows.length`
 * (trang đang xem): "Quá hạn trả (7)" phải đúng kể cả khi trang này chứa 3.
 *
 * Nhóm rỗng BIẾN MẤT, không hiện "0" — cùng luật `attention-list.tsx`.
 */
export function RentalQueue({ rentals, groupCounts, now, onOpen }: RentalQueueProps) {
  return (
    <div className="flex flex-col gap-6">
      {QUEUE_GROUPS.map((group) => {
        const rows = rentals.filter((r) => r.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              {GROUP_LABEL[group]} ({groupCounts[group]})
            </h2>
            <RentalList rows={rows} now={now} onOpen={onOpen} />
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Bước 2: `rental-ledger.tsx`**

```tsx
import type { RentalLedgerRow } from "../../lib/rentals-list";
import type { RentalsSearch } from "../../lib/rentals-search";
import { RentalList } from "./rental-list";

const MONEY_FMT = new Intl.NumberFormat("vi-VN");

interface RentalLedgerProps {
  readonly rentals: readonly RentalLedgerRow[];
  readonly collectedAmount: number;
  readonly search: RentalsSearch;
  readonly now: Date;
  readonly onRange: (from: string, to: string) => void;
  readonly onOpen: (id: string) => void;
}

export function RentalLedger({
  rentals,
  collectedAmount,
  search,
  now,
  onRange,
  onOpen,
}: RentalLedgerProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Từ ngày
          <input
            type="date"
            value={search.from}
            onChange={(e) => onRange(e.target.value, search.to)}
            className="min-h-11 rounded-card border border-border card-pad text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Đến ngày
          <input
            type="date"
            value={search.to}
            onChange={(e) => onRange(search.from, e.target.value)}
            className="min-h-11 rounded-card border border-border card-pad text-ink"
          />
        </label>
        {/*
         * "Đã thu", KHÔNG phải "Doanh thu" — và đó là một quyết định, không phải
         * cách nói vòng. Con số này cộng đúng vị từ doanh thu của `stats.ts`
         * (`handed_over_at IS NOT NULL`) nhưng qua một CỬA SỔ khác: giao với
         * khoảng thuê, không phải mốc giao xe. Gọi nó là "Doanh thu" thì nó sẽ
         * bị đem đối chiếu với thẻ ở Thống kê rồi báo là bug.
         */}
        <p className="ml-auto text-sm text-muted">
          Đã thu (đơn đã giao xe):{" "}
          <span className="font-semibold tabular-nums text-ink">
            {MONEY_FMT.format(collectedAmount)} ₫
          </span>
        </p>
      </div>
      <RentalList rows={rentals} now={now} onOpen={onOpen} />
    </div>
  );
}
```

- [ ] **Bước 3: `pages/rentals-page.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { RentalStatus } from "@v9/shared/domain/rental";
import { RentalLedger } from "../components/rentals/rental-ledger";
import { RentalQueue } from "../components/rentals/rental-queue";
import { RentalDetailSheet } from "../components/rentals/rental-detail-sheet";
import { Alert } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { ToggleGroup } from "../components/ui/toggle-group";
import { TextField } from "../components/ui/text-field";
import { connectionFailed } from "../lib/customers";
import { shouldResyncSearchText } from "../lib/customers-search";
import { errorMessage } from "../lib/errors";
import { STATUS_LABEL } from "../lib/rental-status";
import { fleetQuery } from "../lib/rentals";
import { RENTALS_PAGE_SIZE, rentalsLedgerQuery, rentalsQueueQuery } from "../lib/rentals-list";
import { effectiveMode, type RentalsMode } from "../lib/rentals-search";

const MODES: readonly { value: RentalsMode; label: string }[] = [
  { value: "queue", label: "Hàng đợi" },
  { value: "ledger", label: "Sổ cái" },
];

export function RentalsPage() {
  // `strict: false` chứ không `rentalsRoute.useSearch()` — import route vào page
  // dựng ra chu trình module, cùng lý do `customers-list-page.tsx` làm vậy.
  const search = useSearch({ strict: false });
  const navigate = useNavigate({ from: "/rentals" });

  const mode = search.mode === "ledger" ? "ledger" : "queue";
  const q = search.q ?? "";
  const page = search.page ?? 1;
  const from = search.from ?? "";
  const to = search.to ?? "";
  const current = { mode, q, page, from, to } as const;
  const shown = effectiveMode(current);

  const [searchText, setSearchText] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  if (shouldResyncSearchText(q, lastQ)) {
    setLastQ(q);
    setSearchText(q);
  }

  // Debounce 300ms, ghi vào URL với `replace: true` — cùng ngưỡng và cùng lý lẽ
  // `customers-list-page.tsx`: một nhịp debounce là đồng bộ Ô GÕ, không phải một
  // hành động điều hướng đáng có điểm dừng riêng trong lịch sử. Nút phân trang
  // thì ngược lại, nên nó `push`.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim();
      if (next !== q) void navigate({ search: { ...current, q: next, page: 1 }, replace: true });
    }, 300);
    return () => clearTimeout(timer);
    // `current` dựng mới mỗi lần render nên KHÔNG đưa vào deps — nó sẽ làm effect
    // chạy lại mỗi render và reset đồng hồ debounce vĩnh viễn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, q, navigate]);

  const queue = useQuery({ ...rentalsQueueQuery(page), enabled: shown === "queue" });
  const ledger = useQuery({ ...rentalsLedgerQuery(current), enabled: shown === "ledger" });
  const fleet = useQuery(fleetQuery);

  const active = shown === "queue" ? queue : ledger;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changed, setChanged] = useState<string | null>(null);

  const rows = active.data?.ok ? active.data.rentals : [];
  const total = active.data?.ok ? active.data.total : 0;
  const now = new Date();

  /*
   * GHIM bản đang mở, không suy thẳng từ danh sách — cùng lý do
   * `rental-calendar.tsx` đã ghi và cùng mức nguy hiểm: đổi trạng thái xong thì
   * refetch có thể làm đơn RƠI KHỎI trang hiện tại (hàng đợi lọc theo nhóm; một
   * đơn vừa "đã nhận lại xe" thành COMPLETED và biến mất hoàn toàn). Không ghim
   * thì sheet bị gỡ thẳng khỏi cây, không đi qua `dialog.close()`, và hiệu ứng
   * ra không chạy lấy một khung hình.
   */
  const fresh = selectedId === null ? null : (rows.find((r) => r.id === selectedId) ?? null);
  const [pinned, setPinned] = useState<(typeof rows)[number] | null>(null);
  if (fresh !== null && fresh !== pinned) setPinned(fresh);
  const selected = selectedId === null ? null : pinned;

  const vehicles = fleet.data?.ok ? fleet.data.vehicles : [];
  const lastPage = Math.max(1, Math.ceil(total / RENTALS_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Đơn thuê</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          label="Chế độ xem"
          options={MODES}
          value={mode}
          onChange={(next) => void navigate({ search: { ...current, mode: next, page: 1 } })}
        />
        <TextField
          label="Tìm khách, số điện thoại hoặc biển số"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Tên khách, số điện thoại, hoặc biển số"
        />
      </div>

      {/* Gõ từ khoá thì hàng đợi mất nghĩa và trang tự chuyển sang sổ cái. NÓI RA
          điều đó, đừng để người dùng tự đoán vì sao nhóm biến mất. */}
      {q.trim().length > 0 && mode === "queue" && (
        <Alert tone="info">Đang tìm trong tất cả đơn thuê, kể cả đơn đã trả và đã huỷ.</Alert>
      )}

      {changed && (
        <Alert tone="info" live="polite">
          {changed}
        </Alert>
      )}

      {active.isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      )}

      {connectionFailed(active) && (
        <Alert tone="error">
          Không kết nối được tới máy chủ.{" "}
          <button type="button" className="underline" onClick={() => void active.refetch()}>
            Thử lại
          </button>
        </Alert>
      )}

      {!connectionFailed(active) && active.data && !active.data.ok && (
        <Alert tone="error">
          {errorMessage(active.data.value, "Không tải được danh sách đơn thuê.")}
        </Alert>
      )}

      {/* Hai câu RỖNG khác nhau, và sự khác nhau là có thật: ở hàng đợi, rỗng là
          TIN TỐT; ở sổ cái đã lọc, rỗng nghĩa là bộ lọc không khớp gì. */}
      {active.data?.ok && rows.length === 0 && (
        <p className="text-sm text-muted">
          {shown === "queue"
            ? "Không có đơn nào cần xử lý."
            : "Không có đơn nào khớp bộ lọc hiện tại."}
        </p>
      )}

      {active.data?.ok && rows.length > 0 && shown === "queue" && queue.data?.ok && (
        <RentalQueue
          rentals={queue.data.rentals}
          groupCounts={queue.data.groupCounts}
          now={now}
          onOpen={setSelectedId}
        />
      )}

      {active.data?.ok && rows.length > 0 && shown === "ledger" && ledger.data?.ok && (
        <RentalLedger
          rentals={ledger.data.rentals}
          collectedAmount={ledger.data.collectedAmount}
          search={current}
          now={now}
          onRange={(nextFrom, nextTo) =>
            void navigate({ search: { ...current, from: nextFrom, to: nextTo, page: 1 } })
          }
          onOpen={setSelectedId}
        />
      )}

      {total > RENTALS_PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          {/* `push`, không `replace`: bấm sang trang là hành động rời rạc, có chủ
              ý, xứng đáng một điểm dừng riêng trong lịch sử — cùng khuôn nút
              prev/next của lịch và của màn Khách hàng. */}
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => void navigate({ search: { ...current, page: page - 1 } })}
            className="min-h-11 rounded-card border border-border px-3 text-sm text-ink disabled:opacity-50"
          >
            Trước
          </button>
          <span className="text-sm text-muted tabular-nums">
            Trang {page}/{lastPage} · {total} đơn
          </span>
          <button
            type="button"
            disabled={page >= lastPage}
            onClick={() => void navigate({ search: { ...current, page: page + 1 } })}
            className="min-h-11 rounded-card border border-border px-3 text-sm text-ink disabled:opacity-50"
          >
            Sau →
          </button>
        </div>
      )}

      {selected && (
        <RentalDetailSheet
          rental={selected}
          vehicle={vehicles.find((v) => v.id === selected.vehicleId)}
          onClose={() => setSelectedId(null)}
          /* `onChanged` KHÔNG gỡ sheet — chỉ `onClose` mới được làm việc đó. Gỡ ở
             đây là gỡ `<dialog>` thẳng khỏi cây, không đi qua `dialog.close()`,
             tức mất hiệu ứng ra. Cùng luật `rental-calendar.tsx`. */
          onChanged={(next: RentalStatus) =>
            setChanged(`Đã cập nhật: ${STATUS_LABEL[next].toLowerCase()}.`)
          }
        />
      )}
    </div>
  );
}
```

⚠️ **`TextField` spread thẳng phần prop còn lại vào `<input>`** (`{ label, error, className,
...input }`), nên `onChange` là handler DOM nhận `event`, KHÔNG phải `(value: string) => void`.
Viết `onChange={setSearchText}` thì `searchText` thành một `SyntheticEvent` và ô nhập chết im lặng.
Chỗ gọi mẫu: `customers-list-page.tsx:94`.

`Alert` có `tone: AlertTone` và prop `live` ghi đè mức khẩn (mặc định suy từ `tone`: `error` →
`assertive`). `tone="info"` và `tone="error"` đều dùng được — `stats-page.tsx` và
`customers-list-page.tsx` đã dùng cả hai.

- [ ] **Bước 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS. Lỗi hay gặp: `search` từ `useSearch({ strict: false })` có kiểu rộng — dot access
là đúng khuôn (`validateRentalsSearch` ở route đã lọc rồi), giống `customers-list-page.tsx`.

- [ ] **Bước 5: Commit**

```bash
bun run typecheck && bun test
git add apps/staff/src/components/rentals/rental-queue.tsx \
        apps/staff/src/components/rentals/rental-ledger.tsx \
        apps/staff/src/pages/rentals-page.tsx
git commit -m "feat(staff): trang Đơn thuê — hàng đợi theo độ gấp và sổ cái có đơn đã huỷ"
```

---

### Task 9: Nối dây — route, nav, và đóng cảnh báo của `attention-list`

Đây là task **duy nhất** làm màn hình xuất hiện với người dùng. Trước nó, tám task kia là code chưa
ai với tới được — đúng cái bẫy mà màn Khách hàng đã cắn (`2026-08-31-customers-surface-design.md`
§1: "surface chưa được nối vào app").

**Files:**

- Modify: `apps/staff/src/router.tsx`
- Modify: `apps/staff/src/components/layout/app-nav.tsx`
- Modify: `apps/staff/src/components/stats/attention-list.tsx`
- Modify: `docs/ROADMAP.md`

- [ ] **Bước 1: Đăng ký route**

Trong `apps/staff/src/router.tsx`, thêm cạnh `customersListRoute`:

```ts
const rentalsRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/rentals",
  validateSearch: validateRentalsSearch,
  component: lazy(() => import("./pages/rentals-page"), "RentalsPage"),
});
```

Thêm `import { validateRentalsSearch } from "./lib/rentals-search";` ở đầu file, và
`rentalsRoute` vào `protectedLayoutRoute.addChildren([...])`.

⚠️ `lazy(...)` ở file này là **helper riêng của repo** (`router.tsx:58`), một lớp mỏng bọc
`lazyRouteComponent` của TanStack và nhận tên export làm tham số thứ hai — KHÔNG phải `React.lazy`.
Vì vậy `RentalsPage` phải là **named export**, đúng như Task 8 đã khai.

- [ ] **Bước 2: Mở khoá mục nav**

Trong `app-nav.tsx`:

```ts
  readonly to: "/" | "/staff" | "/calendar" | "/customers" | "/requests" | "/rentals";
```

```ts
  { kind: "link", label: "Đơn thuê", to: "/rentals", icon: "nav-rentals" },
```

thay cho `{ kind: "soon", label: "Đơn thuê", icon: "nav-rentals" }`. **Giữ nguyên vị trí** — giữa
"Yêu cầu" và "Khách hàng". Vị trí đó đã được quyết từ trước và đổi nó là đổi bản đồ trong đầu người
dùng mà không được gì.

Cập nhật comment ở đầu file: `Lịch` không còn là ví dụ duy nhất về mục vừa mở khoá.

- [ ] **Bước 3: Ba dòng "Cần chú ý" đổi đích**

Trong `attention-list.tsx`, đổi `target` của `overdue`, `pickupOverdue`, `dueToday` thành
`{ to: "/rentals" as const, search: { mode: "queue" as const, q: "", page: 1, from: "", to: "" } }`,
và nới union `Row["target"]` cho nhánh mới.

**Xoá** khối cảnh báo `⚠️ Neo ở mốc sớm nhất KHÔNG bảo đảm nhìn thấy đủ cả nhóm…` — nó mô tả một
giới hạn đã hết tồn tại, và một cảnh báo sai còn tệ hơn không có cảnh báo. Thay bằng một câu ngắn
nói vì sao ba dòng này sang `/rentals` còn dòng `pendingStaff` thì không.

`overdueFrom` / `pickupOverdueFrom` ở API **giữ nguyên** — đừng dọn chúng trong task này.

Chạy lại `bun test apps/staff/src/components/stats/attention-list.test.tsx` và **sửa test cho khớp
đích mới**. Nếu test vẫn xanh mà không phải sửa gì, nghĩa là nó không hề canh đích của link — ghi
điều đó vào báo cáo task.

- [ ] **Bước 4: Chạy app thật và đi hết luồng**

```bash
nvm use 22
docker compose up -d postgres
bun run dev
```

Kiểm bằng tay, ghi kết quả từng ý vào báo cáo (**đo, không suy**):

1. `/rentals` mở ra thấy nhóm gấp nhất ở trên cùng, **không** phải chọn ngày trước.
2. Nhóm rỗng không hiện, không có dòng "(0)".
3. Bấm một đơn → sheet mở, có nút đổi trạng thái, ảnh bàn giao hiện.
4. Đổi trạng thái → sheet chạy hết hiệu ứng rồi mới đóng (**không** biến mất đột ngột).
5. Gõ vào ô tìm → tự chuyển sổ cái, có băng giải thích, thấy được đơn `CANCELLED`.
6. Bấm "Sau →" rồi Back → về đúng trang trước, ô tìm giữ nguyên chữ.
7. Thu cửa sổ xuống 375px → đổi sang hình dạng thẻ, **không** cuộn ngang.
8. Trang chủ → bấm "N xe quá hạn chưa trả" → sang `/rentals`, và số dòng nhóm "Quá hạn trả"
   **đúng bằng** con số vừa bấm.

Ý số 8 là hàng rào ở tầng người dùng cho test "khớp tuyệt đối" của Task 3. Nếu hai số lệch, **dừng
lại** — đó là một mâu thuẫn thật, không phải sai số hiển thị.

- [ ] **Bước 5: Cập nhật `docs/ROADMAP.md`**

Thêm mục đợt này (thiết kế + plan + những gì đã land), và sửa dòng liệt kê mục nav còn `soon`: nay
chỉ còn **"Bàn giao"**. Không sửa gì khác trong file đó.

- [ ] **Bước 6: Commit**

```bash
bun run typecheck && bun test
git add apps/staff/src/router.tsx apps/staff/src/components/layout/app-nav.tsx \
        apps/staff/src/components/stats/attention-list.tsx \
        apps/staff/src/components/stats/attention-list.test.tsx docs/ROADMAP.md
git commit -m "feat(staff): mở khoá màn Đơn thuê và đưa ba dòng Cần chú ý về đúng đích"
```

---

## Tự rà lại

**Phủ spec.** §3 hai chế độ → Task 5, 8. §4 năm nhóm → Task 1, 3. §4.1 loại trừ + khớp Thống kê →
Task 1 (thứ tự nhánh), Task 3 (hai test). §5 hai endpoint → Task 5. §5.1 sheet không phải sửa →
Task 6 bước 4. §5.2 biên tính trong SQL → Task 3. §6 ba hàng rào → Task 3 (SQL↔TS, khớp Thống kê,
phân trang) + Task 4 (phân trang sổ cái). §7 đóng cảnh báo → Task 9 bước 3. §8 quyết định nghiệp vụ
→ không có nút Huỷ ở tầng danh sách (Task 7, 8 đều không dựng), `collectedAmount` đặt tên và gắn
nhãn (Task 4, 8). §10 responsive → Task 7. §11 trạng thái → Task 8. §12 phân trang server → Task 3,
4, 8.

**Chưa phủ, cố ý:** §9 (ngoài phạm vi) không có task nào — đúng thiết kế.

**Nhất quán kiểu.** `QueueGroup` dùng chung một tên ở cả năm nơi (domain, service, route schema,
`lib/rentals-list`, `rental-queue.tsx`). `RentalListItem` (Task 7) hẹp hơn `RentalListRow` (Task 3)
có chủ ý và cả `RentalQueueRow` lẫn `RentalLedgerRow` đều thoả nó. `RENTALS_PAGE_SIZE` (frontend)
khớp `RENTALS_PAGE_SIZE_DEFAULT` (backend) — hai hằng số riêng, cùng giá trị, cùng lý lẽ đã ghi ở
`CUSTOMERS_PAGE_SIZE`.

**Rủi ro đã biết, đã ghi tại chỗ chứ không giấu:** `schema.rentals.period` có thể không tồn tại ở
tầng drizzle (Task 4 bước 1) · test "khớp tuyệt đối" có thể đỏ vì dữ liệu seed-dev (Task 3 bước 2)
· `TextField`/`Alert` phải đọc chữ ký thật trước khi gọi (Task 8 bước 3) · `useLayoutVariant` trả
`"desktop"` trong test nên hình dạng thẻ chưa được test tự động phủ (Task 7 bước 3).
