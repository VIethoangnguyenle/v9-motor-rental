# Kế hoạch thi công — hình dạng riêng cho màn hẹp của `apps/staff`

> **Cho người thi công:** dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc
> `superpowers:executing-plans` để chạy từng task. Mỗi bước là một ô `- [ ]`.

**Goal:** Đóng sáu lỗi đo được của `apps/staff` ở màn hẹp, và dựng lưới test component đầu tiên cho
app này.

**Architecture:** `Modal` nhận thêm khe `footer` neo cố định (đóng #1, #3). Bảng nhân viên có hình
dạng thẻ ở mobile, chọn bằng hook `useLayoutVariant` (đóng #2). Lịch giữ nguyên lưới, thêm dấu hiệu
cuộn và cho tên xe xuống hai dòng (đóng #4, #7, #8). `currentDayCount` đo vùng lưới thay vì cửa sổ
(đóng #5).

**Tech Stack:** React 19 · TanStack Router/Query · Tailwind v4 (`@theme` trong `index.css`) · Bun
test · happy-dom · @testing-library/react

**Spec:** [`2026-09-03-staff-mobile-views-design.md`](2026-09-03-staff-mobile-views-design.md)

## Global Constraints

- **Mỗi commit phải tự dựng được.** Kiểm trước khi commit:
  `git stash push --include-untracked && bun run typecheck && bun test && git stash pop`
- **Chỉ `git add` file thuộc task đang làm.** Không bao giờ `git add -A`.
- **Node ≥ 22 cho mọi lệnh chạm Vite.** Mặc định máy là 21.7.1; `rolldown` gọi `util.styleText` với
  mảng và Node 21 ném `ERR_INVALID_ARG_VALUE`. Chạy `nvm use 22` trước `bun run dev`. `bun test` và
  `bun run typecheck` **không** dính.
- **Serena báo sai trong repo này** (`DEBT.md:127`): `find_referencing_symbols` từng trả 0 tham
  chiếu cho hàm có 25 chỗ dùng. Đổi tên hay đổi signature của symbol export thì kiểm **Serena VÀ
  `grep -rn`**, không tin một mình Serena.
- **Không hard-code hex, không arbitrary value cho màu/spacing.** Token ở `apps/staff/src/index.css`.
  Arbitrary value cho **chiều cao/bề rộng** thì được (`spacing-fence.test.ts` chỉ khoá p/m/gap).
- **Mỗi test phải thấy ĐỎ vì đúng lý do** trước khi có implementation. Đỏ vì lỗi cú pháp không tính.
- Ngoài phạm vi: Thống kê · Yêu cầu · Cài đặt · Đổi mật khẩu · sheet "Thêm" · nav dưới ·
  `DEBT.md:308` · `DEBT.md:126`.

## File Structure

| File                                                            | Trách nhiệm                                        |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `apps/staff/test-setup.ts` (tạo)                                | Đăng ký happy-dom làm DOM toàn cục cho `bun test`  |
| `bunfig.toml` (sửa)                                             | `preload` trỏ vào file trên                        |
| `apps/staff/src/hooks/use-layout-variant.ts` (tạo)              | `"mobile" \| "desktop"` theo ngưỡng md             |
| `apps/staff/src/hooks/use-layout-variant.test.ts` (tạo)         | Test hook                                          |
| `apps/staff/src/components/ui/modal.tsx` (sửa)                  | Thêm khe `footer` neo cố định                      |
| `apps/staff/src/components/ui/modal.test.tsx` (tạo)             | Test khe footer                                    |
| `apps/staff/src/components/staff/staff-row-actions.tsx` (sửa)   | Tách nút ra khỏi `<td>`                            |
| `apps/staff/src/components/staff/staff-cards.tsx` (tạo)         | Hình dạng thẻ cho mobile                           |
| `apps/staff/src/components/staff/staff-table.tsx` (sửa)         | Chọn hình dạng theo `useLayoutVariant`             |
| `apps/staff/src/components/staff/staff-table.test.tsx` (tạo)    | Test hai hình dạng                                 |
| `apps/staff/src/components/rentals/calendar-timeline.tsx` (sửa) | Dấu hiệu cuộn · tên xe hai dòng                    |
| `apps/staff/src/components/rentals/rental-calendar.tsx` (sửa)   | `ResizeObserver` thay `matchMedia` · gộp đầu trang |

---

### Task 1: Lưới test component — happy-dom + testing-library

Không có task nào sau đây chạy được nếu task này chưa xong. `apps/staff` hiện có **0 test
component** và repo chưa cài DOM giả (`DEBT.md:335`).

**Files:**

- Create: `apps/staff/test-setup.ts`
- Modify: `bunfig.toml`
- Modify: `package.json` (devDependencies)
- Test: `apps/staff/src/components/ui/button.test.tsx`

**Interfaces:**

- Produces: DOM toàn cục (`document`, `window`) cho mọi file `*.test.tsx` chạy bằng `bun test`;
  `render`, `screen`, `fireEvent` từ `@testing-library/react`.

- [ ] **Bước 1: Cài phụ thuộc**

```bash
bun add -D happy-dom @testing-library/react @testing-library/dom @types/react-dom
```

- [ ] **Bước 2: Viết test ĐỎ trước khi có DOM**

Tạo `apps/staff/src/components/ui/button.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("render được vào DOM thật và giữ ngưỡng chạm 44px", () => {
    render(<Button type="button">Duyệt</Button>);
    const btn = screen.getByRole("button", { name: "Duyệt" });
    expect(btn).toBeDefined();
    // `min-h-11` = 44px — ngưỡng app tự tuyên bố ở ui/button.tsx
    expect(btn.className).toContain("min-h-11");
  });
});
```

- [ ] **Bước 3: Chạy để thấy nó ĐỎ vì đúng lý do**

```bash
bun test apps/staff/src/components/ui/button.test.tsx
```

Kỳ vọng: FAIL với `ReferenceError: document is not defined` (hoặc tương đương). **Không phải** lỗi
import hay cú pháp — nếu thấy lỗi khác thì sửa test trước khi đi tiếp.

- [ ] **Bước 4: Đăng ký happy-dom**

Tạo `apps/staff/test-setup.ts`:

```ts
// DOM giả cho test component của apps/staff. `bun test` chạy trên Bun runtime,
// không có DOM — không có file này thì mọi `render()` ném `document is not defined`.
//
// GlobalRegistrator gắn document/window vào global scope MỘT LẦN cho cả tiến trình
// test. Nạp qua `preload` của bunfig.toml chứ không import trong từng file test:
// import lẻ thì thứ tự nạp phụ thuộc thứ tự file, và một file quên import sẽ đỏ
// theo cách trông như lỗi của chính nó.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
```

- [ ] **Bước 5: Trỏ `preload` vào nó**

Sửa `bunfig.toml`:

```toml
[install]
exact = true

[test]
coverage = false
# DOM giả cho test component của apps/staff — xem apps/staff/test-setup.ts.
# Nạp cho MỌI test, kể cả test của apps/api và packages/db: happy-dom chỉ thêm
# global, không đổi hành vi của code không đụng tới DOM. Đo ở Bước 7.
preload = ["./apps/staff/test-setup.ts"]
```

- [ ] **Bước 6: Chạy lại để thấy XANH**

```bash
bun test apps/staff/src/components/ui/button.test.tsx
```

Kỳ vọng: PASS, 1 test.

- [ ] **Bước 7: Kiểm `preload` không làm hỏng test cũ**

```bash
bun test
```

Kỳ vọng: **485 pass / 0 fail** (484 cũ + 1 mới). Nếu có test cũ đỏ, `preload` đang đổi hành vi —
dừng lại và thu hẹp phạm vi preload thay vì sửa test cũ.

- [ ] **Bước 8: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add package.json bun.lock bunfig.toml apps/staff/test-setup.ts \
        apps/staff/src/components/ui/button.test.tsx
git commit -m "test(staff): lưới test component đầu tiên — happy-dom + testing-library"
```

---

### Task 2: `Modal` — khe `footer` neo cố định

**Files:**

- Modify: `apps/staff/src/components/ui/modal.tsx`
- Test: `apps/staff/src/components/ui/modal.test.tsx`

**Interfaces:**

- Consumes: lưới test của Task 1.
- Produces: `Modal` nhận thêm prop tuỳ chọn
  `footer?: (close: () => void) => React.ReactNode`. Khi **không** truyền, hành vi giữ nguyên
  100% — panel tự cuộn như hôm nay (sheet "Thêm" phụ thuộc điều này).

- [ ] **Bước 1: Viết test ĐỎ**

Tạo `apps/staff/src/components/ui/modal.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Modal } from "./modal";

describe("Modal", () => {
  it("không truyền footer thì panel vẫn là vùng cuộn (hành vi cũ)", () => {
    render(
      <Modal label="Thử" placement="bottom" onClose={() => {}}>
        {() => <p>nội dung</p>}
      </Modal>,
    );
    const panel = document.querySelector("[data-panel]");
    expect(panel?.className).toContain("overflow-y-auto");
  });

  it("truyền footer thì footer nằm NGOÀI vùng cuộn", () => {
    render(
      <Modal
        label="Thử"
        placement="bottom"
        onClose={() => {}}
        footer={() => <button type="button">Tạo đơn</button>}
      >
        {() => <p>nội dung</p>}
      </Modal>,
    );
    const panel = document.querySelector("[data-panel]");
    const submit = screen.getByRole("button", { name: "Tạo đơn" });
    const scroller = document.querySelector("[data-modal-scroll]");

    // Vùng cuộn là con của panel, KHÔNG phải panel — panel thôi tự cuộn.
    expect(panel?.className).not.toContain("overflow-y-auto");
    expect(scroller?.className).toContain("overflow-y-auto");
    // Nút nằm ngoài vùng cuộn: cuộn hết nội dung cũng không đẩy nó đi đâu.
    expect(scroller?.contains(submit)).toBe(false);
    expect(panel?.contains(submit)).toBe(true);
  });
});
```

- [ ] **Bước 2: Chạy để thấy ĐỎ vì đúng lý do**

```bash
bun test apps/staff/src/components/ui/modal.test.tsx
```

Kỳ vọng: test thứ nhất PASS (hành vi cũ), test thứ hai FAIL vì `[data-modal-scroll]` chưa tồn tại
(`expect(received).toContain(expected)` trên `undefined`). Nếu test thứ nhất cũng đỏ thì `Modal`
đang hỏng sẵn — dừng lại tìm hiểu.

- [ ] **Bước 3: Thêm prop `footer` vào chữ ký**

Trong `apps/staff/src/components/ui/modal.tsx`, thêm vào khối props (ngay sau `children`):

```tsx
  /**
   * Hành động chính, neo ở CHÂN panel và KHÔNG cuộn theo nội dung.
   *
   * Sinh ra từ một ca đo được: ở 390px nút `Tạo đơn` của `RentalForm` nằm ở
   * y=705–749 trong khi thanh nav dưới bắt đầu ở 724 — chạm vào nửa dưới của nút
   * rơi vào `<dialog>` chứ không vào nút, tức 19/44px là vùng chết. Sheet chi tiết
   * đơn còn nặng hơn: 4/7 hành động (`Thêm ảnh` ×2, `Đã giao xe`, `Huỷ đơn`) nằm
   * dưới nếp gấp của panel, không có gì báo rằng chúng tồn tại.
   *
   * KHÔNG truyền thì panel giữ nguyên hành vi cũ — sheet "Thêm" đo sạch (0/6 nút
   * ngoài tầm) chính vì nội dung của nó ngắn hơn khung, nên nó không cần khe này.
   */
  readonly footer?: (close: () => void) => React.ReactNode;
```

và thêm `footer` vào destructuring của tham số.

- [ ] **Bước 4: Tách panel thành cuộn + chân khi có `footer`**

Thay khối `<div ref={panelRef} …>` ở cuối `Modal` bằng:

```tsx
<div
  ref={panelRef}
  tabIndex={-1}
  data-panel=""
  data-placement={placement}
  className={`absolute mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col overscroll-contain bg-surface ${
    footer ? "" : "overflow-y-auto"
  } ${PANEL_PLACEMENT[placement]}`}
>
  {footer ? (
    <>
      {/* `min-h-0` BẮT BUỘC: một flex item mặc định không co xuống dưới nội dung
          của nó, nên thiếu dòng này thì vùng cuộn phình bằng nội dung và đẩy chân
          panel ra ngoài `max-h-[90dvh]` — đúng lại con bug đang sửa. */}
      <div data-modal-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children(close)}
      </div>
      {/* `border-t` để chân không trôi lẫn vào nội dung khi cuộn tới sát nó.
          KHÔNG thêm padding ở đây: `PANEL_PLACEMENT` đã mang `pb-safe`, và phía
          gọi sở hữu nhịp nội dung của chính nó (xem chú thích của panel). */}
      <div className="shrink-0 border-t border-border">{footer(close)}</div>
    </>
  ) : (
    children(close)
  )}
</div>
```

- [ ] **Bước 5: Chạy test — cả hai phải XANH**

```bash
bun test apps/staff/src/components/ui/modal.test.tsx
```

Kỳ vọng: PASS, 2 tests.

- [ ] **Bước 6: Kiểm ba chỗ gọi cũ chưa đổi vẫn chạy**

```bash
bun run typecheck && bun test
```

Kỳ vọng: typecheck exit 0; **486 pass / 0 fail**.

- [ ] **Bước 7: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/ui/modal.tsx apps/staff/src/components/ui/modal.test.tsx
git commit -m "feat(staff): Modal có khe footer neo cố định, không cuộn theo nội dung"
```

---

### Task 3: `RentalForm` dùng khe `footer` — đóng #3

**Files:**

- Modify: `apps/staff/src/components/rentals/rental-form.tsx`

**Interfaces:**

- Consumes: `Modal` có prop `footer` (Task 2).

- [ ] **Bước 1: Tìm nút `Tạo đơn` hiện tại**

```bash
grep -n "Tạo đơn" apps/staff/src/components/rentals/rental-form.tsx
```

- [ ] **Bước 2: Chuyển nút xuống khe `footer`**

Gỡ nút submit khỏi thân `children`, truyền qua prop mới của `<Modal>`:

```tsx
<Modal
  label="Lên đơn thuê xe"
  placement="adaptive"
  onClose={onClose}
  footer={() => (
    <div className="card-pad">
      <Button type="submit" form="rental-form" disabled={busy} className="w-full">
        Tạo đơn
      </Button>
    </div>
  )}
>
```

Và đặt `id="rental-form"` lên `<form>` trong thân modal. Thuộc tính `form` trên nút là cách duy
nhất để một nút submit nằm NGOÀI `<form>` vẫn gửi được form đó — chân panel là anh em của vùng
cuộn, không phải con của form.

- [ ] **Bước 3: Đo lại bằng CDP**

```bash
nvm use 22
# hai server dev phải đang chạy; xem §11 của design doc
node apps/staff/scripts/mobile-probe/modal-submit-hit.mjs
```

Kỳ vọng: mọi điểm `y` trong khoảng nút `Tạo đơn` đều trả `<button>` — **0/3 nút ngoài tầm** thay vì
1/3.

- [ ] **Bước 4: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/rentals/rental-form.tsx
git commit -m "fix(staff): nút Tạo đơn thôi nằm dưới thanh nav — 19/44px vùng chết"
```

---

### Task 4: `RentalDetailSheet` dùng khe `footer` — đóng #1

**Files:**

- Modify: `apps/staff/src/components/rentals/rental-detail-sheet.tsx`

**Interfaces:**

- Consumes: `Modal` có prop `footer` (Task 2).

- [ ] **Bước 1: Xác định đâu là hành động, đâu là nội dung**

```bash
grep -n "Đã giao xe\|Huỷ đơn\|Thêm ảnh" apps/staff/src/components/rentals/rental-detail-sheet.tsx
```

`Đã giao xe` và `Huỷ đơn` là hành động của cả đơn → xuống chân. `Thêm ảnh` **ở lại trong nội
dung**: nó thuộc về khối ảnh của nó, tách ra chân là mất ngữ cảnh "ảnh giấy tờ" hay "ảnh tình
trạng xe".

- [ ] **Bước 2: Chuyển hai nút chuyển trạng thái xuống `footer`**

```tsx
footer={(close) => (
  <div className="card-pad flex gap-2">
    <Button type="button" disabled={busy} onClick={onHandover} className="flex-1">
      Đã giao xe
    </Button>
    <Button type="button" variant="ghost" disabled={busy} onClick={() => onCancel(close)}>
      Huỷ đơn
    </Button>
  </div>
)}
```

- [ ] **Bước 3: Đo lại**

```bash
nvm use 22 && node apps/staff/scripts/mobile-probe/sheet-actions.mjs
```

Kỳ vọng: sheet chi tiết còn **≤2/7** nút ngoài tầm trước khi cuộn (hai nút `Thêm ảnh` vẫn ở trong
nội dung, đó là chủ ý), thay vì 4/7. `Đã giao xe` và `Huỷ đơn` **không** được nằm trong danh sách.

- [ ] **Bước 4: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/rentals/rental-detail-sheet.tsx
git commit -m "fix(staff): hai hành động của đơn neo ở chân sheet, thôi chui dưới nếp gấp"
```

---

### Task 5: `useLayoutVariant`

**Files:**

- Create: `apps/staff/src/hooks/use-layout-variant.ts`
- Test: `apps/staff/src/hooks/use-layout-variant.test.ts`

**Interfaces:**

- Produces: `useLayoutVariant(): "mobile" | "desktop"` — `"mobile"` khi
  `window.matchMedia("(min-width: 768px)").matches === false`.

- [ ] **Bước 1: Viết test ĐỎ**

```ts
import { describe, expect, it, beforeEach } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useLayoutVariant } from "./use-layout-variant";

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

describe("useLayoutVariant", () => {
  beforeEach(() => stubMatchMedia(false));

  it("dưới ngưỡng md → mobile", () => {
    stubMatchMedia(false);
    expect(renderHook(() => useLayoutVariant()).result.current).toBe("mobile");
  });

  it("từ ngưỡng md trở lên → desktop", () => {
    stubMatchMedia(true);
    expect(renderHook(() => useLayoutVariant()).result.current).toBe("desktop");
  });

  it("lần vẽ ĐẦU đã đúng, không phải sửa ở lần vẽ sau", () => {
    stubMatchMedia(true);
    const seen: string[] = [];
    renderHook(() => {
      const v = useLayoutVariant();
      seen.push(v);
      return v;
    });
    // Không có "mobile" lọt vào lần vẽ đầu rồi mới đổi — đó chính là cái nháy
    // mà rental-calendar.tsx đã ghi lý do khi chọn useSyncExternalStore.
    expect(seen).not.toContain("mobile");
  });
});
```

- [ ] **Bước 2: Chạy để thấy ĐỎ**

```bash
bun test apps/staff/src/hooks/use-layout-variant.test.ts
```

Kỳ vọng: FAIL — `Cannot find module './use-layout-variant'`.

- [ ] **Bước 3: Implement**

```ts
import { useSyncExternalStore } from "react";

/** Cùng ngưỡng `md` mặc định của Tailwind mà `AppShell` dùng để đổi nav. */
const MD_QUERY = "(min-width: 768px)";

function subscribe(callback: () => void): () => void {
  const list = window.matchMedia(MD_QUERY);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}

function getSnapshot(): "mobile" | "desktop" {
  return window.matchMedia(MD_QUERY).matches ? "desktop" : "mobile";
}

/**
 * `useSyncExternalStore`, KHÔNG `useEffect` + `useState`: effect chạy SAU lần vẽ
 * đầu, nên hình dạng sai kịp xuất hiện đúng một khung hình rồi mới bị sửa. Cùng
 * kỹ thuật và cùng lý do với `currentDayCount` ở `rental-calendar.tsx`.
 *
 * Server snapshot trả `"desktop"`: app này là SPA, không SSR, nên nhánh đó chỉ
 * chạy trong test chưa cắm `matchMedia`. Chọn `"desktop"` vì đó là hình dạng đầy
 * đủ — hỏng theo hướng thừa thông tin, không thiếu.
 */
export function useLayoutVariant(): "mobile" | "desktop" {
  return useSyncExternalStore(subscribe, getSnapshot, () => "desktop");
}
```

- [ ] **Bước 4: Chạy để thấy XANH**

```bash
bun test apps/staff/src/hooks/use-layout-variant.test.ts
```

Kỳ vọng: PASS, 3 tests.

- [ ] **Bước 5: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/hooks/use-layout-variant.ts apps/staff/src/hooks/use-layout-variant.test.ts
git commit -m "feat(staff): hook useLayoutVariant, đúng ngay lần vẽ đầu"
```

---

### Task 6: Tách nút nhân viên khỏi `<td>`

`StaffRowActions` hôm nay **trả về `<td>`**, nên hình dạng thẻ không dùng lại được — một `<td>`
ngoài `<table>` là HTML sai.

**Files:**

- Modify: `apps/staff/src/components/staff/staff-row-actions.tsx`

**Interfaces:**

- Produces: `StaffActionButtons` (không bọc `<td>`, cùng props như `StaffRowActions` hôm nay);
  `StaffRowActions` giữ nguyên chữ ký và giờ chỉ bọc `<td>` quanh `StaffActionButtons`.

- [ ] **Bước 1: Kiểm ai đang dùng — Serena VÀ grep**

```bash
grep -rn "StaffRowActions" apps/staff/src
```

Kỳ vọng: đúng 2 chỗ (khai + dùng trong `staff-table.tsx`). Nếu Serena nói khác, tin `grep`.

- [ ] **Bước 2: Tách, giữ nguyên `StaffRowActions`**

Trong `staff-row-actions.tsx`, đổi phần `return`:

```tsx
/** Ba nút, KHÔNG bọc ô bảng — dùng được ở cả `<td>` lẫn thẻ. */
export function StaffActionButtons({
  row,
  me,
  busy,
  onApprove,
  onDisable,
  onIssueCode,
}: StaffRowActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {row.status === "PENDING" && (
        <Button type="button" disabled={busy} onClick={() => onApprove(row.id)}>
          Duyệt
        </Button>
      )}
      {row.status === "ACTIVE" && row.id !== me?.id && (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => onDisable(row.id)}>
          Khoá
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={() => onIssueCode({ id: row.id, name: row.fullName })}
      >
        Phát mã
      </Button>
    </div>
  );
}

export function StaffRowActions(props: StaffRowActionsProps) {
  return (
    <td className="card-pad">
      <StaffActionButtons {...props} />
    </td>
  );
}
```

- [ ] **Bước 3: Kiểm không đổi hành vi**

```bash
bun run typecheck && bun test
```

Kỳ vọng: typecheck exit 0, **489 pass / 0 fail** (487 sau Task 2 + 3 của Task 5 − trùng; con số
chính xác lấy từ lần chạy trước, điều kiện là **0 fail** và số pass **không giảm**).

- [ ] **Bước 4: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/staff/staff-row-actions.tsx
git commit -m "refactor(staff): tách StaffActionButtons khỏi <td> để thẻ dùng lại được"
```

---

### Task 7: Hình dạng thẻ cho bảng nhân viên — đóng #2

**Files:**

- Create: `apps/staff/src/components/staff/staff-cards.tsx`
- Modify: `apps/staff/src/components/staff/staff-table.tsx`
- Test: `apps/staff/src/components/staff/staff-table.test.tsx`

**Interfaces:**

- Consumes: `useLayoutVariant` (Task 5) · `StaffActionButtons` (Task 6).
- Produces: `StaffTable` giữ nguyên chữ ký; bên trong tự chọn thẻ hay bảng.

- [ ] **Bước 1: Viết test ĐỎ cho cả hai hình dạng**

```tsx
import { describe, expect, it, beforeEach } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StaffTable } from "./staff-table";

const ROWS = [
  {
    id: "a",
    email: "a@v9.vn",
    fullName: "Nguyễn Văn A",
    phone: null,
    role: "STAFF",
    status: "PENDING",
    avatarVersion: null,
  },
] as const;

function stub(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

const props = {
  rows: ROWS,
  me: null,
  busy: false,
  onApprove: () => {},
  onDisable: () => {},
  onIssueCode: () => {},
};

describe("StaffTable", () => {
  beforeEach(() => stub(true));

  it("desktop: vẫn là <table> đủ sáu cột", () => {
    stub(true);
    render(<StaffTable {...props} />);
    expect(document.querySelector("table")).not.toBeNull();
    expect(document.querySelectorAll("thead th").length).toBe(6);
  });

  it("mobile: KHÔNG có <table>, và không sinh vùng cuộn ngang", () => {
    stub(false);
    render(<StaffTable {...props} />);
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("mobile: đủ vai trò, trạng thái và hai nút hành động", () => {
    stub(false);
    render(<StaffTable {...props} />);
    expect(screen.getByText("Nhân viên")).toBeDefined(); // ROLE_LABEL.STAFF
    expect(screen.getByText("Chờ duyệt")).toBeDefined(); // STATUS_LABEL.PENDING
    expect(screen.getByRole("button", { name: "Duyệt" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Phát mã" })).toBeDefined();
  });
});
```

- [ ] **Bước 2: Chạy để thấy ĐỎ vì đúng lý do**

```bash
bun test apps/staff/src/components/staff/staff-table.test.tsx
```

Kỳ vọng: test desktop PASS; hai test mobile FAIL vì `<table>` vẫn được dựng ở mọi bề rộng.

- [ ] **Bước 3: Viết `staff-cards.tsx`**

```tsx
import { useAvatarUrl } from "../../hooks/use-avatar-url";
import { ROLE_LABEL, STATUS_LABEL, type Me, type StaffRow } from "../../lib/me";
import { Avatar } from "../ui/avatar";
import { StaffActionButtons } from "./staff-row-actions";

interface StaffCardsProps {
  readonly rows: readonly StaffRow[];
  readonly me: Me | null;
  readonly busy: boolean;
  readonly onApprove: (id: string) => void;
  readonly onDisable: (id: string) => void;
  readonly onIssueCode: (row: { id: string; name: string }) => void;
}

/** Một dòng nhân viên, tách component vì `useAvatarUrl` không gọi được trong `.map()`. */
function StaffCard({
  row,
  me,
  busy,
  onApprove,
  onDisable,
  onIssueCode,
}: StaffCardsProps & { readonly row: StaffRow }) {
  const avatarUrl = useAvatarUrl(row.id, row.avatarVersion);
  return (
    <li className="card-pad border-b border-border">
      <div className="flex items-center gap-2">
        <Avatar name={row.fullName} seed={row.id} src={avatarUrl} />
        <span className="font-semibold text-ink">{row.fullName}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{row.email}</p>
      <p className="text-sm text-muted">{row.phone ?? "—"}</p>
      {/* Vai trò và trạng thái đi cùng một dòng: ở bảng chúng là hai cột cạnh
          nhau, giữ nguyên quan hệ đó thì người đã quen bảng không phải học lại. */}
      <p className="mt-1 text-sm text-ink">
        {ROLE_LABEL[row.role]} · {STATUS_LABEL[row.status]}
      </p>
      <div className="mt-2">
        <StaffActionButtons
          row={row}
          me={me}
          busy={busy}
          onApprove={onApprove}
          onDisable={onDisable}
          onIssueCode={onIssueCode}
        />
      </div>
    </li>
  );
}

/**
 * Hình dạng thẻ của danh sách nhân viên, dùng ở màn hẹp.
 *
 * Không phải để thêm lại thứ đã mất — bảng vốn dựng đủ sáu cột và cả ba nút. Đo
 * ở 390px: khối bọc bảng là 358/640, và **0/3 nút hành động** nằm trong khung
 * nhìn. Thẻ đưa mọi trường vào tầm mắt mà không đòi ai phải phát hiện ra là bảng
 * cuộn ngang được.
 */
export function StaffCards(props: StaffCardsProps) {
  return (
    <ul className="mt-4">
      {props.rows.map((row) => (
        <StaffCard key={row.id} {...props} row={row} />
      ))}
    </ul>
  );
}
```

- [ ] **Bước 4: Cho `StaffTable` chọn hình dạng**

Đầu `StaffTable`, trước `return`:

```tsx
// Chọn MỘT hình dạng, không dựng cả hai rồi ẩn bằng CSS như `AppNav`: mỗi dòng
// gọi `useAvatarUrl`, nên dựng hai bản là nhân đôi số request ảnh đại diện.
if (useLayoutVariant() === "mobile") {
  return (
    <StaffCards
      rows={rows}
      me={me}
      busy={busy}
      onApprove={onApprove}
      onDisable={onDisable}
      onIssueCode={onIssueCode}
    />
  );
}
```

- [ ] **Bước 5: Chạy để thấy XANH**

```bash
bun test apps/staff/src/components/staff/staff-table.test.tsx && bun run typecheck
```

Kỳ vọng: PASS 3 tests; typecheck exit 0.

- [ ] **Bước 6: Đo lại bằng CDP**

```bash
nvm use 22 && node apps/staff/scripts/mobile-probe/staff-table.mjs
```

Kỳ vọng ở 390px: **không có `.overflow-x-auto`**, và **3/3 nút nằm trong khung nhìn**. Ở 1280px giữ
nguyên `1024/1024` và `3/3`.

- [ ] **Bước 7: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/staff/staff-cards.tsx \
        apps/staff/src/components/staff/staff-table.tsx \
        apps/staff/src/components/staff/staff-table.test.tsx
git commit -m "feat(staff): danh sách nhân viên dạng thẻ ở màn hẹp — 0/3 nút trong tầm mắt"
```

---

### Task 8: Tên xe xuống hai dòng — đóng #7

**Files:**

- Modify: `apps/staff/src/components/rentals/calendar-timeline.tsx:109,144`

**Interfaces:** không đổi API nào.

- [ ] **Bước 1: Xác nhận số đo trước khi sửa**

Cột đang cấp 88px (`--veh-col: 5.5rem`); sáu tên xe cần 121–163px, **cả sáu đều cụt**. Cột đã
`sticky left-0` sẵn — không đụng.

- [ ] **Bước 2: Nới vừa phải và cho xuống dòng**

Dòng 109 — đổi `[--veh-col:5.5rem]` thành `[--veh-col:7.5rem]` (120px). Giữ nguyên `md:` và `xl:`.

Dòng 144 — bỏ `truncate`, thêm `leading-tight`:

```tsx
className =
  "sticky left-0 z-10 min-h-12 border-r border-b border-border bg-surface card-pad text-sm leading-tight text-ink";
```

`min-h-12` (48px) đã có sẵn nên hai dòng `text-sm` vừa chỗ, không phải nới chiều cao hàng.

- [ ] **Bước 3: Đo lại**

```bash
nvm use 22 && node apps/staff/scripts/mobile-probe/vehicle-column.mjs
```

Kỳ vọng: cả sáu ô đều `✅` (`scrollWidth ≤ clientWidth`). Nếu `Ducati Scrambler 800` vẫn cụt thì
tăng tiếp lên `8rem` và đo lại — **điều kiện là kết quả, không phải con số**.

- [ ] **Bước 4: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/rentals/calendar-timeline.tsx
git commit -m "fix(staff): tên xe xuống hai dòng, thôi cụt cả sáu dòng ở 390px"
```

---

### Task 9: Dấu hiệu còn nội dung bên phải — đóng #4

**Files:**

- Modify: `apps/staff/src/components/rentals/calendar-timeline.tsx:102`

- [ ] **Bước 1: Viết test ĐỎ (hai chiều)**

Tạo `apps/staff/src/components/rentals/calendar-timeline.test.tsx`:

```tsx
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { ScrollHint } from "./calendar-timeline";

/** happy-dom không làm layout, nên `scrollWidth`/`clientWidth` phải đặt tay. */
function fakeScroller(clientWidth: number, scrollWidth: number, scrollLeft = 0) {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  el.scrollLeft = scrollLeft;
  return el;
}

describe("ScrollHint", () => {
  it("còn nội dung chưa xem → bật", () => {
    const el = fakeScroller(356, 942, 0);
    render(<ScrollHint scrollerRef={{ current: el }} />);
    expect(document.querySelector("[data-scroll-hint]")?.getAttribute("data-more")).toBe("true");
  });

  it("đã cuộn hết → TẮT", () => {
    // 942 - 356 = 586 là scrollLeft tối đa.
    const el = fakeScroller(356, 942, 586);
    render(<ScrollHint scrollerRef={{ current: el }} />);
    expect(document.querySelector("[data-scroll-hint]")?.getAttribute("data-more")).toBe("false");
  });

  it("không có gì để cuộn → TẮT", () => {
    const el = fakeScroller(1024, 1024, 0);
    render(<ScrollHint scrollerRef={{ current: el }} />);
    expect(document.querySelector("[data-scroll-hint]")?.getAttribute("data-more")).toBe("false");
  });
});
```

Ba ca, không phải một. Một dấu hiệu **luôn bật** vẫn qua được test chỉ kiểm chiều bật — đó đúng là
kiểu test xanh vô nghĩa mà `.claude/CLAUDE.md` §4 cảnh báo. Ca thứ ba canh riêng trường hợp desktop
không cần cuộn.

- [ ] **Bước 2: Chạy để thấy ĐỎ**

```bash
bun test apps/staff/src/components/rentals/calendar-timeline.test.tsx
```

Kỳ vọng: FAIL vì `[data-scroll-hint]` chưa tồn tại.

- [ ] **Bước 3: Implement**

Export một component **có tên**, đúng tên mà test ở Bước 1 import:

```tsx
/**
 * Vệt mờ ở mép phải, chỉ hiện khi còn phần chưa xem.
 *
 * Tách thành component export được vì nó là thứ DUY NHẤT của file này test được
 * mà không cần layout thật: happy-dom không tính layout, nên `scrollWidth` phải
 * đặt tay — dễ làm với một ref giả, không làm được với cả `CalendarTimeline`.
 *
 * `aria-hidden`: tín hiệu thị giác thuần. Người dùng trình đọc màn hình đã có
 * vùng `overflow` gốc để điều hướng, thêm một node nữa chỉ là nhiễu.
 */
export function ScrollHint({
  scrollerRef,
}: {
  readonly scrollerRef: React.RefObject<HTMLElement | null>;
}) {
  const hasMore = useSyncExternalStore(
    (onChange) => {
      const el = scrollerRef.current;
      if (!el) return () => {};
      el.addEventListener("scroll", onChange, { passive: true });
      const ro = new ResizeObserver(onChange);
      ro.observe(el);
      return () => {
        el.removeEventListener("scroll", onChange);
        ro.disconnect();
      };
    },
    () => {
      const el = scrollerRef.current;
      if (!el) return false;
      // `- 1`: bề rộng sau layout là số thực, `scrollLeft` làm tròn khác nhau
      // giữa các trình duyệt. Không có biên này thì cuộn hết vẫn còn thừa 0,5px
      // và vệt mờ kẹt ở trạng thái bật — đúng lỗi mà ca test thứ hai canh.
      return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    },
    () => false,
  );

  return (
    <span
      aria-hidden="true"
      data-scroll-hint=""
      data-more={hasMore ? "true" : "false"}
      className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas to-transparent opacity-0 transition-opacity data-[more=true]:opacity-100"
    />
  );
}
```

Rồi bọc khối `overflow-x-auto` (dòng 102) trong `<div className="relative">`, gắn `ref` vào chính
khối cuộn đó, và đặt `<ScrollHint scrollerRef={ref} />` làm anh em của nó.

- [ ] **Bước 4: XANH + đo**

```bash
bun test apps/staff/src/components/rentals/calendar-timeline.test.tsx && nvm use 22
```

Rồi mở `/calendar` ở 390px và xác nhận vệt mờ hiện lúc đầu, tắt khi cuộn hết.

- [ ] **Bước 5: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/rentals/calendar-timeline.tsx \
        apps/staff/src/components/rentals/calendar-timeline.test.tsx
git commit -m "feat(staff): lưới lịch báo còn nội dung bên phải, thôi cuộn trong im lặng"
```

---

### Task 10: `currentDayCount` đo vùng lưới — đóng #5

**Files:**

- Modify: `apps/staff/src/components/rentals/rental-calendar.tsx:154-181`

- [ ] **Bước 1: Ghi lại số đo hiện tại**

Ở 1280px: vùng lưới `clientWidth = 1022`, `scrollWidth = 1839`. Hàm trả 14 ngày vì
`matchMedia("(min-width:1280px)")` khớp **cửa sổ**, trong khi sidebar đã ăn ~258px.

- [ ] **Bước 2: Viết test ĐỎ**

Tách một hàm **thuần** ra để test được mà không cần `ResizeObserver` giả. Thêm vào
`apps/staff/src/components/rentals/rental-calendar.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { dayCountForWidth } from "./rental-calendar";

describe("dayCountForWidth", () => {
  it("đo BỀ RỘNG VÙNG LƯỚI, không phải bề rộng cửa sổ", () => {
    // Ca thật đã đo: cửa sổ 1280px nhưng sidebar ăn ~258px nên lưới chỉ có 1022.
    // Hàm cũ hỏi matchMedia trên cửa sổ → trả 14 ngày cho một chỗ chứa được 10.
    expect(dayCountForWidth(1022)).toBe(10);
  });

  it("ba ngưỡng", () => {
    expect(dayCountForWidth(360)).toBe(7);
    expect(dayCountForWidth(767)).toBe(7);
    expect(dayCountForWidth(768)).toBe(10);
    expect(dayCountForWidth(1279)).toBe(10);
    expect(dayCountForWidth(1280)).toBe(14);
  });
});
```

- [ ] **Bước 3: Implement**

Export hàm thuần đúng tên test đã import, rồi cho `useSyncExternalStore` dùng nó:

```ts
/** Ba ngưỡng cũ, nhưng áp lên bề rộng VÙNG LƯỚI thay vì bề rộng cửa sổ. */
export function dayCountForWidth(gridWidth: number): 7 | 10 | 14 {
  if (gridWidth >= 1280) return 14;
  if (gridWidth >= 768) return 10;
  return 7;
}
```

Thay `currentDayCount()` + `subscribeToBreakpoint()` bằng `ResizeObserver` gắn lên ref của khối
lưới, `getSnapshot` gọi `dayCountForWidth(el.clientWidth)`. Xoá hai hàm cũ và hai hằng `MD_QUERY` /
`XL_QUERY` nếu không còn ai dùng — kiểm bằng `grep -rn "MD_QUERY\|XL_QUERY" apps/staff/src`, đừng
tin một mình Serena.

⚠️ `calendar-timeline.tsx` khai ở đầu file rằng ba ngưỡng này PHẢI khớp với `md:`/`xl:` của
`--veh-col`. Sau khi đổi sang đo vùng lưới, hai bên không còn cùng gốc quy chiếu — cập nhật chú
thích đó cho khỏi nói dối người sau.

- [ ] **Bước 4: Đo lại**

```bash
nvm use 22 && node apps/staff/scripts/mobile-probe/calendar-geometry.mjs
```

Kỳ vọng ở 1280px: `scrollWidth ≤ clientWidth` — lưới không còn giấu 44%.

- [ ] **Bước 5: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/rentals/rental-calendar.tsx \
        apps/staff/src/components/rentals/calendar-timeline.tsx
git commit -m "fix(staff): số cột lịch đo theo vùng lưới, không theo cửa sổ"
```

---

### Task 11: Gộp đầu trang Lịch — đóng #8

**Files:**

- Modify: `apps/staff/src/components/rentals/rental-calendar.tsx`

- [ ] **Bước 1: Số đo hiện tại**

Ở 390px lưới bắt đầu ở `y = 228` trên viewport 780 → **29%**. Ở 1280px là 120 → 15%.

- [ ] **Bước 2: Gộp ba hàng thành một ở màn hẹp**

Điều hướng ngày (`‹` `›` + khoảng ngày), nút `Hôm nay`, và cặp `Timeline`/`Tháng` hiện xếp ba hàng.
Cho chúng vào một `flex flex-wrap items-center gap-2`, và rút nhãn khoảng ngày ở màn hẹp
(`03/09 – 09/09` thay vì `03/09/2026 – 09/09/2026`) — năm đã nằm trong ngữ cảnh trang.

- [ ] **Bước 3: Đo lại**

```bash
nvm use 22 && node apps/staff/scripts/mobile-probe/calendar-geometry.mjs
```

Kỳ vọng: `y` của lưới ở 390px ≤ **117px** (15% của 780).

- [ ] **Bước 4: Commit**

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
git add apps/staff/src/components/rentals/rental-calendar.tsx
git commit -m "fix(staff): đầu trang Lịch còn một hàng ở màn hẹp — từ 29% xuống ≤15%"
```

---

### Task 12: Nghiệm thu — chạy lại toàn bộ bộ đo

**Files:** không sửa file nguồn nào.

- [ ] **Bước 1: Dựng lại môi trường**

```bash
docker compose up -d postgres minio minio-init supertokens
bun run db:migrate && bun run seed:dev
nvm use 22
# api: cd apps/api && bun --env-file=../../.env --hot src/index.ts
# staff: cd apps/staff && bun run dev
google-chrome --headless=new --no-sandbox --remote-debugging-port=9222 \
  --user-data-dir=/tmp/v9-chrome about:blank &
```

- [ ] **Bước 2: Chạy lại từng probe và đối chiếu**

| Điều kiện đạt                                                | Trước     | Probe                   |
| ------------------------------------------------------------ | --------- | ----------------------- |
| Sheet chi tiết: `Đã giao xe` và `Huỷ đơn` không dưới nếp gấp | 4/7 ngoài | `sheet-actions.mjs`     |
| `/staff` 390px: không `.overflow-x-auto`, 3/3 nút trong tầm  | 0/3       | `staff-table.mjs`       |
| `Tạo đơn` bấm được toàn bộ 44px                              | 19/44px   | `modal-submit-hit.mjs`  |
| Không tên xe nào bị cắt ở 390px                              | 6/6 cụt   | `vehicle-column.mjs`    |
| Dấu hiệu mép phải bật/tắt đúng hai chiều                     | không có  | mắt + test              |
| Đầu trang Lịch ≤ 15% chiều cao ở 390px                       | 29%       | `calendar-geometry.mjs` |
| Lưới desktop `scrollWidth ≤ clientWidth` ở 1280px            | 1022/1839 | `calendar-geometry.mjs` |
| Tràn ngang cấp trang vẫn 0px ở 360 và 390                    | 0px       | `screens.mjs`           |

- [ ] **Bước 3: Cổng cuối**

```bash
bun run typecheck && bun test && bun run lint && ./node_modules/.bin/prettier --check .
```

Tất cả phải exit 0.

- [ ] **Bước 4: Cập nhật `DEBT.md`**

Gạch nợ ⛔ `apps/staff` không có test component — giờ đã có happy-dom và bốn file test. Ghi số đo
trước/sau cho từng lỗi đã đóng, theo lối các mục khác trong file đó.

- [ ] **Bước 5: Commit**

```bash
git add docs/DEBT.md
git commit -m "docs(debt): đóng nợ test component của apps/staff, kèm số đo trước/sau"
```
