# Plan B — Hệ thiết kế và app shell cho `apps/staff`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khai `@theme` cho `apps/staff`, dựng app shell responsive thật (sidebar ↔ bottom nav), và đưa toàn bộ màn hình hiện có sang hệ mới — để Plan C chỉ việc dựng nội dung, không phải vừa dựng nội dung vừa phát minh khung.

**Architecture:** Token khai bằng Tailwind v4 `@theme` trong `src/index.css` (app này **không có** `tailwind.config.js`). Shell đặt ở `component` của `protectedLayoutRoute` nên mọi trang được bảo vệ tự có nav. Sáu màn auth đứng ngoài shell và giữ `PageShell` hẹp.

**Tech Stack:** Vite 8 · React 19 · Tailwind v4 qua `@tailwindcss/vite` · TanStack Router · `bun test`.

**Spec:** [`2026-08-15-staff-home-stats-calendar-design.md`](2026-08-15-staff-home-stats-calendar-design.md) §6 và §7. Plan A (nền dữ liệu) đã xong.

---

## Trước khi bắt đầu

```bash
bun install
bun test          # phải xanh: 205 pass
bun run typecheck
bun run lint
```

Plan B **không chạm Postgres** — không task nào ở đây cần `docker compose up -d`.

---

## Cấu trúc file

| File | Trách nhiệm |
| ---- | ----------- |
| `apps/staff/src/index.css` | `@theme` token + `@utility` thang cách |
| `apps/staff/index.html` | `viewport-fit=cover` |
| `apps/staff/src/lib/spacing-fence.test.ts` | Hàng rào cấm arbitrary value cho khoảng cách |
| `apps/staff/src/components/ui/button.tsx` | Nút dùng chung (thay `submit-button` mở rộng) |
| `apps/staff/src/components/ui/{alert,text-field,page-shell}.tsx` | Retrofit sang token |
| `apps/staff/src/components/layout/app-shell.tsx` | Khung: sidebar ≥768 · bottom nav <768 |
| `apps/staff/src/components/layout/app-nav.tsx` | Nav thật, có mục "sắp có" |
| `apps/staff/src/router.tsx` | Gắn shell vào `protectedLayoutRoute` |
| `apps/staff/src/pages/{health,staff-list}-page.tsx` | Bỏ nav tự chế, sống trong shell |
| `eslint.config.js` | Sub-type `frontend-ui` (trả nợ `DEBT.md`) |

---

## Task 1: `@theme` — token màu và thang cách

**Files:**
- Modify: `apps/staff/src/index.css`

`src/index.css` hiện chỉ có `@import "tailwindcss"` cộng một khối comment giải thích **vì sao chưa
khai `@theme`** ("chưa có màn hình nghiệp vụ nào để rút token ra. Khi làm lịch/thống kê/bàn giao thì
mới thêm"). Đây đúng là lúc đó — sửa comment đó thay vì để nó nói dối.

- [ ] **Step 1: Khai token**

Thay nội dung `apps/staff/src/index.css` bằng:

```css
@import "tailwindcss";

/*
 * apps/staff KHÔNG dùng DESIGN.md — file đó là hệ thị giác của apps/web (site
 * công khai, SEO quan trọng, ảnh dẫn dắt). App này là công cụ vận hành nội bộ,
 * ưu tiên chức năng và mật độ thông tin.
 *
 * Token khai ở đây từ đợt màn Thống kê + lịch (Plan B). Trước đợt đó file này cố
 * ý để trống vì chưa có màn hình nghiệp vụ nào để rút token ra.
 */
@theme {
  /* Bề mặt và chữ. Sáng, không phải nền đen của apps/web: đây là công cụ đọc
     nhiều giờ dưới ánh sáng gara, không phải trang bán hàng. */
  --color-canvas: oklch(98.4% 0 0);
  --color-surface: oklch(100% 0 0);
  --color-border: oklch(90% 0 0);
  --color-ink: oklch(20% 0 0);
  --color-muted: oklch(52% 0 0);

  /*
   * ⛔ KHÔNG PHẢI MÀU THƯƠNG HIỆU. docs/ROADMAP.md chặn cứng việc bịa màu accent
   * cho tới khi có file logo thật của shop — nhưng luật đó viết cho DESIGN.md,
   * tức cho apps/web. Ở đây accent là màu CHỨC NĂNG của một công cụ nội bộ, và
   * bốn màu trạng thái bên dưới là ngữ nghĩa (đỏ = quá hạn), không phải nhận diện.
   *
   * Khi có logo: đổi đúng --color-accent, đừng đụng bốn màu trạng thái.
   */
  --color-accent: oklch(52% 0.19 255);
  --color-accent-ink: oklch(100% 0 0);

  /* Bốn trạng thái đơn thuê. Khớp `RentalStatus` ở @v9/shared/domain/rental —
     đổi tên một trạng thái ở đó thì phải đổi ở đây, không có gì ép. */
  --color-status-booked: oklch(62% 0.14 255);
  --color-status-ongoing: oklch(52% 0.19 255);
  --color-status-overdue: oklch(55% 0.21 27);
  --color-status-completed: oklch(60% 0 0);

  /* Bán kính nhỏ và thống nhất: app mật độ cao, bo nhiều làm hàng bảng rối mắt. */
  --radius-card: 0.375rem;
}
```

- [ ] **Step 2: Kiểm token thật sự sinh ra utility**

```bash
bun run --filter @v9/staff build
grep -o 'bg-status-overdue\|text-muted\|border-border' apps/staff/dist/assets/*.css | head
```

Utility chỉ được sinh khi có chỗ dùng, nên bước này có thể **không in gì** và vẫn đúng. Kiểm cách
khác — bản build phải chứa biến CSS:

```bash
grep -o -- '--color-status-overdue' apps/staff/dist/assets/*.css | head -1
```

Kỳ vọng: in ra tên biến. Không in ra nghĩa là `@theme` chưa được Tailwind đọc — dừng lại và báo.

- [ ] **Step 3: Commit**

```bash
git add apps/staff/src/index.css
git commit -m "feat(staff): khai @theme — token màu, trạng thái, bán kính"
```

---

## Task 2: Thang cách responsive và `viewport-fit=cover`

**Files:**
- Modify: `apps/staff/src/index.css`
- Modify: `apps/staff/index.html`

### Thang chốt (design doc §6.2)

| | Điện thoại `<768` | Tablet `768–1279` | Desktop `≥1280` |
| --- | --- | --- | --- |
| Gutter nội dung | 16px | 20px | 24px |
| Padding trong thẻ | 12/14 | 12/14 | 14/16 |
| Khoảng cách giữa thẻ | 8px | 10px | 12px |
| Điều hướng | bottom nav cao 56px | sidebar 168px | sidebar 208px |
| Vùng chạm tối thiểu | **44 × 44px** ở mọi breakpoint |||

- [ ] **Step 1: Thêm `@utility` vào `index.css`**

```css
/*
 * Ba breakpoint, không phải hai. Tablet KHÔNG phải điện thoại phóng to: ở 768px
 * còn đủ chỗ cho sidebar và cho một cột thông tin nữa. Không tách ra thì tablet
 * rơi vào nhánh mobile và phí một nửa màn hình.
 */
@utility page-gutter {
  padding-inline: 1rem;
  @media (width >= 48rem) {
    padding-inline: 1.25rem;
  }
  @media (width >= 80rem) {
    padding-inline: 1.5rem;
  }
}

@utility card-pad {
  padding: 0.75rem 0.875rem;
  @media (width >= 80rem) {
    padding: 0.875rem 1rem;
  }
}

/*
 * Đáy màn hình trong PWA standalone. `env(safe-area-inset-bottom)` chỉ khác 0 khi
 * index.html khai `viewport-fit=cover` — xem Step 2. Thiếu nó thì bottom nav nằm
 * DƯỚI thanh home indicator của iPhone, và chỉ hỏng sau khi người dùng CÀI app.
 */
@utility pb-safe {
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
}
```

⚠️ **Kiểm chứ đừng tin:** Tailwind v4 `@utility` có hỗ trợ `@media` lồng bên trong ở phiên bản đang
cài (`tailwindcss@4.3.3`) hay không là điều **chưa được xác nhận trong repo này**. Chạy build và mở
CSS ra xem `page-gutter` có sinh đủ ba nhánh media không. Nếu không, đừng cố ép — đổi sang khai
bằng ba class responsive ở chỗ dùng (`px-4 md:px-5 xl:px-6`) và **ghi lại trong plan** rằng
`@utility` không nhận media ở version này. Cả hai đường đều chấp nhận được; đường sai duy nhất là
khai một utility trông như có ba breakpoint mà thực tế chỉ có một.

- [ ] **Step 2: Sửa `index.html`**

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Đây là **lỗi thật đang có**, không phải cải tiến: thiếu `viewport-fit=cover` thì
`env(safe-area-inset-bottom)` luôn trả `0`. Không hỏng ở `vite dev`, không hỏng trên desktop, không
hỏng trong tab trình duyệt — chỉ hỏng đúng lúc chủ shop **cài app vào máy**, tức đúng lúc không ai
đang test.

- [ ] **Step 3: Kiểm bản build**

```bash
bun run --filter @v9/staff build
grep -c 'safe-area-inset-bottom' apps/staff/dist/assets/*.css
grep -o 'viewport-fit=cover' apps/staff/dist/index.html
```

Cả hai phải in ra kết quả khác rỗng.

- [ ] **Step 4: Commit**

```bash
git add apps/staff/src/index.css apps/staff/index.html
git commit -m "feat(staff): thang cách ba breakpoint và viewport-fit=cover"
```

---

## Task 3: Hàng rào cấm arbitrary value cho khoảng cách

**Files:**
- Create: `apps/staff/src/lib/spacing-fence.test.ts`

Thang cách chỉ có giá trị nếu không ai rải số lẻ bên cạnh nó. Luật đó **không tự sống bằng kỷ luật
đọc code** — `CLAUDE.md` gốc đếm được bốn lần một hàng rào suy thoái trong im lặng.

Hàng rào ở đây là **một test**, không phải một plugin ESLint: `bun test` đã nằm sẵn trong CI, còn
thêm plugin nghĩa là đụng `eslint.config.js`, mà mỗi lần đụng file đó phải chạy lại bốn probe của
skill `v9-fences`. Task 9 đã phải trả cái giá đó một lần; không cần trả hai lần.

- [ ] **Step 1: Viết test**

```ts
import { describe, expect, it } from "bun:test";
import { Glob } from "bun";

/**
 * Cấm arbitrary value cho khoảng cách trong apps/staff: `p-[13px]`, `gap-[7px]`,
 * `mt-[22px]`… Thang cách đã khai trong `index.css`; một số lẻ cạnh nó là một
 * thang cách thứ hai không ai biết.
 *
 * Chỉ chặn nhóm KHOẢNG CÁCH. Arbitrary value cho thứ khác (`grid-cols-[...]`,
 * `w-[88px]` cho cột dính) là hợp lệ và không bị đụng tới — chặn quá tay thì
 * người ta tắt hàng rào, và một hàng rào bị tắt tệ hơn không có.
 */
const FORBIDDEN = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[/;

describe("thang cách", () => {
  it("không có arbitrary value cho khoảng cách trong .tsx", async () => {
    const offenders: string[] = [];

    for await (const path of new Glob("src/**/*.tsx").scan({ cwd: import.meta.dir + "/../.." })) {
      const text = await Bun.file(`${import.meta.dir}/../../${path}`).text();
      text.split("\n").forEach((line, i) => {
        if (FORBIDDEN.test(line)) offenders.push(`${path}:${String(i + 1)} — ${line.trim()}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy — phải XANH trên code hiện tại**

```bash
bun test apps/staff/src/lib/spacing-fence.test.ts
```

Nếu đỏ, nghĩa là code hiện có đã vi phạm. Báo lại danh sách thay vì tự sửa — đó là thông tin, không
phải rác.

- [ ] **Step 3: Chứng minh hàng rào bắt được thật**

Thêm tạm `className="p-[13px]"` vào một `.tsx` bất kỳ trong `apps/staff/src`, chạy lại test. Nó
**phải đỏ** và **phải in ra đúng đường dẫn + số dòng**. Ghi lại output, rồi hoàn tác.

Một hàng rào chưa từng thấy đỏ là một hàng rào chưa được chứng minh.

- [ ] **Step 4: Commit**

```bash
git add apps/staff/src/lib/spacing-fence.test.ts
git commit -m "test(staff): hàng rào cấm arbitrary value cho khoảng cách"
```

---

## Task 4: Retrofit `components/ui/`

**Files:**
- Create: `apps/staff/src/components/ui/button.tsx`
- Modify: `apps/staff/src/components/ui/{alert,text-field,page-shell,submit-button}.tsx`

Bốn component này là toàn bộ diện mạo của sáu màn auth — sửa chúng là sáu màn đổi theo.

`ui/` **không được biết domain**: không import `lib/api`, không biết `Me` hay `StaffRole`. Task 9
biến luật đó thành hàng rào máy ép; tới lúc đó nó vẫn chỉ là quy ước, nên đừng phá.

- [ ] **Step 1: `button.tsx` — nút dùng chung**

`submit-button.tsx` hiện chỉ làm được nút submit có trạng thái pending. Shell và các màn nghiệp vụ
cần thêm nút thường và nút phụ. Tạo `button.tsx`:

```tsx
type Variant = "primary" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
}

/**
 * `min-h-11` = 44px — ngưỡng vùng chạm, áp ở MỌI breakpoint. Mật độ thông tin cao
 * là đặc quyền của desktop; trên điện thoại nút phải bấm trúng được bằng ngón cái.
 */
const BASE = "inline-flex min-h-11 items-center justify-center rounded-card px-4 text-sm font-semibold disabled:opacity-50";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink",
  ghost: "border border-border text-ink",
};

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  return <button {...rest} className={`${BASE} ${VARIANT[variant]} ${className ?? ""}`} />;
}
```

- [ ] **Step 2: `submit-button.tsx` dùng lại `Button`**

Giữ nguyên API (`pending`, `pendingLabel`, `children`) — sáu màn auth đang gọi nó, đổi signature là
đổi sáu chỗ không cần thiết. Chỉ đổi phần render để đi qua `Button`.

- [ ] **Step 3: `alert.tsx`, `text-field.tsx`, `page-shell.tsx` sang token**

- `alert.tsx`: ba tone hiện dùng `bg-red-100` / `bg-amber-100` / `bg-gray-100` — đổi sang token
  (`status-overdue`, `surface`, `border`) sao cho vẫn phân biệt được ba mức. Giữ nguyên API.
- `text-field.tsx`: giữ nguyên **cả** hành vi nối `className` của caller vào sau — comment tại chỗ
  giải thích ô nhập OTP cần `tracking-widest`, và ghi đè im lặng là bug đã từng xảy ra.
- `page-shell.tsx`: `max-w-sm` + `page-gutter`, nền `canvas`.

- [ ] **Step 4: Kiểm**

```bash
bun run typecheck
bun run lint
bun test apps/staff/src/lib/spacing-fence.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/staff/src/components/ui/
git commit -m "feat(staff): ui/ dùng token, thêm Button với vùng chạm 44px"
```

---

## Task 5: `app-shell.tsx`

**Files:**
- Create: `apps/staff/src/components/layout/app-shell.tsx`

- [ ] **Step 1: Viết shell**

Yêu cầu, không phải code sẵn — hình dạng phải tự suy từ thang cách ở Task 2:

- `<768`: không sidebar. Nội dung cuộn, **bottom nav dính đáy** cao 56px + `pb-safe`.
- `≥768`: sidebar dính trái 168px; `≥1280` giãn ra 208px. Nội dung cuộn riêng.
- Vùng nội dung dùng `page-gutter`.
- Nền `canvas`, sidebar nền `surface`, viền `border`.
- Nhận `me` và `onSignOut` rồi truyền xuống `AppNav` — shell **không** tự gọi `useMe` hay `signOut`;
  nó là layout, không phải chỗ biết domain.

⚠️ **Đừng đặt `overflow-hidden` lên `body`.** Bottom nav dính đáy bằng `position: sticky` trong một
vùng cuộn hoạt động khác hẳn `fixed` trên toàn trang, và trong PWA standalone trên iOS thanh địa chỉ
không tồn tại nên chiều cao viewport ổn định — nhưng ở tab trình duyệt thì không. Chọn một cách, thử
**cả hai** ngữ cảnh ở Task 8, và ghi lại cách nào bạn chọn cùng lý do.

- [ ] **Step 2: Typecheck + lint + hàng rào thang cách**

- [ ] **Step 3: Commit**

---

## Task 6: `app-nav.tsx` — nav thật

**Files:**
- Modify: `apps/staff/src/components/layout/app-nav.tsx`

Bản hiện tại là một thanh link ngang tối giản. Bản mới:

| Mục | Route | Desktop/tablet | Bottom nav |
| --- | ----- | -------------- | ---------- |
| Trang chủ | `/` | ✅ | ✅ |
| Lịch | — | ✅ vô hiệu hoá, nhãn "sắp có" | ✅ vô hiệu hoá |
| Đơn thuê | — | ✅ vô hiệu hoá | trong **Thêm** |
| Khách hàng | — | ✅ vô hiệu hoá | trong **Thêm** |
| Bàn giao | — | ✅ vô hiệu hoá | trong **Thêm** |
| Nhân viên | `/staff` | ✅ chỉ OWNER | trong **Thêm** |
| Đổi mật khẩu · Đăng xuất | `/change-password` | chân sidebar | trong **Thêm** |

- [ ] **Step 1: Viết nav**

Ràng buộc:

- **Bottom nav đúng 3 ô: Trang chủ · Lịch · Thêm.** Sáu ô trên màn 375px cho ra chữ ~8,5px và không
  ai bấm trúng; ba ô cho mỗi ô ~125px. Phần còn lại nằm sau **Thêm** (mở sheet hoặc trang, tuỳ bạn —
  chọn cái đơn giản hơn và nói lý do).

  > ⚠️ Bản đầu của plan này ghi "đúng 4 ô" ngay dưới một bảng chỉ liệt kê **hai** mục làm ô trực
  > tiếp — tự mâu thuẫn. Con số 4 mang từ mockup của design doc sang, nơi *Đơn thuê* còn là ô trực
  > tiếp; lúc viết plan tôi đẩy nó vào **Thêm** mà quên sửa con số. Giữ **3**: một ô vô hiệu hoá
  > chiếm 25% thanh nav trên màn nhỏ nhất là chỗ đắt nhất để quảng cáo lộ trình.
- Mục "sắp có" **không được là `<Link>`**. Chúng phải không bấm được — một link tới route không tồn
  tại là một cú 404 trong app của chính mình.
- Link `/staff` chỉ hiện với OWNER. Đây là hàng rào của **trải nghiệm**, không phải của dữ liệu:
  `beforeLoad` của route đó và `/staff/users*` ở server mới là hàng rào thật. Giữ nguyên lý lẽ đã
  ghi trong comment hiện có.

- [ ] **Step 2–3: Kiểm và commit**

---

## Task 7: Gắn shell vào cây route

**Files:**
- Modify: `apps/staff/src/router.tsx`
- Modify: `apps/staff/src/pages/health-page.tsx`
- Modify: `apps/staff/src/pages/staff-list-page.tsx`

Đây là task sửa một **lệch có thật** đang tồn tại: `health-page` tự render `<AppNav>` còn
`staff-list-page` thì không, nên nó phải tự chế một link "← Trang chủ".

- [ ] **Step 1: Đưa shell lên `protectedLayoutRoute`**

`component` của layout route đó hiện là `Outlet`. Đổi thành một component bọc `<AppShell>` quanh
`<Outlet />`. Sau đó **thêm một trang mới là tự có nav** — không phải nhớ bọc.

⚠️ Shell cần `me` và `onSignOut`. `me` đã có trong context từ `beforeLoad`; đừng gọi thêm một vòng
mạng. Nếu lấy từ context khó hơn dự kiến, dùng `useMe()` (cache đã ấm) và **nói rõ bạn chọn cách nào**.

- [ ] **Step 2: Bỏ nav tự chế khỏi hai trang, và retrofit bảng nhân viên**

- `health-page.tsx`: bỏ `<AppNav>` và phần `handleSignOut`.
- `staff-list-page.tsx`: bỏ link "← Trang chủ".
- `components/staff/staff-table.tsx`: đổi `border-b` / `text-sm` / khoảng cách sang token và thang
  cách mới. Đây là **màn nghiệp vụ duy nhất đang có**, nên nó là chỗ duy nhất chứng minh được hệ
  thiết kế chịu được một bảng dữ liệu thật chứ không chỉ chịu được form.

  ⚠️ Bảng ở màn hẹp: `<table>` không tự xuống dòng đẹp ở 375px. Chọn một trong hai — cho bảng cuộn
  ngang trong khung `overflow-x-auto`, hoặc đổi sang danh sách thẻ ở `<768`. **Nói rõ bạn chọn cái
  nào và vì sao**; cả hai đều chấp nhận được, nhưng để nguyên bảng tràn ngang thì không.

- [ ] **Step 3: Chứng minh trang mới tự có nav**

Thêm tạm một route `/nav-probe` dưới `protectedLayoutRoute` render đúng một chữ, chạy dev, đăng
nhập, mở nó ra và xác nhận nav **có mặt mà không viết dòng nào cho nó**. Rồi gỡ route đó đi.

Không có bước này thì "shell ở layout route" chỉ là một khẳng định.

- [ ] **Step 4–5: Kiểm và commit**

---

## Task 8: Kiểm trên bản build, kể cả PWA và safe-area

**Files:** không sửa file nào — đây là task kiểm.

`vite dev` **không** đăng ký service worker và **không** chèn manifest. Mọi hành vi PWA chỉ quan sát
được trên bản build. Kiểm ở dev rồi kết luận "PWA hỏng" là kết luận sai, và đó là lỗi dễ mắc nhất
với app này.

- [ ] **Step 1: Build và preview**

```bash
bun run --filter @v9/staff build
bun run --filter @v9/staff preview
```

- [ ] **Step 2: Kiểm ba thứ và ghi lại kết quả**

1. Manifest và service worker có mặt (bản build, không phải dev).
2. Bố cục ở **ba** chiều rộng: 375px, 768px, 1280px. Sidebar xuất hiện đúng ngưỡng, bottom nav đúng
   4 ô, không có tràn ngang ở bất kỳ chiều nào.
3. Vùng an toàn đáy: mô phỏng bằng cách đặt tạm `env(safe-area-inset-bottom)` thành một giá trị
   khác 0 (devtools cho phép, hoặc thêm tạm `padding-bottom: 34px`) và xác nhận bottom nav bị đẩy
   lên chứ không bị che.

- [ ] **Step 3: Báo cáo bằng ảnh hoặc mô tả cụ thể**

Không viết "trông ổn". Viết cái bạn đo được: ngưỡng nào sidebar hiện, chiều cao bottom nav, có tràn
ngang không.

---

## Task 9: Trả nợ — sub-type `frontend-ui` trong `eslint.config.js`

**Files:**
- Modify: `eslint.config.js`

[`../DEBT.md`](../DEBT.md) ghi: ranh giới "`components/ui/` không biết domain" **không được lint
ép** — `eslint.config.js` khai đúng một type `frontend` khớp `apps/{web,staff}/**`, và
`frontend → frontend` được cho phép vô điều kiện.

- [ ] **Step 1: Thêm element type**

Thêm `{ type: "frontend-ui", pattern: "apps/staff/src/components/ui/**" }` **trước** entry
`frontend` (thứ tự giữa hai folder-pattern chồng nhau không đổi kết quả phân loại, nhưng đọc dễ
hơn), và một luật cho phép `frontend-ui` chỉ import `frontend-ui`.

- [ ] **Step 2: ⚠️ Chạy lại BỐN probe của skill `v9-fences` và ĐỌC TÊN LUẬT**

`CLAUDE.md` gốc: config linter "chạy được và exit 0" **không chứng minh điều gì**, và probe exit 1
**cũng chưa chứng minh gì** nếu không đọc nó nổ vì luật nào.

Cụ thể cho luật mới: thêm tạm `import { api } from "../../lib/api";` vào một file trong
`components/ui/`, chạy `bun run lint`, và xác nhận nó đỏ với **`boundaries/element-types`** — không
phải với `no-unused-vars`. Ghi lại nguyên văn thông báo, rồi hoàn tác.

Một file `ui/` import `lib/api` mà chỉ đỏ vì "biến không dùng" nghĩa là hàng rào vẫn chưa tồn tại.

- [ ] **Step 3: Cập nhật `DEBT.md`** — đánh dấu món nợ này đã đóng, kèm cách chứng minh.

- [ ] **Step 4: Commit**

---

## Xong Plan B khi

- [ ] `bun test` xanh, gồm `spacing-fence.test.ts`
- [ ] `bun run typecheck` xanh (cả hai nửa)
- [ ] `bun run lint` xanh, và luật `frontend-ui` đã được chứng minh bằng vi phạm cố ý
- [ ] Bốn probe `v9-fences` chạy lại, đọc tên luật
- [ ] Bản build kiểm ở 375 / 768 / 1280, PWA có manifest + service worker
- [ ] Sáu màn auth và bảng nhân viên đều sống trong hệ mới
- [ ] `viewport-fit=cover` có trong `dist/index.html`

Sau đó: **Plan C — màn Thống kê và trang Lịch**.

---

## Ghi chú cho người thực thi

**Task 5, 6, 7 cố ý ra đề bằng RÀNG BUỘC thay vì code sẵn — khác Plan A.** Skill `writing-plans`
đòi mỗi bước sửa code phải kèm code thật, và Plan A làm đúng thế. Ở đây tôi lệch khỏi luật đó có
chủ ý, và nói ra thay vì lặng lẽ:

Bố cục là thứ tôi **không nhìn thấy được** khi viết plan. Đọc chính tả từng dòng JSX cho một shell
responsive nghĩa là mã hoá phỏng đoán của tôi về thứ mình chưa từng render — rồi người thực thi sẽ
chép đúng phỏng đoán đó, phát hiện nó lệch ở 768px, và phải sửa ngược lại một plan nói rất chắc
chắn. Plan A đã cho thấy hậu quả: bốn trong chín lỗi của đợt đó là **code tôi viết sẵn** trong plan,
và cả bốn chỉ lộ ra khi có thứ gì đó thực sự chạy.

Nên với ba task này, plan chốt **cái đo được** — ngưỡng breakpoint, chiều cao 56px, vùng chạm 44px,
số ô bottom nav, thứ gì phải chứng minh — và để người thực thi chọn JSX. Bù lại, mỗi task đều có
một bước bắt **chứng minh** thay vì mô tả (Task 7 dựng route thử để xác nhận nav tự có mặt; Task 8
đo ở ba chiều rộng thật).

Task 1–4 và 9 vẫn có code đầy đủ: token, `@utility`, test, và cấu hình ESLint đều là thứ đúng-sai
xác định được mà không cần nhìn.


**Plan này KHÔNG thêm tính năng nào.** Sau khi xong, app làm được đúng những việc nó làm được hôm
nay — chỉ khác diện mạo và khung. Đó là chủ ý: trộn "đổi khung" với "thêm màn hình" vào một đợt là
cách một diff trở nên không review được.

**Đừng polish quá tay.** `apps/staff/CLAUDE.md` ghi rõ app này ưu tiên **chức năng và mật độ thông
tin**, và `impeccable` chỉ audit nhẹ ở đây chứ không phải app chính. Mục tiêu là nhất quán và bấm
trúng, không phải đẹp.

**Ba con số duy nhất được phép xuất hiện ngoài thang cách** là chiều rộng cột dính của lịch
(88/112/130px, Plan C) — và chúng không thuộc nhóm khoảng cách nên hàng rào ở Task 3 không đụng tới.
