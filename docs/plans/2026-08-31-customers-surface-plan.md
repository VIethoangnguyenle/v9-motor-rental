# Màn Khách hàng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nối màn Khách hàng vào `apps/staff`, làm nó trả lời được câu hỏi vận hành thật, và đóng 1 P0 + 4 P1 + 1 P2 của `/impeccable critique`.

**Architecture:** Ba tầng theo thứ tự phụ thuộc. UI trước (nối route để `typecheck` xanh, tạo baseline kiểm chứng được cho mọi task sau), rồi migration + API (chuẩn hoá tìm kiếm, tín hiệu vận hành), rồi UI tiêu thụ dữ liệu mới. Mọi tín hiệu vận hành **suy ra từ `rentals`**, không có cột denormalized nào.

**Tech Stack:** Bun · Elysia + TypeBox · Drizzle + `bun-sql` · Postgres 17 (`unaccent`, `pg_trgm`) · React + TanStack Router/Query · Tailwind v4.

**Design doc:** [`2026-08-31-customers-surface-design.md`](2026-08-31-customers-surface-design.md)

---

## Sai lệch có chủ ý so với design doc

Design doc §3.2 chọn `LEFT JOIN LATERAL`. **Plan này không dùng LATERAL**, và đây là lý do:

`listCustomers` **đã có sẵn** một truy vấn phụ khoanh theo đúng trang đang xem
(`apps/api/src/services/customers.ts:204-216`), kèm comment giải thích: _"Đếm rental CHỈ cho đúng
trang đang xem — không đếm cả bảng `rentals` cho 12.000 khách để rồi vứt đi 11.980 kết quả."_

Ba lựa chọn trong design doc phân biệt nhau ở **hình dạng API** (một round trip HTTP / hai lời gọi
HTTP / cột denormalized). Truy vấn phụ sẵn có vẫn là **một round trip HTTP**, không có state trùng
lặp — tức nó nằm TRONG phương án đã duyệt, chỉ khác cách viết SQL. Mở rộng khuôn đã có thắng việc
dựng LATERAL mới: nó giữ nguyên tối ưu khoanh-theo-trang, và không viết lại một hàm đang chạy đúng.

Kết quả vẫn y hệt design doc: `activeRental` + `lateReturnCount`, suy ra, không lưu.

---

## File structure

| File                                            | Trách nhiệm                                                                       | Task  |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | ----- |
| `apps/staff/src/router.tsx`                     | Khai hai route mới + `validateSearch`                                             | 1, 2  |
| `apps/staff/src/components/layout/app-nav.tsx`  | Mở khoá mục "Khách hàng"                                                          | 1     |
| `apps/staff/src/lib/customers-search.ts`        | **Tạo mới** — `validateCustomersSearch`, tách khỏi page để tránh chu trình module | 2     |
| `packages/db/migrations/00XX_*.sql`             | **Tạo mới** — extension, `f_unaccent`, GIN index, 3 cột                           | 4     |
| `packages/db/src/schema/rentals.ts`             | Ba cột mới vào định nghĩa Drizzle                                                 | 4     |
| `packages/db/src/schema/rentals-schema.test.ts` | Test hai CHECK mới                                                                | 4     |
| `apps/api/src/services/customers.ts`            | `fullNameMatches()`, tín hiệu vận hành                                            | 5, 6  |
| `apps/api/src/services/customers.test.ts`       | Test bỏ dấu, test index, test parity                                              | 5, 6  |
| `apps/api/src/routes/rentals.ts`                | Mở rộng `customerListRowSchema`                                                   | 6     |
| `apps/staff/src/components/ui/alert.tsx`        | `role`/`aria-live`                                                                | 7     |
| `apps/staff/src/components/ui/text-field.tsx`   | `min-h-11`                                                                        | 7     |
| `apps/staff/src/lib/customers.ts`               | `placeholderData`, kiểu mới                                                       | 8     |
| `apps/staff/src/lib/rental-status.ts`           | Nới tham số `rentalChipClass`                                                     | 9     |
| `apps/staff/src/components/customers/*.tsx`     | Tiêu thụ tín hiệu, vùng chạm                                                      | 9, 10 |
| `docs/DEBT.md`, `docs/ROADMAP.md`               | Ghi nợ đã quyết không trả                                                         | 11    |

---

## Task 1: Nối route và nav (đóng P0)

Đây là task đầu vì `bun run --filter @v9/staff typecheck` **đang exit 2**. Không có baseline xanh
thì không task nào sau đó kiểm chứng được.

**Files:**

- Modify: `apps/staff/src/router.tsx:248-263`
- Modify: `apps/staff/src/components/layout/app-nav.tsx:26,35`
- Modify: `apps/staff/src/pages/customer-detail-page.tsx:16`

- [ ] **Step 1: Chạy typecheck để thấy đúng bốn lỗi trước khi sửa**

```bash
bun run --filter @v9/staff typecheck
```

Expected: FAIL, exit 2, đúng bốn lỗi: `customer-table.tsx(31,19)`, `customer-table.tsx(32,29)`,
`customer-detail-page.tsx(16,30)`, `customer-detail-page.tsx(38,13)`.

- [ ] **Step 2: Tạo `apps/staff/src/lib/customers-search.ts`**

`router.tsx` import file này ở Step 3, nên nó phải tồn tại trước.

```ts
/**
 * `validateSearch` cho `/customers`, tách khỏi `customers-list-page.tsx` có chủ
 * ý: `router.tsx` import file này, mà page cũng import nó — để hàm trong page
 * thì `router.tsx` → page → router.tsx thành chu trình module. Cùng lý do
 * `validateCalendarSearch` nằm ở `rental-calendar.tsx` chứ không ở `router.tsx`.
 *
 * Giá trị lạ bị LỌC, không throw: `?page=abc` cho trang 1, không cho màn lỗi.
 */
export interface CustomersSearch {
  readonly q: string;
  readonly page: number;
}

export function validateCustomersSearch(search: Record<string, unknown>): CustomersSearch {
  const rawQ = search["q"];
  const rawPage = search["page"];
  const page =
    typeof rawPage === "number" && Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  return { q: typeof rawQ === "string" ? rawQ : "", page };
}
```

- [ ] **Step 3: Khai hai route, đặt NGAY TRƯỚC `const routeTree`**

Trong `apps/staff/src/router.tsx`, chèn trước dòng `const routeTree = rootRoute.addChildren([`:

```tsx
/**
 * `?q=` và `?page=` sống ở URL chứ không trong `useState` của component —
 * cùng lý lẽ với `calendarRoute` ngay trên: Back từ trang chi tiết phải trả về
 * ĐÚNG trang và ĐÚNG từ khoá đang xem, F5 không mất chỗ, và link gửi cho đồng
 * nghiệp mở ra đúng thứ mình đang nhìn.
 *
 * `validateCustomersSearch` lọc giá trị lạ thay vì throw (khuôn
 * `validateCalendarSearch`): `?page=abc` cho ra trang 1, không cho ra màn lỗi.
 */
const customersListRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/customers",
  validateSearch: validateCustomersSearch,
  component: CustomersListPage,
});

const customerDetailRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/customers/$id",
  component: CustomerDetailPage,
});
```

Thêm import ở đầu file, cạnh các import `lib/` đã có:

```tsx
import { validateCustomersSearch } from "./lib/customers-search";
```

- [ ] **Step 4: Thêm hai route vào `routeTree`**

Sửa nhánh `protectedLayoutRoute.addChildren([...])` thành:

```tsx
  protectedLayoutRoute.addChildren([
    homeRoute,
    staffListRoute,
    changePasswordRoute,
    healthRoute,
    calendarRoute,
    customersListRoute,
    customerDetailRoute,
  ]),
```

- [ ] **Step 5: Sửa `useParams` — nó dùng route ID, không phải path**

`apps/staff/src/pages/customer-detail-page.tsx:16` hiện là `useParams({ from: "/customers/$id" })`.
Đó là **path**. `from` cần **route ID**, và vì `protectedLayoutRoute` khai `id: "protected"`
(`router.tsx:97`), ID đầy đủ là `/protected/customers/$id`:

```tsx
const { id } = useParams({ from: "/protected/customers/$id" });
```

`<Link to="/customers/$id">` ở `customer-table.tsx:31` và `<Link to="/customers">` ở
`customer-detail-page.tsx:38` **giữ nguyên** — `to` dùng path, và path là đúng như đang viết.

- [ ] **Step 6: Mở khoá mục nav**

`apps/staff/src/components/layout/app-nav.tsx`, nới union `to` (dòng 26):

```tsx
      readonly to: "/" | "/staff" | "/calendar" | "/customers";
```

và đổi dòng 35 từ `{ kind: "soon", label: "Khách hàng" },` thành:

```tsx
  { kind: "link", label: "Khách hàng", to: "/customers" },
```

- [ ] **Step 7: Verify typecheck xanh**

```bash
bun run --filter @v9/staff typecheck
```

Expected: PASS, exit 0, không lỗi nào.

- [ ] **Step 8: Verify route render thật, không chỉ biên dịch**

```bash
bun run dev
```

Mở `http://localhost:3003/customers`. Expected: thấy tiêu đề "Khách hàng" và ô tìm — **không** phải
`Not Found`. Nếu chưa đăng nhập sẽ bị guard đá về `/login`; đăng nhập bằng tài khoản dev
(`scripts/staff-bootstrap.ts` tạo sẵn một OWNER `ACTIVE`) rồi thử lại. Dừng dev server sau khi xong.

- [ ] **Step 9: Commit**

```bash
git add apps/staff/src/router.tsx apps/staff/src/components/layout/app-nav.tsx apps/staff/src/pages/customer-detail-page.tsx apps/staff/src/lib/customers-search.ts
git commit -m "fix(staff): nối route /customers, typecheck hết đỏ

Hai page đã viết xong nhưng routeTree không khai route nào và nav vẫn để
kind: soon — surface không tồn tại trong app đang chạy, và vì build là
tsc --noEmit && vite build, cả nhánh không build được.

useParams nhận route ID chứ không nhận path: protectedLayoutRoute khai
id: protected nên ID đầy đủ là /protected/customers/\$id.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 2: State lên URL (đóng P1 "User Control and Freedom")

**Files:**

- Modify: `apps/staff/src/pages/customers-list-page.tsx:19-39`
- Modify: `apps/staff/src/router.tsx` (thêm `validateSearch` cho `customerDetailRoute`)
- Modify: `apps/staff/src/components/customers/customer-table.tsx` (mang `q`/`page` sang trang chi tiết)
- Modify: `apps/staff/src/pages/customer-detail-page.tsx` (nút back trả về ĐÚNG chỗ vừa rời)

- [ ] **Step 1: Siết `page` — `Number.isInteger` không có trần trên**

Code quality review Task 1 bắt được: `Number.isInteger(1e20)` và `Number.isInteger(Number.MAX_VALUE)`
đều là `true`, nên `?page=1e20` lọt qua nguyên vẹn. Hôm qua vô hại vì trang còn dùng `useState`
riêng; **Step 4 dưới đây nối `search.page` thẳng vào `customersListQuery`**, và từ đó nó bay ra
`GET /customers/list?page=1e20`. Sửa một chữ, cùng chi phí:

Trong `apps/staff/src/lib/customers-search.ts`, đổi `Number.isInteger` thành `Number.isSafeInteger`:

```ts
const page =
  typeof rawPage === "number" && Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
```

- [ ] **Step 2: Viết test cho `validateCustomersSearch`** (hàm đã tạo ở Task 1 Step 2)

Tạo `apps/staff/src/lib/customers-search.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { validateCustomersSearch } from "./customers-search";

describe("validateCustomersSearch", () => {
  it("giữ nguyên giá trị hợp lệ", () => {
    expect(validateCustomersSearch({ q: "nguyen", page: 3 })).toEqual({ q: "nguyen", page: 3 });
  });

  it("thiếu hết thì về mặc định", () => {
    expect(validateCustomersSearch({})).toEqual({ q: "", page: 1 });
  });

  it("page hỏng thì về 1 chứ không throw", () => {
    expect(validateCustomersSearch({ page: "abc" })).toEqual({ q: "", page: 1 });
    expect(validateCustomersSearch({ page: 0 })).toEqual({ q: "", page: 1 });
    expect(validateCustomersSearch({ page: -1 })).toEqual({ q: "", page: 1 });
    expect(validateCustomersSearch({ page: 2.5 })).toEqual({ q: "", page: 1 });
    expect(validateCustomersSearch({ page: Number.NaN })).toEqual({ q: "", page: 1 });
  });

  it("page vượt số nguyên an toàn cũng về 1 — 1e20 KHÔNG được lọt ra API", () => {
    expect(validateCustomersSearch({ page: 1e20 })).toEqual({ q: "", page: 1 });
    expect(validateCustomersSearch({ page: Number.MAX_VALUE })).toEqual({ q: "", page: 1 });
    expect(validateCustomersSearch({ page: Number.POSITIVE_INFINITY })).toEqual({ q: "", page: 1 });
  });

  it("q không phải chuỗi thì về rỗng", () => {
    expect(validateCustomersSearch({ q: ["a", "b"] })).toEqual({ q: "", page: 1 });
  });
});
```

- [ ] **Step 3: Chạy test, phải PASS ngay**

```bash
bun test apps/staff/src/lib/customers-search.test.ts
```

Expected: PASS, 3 tests. (Đây là hàm thuần, không cần vòng đỏ trước — implementation đã có ở Step 1.)

- [ ] **Step 4: Đọc/ghi state qua URL trong page**

Trong `apps/staff/src/pages/customers-list-page.tsx`, thay ba dòng `useState` (20-22) và hai
`useEffect` (25-34) bằng:

```tsx
export function CustomersListPage() {
  // `strict: false` chứ không `customersListRoute.useSearch()` — cùng lý do
  // `login-page.tsx` và `rental-calendar.tsx:299` làm vậy: import route vào
  // page dựng ra chu trình module.
  const search = useSearch({ strict: false });
  const navigate = useNavigate({ from: "/customers" });

  // Dot access, không type-guard: `validateCustomersSearch` ở route đã lọc rồi.
  // Cùng idiom `rental-calendar.tsx:300` (`search.view ?? DEFAULT_VIEW`).
  const q = search.q ?? "";
  const page = search.page ?? 1;

  const [searchText, setSearchText] = useState(q);

  // Debounce 300ms — cùng ngưỡng với ô tìm khách hàng ở `rental-form.tsx`.
  // Ghi vào URL thay vì vào state: Back trả về đúng từ khoá trước đó.
  // Đổi từ khoá thì QUAY VỀ trang 1 — giữ `page` cũ dễ ra một trang trống nếu
  // kết quả mới có ít hơn `page * pageSize` dòng.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim();
      if (next !== q) void navigate({ search: { q: next, page: 1 } });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, q, navigate]);

  const query = useQuery(customersListQuery(q, page));
```

Đổi import ở dòng 2 và thêm router hooks:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
```

Thay hai `onClick` phân trang (dòng 77 và 88):

```tsx
            onClick={() => void navigate({ search: { q, page: Math.max(1, page - 1) } })}
```

```tsx
            onClick={() => void navigate({ search: { q, page: Math.min(totalPages, page + 1) } })}
```

Và đổi `debouncedSearch` ở dòng 65 thành `q`.

- [ ] **Step 5: Nút "← Khách hàng" phải trả về ĐÚNG chỗ vừa rời**

Task 1 buộc phải thêm `search={{ q: "", page: 1 }}` vào `<Link to="/customers">`
(`customer-detail-page.tsx`) vì `CustomersSearch` có `q`/`page` không optional — TanStack Router
đòi prop `search` trên `<Link>` có `to` là literal. Hôm đó nó vô hại vì trang danh sách còn đọc
`useState`. **Từ Step 3 nó thành bug**: gõ "nguyen", sang trang 3, mở một khách, bấm back → về
`?q=&page=1`, mất sạch. Đó đúng là thứ task này sinh ra để sửa.

Đây là điều hướng `<Link>` tường minh (push state mới), **không** phải nút Back trình duyệt, nên
nó reset bất kể lịch sử. Cách sửa: cho trang chi tiết **biết mình tới từ đâu**.

Trong `router.tsx`, thêm `validateSearch` cho `customerDetailRoute`:

```tsx
const customerDetailRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/customers/$id",
  // Trang chi tiết mang theo `q`/`page` của DANH SÁCH nó tới từ, chỉ để nút
  // "← Khách hàng" trả về đúng chỗ vừa rời. Nó không tự dùng hai giá trị này
  // vào việc gì khác. Cùng khuôn `rental-form.tsx:511` mang `view`/`from` sang
  // `/calendar`.
  validateSearch: validateCustomersSearch,
  component: CustomerDetailPage,
});
```

Trong `customer-table.tsx`, nhận thêm prop và truyền đi:

```tsx
interface CustomerTableProps {
  readonly rows: readonly CustomerListRow[];
  /** `q`/`page` đang xem, đi cùng sang trang chi tiết để nút back quay lại đúng đây. */
  readonly listSearch: { readonly q: string; readonly page: number };
}
```

```tsx
                <Link
                  to="/customers/$id"
                  params={{ id: row.id }}
                  search={listSearch}
                  className="font-semibold text-ink underline-offset-2 hover:underline"
                >
```

Ở `customers-list-page.tsx`, truyền xuống: `<CustomerTable rows={...} listSearch={{ q, page }} />`.

Trong `customer-detail-page.tsx`, đọc lại và trả về đúng chỗ:

```tsx
const backSearch = useSearch({ strict: false });
```

```tsx
<Link
  to="/customers"
  search={{ q: backSearch.q ?? "", page: backSearch.page ?? 1 }}
  className="text-sm text-muted underline-offset-2 hover:underline"
>
  ← Khách hàng
</Link>
```

- [ ] **Step 6: Đồng bộ `searchText` khi `q` đổi từ Back/Forward**

⚠️ Bước này được thêm sau khi spec review Task 2 bắt được bug trong chính code mẫu của plan.

`useState(q)` chỉ chạy lúc mount. Bấm Back/Forward **trong khi vẫn ở `/customers`** chỉ đổi search
param — route không đổi nên component **không unmount** — nên `searchText` cũ. Effect debounce
re-run (`q` nằm trong deps), thấy `next !== q`, rồi `navigate()` ghi giá trị **cũ** ngược lại URL
sau ~300ms. Back bị đá ngược, tức đúng cái P1 task này sinh ra để sửa.

Thêm vào `apps/staff/src/lib/customers-search.ts` một hàm thuần để test được — `apps/staff`
**không có** React Testing Library/jsdom, và tiền lệ là `decideEntry` ở `guard-decision.ts`:

```ts
export function shouldResyncSearchText(q: string, lastQ: string): boolean {
  return q !== lastQ;
}
```

Trong `customers-list-page.tsx`, đồng bộ **ngay trong lúc render** (khuôn "adjusting state when
props change" của React), không dùng `useEffect` thứ hai — effect chạy sau paint nên ô nhập sẽ
nháy một khung hình giá trị cũ:

```tsx
const [lastQ, setLastQ] = useState(q);
if (shouldResyncSearchText(q, lastQ)) {
  setLastQ(q);
  setSearchText(q);
}
```

Test: `shouldResyncSearchText("", "nguyen")` → `true` (gõ "nguyen" rồi Back về rỗng);
`shouldResyncSearchText("nguyen", "nguyen")` → `false` (chỉ đổi trang, `q` không đổi).

**Kiểm tay bắt buộc — checklist cũ KHÔNG bắt được bug này:** gõ "nguyen" → đổi trang → bấm Back
vài lần về `q=""` → đợi hơn 300ms. URL phải **đứng yên**, không bị đẩy về `?q=nguyen`.

- [ ] **Step 7: Verify**

```bash
bun run --filter @v9/staff typecheck && bun test apps/staff/src/lib/customers-search.test.ts
```

Expected: cả hai PASS.

Kiểm tay với `bun run dev`: gõ vào ô tìm → URL đổi thành `?q=...&page=1`; bấm "Sau →" → `page=2`;
bấm Back → về `page=1` giữ nguyên từ khoá; F5 → vẫn đúng chỗ.

- [ ] **Step 8: Commit**

```bash
git add apps/staff/src/lib/customers-search.ts apps/staff/src/lib/customers-search.test.ts apps/staff/src/pages/customers-list-page.tsx apps/staff/src/pages/customer-detail-page.tsx apps/staff/src/components/customers/customer-table.tsx apps/staff/src/router.tsx
git commit -m "feat(staff): q và page của màn Khách hàng lên URL

Back từ trang chi tiết trả về đúng trang và đúng từ khoá, F5 không mất chỗ,
link share được. Cùng khuôn calendarRoute.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 3: Bỏ `<main>` lồng nhau (đóng P1 "Consistency and Standards")

**Files:**

- Modify: `apps/staff/src/pages/customers-list-page.tsx:42,94`
- Modify: `apps/staff/src/pages/customer-detail-page.tsx:37,71`

- [ ] **Step 1: Đọc luật đã ghi thành văn**

```bash
sed -n '15,30p' apps/staff/src/pages/stats-page.tsx
```

Expected: thấy comment nói `AppShell` đã bọc `children` trong CHÍNH MỘT `<main>`, và _"trang MỚI
thì không lặp"_.

- [ ] **Step 2: Sửa `customers-list-page.tsx`**

Đổi dòng 42 từ `<main className="p-6">` thành `<div className="flex flex-col gap-4">`, và dòng 94
`</main>` thành `</div>`. Rồi **bỏ mọi `mt-3`/`mt-4` cấp một** bên trong — `gap-4` lo khoảng cách:

- dòng 45: `<div className="mt-4 max-w-sm">` → `<div className="max-w-sm">`
- dòng 55: `<div className="mt-3">` → `<div>`
- dòng 62: `className="mt-3 text-sm text-muted"` → `className="text-sm text-muted"`
- dòng 64: `className="mt-3 text-sm text-muted"` → `className="text-sm text-muted"`
- dòng 72: `<div className="mt-4 flex items-center gap-3">` → `<div className="flex items-center gap-3">`

Và trong `customer-table.tsx` dòng 16: `<div className="mt-4 overflow-x-auto">` → `<div className="overflow-x-auto">`.

- [ ] **Step 3: Sửa `customer-detail-page.tsx`**

Dòng 37 `<main className="p-6">` → `<div className="flex flex-col gap-4">`, dòng 71 `</main>` →
`</div>`. Bỏ `mt-*` cấp một: dòng 42, 45, 52 (`mt-1`), 54, 58 (`mt-6` → giữ `mt-2` nếu muốn tách
nhóm, nhưng mặc định bỏ), 60, 62.

Lưu ý: `<>...</>` ở dòng 51-69 nằm trong flex container nên các con của nó **không** nhận `gap`.
Bọc nhánh đó bằng `<div className="flex flex-col gap-4">` để nhịp đều.

- [ ] **Step 4: Verify không còn `<main>` nào trong hai file**

```bash
grep -n "<main" apps/staff/src/pages/customers-list-page.tsx apps/staff/src/pages/customer-detail-page.tsx
```

Expected: không có dòng nào (exit 1).

```bash
grep -n "<main" apps/staff/src/components/layout/app-shell.tsx
```

Expected: đúng MỘT dòng (`app-shell.tsx:52`) — landmark duy nhất của app.

- [ ] **Step 5: Verify typecheck + mắt thường**

```bash
bun run --filter @v9/staff typecheck
```

Expected: PASS.

Với `bun run dev`, thu cửa sổ về 375px: bảng phải bắt đầu cuộn ngang MUỘN hơn trước (vùng nội dung
tăng từ ~295px lên ~343px vì bỏ 24px padding mỗi bên).

- [ ] **Step 6: Commit**

```bash
git add apps/staff/src/pages/customers-list-page.tsx apps/staff/src/pages/customer-detail-page.tsx apps/staff/src/components/customers/customer-table.tsx
git commit -m "fix(staff): bỏ <main> lồng trong <main> ở hai trang Khách hàng

AppShell đã bọc children trong chính một <main>. Lặp nó gây hai landmark cho
cùng nội dung, cộng dồn padding 40px mỗi bên, và vứt bỏ hệ ba breakpoint của
page-gutter. stats-page.tsx đã ghi luật này thành văn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 4: Migration — extension, `f_unaccent`, GIN index, ba cột

**Files:**

- Create: `packages/db/migrations/00XX_*.sql` (số do `db:custom` sinh)
- Modify: `packages/db/src/schema/rentals.ts`
- Modify: `packages/db/src/schema/rentals-schema.test.ts`

- [ ] **Step 1: Sinh file migration trống**

```bash
bun run db:custom
```

Expected: in ra đường dẫn file `.sql` mới trong `packages/db/migrations/`, nội dung trống. Ghi nhớ
tên file — các bước sau gọi nó là `<FILE>`.

- [ ] **Step 2: Viết SQL vào `<FILE>`**

```sql
-- Tìm kiếm khách hàng KHÔNG phân biệt hoa/thường và KHÔNG phân biệt dấu.
--
-- Trước migration này `listCustomers`/`searchCustomers` dùng `LIKE '%term%'` trên
-- text thô: Postgres LIKE phân biệt hoa thường và không biết gì về dấu, nên nhân
-- viên gõ "nguyen" hoặc "trần" không ra "Nguyễn" — và màn hình trả về câu RẤT tự
-- tin "Không tìm thấy khách hàng nào khớp." Cùng lớp lỗi với email phân biệt
-- hoa thường đã đóng ở migration 0011; ở đó bài học đã được áp cho `phone`
-- (chuẩn hoá cả đường đọc lẫn đường ghi) nhưng `full_name` thì lọt.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() do extension cung cấp là STABLE, KHÔNG phải IMMUTABLE — nó tra một
-- dictionary mà người ta đổi được lúc chạy. Postgres vì vậy TỪ CHỐI nó trong
-- biểu thức index. Wrapper dưới đây ghim regdictionary thành hằng nên nó
-- immutable THẬT, không phải khai bừa cho qua planner rồi để index sai lặng lẽ.
CREATE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- GIN + gin_trgm_ops, KHÔNG phải btree. btree không phục vụ được `LIKE '%term%'`
-- (wildcard đứng đầu) — chép nguyên mẫu expression-btree của 0011 sang đây sẽ
-- tạo ra một index không bao giờ được dùng: tốn ghi, tốn dung lượng, và tạo ảo
-- giác đã tối ưu.
--
-- Biểu thức phải khớp CHÍNH XÁC biểu thức trong câu WHERE của
-- `fullNameMatches()` (apps/api/src/services/customers.ts), nếu không planner
-- bỏ qua index. Đó là bài học của 0011.
CREATE INDEX customers_full_name_search_idx
  ON customers USING gin (f_unaccent(lower(full_name)) gin_trgm_ops);

-- Giấy tờ tùy thân shop đang giữ, và địa chỉ giao xe. Cả hai thuộc LƯỢT THUÊ
-- chứ không thuộc khách: giấy tờ được giữ cho một đơn rồi trả lại (vòng đời
-- khớp handed_over_at/returned_at đã có), và khách du lịch đổi chỗ ở mỗi chuyến
-- nên một địa chỉ mặc định trên `customers` sẽ nói dối.
--
-- CỐ Ý KHÔNG có `document_number`: câu hỏi vận hành duy nhất thật sự cần là
-- "đơn này shop còn giữ giấy gì", và trả lời được nó không cần lưu số CCCD của
-- mọi khách từng thuê vào Postgres lẫn mọi bản backup. Bằng chứng đối chiếu khi
-- tranh chấp là ẢNH CHỤP (MinIO), cùng chỗ với ảnh tình trạng xe.
--
-- ⚠️ Ba cột này CHƯA CÓ AI GHI VÀO cho tới khi luồng bàn giao xe được dựng.
-- Đó là hợp đồng dữ liệu cho đợt sau, không phải cột bị quên.
ALTER TABLE rentals
  ADD COLUMN document_type text,
  ADD COLUMN document_returned_at timestamptz,
  ADD COLUMN delivery_address text;

ALTER TABLE rentals
  ADD CONSTRAINT rentals_document_type_valid
    CHECK (document_type IS NULL OR document_type IN ('CCCD', 'PASSPORT')),
  ADD CONSTRAINT rentals_document_return_needs_type
    CHECK (document_returned_at IS NULL OR document_type IS NOT NULL);
```

- [ ] **Step 3: Chạy migration**

```bash
bun run db:migrate
```

Expected: in ra migration vừa áp, exit 0.

**Nếu `CREATE EXTENSION` báo permission denied:** đây là rủi ro đã ghi ở design doc §10. Role của
migrator cần quyền tạo extension. Kiểm bằng:

```bash
docker exec v9-rental-dev-postgres-1 psql -U v9 -d v9_rental -c "\dx"
```

Nếu thiếu quyền, dừng lại và báo người — **không** tự cấp superuser cho role ứng dụng.

- [ ] **Step 4: Verify index tồn tại và ĐÚNG biểu thức**

```bash
docker exec v9-rental-dev-postgres-1 psql -U v9 -d v9_rental -c "\d+ customers" | grep -A2 search_idx
```

Expected: thấy `customers_full_name_search_idx` với `gin (f_unaccent(lower(full_name)))`.

- [ ] **Step 5: Thêm ba cột vào schema Drizzle**

Trong `packages/db/src/schema/rentals.ts`, thêm vào object cột của `rentals` (sau `note`):

```ts
    /**
     * Giấy tờ tùy thân shop đang giữ cho ĐƠN NÀY. Cố ý không lưu số giấy tờ —
     * xem comment trong migration. `document_returned_at` null = còn đang giữ.
     *
     * ⚠️ Chưa có writer cho tới khi luồng bàn giao xe được dựng.
     */
    documentType: text("document_type"),
    documentReturnedAt: timestamp("document_returned_at", { withTimezone: true }),
    /** Địa chỉ giao xe của đơn này. "Lần gần nhất" của một khách là TRUY VẤN, không phải cột. */
    deliveryAddress: text("delivery_address"),
```

Và thêm hai CHECK vào mảng `(t) => [...]`:

```ts
    check(
      "rentals_document_type_valid",
      sql`${t.documentType} IS NULL OR ${t.documentType} IN ('CCCD', 'PASSPORT')`,
    ),
    check(
      "rentals_document_return_needs_type",
      sql`${t.documentReturnedAt} IS NULL OR ${t.documentType} IS NOT NULL`,
    ),
```

- [ ] **Step 6: Viết test cho hai CHECK mới**

Thêm vào cuối `packages/db/src/schema/rentals-schema.test.ts`, đúng khuôn khối
`describe("customers — CHECK số điện thoại")` đã có (dòng 256-269) — chú ý `try/catch` bọc **cả lời
gọi `tx.savepoint`**, không bọc câu lệnh bên trong:

```ts
describe("rentals — CHECK giấy tờ", () => {
  it("từ chối document_type lạ", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, document_type)
            VALUES (${vehicleId}, ${customerId}, now(), now() + interval '1 day', 500000, ${staffId}, 'GIAY_PHEP_LAI_XE')`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_document_type_valid");
    });
  });

  it("từ chối 'đã trả' một thứ chưa từng giữ", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, document_returned_at)
            VALUES (${vehicleId}, ${customerId}, now(), now() + interval '1 day', 500000, ${staffId}, now())`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_document_return_needs_type");
    });
  });
});
```

- [ ] **Step 7: Chạy test**

```bash
bun test packages/db/src/schema/rentals-schema.test.ts
```

Expected: PASS, gồm hai test mới.

- [ ] **Step 8: Verify `db:generate` không sinh migration thừa**

```bash
bun run db:generate
```

Expected: "No schema changes, nothing to migrate" (hoặc tương đương). Nếu nó sinh file mới, schema
Drizzle chưa khớp DB — sửa `rentals.ts` cho khớp rồi **xoá file vừa sinh**.

- [ ] **Step 9: Commit**

```bash
git add packages/db/migrations packages/db/src/schema/rentals.ts packages/db/src/schema/rentals-schema.test.ts
git commit -m "feat(db): unaccent + pg_trgm cho tìm khách, ba cột giấy tờ/địa chỉ trên rentals

unaccent() là STABLE nên không index thẳng được — bọc f_unaccent IMMUTABLE.
GIN + gin_trgm_ops chứ không btree: btree không phục vụ LIKE '%term%', chép
nguyên mẫu 0011 sang đây sẽ tạo một index chết.

Ba cột mới chưa có writer cho tới đợt bàn giao — cố ý, đã ghi trong migration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 5: Chuẩn hoá tìm kiếm ở API (đóng P1 "ô tìm nói dối")

**Files:**

- Modify: `apps/api/src/services/customers.ts:3,32-52,180-190`
- Modify: `apps/api/src/services/customers.test.ts`

- [ ] **Step 1: Viết test đỏ TRƯỚC**

Thêm vào `apps/api/src/services/customers.test.ts`, trong `describe("searchCustomers")` đã có:

```ts
it("gõ thường KHÔNG DẤU vẫn ra đúng hồ sơ", async () => {
  const rows = await searchCustomers(`${P}minh`);
  expect(rows.length).toBeGreaterThan(0);
});
```

Và một `describe` mới cho hàng rào parity:

```ts
describe("searchCustomers và listCustomers không được lệch nhau", () => {
  it("cùng từ khoá không dấu, cả hai đều tìm ra", async () => {
    const term = `${P}minh`;
    const fromSearch = await searchCustomers(term);
    const fromList = await listCustomers({ q: term });
    expect(fromSearch.length).toBeGreaterThan(0);
    expect(fromList.customers.length).toBeGreaterThan(0);
  });
});
```

> `P` là tiền tố dữ liệu test đã có sẵn ở đầu file; hồ sơ mẫu tên `${P}Minh` được seed ở đó. Nếu
> tên seed không chứa dấu tiếng Việt, **đổi seed** thành một tên có dấu (ví dụ `${P}Mĩnh`) để test
> này thật sự đo việc bỏ dấu chứ không chỉ đo hoa/thường.

- [ ] **Step 2: Chạy test, phải ĐỎ**

```bash
bun test apps/api/src/services/customers.test.ts
```

Expected: FAIL — `expect(rows.length).toBeGreaterThan(0)` nhận 0, vì `LIKE` phân biệt hoa thường và
dấu.

- [ ] **Step 3: Hai tính chất của `f_unaccent` + `gin_trgm_ops` phải biết trước khi viết query**

Task 4 đo được trên DB thật, không suy đoán:

1. **`f_unaccent` là `STRICT`** — đầu vào `NULL` cho ra `NULL`, không phải khớp. Không thành vấn đề
   với đường đi hiện tại (`term` luôn là chuỗi), nhưng đừng đưa giá trị có thể `NULL` vào nó.
2. **`gin_trgm_ops` cần ít nhất một trigram đầy đủ** — từ khoá **1–2 ký tự** không dùng được index
   và rơi về seq scan. Đây là hành vi của `pg_trgm`, không phải lỗi cấu hình.

Điểm 2 là một **quyết định**, không phải một ghi chú: gõ 1–2 ký tự vẫn cho kết quả đúng, chỉ là
quét bảng. Ở quy mô một shop thì chấp nhận được, và **cố ý không** chặn tìm kiếm ngắn — chặn sẽ
làm ô tìm im lặng không trả gì khi nhân viên mới gõ chữ đầu, tệ hơn hẳn một lần quét rẻ. Ghi nhận
để lần sau ai đó thấy seq scan trong log thì biết đây là đã cân nhắc, không phải bỏ sót.

- [ ] **Step 4: Thêm helper dùng chung**

Trong `apps/api/src/services/customers.ts`, thêm ngay sau khối `COLUMNS` (sau dòng 30):

```ts
/**
 * Khớp tên KHÔNG phân biệt hoa/thường, KHÔNG phân biệt dấu.
 *
 * MỘT hàm dùng cho CẢ `searchCustomers` (ô tìm tự động của form lên đơn) lẫn
 * `listCustomers` (màn danh sách). Hai bản riêng là hai kết quả khác nhau cho
 * cùng một từ khoá, và không ai biết bản nào đúng — đúng lớp lỗi mà comment ở
 * đầu `searchCustomers` đã cảnh báo về đường đọc/đường ghi.
 *
 * Biểu thức phải khớp CHÍNH XÁC index `customers_full_name_search_idx`, nếu
 * không planner bỏ qua index và câu này thành seq scan im lặng.
 */
function fullNameMatches(term: string) {
  return sql`f_unaccent(lower(${schema.customers.fullName})) LIKE f_unaccent(lower(${`%${term}%`}))`;
}
```

- [ ] **Step 5: Dùng helper ở CẢ HAI chỗ**

Trong `searchCustomers` (khoảng dòng 45-49), thay:

```ts
      asPhone
        ? or(eq(schema.customers.phone, asPhone), fullNameMatches(term))
        : fullNameMatches(term),
```

Trong `listCustomers` (khoảng dòng 184-188), thay:

```ts
const where = term
  ? asPhone
    ? or(eq(schema.customers.phone, asPhone), fullNameMatches(term))
    : fullNameMatches(term)
  : undefined; // KHÔNG lọc — đúng điểm khác biệt cố ý với searchCustomers.
```

Bỏ `like` khỏi import dòng 3 nếu không còn chỗ nào dùng:

```ts
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
```

- [ ] **Step 6: Chạy test, phải XANH**

```bash
bun test apps/api/src/services/customers.test.ts
```

Expected: PASS, gồm hai test mới.

- [ ] **Step 7: Chứng minh index THẬT SỰ dùng được cho biểu thức này**

Thêm test:

```ts
describe("customers_full_name_search_idx", () => {
  it("planner dùng được index cho biểu thức của fullNameMatches", async () => {
    // `enable_seqscan = off` vì bảng test nhỏ — planner luôn chọn seq scan ở
    // vài chục hàng dù index có tồn tại. Tắt seq scan biến câu hỏi thành đúng
    // thứ ta cần chứng minh: biểu thức trong WHERE có KHỚP biểu thức của index
    // không. Nếu lệch, planner không còn đường nào và vẫn phải seq scan.
    await db.execute(sql`SET LOCAL enable_seqscan = off`);
    const plan = await db.execute(
      sql`EXPLAIN SELECT id FROM customers WHERE f_unaccent(lower(full_name)) LIKE f_unaccent(lower('%nguyen%'))`,
    );
    expect(JSON.stringify(plan)).toContain("customers_full_name_search_idx");
  });
});
```

```bash
bun test apps/api/src/services/customers.test.ts
```

Expected: PASS. **Nếu FAIL**, biểu thức trong `fullNameMatches` không khớp index — so từng ký tự
với `CREATE INDEX` ở migration, đó chính là cái bẫy migration `0011` đã ghi.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/customers.ts apps/api/src/services/customers.test.ts
git commit -m "fix(api): tìm khách hàng bỏ dấu và không phân biệt hoa thường

LIKE trên text thô làm 'nguyen' không ra 'Nguyễn', và màn hình trả về câu rất
tự tin 'Không tìm thấy khách hàng nào khớp' — câu trả lời SAI, không phải
thông báo lỗi. Một helper dùng cho cả searchCustomers lẫn listCustomers để hai
đường không lệch.

Test EXPLAIN chứng minh biểu thức WHERE khớp biểu thức index — index không
được dùng còn tệ hơn không có index.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 6: Tín hiệu vận hành ở API

**Files:**

- Modify: `apps/api/src/services/customers.ts:150-222`
- Modify: `apps/api/src/routes/rentals.ts:34`
- Modify: `apps/api/src/services/customers.test.ts`

- [ ] **Step 1: Mở rộng kiểu**

Trong `apps/api/src/services/customers.ts`, thay `CustomerListRow`:

```ts
/** Đơn đang chiếm dụng sự chú ý của nhân viên với khách này. `null` = không có. */
export interface ActiveRental {
  readonly id: string;
  readonly status: "ONGOING" | "BOOKED";
  readonly endsAt: Date;
}

export interface CustomerListRow extends Customer {
  readonly rentalCount: number;
  /**
   * Chọn theo thứ tự: (1) đơn ONGOING có `ends_at` sớm nhất — một khách thuê
   * được nhiều xe, và đơn sắp tới hạn nhất là đơn cần chú ý nhất; (2) nếu
   * không có ONGOING thì đơn BOOKED có `starts_at` gần nhất; (3) `null`.
   * COMPLETED và CANCELLED không bao giờ được chọn.
   */
  readonly activeRental: ActiveRental | null;
  /** Số đơn đã trả TRỄ (`returned_at > ends_at`). Suy ra, không lưu. */
  readonly lateReturnCount: number;
}
```

- [ ] **Step 2: Mở rộng truy vấn đếm sẵn có**

Thay khối `counts` (khoảng dòng 204-216) bằng:

```ts
const ids = rows.map((r) => r.id);

// Đếm rental CHỈ cho đúng trang đang xem — không đếm cả bảng `rentals` cho
// 12.000 khách để rồi vứt đi 11.980 kết quả không hiện ra màn hình.
// `lateReturnCount` đi ké đúng câu này: cùng bảng, cùng phạm vi, thêm một
// aggregate có FILTER thì rẻ hơn hẳn một vòng mạng thứ hai.
const counts = await db
  .select({
    customerId: schema.rentals.customerId,
    n: sql<number>`count(*)::int`,
    late: sql<number>`(count(*) FILTER (WHERE ${schema.rentals.returnedAt} > ${schema.rentals.endsAt}))::int`,
  })
  .from(schema.rentals)
  .where(inArray(schema.rentals.customerId, ids))
  .groupBy(schema.rentals.customerId);
const countByCustomer = new Map(counts.map((c) => [c.customerId, c]));
```

- [ ] **Step 3: Thêm truy vấn `activeRental`**

Ngay sau khối `counts`:

```ts
// `DISTINCT ON` lấy ĐÚNG MỘT đơn mỗi khách — thứ tự trong ORDER BY chính là
// luật ưu tiên: ONGOING trước BOOKED, rồi trong mỗi nhóm lấy mốc thời gian
// gần nhất (ONGOING xét `ends_at` vì nó sắp tới hạn; BOOKED xét `starts_at`
// vì nó sắp bắt đầu). Cũng khoanh theo trang như câu trên.
const actives = await db
  .selectDistinctOn([schema.rentals.customerId], {
    customerId: schema.rentals.customerId,
    id: schema.rentals.id,
    status: schema.rentals.status,
    endsAt: schema.rentals.endsAt,
  })
  .from(schema.rentals)
  .where(
    and(
      inArray(schema.rentals.customerId, ids),
      inArray(schema.rentals.status, ["ONGOING", "BOOKED"]),
    ),
  )
  .orderBy(
    schema.rentals.customerId,
    sql`CASE ${schema.rentals.status} WHEN 'ONGOING' THEN 0 ELSE 1 END`,
    sql`CASE ${schema.rentals.status} WHEN 'ONGOING' THEN ${schema.rentals.endsAt} ELSE ${schema.rentals.startsAt} END`,
  );
const activeByCustomer = new Map(actives.map((a) => [a.customerId, a]));
```

- [ ] **Step 4: Ráp vào kết quả**

Thay khối `return` cuối `listCustomers`:

```ts
return {
  customers: rows.map((r) => {
    const c = countByCustomer.get(r.id);
    const a = activeByCustomer.get(r.id);
    return {
      ...r,
      rentalCount: c?.n ?? 0,
      lateReturnCount: c?.late ?? 0,
      activeRental: a
        ? { id: a.id, status: a.status as "ONGOING" | "BOOKED", endsAt: a.endsAt }
        : null,
    };
  }),
  total,
};
```

- [ ] **Step 5: Mở rộng response schema**

Trong `apps/api/src/routes/rentals.ts`, thay dòng 34:

```ts
/** Một dòng của `GET /customers/list` — `customerSchema` cộng tín hiệu vận hành suy ra từ `rentals`. */
const customerListRowSchema = t.Composite([
  customerSchema,
  t.Object({
    rentalCount: t.Integer(),
    lateReturnCount: t.Integer(),
    activeRental: t.Nullable(
      t.Object({
        id: t.String({ format: "uuid" }),
        status: t.Union([t.Literal("ONGOING"), t.Literal("BOOKED")]),
        endsAt: t.Date(),
      }),
    ),
  }),
]);
```

- [ ] **Step 6: Siết test parity — hiện nó không canh được thứ nó tuyên bố canh**

Review Task 5 chỉ ra: test `"searchCustomers và listCustomers không được lệch nhau"` tự nhận là
"hàng rào duy nhất ép hai hàm đi chung một đường", nhưng chỉ assert `length > 0` cho **cả hai**.
Nó sẽ vẫn xanh nếu hai hàm lệch thành hai tập kết quả **khác nhau mà đều không rỗng** — đúng cái
nó sinh ra để chặn. Hôm nay may mắn chỉ có một hàng khớp nên nó còn phân biệt được.

Nâng lên so **tập `id`**, gần như miễn phí:

```ts
const idsFromSearch = fromSearch.map((c) => c.id).sort();
const idsFromList = fromList.customers.map((c) => c.id).sort();
expect(idsFromSearch.length).toBeGreaterThan(0);
expect(idsFromSearch).toEqual(idsFromList);
```

Lưu ý khi seed thêm khách cho Task 6: `searchCustomers` có `.limit(20)` còn `listCustomers` phân
trang — nếu bộ test có hơn 20 khách khớp cùng từ khoá thì hai tập lệch nhau **hợp lệ**. Giữ từ
khoá của test parity đủ hẹp để dưới ngưỡng đó, và ghi lý do vào comment.

- [ ] **Step 7: Viết test**

```ts
describe("listCustomers — tín hiệu vận hành", () => {
  it("khách chưa có đơn thì activeRental null và lateReturnCount 0", async () => {
    const res = await listCustomers({ q: `${P}Minh` });
    const row = res.customers[0];
    expect(row).toBeDefined();
    expect(row?.activeRental).toBeNull();
    expect(row?.lateReturnCount).toBe(0);
  });
});
```

> Nếu file test đã seed đơn thuê cho hồ sơ mẫu, đổi kỳ vọng cho khớp dữ liệu seed thật thay vì sửa
> seed — đọc phần đầu file trước khi viết.

- [ ] **Step 8: Chạy toàn bộ test API + typecheck**

```bash
bun test apps/api && bun run typecheck
```

Expected: cả hai PASS. `typecheck` là **hai lệnh nối bằng `&&`** — nửa sau kiểm `scripts/`; đừng
chỉ chạy nửa đầu.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/customers.ts apps/api/src/routes/rentals.ts apps/api/src/services/customers.test.ts
git commit -m "feat(api): danh sách khách trả activeRental và lateReturnCount

Hai câu hỏi duy nhất khiến nhân viên mở màn Khách hàng giữa ca làm: khách này
đang giữ xe nào, và có hay trả trễ không. Cả hai SUY RA từ rentals — không
thêm cột, không trigger, không lệch với thực tế.

Đi ké truy vấn đếm khoanh-theo-trang đã có thay vì dựng LATERAL mới.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 7: `ui/alert.tsx` và `ui/text-field.tsx` (dùng chung — sửa một chỗ, vá sáu màn)

**Files:**

- Modify: `apps/staff/src/components/ui/alert.tsx:23`
- Modify: `apps/staff/src/components/ui/text-field.tsx:18`

- [ ] **Step 1: Đo blast radius TRƯỚC khi sửa**

```bash
grep -rn "from \"../ui/alert\"\|from \"../../components/ui/alert\"\|ui/alert" apps/staff/src --include=*.tsx | grep -v "ui/alert.tsx"
grep -rn "ui/text-field" apps/staff/src --include=*.tsx | grep -v "text-field.tsx"
```

Expected: liệt kê các màn đang dùng (gồm sáu màn auth). Ghi lại — Step 5 phải kiểm chúng.

- [ ] **Step 2: `Alert` thành live region**

Trong `apps/staff/src/components/ui/alert.tsx`, thay dòng 23:

```tsx
return (
  // `role="alert"` cho lỗi (ngắt lời trình đọc màn hình — người dùng cần biết
  // NGAY), `role="status"` + `aria-live="polite"` cho warning/info (chờ tới
  // lượt, không cắt ngang). Trước đây đây là `<p>` trần: câu 409 "Số điện
  // thoại này đã thuộc về khách hàng khác: …" hiện lên màn hình và KHÔNG được
  // đọc ra — người dùng screen reader nghe thấy đúng con số không.
  <p
    role={tone === "error" ? "alert" : "status"}
    aria-live={tone === "error" ? "assertive" : "polite"}
    className={`rounded-card p-3 text-sm ${TONE[tone]}`}
  >
    {children}
  </p>
);
```

- [ ] **Step 3: `TextField` đạt vùng chạm 44px**

Trong `apps/staff/src/components/ui/text-field.tsx`, thay dòng 18:

```tsx
        className={`min-h-11 rounded-card border border-border bg-surface px-3 py-2 text-ink ${className ?? ""}`}
```

Chiều cao thực trước đó là 38px (line-height 20 + py-2 8+8 + border 2) — dưới chuẩn 44px mà chính
`ui/button.tsx:12,16` tuyên bố "áp ở MỌI breakpoint".

- [ ] **Step 4: Verify typecheck + test**

```bash
bun run --filter @v9/staff typecheck && bun test apps/staff
```

Expected: cả hai PASS.

- [ ] **Step 5: Kiểm mắt sáu màn dùng chung**

`bun run dev`, rồi mở lần lượt: `/login`, `/signup`, `/forgot-password`, `/pending-approval`,
`/change-password`, `/staff`. Expected: ô nhập cao hơn một chút, không màn nào vỡ layout, thông báo
lỗi vẫn hiện đúng màu.

- [ ] **Step 6: Commit**

```bash
git add apps/staff/src/components/ui/alert.tsx apps/staff/src/components/ui/text-field.tsx
git commit -m "fix(staff): Alert thành live region, TextField đạt vùng chạm 44px

Alert là <p> trần nên mọi thông báo lỗi/thành công của app im lặng với screen
reader. TextField cao thực 38px, dưới chuẩn 44px mà chính button.tsx tuyên bố.
Hai sửa đổi ở tầng dùng chung — vá sáu màn hình cùng lúc.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 8: Nhánh lỗi và hết nhấp nháy (đóng P1 "hỏng im lặng")

**Files:**

- Modify: `apps/staff/src/lib/customers.ts:43-52`
- Modify: `apps/staff/src/pages/customers-list-page.tsx`
- Modify: `apps/staff/src/pages/customer-detail-page.tsx`

- [ ] **Step 1: Xác nhận lỗ hổng có thật**

```bash
grep -rn "isError" apps/staff/src
```

Expected: **không dòng nào**. Đó chính là lỗ: cả ba query chỉ xử lý `res.error` (lỗi HTTP gói trong
union). Nếu `queryFn` reject (mạng chết), `isPending` false và `data` undefined ⇒ không nhánh nào
render gì.

- [ ] **Step 2: Trả nợ `aria-live` mà Task 7 để lại — trong phạm vi màn Khách hàng**

Task 7 thêm `role`/`aria-live` cho `Alert`, nhưng ánh xạ đi theo `tone` chứ không theo _"lỗi này
có phải phản hồi một hành động người dùng đang chờ không"_. Soát cả 10 màn: **quá nửa** số
`tone="error"` là banner báo lỗi **tải dữ liệu**, và `assertive` cắt ngang trình đọc màn hình vô cớ
ở nhóm đó. Comment cảnh báo nằm sẵn ở `ui/alert.tsx`.

Step 3 và 4 dưới đây sắp thêm **nhiều alert load-driven nữa** vào đúng hai trang này, nên trả nợ ở
đây thay vì để nó lớn thêm.

Thêm prop override vào `ui/alert.tsx`, mặc định suy từ `tone` nên **mọi call site hiện tại không
đổi hành vi**:

```tsx
export function Alert({
  tone,
  live,
  children,
}: {
  readonly tone: AlertTone;
  /**
   * Ghi đè mức khẩn của live region. Mặc định suy từ `tone`: `error` →
   * `assertive` (cắt ngang), còn lại → `polite` (chờ tới lượt).
   *
   * Truyền `"polite"` cho banner báo lỗi TẢI DỮ LIỆU: nó xuất hiện vì một query
   * settle, không phải vì người dùng vừa bấm gì và đang chờ — cắt ngang họ ở đó
   * là mạnh hơn cần thiết. Giữ mặc định `assertive` cho lỗi submit (ca 409
   * "Số điện thoại này đã thuộc về khách hàng khác").
   */
  readonly live?: "assertive" | "polite";
  readonly children: React.ReactNode;
}) {
  const liveMode = live ?? (tone === "error" ? "assertive" : "polite");
  return (
    <p
      role={liveMode === "assertive" ? "alert" : "status"}
      aria-live={liveMode}
      className={`rounded-card p-3 text-sm ${TONE[tone]}`}
    >
      {children}
    </p>
  );
}
```

Rồi truyền `live="polite"` cho **mọi** `Alert` báo lỗi tải trong `customers-list-page.tsx` và
`customer-detail-page.tsx` — gồm cả các nhánh `isError` bạn thêm ở Step 3 và 4. **Không** đụng
`Alert` trong `customer-edit-form.tsx`: đó là lỗi submit, `assertive` đúng.

**Ngoài phạm vi, ghi nợ ở Task 11:** `rental-calendar.tsx`, `rental-form.tsx`, `stats-page.tsx`,
`staff-list-page.tsx` vẫn còn banner tải dùng mặc định `assertive`. Sửa chúng đòi kiểm lại những
màn đợt này không đụng tới.

Cập nhật luôn comment ⚠️ trong `ui/alert.tsx`: nay đã có cơ chế, phần còn lại là chỉnh call site.

- [ ] **Step 3: Thêm `placeholderData` vào query danh sách**

Trong `apps/staff/src/lib/customers.ts`, sửa `customersListQuery`:

```ts
import { keepPreviousData } from "@tanstack/react-query";
```

```ts
export const customersListQuery = (q: string, page: number) => ({
  queryKey: ["customers-list", q, page] as const,
  // Đổi trang / gõ từ khoá tạo queryKey MỚI ⇒ `data` về undefined ⇒ bảng trắng
  // hoàn toàn rồi mới hiện lại. Giữ dữ liệu cũ trong lúc tải bản mới; chỉ báo
  // "đang tải" chuyển sang `isFetching` (khuôn `rental-form.tsx:348`).
  placeholderData: keepPreviousData,
  queryFn: async (): Promise<CustomersListResult> => {
    const res = await api.customers.list.get({
      query: { q, page, pageSize: CUSTOMERS_PAGE_SIZE },
    });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, ...res.data };
  },
});
```

- [ ] **Step 4: Nhánh `isError` + nút Thử lại ở trang danh sách**

Trong `customers-list-page.tsx`, ngay sau khối `query.data?.ok === false`, thêm:

```tsx
{
  query.isError && (
    <div className="flex flex-col items-start gap-2">
      <Alert tone="error">Không kết nối được máy chủ.</Alert>
      <Button type="button" variant="ghost" onClick={() => void query.refetch()}>
        Thử lại
      </Button>
    </div>
  );
}
```

Và đổi chỉ báo tải (dòng 62) từ `query.isPending` sang `query.isFetching`:

```tsx
{
  query.isFetching && <p className="text-sm text-muted">Đang tải…</p>;
}
```

- [ ] **Step 5: Nhánh `isError` ở trang chi tiết**

Trong `customer-detail-page.tsx`, thêm sau khối `detail.data?.ok === false`:

```tsx
{
  detail.isError && (
    <div className="flex flex-col items-start gap-2">
      <Alert tone="error">Không kết nối được máy chủ.</Alert>
      <Button type="button" variant="ghost" onClick={() => void detail.refetch()}>
        Thử lại
      </Button>
    </div>
  );
}
```

và tương tự cho `rentals` (dùng `rentals.isError` / `rentals.refetch()`), đặt cạnh khối
`rentals.data?.ok === false`. Thêm import `Button`:

```tsx
import { Button } from "../components/ui/button";
```

- [ ] **Step 6: Bỏ ba wrapper `<div>` rỗng quanh `Alert`**

Review Task 3 chỉ ra: `Alert` **không nhận `className`** (`ui/alert.tsx`), nên
`<div className="mt-3"><Alert/></div>` tồn tại **chỉ để** giữ chỗ cho `mt-3`. Task 3 đã bỏ `mt-3`,
để lại `<div>` trần vô nghĩa. Bỏ hẳn, cho `<Alert>` làm flex item trực tiếp — nó render một `<p>`,
hợp lệ làm flex item.

Ba chỗ: `customers-list-page.tsx` (quanh Alert lỗi danh sách) · `customer-detail-page.tsx` (quanh
Alert lỗi chi tiết) · `customer-detail-page.tsx` (quanh Alert lỗi lịch sử). Số dòng đã dịch qua
nhiều commit — tìm theo nội dung, đừng theo số dòng.

- [ ] **Step 7: Verify bằng cách LÀM HỎNG thật**

```bash
bun run dev
```

Mở `/customers`, rồi **tắt riêng API** (`Ctrl+C` tiến trình api, hoặc chặn cổng 3001) và bấm "Thử
lại"/F5. Expected: thấy "Không kết nối được máy chủ." + nút "Thử lại" — **không** phải màn hình
trống. Bật API lại, bấm "Thử lại": dữ liệu hiện ra.

Đổi trang khi API sống: bảng **không** trắng nữa, chỉ có dòng "Đang tải…".

- [ ] **Step 8: Commit**

```bash
git add apps/staff/src/components/ui/alert.tsx apps/staff/src/lib/customers.ts apps/staff/src/pages/customers-list-page.tsx apps/staff/src/pages/customer-detail-page.tsx
git commit -m "fix(staff): màn Khách hàng hết hỏng im lặng khi mạng chết

Cả ba query chỉ xử lý res.error (lỗi HTTP trong union). Khi queryFn REJECT thì
isPending false và data undefined, nên không nhánh nào render gì — nhân viên
thấy header bảng rỗng và không một thông báo. isError không xuất hiện một lần
nào trong cả apps/staff trước commit này.

keepPreviousData + isFetching để bảng hết trắng mỗi lần đổi trang.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 9: Tín hiệu vận hành ở UI

**Files:**

- Modify: `apps/staff/src/lib/rental-status.ts:46-49`
- Modify: `apps/staff/src/components/customers/customer-table.tsx`
- Modify: `apps/staff/src/components/customers/customer-rental-history.tsx:52`

- [ ] **Step 1: Kiểm reference TRƯỚC khi đổi signature**

`rentalChipClass` là exported function. Root `CLAUDE.md` bắt buộc kiểm reference trước khi đổi
signature:

```bash
grep -rn "rentalChipClass" apps/staff/src
```

Expected: thấy `calendar-timeline.tsx` và `calendar-month.tsx`. Cả hai truyền `CalendarRental`, nên
nới tham số thành structural là **mở rộng**, không phá — nhưng phải chạy typecheck xác nhận.

- [ ] **Step 2: Nới tham số**

Trong `apps/staff/src/lib/rental-status.ts`, thay chữ ký `rentalChipClass`:

```ts
/**
 * Tham số là structural `{ status; endsAt }` chứ không phải `CalendarRental`:
 * màn Khách hàng cũng cần tô đúng màu này cho `activeRental`, và đó là một hình
 * dạng hẹp hơn. Khớp đúng chữ ký `isOverdue` (`@v9/shared/domain/rental`) nên
 * không có định nghĩa "quá hạn" thứ hai nào sinh ra.
 */
export function rentalChipClass(rental: { status: RentalStatus; endsAt: Date }, now: Date): string {
  if (isOverdue(rental, now)) return "bg-status-overdue text-accent-ink";
  return STATUS_CLASS[rental.status];
}
```

`STATUS_CLASS` **giữ nguyên là `const` nội bộ, không export** — nó là chi tiết của file này.

- [ ] **Step 3: Cột trạng thái + số điện thoại hành động được**

Thay `customer-table.tsx` từ `<thead>` xuống hết `<tbody>`:

```tsx
export function CustomerTable({ rows }: CustomerTableProps) {
  const now = new Date();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        {rows.length > 0 && (
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="card-pad">
                Họ tên
              </th>
              <th scope="col" className="card-pad">
                Điện thoại
              </th>
              <th scope="col" className="card-pad">
                Tình trạng
              </th>
              <th scope="col" className="card-pad">
                Ghi chú
              </th>
              <th scope="col" className="card-pad text-right">
                Số đơn
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border align-top">
              {/* `p-0` + `card-pad block` trên chính `<a>`: trước đây vùng bấm là
                  line box của thẻ a (~20px), bấm vào padding của ô không kích
                  hoạt link. Giờ cả ô là vùng bấm. */}
              <td className="p-0">
                <Link
                  to="/customers/$id"
                  params={{ id: row.id }}
                  className="card-pad block font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {row.fullName}
                </Link>
              </td>
              <td className="p-0">
                <div className="card-pad flex items-center gap-3">
                  {/* Shop chạy bằng Zalo (PRODUCT.md). Số điện thoại là HÀNH
                      ĐỘNG, không phải dữ liệu để copy bằng một tay ngoài nắng. */}
                  <a
                    href={`tel:${row.phone}`}
                    className="min-h-11 flex items-center text-ink underline-offset-2 hover:underline"
                  >
                    {row.phone}
                  </a>
                  <a
                    href={`https://zalo.me/${row.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-11 flex items-center text-accent underline-offset-2 hover:underline"
                  >
                    Zalo
                  </a>
                </div>
              </td>
              <td className="card-pad">
                {row.activeRental ? (
                  <span
                    className={`inline-block rounded-card px-2 py-0.5 ${rentalChipClass(
                      { status: row.activeRental.status, endsAt: row.activeRental.endsAt },
                      now,
                    )}`}
                  >
                    {STATUS_LABEL[row.activeRental.status]}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
                {row.lateReturnCount > 0 && (
                  <span className="ml-2 text-muted">trả trễ {row.lateReturnCount}×</span>
                )}
              </td>
              <td className="card-pad text-muted">{row.note ?? "—"}</td>
              <td className="card-pad text-right tabular-nums">{row.rentalCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Thêm import:

```tsx
import { rentalChipClass, STATUS_LABEL } from "../../lib/rental-status";
```

`min-w-[560px]` lên `min-w-[680px]` vì bảng có thêm một cột.

- [ ] **Step 4: Lịch sử thuê hết in trạng thái bằng chữ trần**

Trong `customer-rental-history.tsx`, thay dòng 52:

```tsx
<td className="card-pad">
  <span className={`inline-block rounded-card px-2 py-0.5 ${rentalChipClass(r, new Date())}`}>
    {STATUS_LABEL[r.status]}
  </span>
</td>
```

và dòng 53 thêm `tabular-nums` + canh phải:

```tsx
<td className="card-pad text-right tabular-nums">{formatVnd(r.totalAmount)}</td>
```

Sửa import dòng 4:

```tsx
import { rentalChipClass, STATUS_LABEL } from "../../lib/rental-status";
```

Thêm `scope="col"` cho bốn `<th>` (dòng 36-39) và `text-right` cho `<th>Tổng tiền`.

- [ ] **Step 5: Bỏ `mt-3` sót trong `customer-rental-history.tsx`**

Review Task 3 **đo được trên app chạy thật**: khoảng cách giữa `<h2>Lịch sử thuê xe</h2>` và nội
dung bên dưới là **28px** thay vì 16px, do component này tự mang `mt-3` trên **cả hai** nhánh
render trong khi đã là flex item của một `flex flex-col gap-4` — 16px (`gap-4`) + 12px (`mt-3`)
cộng dồn.

Bỏ `mt-3` ở cả hai chỗ: nhánh rỗng (`<p className="mt-3 text-sm text-muted">Khách hàng này chưa
có đơn thuê nào.</p>`) và nhánh bảng (`<div className="mt-3 overflow-x-auto">`).

- [ ] **Step 6: Verify**

```bash
bun run --filter @v9/staff typecheck && bun test apps/staff
```

Expected: cả hai PASS. Nếu `calendar-timeline.tsx`/`calendar-month.tsx` đỏ, việc nới tham số đã phá
call site — quay lại Step 2.

`bun run dev`, mở `/calendar`: màu thanh đơn thuê phải **y hệt trước**. Mở `/customers`: cột "Tình
trạng" có chip màu, số điện thoại bấm được.

- [ ] **Step 7: Commit**

```bash
git add apps/staff/src/lib/rental-status.ts apps/staff/src/components/customers/customer-table.tsx apps/staff/src/components/customers/customer-rental-history.tsx
git commit -m "feat(staff): màn Khách hàng hiện tình trạng và gọi/Zalo được

Bốn cột cũ không trả lời được hai câu hỏi duy nhất khiến người ta mở màn này:
khách đang giữ xe nào, và gọi cho khách. Chip trạng thái dùng lại
rentalChipClass + token status-* đã đo contrast; số điện thoại thành tel: và
zalo.me. Lịch sử thuê hết in trạng thái bằng chữ trần — nó là nơi DUY NHẤT
trong app hiển thị trạng thái đơn thuê mà không dùng màu.

rentalChipClass nới tham số thành structural { status; endsAt }, khớp chữ ký
isOverdue nên không sinh định nghĩa 'quá hạn' thứ hai.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 10: Dọn phần còn lại

**Files:**

- Modify: `apps/staff/src/pages/customers-list-page.tsx`
- Modify: `apps/staff/src/components/customers/customer-edit-form.tsx`

- [ ] **Step 1: Số tổng hiện cả khi chỉ có một trang**

Trong `customers-list-page.tsx`, tách số tổng khỏi điều kiện phân trang. Thay khối `total > CUSTOMERS_PAGE_SIZE`:

```tsx
{
  query.data?.ok && total > 0 && (
    <div className="flex items-center gap-3">
      {total > CUSTOMERS_PAGE_SIZE && (
        <Button
          type="button"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => void navigate({ search: { q, page: Math.max(1, page - 1) } })}
        >
          ← Trước
        </Button>
      )}
      <span className="text-sm text-muted">
        {total > CUSTOMERS_PAGE_SIZE ? `Trang ${page}/${totalPages} · ` : ""}
        {total} khách hàng
      </span>
      {total > CUSTOMERS_PAGE_SIZE && (
        <Button
          type="button"
          variant="ghost"
          disabled={page >= totalPages}
          onClick={() => void navigate({ search: { q, page: Math.min(totalPages, page + 1) } })}
        >
          Sau →
        </Button>
      )}
    </div>
  );
}
```

Trước đó shop có 18 khách không bao giờ nhìn thấy mình có bao nhiêu khách.

- [ ] **Step 2: Form hết nói dối sau khi lưu**

Trong `customer-edit-form.tsx`, gọi `update.reset()` khi người dùng gõ tiếp, để thông báo
"Đã lưu thay đổi." không nằm cạnh những trường đang bẩn. Thêm vào `onChange` của cả ba `TextField`:

```tsx
          onChange={(e) => {
            setFullName(e.target.value);
            if (update.isSuccess) update.reset();
          }}
```

(làm tương tự cho `phone` và `note`, thay `setFullName` bằng setter tương ứng).

- [ ] **Step 3: `Ghi chú` thành textarea**

`ui/text-field.tsx` chỉ render `<input>`. Đừng nhồi textarea vào nó — thay ô ghi chú trong
`customer-edit-form.tsx` bằng markup tại chỗ, cùng token:

```tsx
<label className="flex flex-col gap-1 text-sm text-ink">
  Ghi chú
  <textarea
    value={note}
    maxLength={500}
    rows={3}
    onChange={(e) => {
      setNote(e.target.value);
      if (update.isSuccess) update.reset();
    }}
    className="min-h-11 rounded-card border border-border bg-surface px-3 py-2 text-ink"
  />
</label>
```

- [ ] **Step 4: Verify**

```bash
bun run --filter @v9/staff typecheck && bun test apps/staff && bun run lint
```

Expected: cả ba PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/staff/src/pages/customers-list-page.tsx apps/staff/src/components/customers/customer-edit-form.tsx
git commit -m "fix(staff): số tổng khách luôn hiện, form hết nói dối sau khi lưu

Dòng '47 khách hàng' bị ẩn hoàn toàn khi total <= 20, nên shop 18 khách không
bao giờ thấy mình có bao nhiêu khách. update.isSuccess không tự tắt nên 'Đã lưu
thay đổi.' nằm cạnh những trường đang bẩn. Ghi chú thành textarea có maxlength.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Task 11: Ghi nợ đã quyết không trả

**Files:**

- Modify: `docs/DEBT.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Thêm mục vào `docs/DEBT.md`**

```markdown
- **Không có chức năng gộp hồ sơ khách trùng** — quyết định 2026-08-31, không phải bỏ sót.
  `customers.phone` là `UNIQUE` nên hồ sơ trùng chỉ xảy ra khi MỘT người dùng hai số khác nhau; và
  từ khi tìm kiếm bỏ dấu (migration `00XX`), nhân viên tìm ra hồ sơ cũ thay vì tạo mới. Lập trường
  đã có tiền lệ thành văn ở migration `0011`: _gộp ngầm hai hồ sơ là quyết định nghiệp vụ, không
  phải thứ một migration tự động nên tự ý làm._
  **Điều kiện mở lại:** xuất hiện ca trùng thật (hai hồ sơ, hai số, cùng một người).

- **Ba cột `rentals.document_type` / `document_returned_at` / `delivery_address` chưa có writer** —
  cố ý. Chúng là hợp đồng dữ liệu cho luồng bàn giao xe, sẽ được ghi khi màn bàn giao được dựng.
  **Điều kiện đóng:** màn bàn giao land.
```

- [ ] **Step 2: Hai mục nợ nữa, do review Task 5 tìm ra**

```markdown
- **Ô tìm khách không escape `%` và `_`** — gõ `%` khớp toàn bộ khách hàng. Có sẵn từ trước
  migration `0012`, **không** phải hồi quy. Đã đo và kết luận là **nhiễu, không phải lỗ hổng**:
  chuỗi đi qua bind parameter nên không phải injection; `OWNER`/`STAFF` vốn đã xem được toàn bộ
  khách nên không rò gì; `searchCustomers` có `.limit(20)` và `listCustomers` chặn `pageSize ≤ 50`
  nên không kéo sập được gì; pattern luôn kết thúc bằng `%` nên `\` không gây 500.
  Đường rủi ro thật duy nhất: nhân viên lỡ gõ `%` ở ô tìm của form lên đơn, thấy danh sách trông
  hợp lý nhưng sai người, rồi gắn nhầm khách vào đơn.
  **Nếu sửa:** `term.replace(/[\\%_]/g, "\\$&")` + `ESCAPE '\'`, và nhớ nó đổi nhẹ cách trích trigram.

- **`updateCustomer` xoá trắng `note` khi caller bỏ qua field** — `note: input.note ?? null`
  (`services/customers.ts`) là semantic PUT, trong khi route khai `note: t.Optional(...)`
  (`routes/rentals.ts`). Client nào gửi thiếu `note` sẽ xoá ghi chú cũ mà không định làm vậy.
  Hôm nay `customer-edit-form.tsx` luôn gửi đủ ba field nên chưa phát tác.
  **Điều kiện phải sửa:** ngay khi có caller thứ hai của `POST /customers/:id`.
```

- [ ] **Step 3: Năm món nợ nữa, sinh ra trong lúc làm đợt này**

```markdown
- **Không có index trên `rentals.customer_id`** — `rentals` hiện chỉ có `rentals_pkey`,
  `rentals_no_overlap`, `rentals_revenue_idx`. Ba truy vấn của màn Khách hàng (`counts`, `actives`,
  `listRentalsForCustomer`) đều seq scan toàn bảng. Khoanh-theo-trang giảm số hàng **trả về**,
  không giảm số hàng **quét** — comment biện minh page-scoping bằng lý do hiệu năng đang nói quá.
  Vô hại ở quy mô hiện tại. **Điều kiện sửa:** khi `rentals` vượt ~vài chục nghìn hàng.

- **Năm file còn nguyên điểm mù "nuốt lỗi truyền tải"** — `lib/rentals.ts`, `rental-calendar.tsx`,
  `rental-form.tsx`, `stats-page.tsx`, `staff-list-page.tsx`. Eden Treaty **nuốt** rejection của
  `fetch` và trả `{ error: EdenFetchError(503, exception) }`, nên `isError` là nhánh chết ở khắp
  nơi, và các màn đó hiện câu fallback chung chung không kèm đường thử lại. `connectionFailed()`
  (`lib/customers.ts`) đã export, dùng lại được. Chúng cũng còn dùng `assertive` cho banner tải,
  cắt ngang trình đọc màn hình vô cớ — `Alert` đã có prop `live` để sửa.

- **API chết thì đăng xuất.** `protectedLayoutRoute.beforeLoad` gọi `hasSession()` vốn cần API, nên
  nhân viên F5 đúng lúc API chớp tắt sẽ bị đá về `/login` chứ không phải màn có nút thử lại. Điều
  này giới hạn hẳn giá trị của nhánh lỗi vừa thêm: nó chỉ cứu được ca "trang đang mở sẵn, API chết,
  refetch nổ".

- **`isPickupOverdue` nhìn thấy được nhưng không được đếm ở đâu.** `stats.ts` đếm `overdue` chỉ bằng
  `isOverdue`, và `attention-list.tsx` render nó thành "N xe quá hạn chưa trả" rồi link sang
  `/calendar`. Đơn quá hẹn lấy giờ hiện đỏ-viền trên lịch nhưng không nằm trong con số nào. Đã đỡ
  hơn trước (trước là vừa vô hình vừa không đếm), và cách tô khác nhau nên hai thứ không còn mâu
  thuẫn nhau. **Muốn xử lý thật** thì cần một dòng riêng trong `attention-list.tsx` kèm một count
  thứ hai trong `stats.ts`.

- **`.claude/CLAUDE.md` chưa được track.** Root `CLAUDE.md` nói rõ file này **phải được commit,
  đừng đẩy vào `.gitignore`** — có track thì lần `codegraph install --refresh` sau hiện ra thành
  diff review được. Hiện nó là untracked, tức mọi lần upgrade lại mọc ra một file lạ. Ngoài phạm vi
  đợt này nên **không tự commit**; nêu để người quyết.
```

- [ ] **Step 4: Thêm vào `docs/ROADMAP.md`, mục nghiệp vụ chưa chốt**

```markdown
**Màn Khách hàng — đã land 2026-08-31**, xem
[`plans/2026-08-31-customers-surface-design.md`](plans/2026-08-31-customers-surface-design.md).
Chưa làm, cần brainstorm riêng: sort/lọc/nhảy trang và hành động hàng loạt (một shop 12.000 khách
tới trang 300 là 300 cú click) · đổi thứ tự mặc định từ `asc(fullName)` sang _quá hạn → đang thuê →
gần nhất_ (đổi nó là đổi hình dạng sản phẩm: danh sách duyệt → danh sách cần chú ý) · ảnh chụp giấy
tờ lên MinIO cùng đợt bàn giao.
```

- [ ] **Step 5: Đóng số hiệu migration thật**

```bash
ls packages/db/migrations/*.sql | tail -1
```

Thay `00XX` trong `DEBT.md` bằng số thật.

- [ ] **Step 6: Verify toàn repo**

```bash
bun test && bun run typecheck && bun run lint && bun run format
```

Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add docs/DEBT.md docs/ROADMAP.md
git commit -m "docs: ghi hai quyết định 'không làm' của đợt màn Khách hàng

Gộp hồ sơ trùng (phone đã UNIQUE + tiền lệ 0011) và ba cột rentals chưa có
writer. Cả hai có điều kiện mở lại/đóng viết rõ, để lần sau không ai tưởng là
bỏ sót.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U6R9KKD6ARRmAcm38Ph4o5"
```

---

## Verification cuối đợt

- [ ] `bun test` — toàn repo xanh
- [ ] `bun run typecheck` — **cả hai nửa** của lệnh nối `&&`
- [ ] `bun run lint` — hàng rào kiến trúc còn hiệu lực
- [ ] `bun run bench` — GIN index không đẩy `/health` vượt perf budget
- [ ] `bun run --filter @v9/staff build` — PWA build được (dev server KHÔNG chứng minh điều này)
- [ ] Mở `/customers` ở 375px và 1440px: không cuộn ngang ở cấp trang; bảng cuộn trong khung riêng
- [ ] Tắt API, mở `/customers`: thấy thông báo + nút "Thử lại", không phải màn hình trống
- [ ] `/calendar` màu thanh đơn thuê không đổi so với trước đợt
- [ ] Chạy lại `/impeccable critique src/pages/customers-list-page.tsx` — điểm phải cao hơn 18/40
