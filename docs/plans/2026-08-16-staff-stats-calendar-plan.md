# Plan C — Màn Thống kê, trang Lịch, và form lên đơn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến hai thứ Plan A và B đã dựng — API và app shell — thành hai màn hình chủ shop thật sự dùng: `/` thống kê doanh thu, `/calendar` lịch thuê xe hai chế độ, cộng form lên đơn để lịch có dữ liệu mà không phải `INSERT` bằng SQL.

**Architecture:** Kiểu **suy ra từ Eden**, không gõ tay lại hợp đồng API (khuôn đã có ở `lib/me.ts`). Logic đặt thanh trên lưới lịch tách thành hàm **thuần** ở `lib/calendar-layout.ts` để test bằng bảng ca, không cần dựng React. State của lịch nằm ở **search param**, không nằm trong component.

**Tech Stack:** Vite 8 · React 19 · TanStack Router + Query · Tailwind v4 (token từ Plan B) · Eden Treaty · `bun test`.

**Spec:** [`2026-08-15-staff-home-stats-calendar-design.md`](2026-08-15-staff-home-stats-calendar-design.md) §8, §9, §10. Plan A (API) và Plan B (shell) đã xong.

---

## Trước khi bắt đầu

```bash
docker compose up -d
bun run db:migrate
bun test            # phải xanh: 206 pass
bun run typecheck && bun run lint
```

API phải chạy được (`bun --env-file=.env run --filter @v9/api dev`, cổng 3001) cho các task đụng trình duyệt. `STAFF_APP_URL` trong `.env` phải khớp cổng mà staff phục vụ, nếu không đăng nhập chết vì **CORS** chứ không phải vì sai mật khẩu.

Tài khoản dev có sẵn: `nav-probe-owner@v9rental.dev` / `NavProbe!123x` (OWNER).

---

## Cấu trúc file

| File | Trách nhiệm |
| ---- | ----------- |
| `lib/calendar-layout.ts` | **Hàm thuần**: đơn thuê + cửa sổ → vị trí trên lưới |
| `lib/calendar-layout.test.ts` | Bảng ca biên — viết trước |
| `lib/rentals.ts` | Kiểu suy từ Eden + query options cho fleet/rentals/stats |
| `components/stats/revenue-cards.tsx` | Ba thẻ doanh thu |
| `components/stats/attention-list.tsx` | Dòng "cần chú ý", bấm được |
| `pages/stats-page.tsx` | Lắp lại, không tự dựng |
| `components/rentals/calendar-timeline.tsx` | Hàng = xe, cột = ngày |
| `components/rentals/calendar-month.tsx` | Ô ngày |
| `components/rentals/rental-calendar.tsx` | Vỏ: đổi chế độ, đổi khoảng, loading/error |
| `components/rentals/rental-form.tsx` | Lên đơn |
| `pages/calendar-page.tsx` | Lắp lại |
| `router.tsx` | Route `/calendar` + `validateSearch` |

---

## Task 1: `lib/calendar-layout.ts` — hàm thuần, TDD

**Files:**
- Create: `apps/staff/src/lib/calendar-layout.test.ts`
- Create: `apps/staff/src/lib/calendar-layout.ts`

Đây là chỗ đầy lỗi lệch-một, và là lý do nó **không** được nằm trong JSX. Bắt chước có ý thức `lib/guard-decision.ts`: nhánh `DISABLED` chết trong `beforeLoad` lọt được đúng vì logic quyết định nằm lẫn trong component — tách ra hàm thuần thì thứ tự nhánh trở thành thứ test được.

- [ ] **Step 1: Viết test trước**

```ts
import { describe, expect, it } from "bun:test";
import { dayColumns, placeBar, type GridWindow } from "./calendar-layout";

const D = (iso: string) => new Date(`${iso}T00:00:00+07:00`);
/** Cửa sổ 14 ngày: 15/08 → 29/08, nửa mở [from, to). */
const W: GridWindow = { from: D("2026-08-15"), to: D("2026-08-29") };

describe("dayColumns", () => {
  it("sinh đúng một cột cho mỗi ngày của cửa sổ", () => {
    const cols = dayColumns(W);
    expect(cols).toHaveLength(14);
    expect(cols[0]?.date.getTime()).toBe(D("2026-08-15").getTime());
    expect(cols[13]?.date.getTime()).toBe(D("2026-08-28").getTime());
  });

  it("đánh dấu cuối tuần", () => {
    const cols = dayColumns(W);
    // 15/08/2026 là Thứ Bảy, 16/08 Chủ Nhật, 17/08 Thứ Hai.
    expect(cols[0]?.isWeekend).toBe(true);
    expect(cols[1]?.isWeekend).toBe(true);
    expect(cols[2]?.isWeekend).toBe(false);
  });
});

describe("placeBar", () => {
  it("đơn nằm trọn trong cửa sổ", () => {
    expect(placeBar({ startsAt: D("2026-08-17"), endsAt: D("2026-08-20") }, W)).toEqual({
      startCol: 3,
      span: 3,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("đơn bắt đầu TRƯỚC cửa sổ thì bị cắt trái", () => {
    expect(placeBar({ startsAt: D("2026-08-12"), endsAt: D("2026-08-18") }, W)).toEqual({
      startCol: 1,
      span: 3,
      clippedStart: true,
      clippedEnd: false,
    });
  });

  it("đơn kết thúc SAU cửa sổ thì bị cắt phải", () => {
    expect(placeBar({ startsAt: D("2026-08-27"), endsAt: D("2026-09-05") }, W)).toEqual({
      startCol: 13,
      span: 2,
      clippedStart: false,
      clippedEnd: true,
    });
  });

  it("đơn phủ trọn cửa sổ thì cắt cả hai đầu", () => {
    expect(placeBar({ startsAt: D("2026-08-01"), endsAt: D("2026-09-30") }, W)).toEqual({
      startCol: 1,
      span: 14,
      clippedStart: true,
      clippedEnd: true,
    });
  });

  it("đơn dài đúng một ngày", () => {
    expect(placeBar({ startsAt: D("2026-08-20"), endsAt: D("2026-08-21") }, W)).toEqual({
      startCol: 6,
      span: 1,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("đơn nằm hoàn toàn TRƯỚC cửa sổ → null", () => {
    expect(placeBar({ startsAt: D("2026-08-01"), endsAt: D("2026-08-10") }, W)).toBeNull();
  });

  it("đơn nằm hoàn toàn SAU cửa sổ → null", () => {
    expect(placeBar({ startsAt: D("2026-09-01"), endsAt: D("2026-09-05") }, W)).toBeNull();
  });

  // Hai ca dưới đây là ngữ nghĩa [from, to) — cùng một giả định mà `tstzrange '[)'`
  // ở migration 0010, `overlaps()` ở @v9/shared, và truy vấn `listRentalsInRange`
  // đều dựa vào. Ba chỗ lệch nhau thì lịch hiện xe bận trong khi nó rảnh.
  it("đơn KẾT THÚC đúng lúc cửa sổ bắt đầu → null (không chạm)", () => {
    expect(placeBar({ startsAt: D("2026-08-10"), endsAt: D("2026-08-15") }, W)).toBeNull();
  });

  it("đơn BẮT ĐẦU đúng lúc cửa sổ kết thúc → null (không chạm)", () => {
    expect(placeBar({ startsAt: D("2026-08-29"), endsAt: D("2026-09-02") }, W)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ** (`Cannot find module './calendar-layout'`)

- [ ] **Step 3: Viết implementation**

Yêu cầu:

```ts
export interface GridWindow {
  readonly from: Date;
  readonly to: Date; // nửa mở: cột cuối là ngày TRƯỚC `to`
}

export interface DayColumn {
  readonly date: Date;
  readonly isWeekend: boolean;
}

export interface BarPlacement {
  readonly startCol: number; // 1-based, tính theo cột NGÀY (không gồm cột tên xe)
  readonly span: number;
  readonly clippedStart: boolean;
  readonly clippedEnd: boolean;
}

export function dayColumns(w: GridWindow): DayColumn[];
export function placeBar(r: { startsAt: Date; endsAt: Date }, w: GridWindow): BarPlacement | null;
```

⚠️ **Đừng cộng trừ mili-giây để nhảy ngày.** Việt Nam không có DST nên hôm nay `86_400_000` chạy đúng — nhưng công thức đó là công thức sai với lý do đúng, và nó im lặng. Dùng phép cộng ngày theo lịch. Nếu chọn cách khác, nói rõ vì sao.

⚠️ `isWeekend` phải tính theo **giờ Việt Nam**, không theo giờ máy chạy test. `getDay()` của JS đọc theo múi giờ **local của runtime** — CI chạy ở UTC sẽ cho kết quả khác máy dev, và test sẽ đỏ ở CI mà xanh ở local. Xử lý và nói cách bạn xử lý.

- [ ] **Step 4: Chạy, XANH — 11 test**

- [ ] **Step 5: Chứng minh test bắt được lệch biên**

Đổi `placeBar` để coi biên là đóng (`[from, to]`) thay vì nửa mở. **Hai** test ca biên phải đỏ. Ghi lại output, hoàn tác, xanh lại.

- [ ] **Step 6: Commit** — `feat(staff): calendar-layout — hàm thuần đặt thanh trên lưới lịch`

---

## Task 2: `lib/rentals.ts` — kiểu và query

**Files:**
- Create: `apps/staff/src/lib/rentals.ts`

- [ ] **Step 1: Suy kiểu từ Eden, KHÔNG gõ tay**

Khuôn đã có ở `lib/me.ts` — đọc nó trước, kể cả comment. Gõ tay một `interface Rental` nữa là dựng bản sao thứ hai của hợp đồng API: nó biên dịch được cho tới ngày route đổi một field, và ngày đó chỗ sai không phải chỗ nổ.

```ts
export type FleetVehicle = NonNullable<Awaited<ReturnType<typeof api.fleet.get>>["data"]>[number];
export type CalendarRental = NonNullable<Awaited<ReturnType<typeof api.rentals.get>>["data"]>[number];
export type StatsSummary = NonNullable<Awaited<ReturnType<typeof api.stats.summary.get>>["data"]>;
```

⚠️ Đường truy cập Eden ở trên là **suy đoán** — `/stats/summary` có thể là `api.stats.summary.get` hoặc một hình dạng khác. Kiểm bằng cách viết thử và xem `tsc`; sửa cho đúng rồi **báo lại đường thật**.

- [ ] **Step 2: Query options**

Ba query, khuôn theo `meQuery` ở `lib/me.ts` (trả union thay vì ném, để chỗ gọi phân nhánh được):

- `fleetQuery` — không tham số
- `rentalsQuery(from, to)` — `queryKey` phải chứa `from`/`to` dạng chuỗi ổn định, nếu không hai khoảng khác nhau dùng chung cache
- `statsQuery` — không tham số

⚠️ `queryKey` chứa `Date` là một cái bẫy: TanStack so sánh key bằng deep-equal, và hai `Date` cùng thời điểm **là** bằng nhau — nhưng key sẽ được tuần tự hoá khác nhau nếu ai đó đổi sang string sau này. Dùng ISO string ngay từ đầu.

- [ ] **Step 3–4: Typecheck, commit**

---

## Task 3: Màn Thống kê

**Files:**
- Create: `components/stats/revenue-cards.tsx`, `components/stats/attention-list.tsx`
- Create: `pages/stats-page.tsx`
- Modify: `router.tsx` (thay `HealthPage` ở `/`), `components/layout/app-nav.tsx` (đổi nhãn)

Bố cục (design doc §8):

```
Thống kê                                              [+ Lên đơn]

DOANH THU
┌ Hôm nay ────────┬ Tuần này ───────┬ Tháng này ──────┐
│ 2.400.000 ₫     │ 14.900.000 ₫    │ 48.200.000 ₫    │
│ 3 đơn · +18%    │ 11 đơn · +6%    │ 37 đơn · −4%    │
└─────────────────┴─────────────────┴─────────────────┘

CẦN CHÚ Ý
● 1 xe quá hạn chưa trả                             ›
● 1 xe phải trả hôm nay                             ›
● 2 nhân viên chờ duyệt                             ›
```

Ràng buộc:

- Điện thoại: ba thẻ **xếp dọc**. "48.200.000 ₫" không sống nổi trong cột rộng 100px.
- Tiền định dạng bằng `formatVnd` từ `@v9/shared` — **không** tự viết `toLocaleString`. Đó là hàm đã có, và nó có một cái bẫy ICU đã ghi lại.
- **Nhãn dưới tiêu đề khu doanh thu phải ghi rõ "theo ngày giao xe".** Không có nó, chủ shop đọc "doanh thu" thành tiền đã thu thật.
- **Cảnh báo về `%` so sánh:** `thisWeek`/`thisMonth` là kỳ **đang chạy dở**, còn `prevAmount` là kỳ **đã trọn**. Đầu tháng con số âm là bình thường. Nhãn phải nói điều đó, nếu không nó báo động giả mỗi đầu kỳ.
- `prevAmount === 0` thì **không hiện %** (chia cho 0). Hiện "kỳ trước chưa có đơn".
- Mỗi dòng "cần chú ý" bấm được, dẫn tới đúng chỗ xử lý: quá hạn và trả-hôm-nay → `/calendar`; chờ duyệt → `/staff`.
- `pendingStaff` chỉ có với OWNER — field **tuỳ chọn** trong response. Vắng thì không render dòng đó, không render "0".
- Khu "cần chú ý" mà **không có việc nào** thì hiện một câu tử tế, không hiện khung rỗng.

Nav: đổi nhãn `/` từ "Trang chủ" thành **"Thống kê"**. `HealthPage` đi đâu — xoá, hay chuyển sang một route khác? **Quyết định và nói lý do.** Nó là bằng chứng end-to-end rằng guard chạy (`router.tsx` ghi rõ thế), nên xoá thẳng là mất một thứ có giá trị.

- [ ] Các bước: viết component → lắp trang → nối route → typecheck/lint/fence → build → commit

---

## Task 4: `calendar-timeline.tsx`

**Files:** create.

Hàng = xe, cột = ngày. Dùng `placeBar`/`dayColumns` từ Task 1 — **không** tính lại vị trí trong JSX.

| Breakpoint | Số ngày | Cột xe |
| --- | --- | --- |
| `<768` | 7 | dính trái, 88px |
| `768–1279` | 10 | 112px |
| `≥1280` | 14 | 130px |

- Cột xe **dính trái** khi vuốt ngang. Mất ngữ cảnh "dòng này là xe nào" là mất cả màn hình.
- Màu thanh theo trạng thái, dùng token `status-*`. **Quá hạn tính bằng `isOverdue` từ `@v9/shared`**, không viết lại điều kiện trong JSX.
- Xe không có đơn nào trong kỳ: hàng ghi "trống cả kỳ" — đó là **thông tin có giá trị nhất** trên màn hình này, không phải khoảng trống.
- Hàng rào thang cách cấm arbitrary padding/margin/gap. Chiều rộng cột thì **được** dùng arbitrary.

- [ ] Viết → typecheck/lint/fence → commit

---

## Task 5: `calendar-month.tsx`

**Files:** create.

Ô ngày kiểu lịch tháng. Mỗi đơn là một dòng nhỏ trong ô.

- Ô tràn: hiện tối đa N dòng rồi "+k nữa". Chọn N và nói lý do.
- Tuần bắt đầu **Thứ Hai** (quy ước VN, và khớp `date_trunc('week')` mà API dùng).
- Ngày hôm nay đánh dấu rõ.

⚠️ Mô hình này **không** cho thấy xe nào còn trống — thứ trống thì không xuất hiện trên lịch tháng. Đó là điểm yếu đã biết và là lý do có nút chuyển sang timeline; đừng cố vá nó ở đây.

- [ ] Viết → kiểm → commit

---

## Task 6: `rental-calendar.tsx` + trang + route

**Files:** create `components/rentals/rental-calendar.tsx`, `pages/calendar-page.tsx`; modify `router.tsx`, `app-nav.tsx`.

- [ ] **State nằm ở URL, không trong component**

`?view=timeline|month` và `?from=YYYY-MM-DD`, validate bằng **đúng khuôn** `validateSearch` mà `/login?reason=` đã dùng: chỉ nhận giá trị trong danh sách trắng, **lấy từ hằng chứ không chép tay từng chuỗi**. Thêm một chế độ mà quên sửa danh sách phải là lỗi biên dịch, không phải một cú rơi im lặng về mặc định.

Được ba thứ miễn phí: F5 không mất chỗ đang xem, nút back hoạt động, gửi link "xem tuần này" cho nhau được. **Không dùng `localStorage`** — hai nguồn sự thật cho một thứ là cách chúng lệch nhau.

- [ ] **Vỏ lo: chọn khoảng (‹ › Hôm nay), nút chuyển chế độ, loading, error, rỗng**

Trạng thái rỗng phải phân biệt hai ca (design doc §10):

| Ca | Câu |
| --- | --- |
| Có xe, chưa có đơn | lịch vẫn vẽ đủ lưới xe, mỗi hàng "trống cả kỳ" |
| **Chưa có xe nào** | "Chưa có xe trong đội. Thêm xe trong Directus." |

Gộp hai ca vào một câu là làm người dùng đi sửa nhầm chỗ.

- [ ] Nav: mở khoá mục **Lịch** (bỏ trạng thái vô hiệu hoá, trỏ `/calendar`)
- [ ] Kiểm → commit

---

## Task 7: `rental-form.tsx` — lên đơn

**Files:** create.

Trường: xe (từ `/fleet`) · khách (tìm qua `/customers?q=`, hoặc tạo nhanh) · từ ngày · đến ngày · tổng tiền · cọc · ghi chú.

- [ ] **409 `RENTAL_OVERLAP` phải nói đúng chuyện đã xảy ra**

"Xe này đã có đơn trong khoảng thời gian đó", kèm đường dẫn xem lịch của chính chiếc xe đó. **Không** phải "Có lỗi xảy ra". Dùng `errorMessage()` từ `lib/errors.ts` — thông điệp backend đã là tiếng Việt viết cho người đọc, đừng dịch lại thành bản thứ hai sẽ lệch.

- [ ] **409 `CUSTOMER_EXISTS` trả kèm `existing`** — dùng lại hồ sơ đó, đừng bắt người nhập lại. API đã thiết kế để làm được điều này; bỏ qua nó là phí.

- [ ] **Cảnh báo giá gõ nhầm** (`DEBT.md`): tổng tiền lệch quá **3×** `pricePerDay × số ngày` thì cảnh báo — **không chặn**. Gõ nhầm một số 0 là doanh thu sai một bậc, và `CHECK >= 0` ở DB không bắt được. Cảnh báo chứ không chặn: shop có quyền tính giá đặc biệt.

- [ ] Sau khi tạo xong: đóng form, `invalidateQueries` cho lịch và thống kê.
- [ ] Kiểm → commit

---

## Task 8: Kiểm end-to-end trên bản build

**Files:** không sửa gì.

- [ ] Dọn tiến trình cũ trên 3001/3003, build, `preview`, đăng nhập thật.
- [ ] **Tạo một đơn thuê qua form**, xác nhận nó hiện trên lịch ở cả hai chế độ và làm số thống kê đổi.
- [ ] **Tạo đơn thứ hai chồng lịch cùng xe** → phải thấy đúng câu 409, không phải lỗi chung chung. Đây là đường đi trọn vẹn từ exclusion constraint ở Postgres tới câu tiếng Việt trên màn hình — chỗ duy nhất chứng minh cả chuỗi.
- [ ] Đo ở 375 / 768 / 1280: `scrollWidth == innerWidth`, cột xe dính trái khi vuốt.
- [ ] Xoá dữ liệu test đã tạo, xác nhận `git status` sạch.

---

## Xong Plan C khi

- [ ] `bun test` xanh, gồm `calendar-layout.test.ts`
- [ ] `bun run typecheck` · `lint` · `bun run --filter @v9/staff build` xanh
- [ ] Hàng rào thang cách xanh
- [ ] Đường 409 chồng lịch đã đi hết từ DB tới màn hình
- [ ] Không tràn ngang ở cả ba chiều rộng

---

## Ghi chú cho người thực thi

**Task 1 là task duy nhất bắt buộc TDD nghiêm.** Nó là hàm thuần và nó đầy lỗi biên. Các task còn lại là UI — dùng verification-before-completion thay cho test-first, đúng luật `CLAUDE.md`.

**Ngữ nghĩa `[from, to)` xuất hiện ở BỐN chỗ** giờ: `tstzrange '[)'` (migration 0010), `overlaps()` (@v9/shared), `listRentalsInRange` (API), và `placeBar` (Task 1). Không có gì trong máy ép bốn chỗ khớp nhau — chỉ có test ở mỗi tầng. Đó là lý do Task 1 Step 5 tồn tại.

**Đừng polish.** `apps/staff` ưu tiên chức năng và mật độ thông tin; `impeccable` chỉ audit nhẹ ở đây.
