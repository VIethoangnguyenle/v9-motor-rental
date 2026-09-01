# Hệ thị giác `apps/staff` — Plan thi công

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng hệ màu đo được cho `apps/staff`, thêm theme sáng/tối theo hệ điều hành kèm nút gạt,
biến icon thành kênh thông tin thứ hai bên cạnh màu, và thêm chuyển động có mục đích — với impeccable
làm gate chất lượng cuối.

**Architecture:** Token màu khai trong `@theme` của `src/index.css`; theme tối ghi đè cùng bộ biến
CSS đó dưới hai selector (`@media prefers-color-scheme` và `[data-theme="dark"]`) nên utility của
Tailwind không đổi, chỉ giá trị biến đổi. Toán màu tách thành module thuần để test được; các bảng số
trong design doc trở thành **test hàng rào** chứ không phải ảnh chụp một lần.

**Tech Stack:** Tailwind v4 (`@tailwindcss/vite`) · React 19 · TanStack Router/Query · lucide-react ·
`bun test`.

**Design doc:** [`2026-09-01-staff-visual-system-design.md`](2026-09-01-staff-visual-system-design.md)
— mọi con số dưới đây đến từ đó. Đọc §2.5 trước khi làm Task 4.

---

## ⛔ Hàng rào kiến trúc — plan này đã vi phạm nó một lần

`eslint-plugin-boundaries` cấm `frontend-ui → frontend`: **`components/ui/` không được import bất
cứ thứ gì trong `lib/`.** Đo được (Task 3):

```
error  There is no policy allowing dependencies from elements of type
       "frontend-ui" to elements of type "frontend"   boundaries/dependencies
```

Task 3 đã đâm vào nó: plan bảo tạo `ui/theme-toggle.tsx` import `lib/theme`. Chỗ đúng là
`layout/theme-toggle.tsx` — và chính chú thích trong đoạn code của plan đã ghi _"`ui/` KHÔNG được
biết domain"_ ngay trên một import vi phạm luật đó.

**Luật rút ra, áp cho mọi task còn lại:** một component đặt trong `ui/` phải **nhận mọi thứ qua
prop**. Cần đọc `lib/` thì hoặc đổi chỗ sang thư mục biết-domain (`layout/`, `rentals/`,
`customers/`, `stats/`), hoặc đẩy phần biết-domain lên chỗ gọi.

Cùng luật đó áp cho mọi component đọc `lib/rental-status.ts`: chúng nằm ở `components/rentals/`,
`components/stats/`, `components/customers/` — **không** ở `ui/`. Chiều ngược lại (`lib/` → `ui/`,
kiểu `import type { IconName }`) thì hợp lệ.

**Không được sửa `eslint.config.js` để lách.** Đụng file đó là kéo theo bốn probe của skill
`v9-fences`, và hàng rào này là cố ý.

## ⚠️ Đọc trước khi bắt đầu

1. **Đọc [`docs/workspaces/staff.md`](../workspaces/staff.md)** — bẫy của workspace này. Đặc biệt:
   **PWA không chạy ở `vite dev`**, nên mọi thứ liên quan tới manifest / safe-area / `dvh` chỉ kiểm
   được trên bản build.
2. **`bun test` và `bun run typecheck` chạy trên CÂY LÀM VIỆC, không trên commit.** Trước mỗi commit:
   ```bash
   git stash push --include-untracked && bun run typecheck && bun test && git stash pop
   ```
3. **Không bao giờ `git add -A`.** Chỉ add file thuộc task đang làm.
4. **Không đụng `eslint.config.js`.** Nếu thấy cần, dừng lại và hỏi — mỗi lần đụng file đó phải chạy
   lại bốn probe của skill `v9-fences`.

---

## File Structure

| File                                                              | Trách nhiệm                                                                                                                      | Task    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `apps/staff/src/lib/color-math.ts`                                | **Tạo.** oklch → sRGB, tương phản WCAG, mô phỏng mù màu. Thuần, không import gì của app. Chỉ test dùng — không nằm trong bundle. | 1       |
| `apps/staff/src/lib/color-math.test.ts`                           | **Tạo.** Hiệu chuẩn toán màu bằng chính số `index.css` đã công bố.                                                               | 1       |
| `apps/staff/src/lib/theme-tokens.test.ts`                         | **Tạo.** Hàng rào: đọc `index.css` thật, dựng lại bảng §2.4 của design doc.                                                      | 2       |
| `apps/staff/src/index.css`                                        | **Sửa.** Token màu mới, bảng tối, token chuyển động, reduced-motion.                                                             | 2, 3, 6 |
| `apps/staff/src/lib/theme.ts`                                     | **Tạo.** Đọc/ghi/áp lựa chọn theme. Thuần trừ hai hàm chạm DOM.                                                                  | 3       |
| `apps/staff/src/lib/theme.test.ts`                                | **Tạo.** Ba trạng thái theme, ưu tiên, dữ liệu hỏng trong `localStorage`.                                                        | 3       |
| `apps/staff/index.html`                                           | **Sửa.** Script chống nháy trắng + hai thẻ `theme-color`.                                                                        | 3       |
| `apps/staff/src/components/ui/theme-toggle.tsx`                   | **Tạo.** Nút gạt ba trạng thái.                                                                                                  | 3       |
| `apps/staff/src/components/layout/app-nav.tsx`                    | **Sửa.** Gắn nút gạt vào chân sidebar và sheet Thêm.                                                                             | 3       |
| `apps/staff/src/components/ui/icon.tsx`                           | **Sửa.** Thêm 6 icon; `StatusDot` nhận `name`.                                                                                   | 4       |
| `apps/staff/src/lib/rental-status.ts`                             | **Sửa.** `STATUS_ICON` + `statusIconOf`.                                                                                         | 4, 4b   |
| `apps/staff/src/components/rentals/calendar-{timeline,month}.tsx` | **Sửa.** Thanh đơn mang hình trạng thái.                                                                                         | 4b      |
| `apps/staff/src/lib/rental-status.ts`                             | **Sửa.** Thêm `STATUS_ICON`; giữ nguyên logic màu.                                                                               | 4       |
| `apps/staff/src/lib/status-icon.test.ts`                          | **Tạo.** Hàng rào: 6 trạng thái → 6 icon khác nhau.                                                                              | 4       |
| `apps/staff/src/components/ui/alert.tsx`                          | **Sửa.** Icon theo tone.                                                                                                         | 4       |
| `apps/staff/src/components/stats/attention-list.tsx`              | **Sửa.** Chấm → icon theo loại việc.                                                                                             | 4       |
| `apps/staff/src/components/ui/button.tsx`                         | **Sửa.** Thêm transition.                                                                                                        | 5       |
| `apps/staff/src/components/ui/modal.tsx`                          | **Sửa.** Hiệu ứng vào/ra theo `placement`.                                                                                       | 6       |
| `apps/staff/src/components/rentals/rental-detail-sheet.tsx`       | **Sửa.** Khoảnh khắc bàn giao.                                                                                                   | 7       |
| `apps/staff/src/pages/staff-list-page.tsx` · `health-page.tsx`    | **Sửa.** Bỏ `<main>` lồng nhau.                                                                                                  | 8       |

---

## Task 1 — Toán màu, hiệu chuẩn bằng số đã công bố

Trước khi tin bất kỳ số mới nào, hàm đo phải tái lập được số cũ. `index.css` đã công bố sẵn các cặp
để hiệu chuẩn, và chú thích trong đó cảnh báo rằng một parser ngây thơ cho ra `16,69:1` cho cặp thật
ra là `4,38:1`.

**Files:**

- Create: `apps/staff/src/lib/color-math.ts`
- Create: `apps/staff/src/lib/color-math.test.ts`

- [ ] **Step 1.1: Viết test hiệu chuẩn TRƯỚC**

Tạo `apps/staff/src/lib/color-math.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { contrast, maxChroma, oklch, simulate } from "./color-math";

/**
 * Hiệu chuẩn: hàm đo phải tái lập ĐÚNG những con số `index.css` đã công bố từ
 * đợt token trước. Không hiệu chuẩn thì mọi số mới là số của một hàm chưa ai
 * kiểm — và `index.css` đã ghi rõ một parser sai cho ra 16,69:1 cho cặp thật
 * ra là 4,38:1.
 *
 * Giá trị dưới đây là token CŨ (trước đợt này), cố ý — đó là điều làm chúng
 * thành mốc hiệu chuẩn độc lập.
 */
describe("color-math — hiệu chuẩn theo số đã công bố trong index.css", () => {
  it("accent cũ trên canvas cũ = 5,31:1", () => {
    const accent = oklch(0.52, 0.19, 255);
    const canvas = oklch(0.984, 0, 0);
    expect(contrast(accent, canvas)).toBeCloseTo(5.31, 1);
  });

  it("accent cũ trên surface = 5,56:1", () => {
    expect(contrast(oklch(0.52, 0.19, 255), oklch(1, 0, 0))).toBeCloseTo(5.56, 1);
  });

  it("muted cũ trên surface = 5,49:1", () => {
    expect(contrast(oklch(0.52, 0, 0), oklch(1, 0, 0))).toBeCloseTo(5.49, 1);
  });

  it("muted cũ trên canvas cũ = 5,26:1", () => {
    expect(contrast(oklch(0.52, 0, 0), oklch(0.984, 0, 0))).toBeCloseTo(5.26, 1);
  });

  it("border cũ trên surface = 1,35:1 — con số critique đo được", () => {
    expect(contrast(oklch(0.9, 0, 0), oklch(1, 0, 0))).toBeCloseTo(1.35, 1);
  });
});

describe("color-math — gamut", () => {
  it("phát hiện accent cũ oklch(52% 0.19 255) VƯỢT gamut sRGB", () => {
    expect(oklch(0.52, 0.19, 255).clipped).toBe(true);
  });

  it("accent mới oklch(52% 0.171 255) nằm TRONG gamut", () => {
    expect(oklch(0.52, 0.171, 255).clipped).toBe(false);
  });

  it("maxChroma đồng ý với hai khẳng định trên", () => {
    expect(maxChroma(0.52, 255)).toBeGreaterThanOrEqual(0.171);
    expect(maxChroma(0.52, 255)).toBeLessThan(0.174);
  });
});

describe("color-math — mô phỏng mù màu", () => {
  it("không đổi gì ở kiểu nhìn thường", () => {
    const c = oklch(0.55, 0.21, 27);
    const sim = simulate(c, "normal");
    expect(sim.rgb[0]).toBeCloseTo(c.rgb[0], 5);
  });

  it("tái lập ΔE≈0,040 giữa quá hạn và cảnh báo dưới deuteranopia (design doc §2.5)", () => {
    const overdue = simulate(oklch(0.55, 0.21, 27), "deuteranopia");
    const warning = simulate(oklch(0.52, 0.109, 75), "deuteranopia");
    expect(deltaE(overdue, warning)).toBeCloseTo(0.0395, 3);
  });
});

function deltaE(
  a: { lab: readonly [number, number, number] },
  b: { lab: readonly [number, number, number] },
): number {
  return Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
}
```

- [ ] **Step 1.2: Chạy test, xác nhận nó ĐỎ vì đúng lý do**

```bash
bun test apps/staff/src/lib/color-math.test.ts
```

Kỳ vọng: FAIL với `Cannot find module './color-math'`. **Không phải** lỗi cú pháp.

- [ ] **Step 1.3: Viết `color-math.ts`**

Tạo `apps/staff/src/lib/color-math.ts`:

```ts
/**
 * Toán màu cho hàng rào token. KHÔNG có chỗ gọi nào trong code chạy của app —
 * chỉ test dùng — nên nó không vào bundle. Để trong `src/` (không phải thư mục
 * test riêng) vì `index.css` nằm ở `src/` và hàng rào đọc thẳng file đó.
 *
 * ⚠️ ĐỪNG thay module này bằng `getComputedStyle`. Chromium trả về nguyên chuỗi
 * `oklch()` chứ không quy về sRGB, và với `::placeholder` nó trả màu KẾ THỪA —
 * hai cách đều cho ra số sai một cách tự tin. `index.css` đã ghi cả hai bẫy.
 */

/**
 * Dung sai khi hỏi "màu này có nằm ngoài gamut sRGB không".
 *
 * ⚠️ Bản đầu của file này để **±0.002** và biện minh bằng "sai số dấu phẩy động
 * của phép biến đổi". Lý do đó KHÔNG CÓ THẬT — đo trên ba màu sRGB thuần
 * (#FF0000, #00FF00, #0000FF) cho sai lệch lớn nhất **6,7×10⁻⁷**, tức nhỏ hơn
 * 0.002 khoảng ba nghìn lần.
 *
 * Hậu quả không phải lý thuyết: với 0.002, `oklch(52% 0.174 255)` — chính giá
 * trị đợt này đưa ra để SỬA lỗi tràn gamut của accent — có kênh đỏ tuyến tính
 * **−0,001655** và vẫn được báo là trong gamut. Chín token của hệ này rơi vào
 * cùng cái bẫy đó, vì bảng màu được sinh ra bằng chính hàm mang dung sai sai.
 *
 * Dung sai thật sự cần là để chịu **hằng số oklch làm tròn 3–4 chữ số** trong
 * test và tài liệu, không phải để chịu float. `1e-4` tách sạch hai ca:
 *
 *   #FF0000 (hằng số làm tròn)   lệch 0        → không báo tràn ✅
 *   accent 0.174 (tràn thật)     lệch 1,66e-3  → báo tràn      ✅
 *
 * Đây là bài học đắt nhất của đợt này: **công cụ đo cũng phải bị đo.** Chú thích
 * ở đầu file cảnh báo đừng tin `getComputedStyle`, mà chỗ hỏng lại nằm trong
 * chính hàm thay thế nó.
 */
const GAMUT_EPSILON = 1e-4;

export type Vision = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

export interface Color {
  /** sRGB tuyến tính, đã kẹp về [0,1]. */
  readonly rgb: readonly [number, number, number];
  /** OKLab của màu SAU khi kẹp — dùng để đo khoảng cách cảm nhận. */
  readonly lab: readonly [number, number, number];
  /** `true` nếu giá trị trước khi kẹp nằm ngoài gamut sRGB. */
  readonly clipped: boolean;
}

function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** `L` ∈ [0,1] (không phải phần trăm), `C` tuyệt đối, `h` độ. */
export function oklch(L: number, C: number, hDeg: number): Color {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const raw: [number, number, number] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const clipped = raw.some((v) => v < -GAMUT_EPSILON || v > 1 + GAMUT_EPSILON);
  const rgb = raw.map((v) => Math.min(1, Math.max(0, v))) as unknown as [number, number, number];
  return { rgb, lab: linearToOklab(...rgb), clipped };
}

/** Chroma lớn nhất tại (L, h) còn nằm trong gamut sRGB. */
export function maxChroma(L: number, hDeg: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (oklch(L, mid, hDeg).clipped) hi = mid;
    else lo = mid;
  }
  return Math.floor(lo * 1000) / 1000;
}

function relativeLuminance(c: Color): number {
  return 0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2];
}

/** Tỉ lệ tương phản WCAG 2.x. Đối xứng — thứ tự tham số không quan trọng. */
export function contrast(a: Color, b: Color): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Machado, Oliveira & Fernandes 2009, severity 1.0, áp trên sRGB tuyến tính. */
const CVD: Record<Vision, readonly (readonly [number, number, number])[]> = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function simulate(c: Color, vision: Vision): Color {
  const m = CVD[vision];
  const rgb = m.map((row) =>
    Math.min(1, Math.max(0, row[0] * c.rgb[0] + row[1] * c.rgb[1] + row[2] * c.rgb[2])),
  ) as unknown as [number, number, number];
  return { rgb, lab: linearToOklab(...rgb), clipped: c.clipped };
}

/** Khoảng cách cảm nhận trong OKLab. Hai màu dưới 0,12 coi như khó phân biệt. */
export function deltaE(a: Color, b: Color): number {
  return Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
}
```

- [ ] **Step 1.4: Sửa test cho khớp export**

Trong `color-math.test.ts`, xoá hàm `deltaE` viết tay ở cuối file và thêm `deltaE` vào dòng import:

```ts
import { contrast, deltaE, maxChroma, oklch, simulate } from "./color-math";
```

- [ ] **Step 1.5: Chạy test, xác nhận XANH**

```bash
bun test apps/staff/src/lib/color-math.test.ts
```

Kỳ vọng: 10 pass, 0 fail.

- [ ] **Step 1.6: Chứng minh hàng rào thật sự canh — phá nó và xem nó đỏ**

Đổi tạm `0.2126` thành `0.5` trong `relativeLuminance`, chạy lại test. Kỳ vọng: các test hiệu chuẩn
**ĐỎ**. Hoàn tác thay đổi đó. Đây là bước bắt buộc theo `.claude/CLAUDE.md` §4: một test xanh chứng
minh ít hơn vẻ ngoài của nó.

- [ ] **Step 1.7: Commit**

```bash
git add apps/staff/src/lib/color-math.ts apps/staff/src/lib/color-math.test.ts
git commit -m "test(staff): toán màu đo được, hiệu chuẩn bằng số index.css đã công bố"
```

---

## Task 2 — Hàng rào token + sửa ba lỗi màu

**Files:**

- Create: `apps/staff/src/lib/theme-tokens.test.ts`
- Modify: `apps/staff/src/index.css`

- [ ] **Step 2.1: Viết hàng rào TRƯỚC — nó phải đỏ trên token hiện tại**

Tạo `apps/staff/src/lib/theme-tokens.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { contrast, deltaE, oklch, simulate, type Color, type Vision } from "./color-math";

/**
 * Dựng lại bảng §2.4 của `docs/plans/2026-09-01-staff-visual-system-design.md`
 * TỪ CHÍNH `index.css`, mỗi lần chạy test.
 *
 * Không có hàng rào này thì bảng trong design doc là ảnh chụp một thời điểm: ai
 * chỉnh một token là nó sai lặng lẽ, và không có gì kêu. Ba cặp trong bảng KHÔNG
 * CÓ BIÊN (giải ngược đúng từ ngưỡng), nên "lặng lẽ" ở đây nghĩa là trượt AA.
 *
 * Cùng khuôn với `spacing-fence.test.ts`: là test chứ không phải plugin ESLint,
 * vì `bun test` đã nằm sẵn trong CI còn đụng `eslint.config.js` thì kéo theo bốn
 * probe của skill `v9-fences`.
 */
const CSS_PATH = new URL("../index.css", import.meta.url).pathname;

/** Đọc token trong MỘT khối `{...}` — `@theme` cho sáng, `[data-theme="dark"]` cho tối. */
async function readTokens(startMarker: string): Promise<Record<string, Color>> {
  const css = await Bun.file(CSS_PATH).text();
  const start = css.indexOf(startMarker);
  if (start === -1) throw new Error(`Không tìm thấy khối "${startMarker}" trong index.css`);

  // Cắt tới dấu `}` cân bằng đầu tiên sau `{` mở khối.
  let depth = 0;
  let end = -1;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = css.slice(start, end);

  const out: Record<string, Color> = {};
  const re = /--color-([a-z0-9-]+):\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/g;
  for (const m of block.matchAll(re)) {
    out[m[1]] = oklch(Number(m[2]) / 100, Number(m[3]), Number(m[4]));
  }
  return out;
}

/** Cặp phải đạt, khớp bảng §2.4. `[chữ, nền, ngưỡng]`. */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ["ink", "surface", 4.5],
  ["ink", "canvas", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "canvas", 4.5],
  ["ink-soft", "surface", 4.5],
  ["accent", "surface", 4.5],
  ["accent-ink", "accent", 4.5],
  ["accent-ink", "status-overdue", 4.5],
  ["accent-ink", "warning", 4.5],
  ["accent-ink", "status-ongoing", 4.5],
  ["border-strong", "surface", 3],
  ["status-overdue", "status-overdue-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["accent", "accent-soft", 4.5],
];

for (const [themeName, marker] of [
  ["SÁNG", "@theme {"],
  ["TỐI", '[data-theme="dark"] {'],
] as const) {
  describe(`token ${themeName}`, () => {
    it("khai đủ mọi token mà bảng §2.4 tham chiếu", async () => {
      const t = await readTokens(marker);
      const needed = new Set(PAIRS.flatMap(([a, b]) => [a, b]));
      const missing = [...needed].filter((k) => !(k in t));
      expect(missing).toEqual([]);
    });

    it("mọi cặp §2.4 đạt ngưỡng", async () => {
      const t = await readTokens(marker);
      const failures = PAIRS.filter(([fg, bg, need]) => contrast(t[fg], t[bg]) < need).map(
        ([fg, bg, need]) =>
          `${fg}/${bg} = ${contrast(t[fg], t[bg]).toFixed(2)}:1 (cần ${String(need)})`,
      );
      expect(failures).toEqual([]);
    });

    it("không token nào vượt gamut sRGB — token không được nói dối về màu nó vẽ", async () => {
      const t = await readTokens(marker);
      const clipped = Object.entries(t)
        .filter(([, c]) => c.clipped)
        .map(([k]) => k);
      expect(clipped).toEqual([]);
    });

    it("'đang thuê' KHÁC 'hành động chính' — hai nghĩa không dùng chung một màu", async () => {
      const t = await readTokens(marker);
      expect(deltaE(t["status-ongoing"], t.accent)).toBeGreaterThan(0.12);
    });
  });
}

/**
 * Mù màu. Cặp `quá hạn ↔ cảnh báo` là NGOẠI LỆ ĐÃ BIẾT: design doc §2.5 chứng
 * minh bằng quét vét cạn rằng không giá trị màu nào thoả đồng thời "chữ trắng
 * ≥4,5:1" và "ΔE ≥0,12 ở cả bốn kiểu nhìn". Nó được đỡ bằng KÊNH HÌNH DẠNG
 * (`status-icon.test.ts`), không bằng màu.
 *
 * Ngoại lệ ghi tường minh ở đây thay vì bỏ cặp đó ra khỏi danh sách: ngày ai đó
 * tìm được màu tốt hơn, test này sẽ chỉ thẳng vào chỗ cần cập nhật.
 */
const KNOWN_CVD_EXCEPTION = new Set(["status-overdue|warning"]);

describe("mù màu", () => {
  const VISIONS: Vision[] = ["protanopia", "deuteranopia", "tritanopia"];
  const SEMANTIC = ["status-overdue", "warning", "status-ongoing", "accent"] as const;

  it("mọi cặp ngữ nghĩa phân biệt được, trừ ngoại lệ đã ghi", async () => {
    const t = await readTokens("@theme {");
    const bad: string[] = [];
    for (const vision of VISIONS) {
      for (let i = 0; i < SEMANTIC.length; i++) {
        for (let j = i + 1; j < SEMANTIC.length; j++) {
          const key = `${SEMANTIC[i]}|${SEMANTIC[j]}`;
          if (KNOWN_CVD_EXCEPTION.has(key)) continue;
          const d = deltaE(simulate(t[SEMANTIC[i]], vision), simulate(t[SEMANTIC[j]], vision));
          if (d < 0.12) bad.push(`${vision}: ${key} ΔE=${d.toFixed(3)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2.2: Chạy hàng rào trên token HIỆN TẠI — phải ĐỎ**

```bash
bun test apps/staff/src/lib/theme-tokens.test.ts
```

Kỳ vọng FAIL, và **đọc kỹ nội dung fail** — nó phải kể đúng ba lỗi ở design doc §1:

- `border-strong` chưa tồn tại → test "khai đủ token" đỏ
- `accent` vượt gamut → test gamut đỏ
- `status-ongoing` ΔE với `accent` = 0 → test "hai nghĩa" đỏ
- khối `[data-theme="dark"]` chưa có → test theme TỐI đỏ ngay ở `readTokens`

Nếu fail vì lý do khác, dừng lại và đọc lại — hàng rào phải đỏ vì thứ nó sinh ra để canh.

- [ ] **Step 2.3: Sửa khối `@theme` trong `index.css`**

Trong `apps/staff/src/index.css`, thay các dòng token màu trong `@theme { … }` bằng bảng §2.2 của
design doc. **Giữ nguyên mọi chú thích đang có** — chúng chứa lập luận đo đạc — và thêm chú thích cho
ba thay đổi:

```css
/* Bề mặt và chữ. Sáng, không phải nền đen của apps/web: đây là công cụ đọc
     nhiều giờ dưới ánh sáng gara, không phải trang bán hàng.

     Chroma 0.003–0.02 ở hue 255 (KHÔNG phải 0): sắc xanh của logo. Xám tuyệt
     đối làm accent đứng như vật thể lạ dán lên nền; nhuốm nhẹ cùng hue thì cả
     màn hình đọc ra một hệ. Nhìn từng ô riêng gần như không phân biệt được. */
--color-canvas: oklch(98.4% 0.003 255);
--color-surface: oklch(100% 0 255);
--color-surface-sunken: oklch(96.2% 0.005 255);

/* HAI token viền, không phải một.

     SC 1.4.11 đòi 3:1 cho ranh giới CẦN THIẾT để nhận ra một control — nó KHÔNG
     đòi vậy cho đường chia trang trí. Làm đậm mọi viền lên 3:1 biến bảng dữ liệu
     thành lưới kẻ ô nặng trịch, tức chữa một lỗi bằng cách gây một lỗi khác.

     `border` (1,44:1) cho đường chia; `border-strong` (đo được ĐÚNG 3,00:1, giải
     ngược từ ngưỡng) cho viền ô nhập và nút ghost. */
--color-border: oklch(87.8% 0.008 255);
--color-border-strong: oklch(66.9% 0.012 255);

--color-ink: oklch(22% 0.02 255);
--color-ink-soft: oklch(40% 0.016 255);
--color-muted: oklch(52% 0.014 255);

/* ⚠️ Chroma 0.171, KHÔNG phải 0.19.

     Trần gamut sRGB ở L=52%, hue=255 đo được là 0,17124. Ở 0.19 kênh đỏ tuyến tính
     rơi xuống âm và trình duyệt KẸP nó về 0 — token khai một màu, vẽ ra một màu
     khác. Đây đúng là lớp lỗi mà chú thích của nhóm `*-soft` bên dưới đã cảnh
     báo; luật đã có, chỉ là chưa được áp cho token này. */
--color-accent: oklch(52% 0.171 255);
--color-accent-ink: oklch(100% 0 255);
--color-accent-hover: oklch(46% 0.151 255);
--color-accent-active: oklch(40% 0.132 255);

--color-status-booked: oklch(50% 0.09 255);
/* ⚠️ ĐÃ ĐỔI HUE: 255 → 200.

     Trước đợt này token này là oklch(52% 0.19 255) — TRÙNG KHÍT `--color-accent`.
     Tức "đơn đang thuê" và "hành động chính của app" tô cùng một màu, trong một
     app dạy người dùng rằng màu có nghĩa.

     L=55,7% là mức sáng nhất còn đạt 4,5:1 với chữ trắng — giải ngược từ ngưỡng,
     nên nó KHÔNG có biên. Đổi L là trượt AA. */
--color-status-ongoing: oklch(55.7% 0.094 200);
--color-status-overdue: oklch(55% 0.21 27);
--color-status-completed: oklch(42% 0 255);
/* Chroma 0.109 chứ không 0.13: trần gamut ở L=52%, hue=75. Cùng lý do accent. */
--color-warning: oklch(52% 0.109 75);

--color-status-overdue-soft: oklch(96% 0.019 27);
--color-status-booked-soft: oklch(96% 0.019 255);
--color-status-completed-soft: oklch(96% 0 255);
--color-warning-soft: oklch(96% 0.032 75);
--color-accent-soft: oklch(96% 0.019 255);
```

⛔ **KHÔNG được viết `@theme inline`.** `inline` nội suy giá trị thẳng vào utility thay vì tham chiếu
`var()`, nên Task 3 (theme tối) sẽ **im lặng không có tác dụng** — CSS vẫn build, không lỗi ở đâu.

- [ ] **Step 2.4: Thêm khối theme tối vào `@layer base`**

Thêm vào cuối `@layer base { … }` đang có trong `index.css`:

```css
/*
   * ── Theme tối ────────────────────────────────────────────────────────────
   *
   * Ba trạng thái, không phải hai: `data-theme="light"` (ép sáng) ·
   * `data-theme="dark"` (ép tối) · KHÔNG có thuộc tính (theo hệ điều hành).
   *
   * Bảng tối khai HAI LẦN — một trong `@media`, một trong `[data-theme="dark"]`
   * — để nút gạt thắng ở CẢ HAI CHIỀU: máy đang tối mà người dùng chọn sáng thì
   * phải ra sáng, nên khối `@media` phải tự loại mình bằng `:not([data-theme="light"])`.
   *
   * Nền lấy từ chính logo (`public/icon-512.png`: đen–navy cắt chéo), không phải
   * từ một thang xám bất kỳ.
   *
   * ⚠️ Đây KHÔNG phải bản đảo ngược của bảng sáng. Ba chỗ khác về BẢN CHẤT:
   *   • `accent-ink` là màu NỀN, không phải trắng — chữ trắng trên #53a0ff chỉ
   *     đạt ~2,5:1.
   *   • nhóm `*-soft` ở L=30%, không phải L=96%.
   *   • `accent-hover`/`active` SÁNG dần chứ không tối dần — xem chú thích riêng
   *     bên dưới.
   */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --color-canvas: oklch(17.5% 0.022 255);
    --color-surface: oklch(22.5% 0.024 255);
    --color-surface-sunken: oklch(14% 0.02 255);
    --color-border: oklch(32% 0.026 255);
    --color-border-strong: oklch(51.2% 0.03 255);
    --color-ink: oklch(96.5% 0.006 255);
    --color-ink-soft: oklch(82% 0.012 255);
    --color-muted: oklch(70% 0.018 255);
    --color-accent: oklch(70% 0.159 255);
    --color-accent-ink: oklch(17.5% 0.022 255);
    --color-accent-hover: oklch(76% 0.124 255);
    --color-accent-active: oklch(82% 0.091 255);
    --color-status-booked: oklch(68% 0.08 255);
    --color-status-ongoing: oklch(74% 0.12 200);
    --color-status-overdue: oklch(70% 0.17 27);
    --color-status-completed: oklch(66% 0 255);
    --color-warning: oklch(78% 0.14 75);
    --color-status-overdue-soft: oklch(30% 0.05 27);
    --color-status-booked-soft: oklch(30% 0.05 255);
    --color-status-completed-soft: oklch(30% 0 255);
    --color-warning-soft: oklch(30% 0.05 75);
    --color-accent-soft: oklch(30% 0.05 255);
  }
}

/*
   * `accent-hover`/`accent-active` ở theme tối SÁNG dần, không tối dần.
   *
   * Luật cũ trong file này vẫn đúng nguyên văn — "cả hai đều ĐẬM hơn trạng thái
   * thường, nên tương phản chỉ tăng". Điều bất biến thật nằm ở vế cuối: TƯƠNG
   * PHẢN CHỈ ĐƯỢC TĂNG. "Đậm hơn" chỉ là cách vế đó biểu hiện trên nền sáng.
   *
   * Trên nền tối, accent SÁNG hơn nền, nên đậm đi là đi về phía nền. Đo được:
   * làm tối theo đúng bản sáng thì `active` rơi xuống 4,39:1 với chính chữ của
   * nó — TRƯỢT AA. Làm sáng lên: 10,89:1.
   *
   * Chroma giảm dần khi L tăng (0.160 → 0.125 → 0.091) là trần gamut ở từng mức
   * L, không phải lựa chọn thẩm mỹ.
   */
:root[data-theme="dark"] {
  color-scheme: dark;
  /* ⚠️ Chép Y HỆT khối `@media` ở trên. Hai khối phải giữ bằng nhau —
       `theme-tokens.test.ts` đọc khối NÀY, nên khối kia lệch đi sẽ không bị bắt. */
  --color-canvas: oklch(17.5% 0.022 255);
  --color-surface: oklch(22.5% 0.024 255);
  --color-surface-sunken: oklch(14% 0.02 255);
  --color-border: oklch(32% 0.026 255);
  --color-border-strong: oklch(51.2% 0.03 255);
  --color-ink: oklch(96.5% 0.006 255);
  --color-ink-soft: oklch(82% 0.012 255);
  --color-muted: oklch(70% 0.018 255);
  --color-accent: oklch(70% 0.159 255);
  --color-accent-ink: oklch(17.5% 0.022 255);
  --color-accent-hover: oklch(76% 0.124 255);
  --color-accent-active: oklch(82% 0.091 255);
  --color-status-booked: oklch(68% 0.08 255);
  --color-status-ongoing: oklch(74% 0.12 200);
  --color-status-overdue: oklch(70% 0.17 27);
  --color-status-completed: oklch(66% 0 255);
  --color-warning: oklch(78% 0.14 75);
  --color-status-overdue-soft: oklch(30% 0.05 27);
  --color-status-booked-soft: oklch(30% 0.05 255);
  --color-status-completed-soft: oklch(30% 0 255);
  --color-warning-soft: oklch(30% 0.05 75);
  --color-accent-soft: oklch(30% 0.05 255);
}
```

- [ ] **Step 2.5: Thêm test giữ hai khối tối bằng nhau**

Hai khối chép tay giống nhau là nợ có thật. Thêm vào cuối `theme-tokens.test.ts`:

```ts
it("khối @media và khối [data-theme=dark] khai GIỐNG HỆT nhau", async () => {
  const viaAttr = await readTokens('[data-theme="dark"] {');
  const viaMedia = await readTokens(':root:not([data-theme="light"]) {');
  const keys = [...new Set([...Object.keys(viaAttr), ...Object.keys(viaMedia)])].sort();
  const diff = keys.filter(
    (k) => !viaAttr[k] || !viaMedia[k] || contrast(viaAttr[k], viaMedia[k]) !== 1,
  );
  expect(diff).toEqual([]);
});
```

- [ ] **Step 2.6: Chạy hàng rào, xác nhận XANH**

```bash
bun test apps/staff/src/lib/theme-tokens.test.ts
```

Kỳ vọng: 9 pass, 0 fail.

- [ ] **Step 2.7: Toàn bộ test + typecheck**

```bash
bun run typecheck && bun test
```

- [ ] **Step 2.8: Commit**

```bash
git add apps/staff/src/index.css apps/staff/src/lib/theme-tokens.test.ts
git commit -m "fix(staff): accent hết tràn gamut, 'đang thuê' hết trùng accent, tách border-strong

Ba lỗi ĐÃ CÓ SẴN, phát hiện bằng đo chứ không bằng mắt:
- accent oklch(52% 0.19 255) vượt trần gamut 0,171 -> trình duyệt kẹp kênh đỏ về 0
- status-ongoing TRÙNG KHÍT accent: 'đang thuê' và 'hành động chính' cùng màu
- border 1,35:1 dùng cho cả đường chia lẫn viền control -> tách border-strong 3,00:1

Kèm bảng token theme tối và hàng rào dựng lại toàn bộ bảng số từ chính index.css."
```

---

## Task 3 — Cơ chế theme + nút gạt

**Files:**

- Create: `apps/staff/src/lib/theme.ts`, `apps/staff/src/lib/theme.test.ts`
- Create: `apps/staff/src/components/ui/theme-toggle.tsx`
- Modify: `apps/staff/index.html`, `apps/staff/src/components/layout/app-nav.tsx`

- [ ] **Step 3.1: Viết test TRƯỚC**

Tạo `apps/staff/src/lib/theme.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { THEME_STORAGE_KEY, nextChoice, parseChoice, resolveTheme } from "./theme";

describe("parseChoice", () => {
  it("nhận ba giá trị hợp lệ", () => {
    expect(parseChoice("light")).toBe("light");
    expect(parseChoice("dark")).toBe("dark");
    expect(parseChoice("system")).toBe("system");
  });

  it("rơi về 'system' với dữ liệu rác — localStorage là dữ liệu KHÔNG TIN ĐƯỢC", () => {
    expect(parseChoice(null)).toBe("system");
    expect(parseChoice("")).toBe("system");
    expect(parseChoice("Dark")).toBe("system");
    expect(parseChoice('{"a":1}')).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("lựa chọn tường minh THẮNG hệ điều hành ở cả hai chiều", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("'system' đi theo hệ điều hành", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("nextChoice — vòng ba trạng thái", () => {
  it("system → light → dark → system", () => {
    expect(nextChoice("system")).toBe("light");
    expect(nextChoice("light")).toBe("dark");
    expect(nextChoice("dark")).toBe("system");
  });
});

describe("khoá lưu trữ", () => {
  it("khớp CHÍNH XÁC khoá mà script trong index.html dùng", () => {
    // Script chống nháy trắng trong `index.html` chép tay khoá này — nó chạy
    // TRƯỚC khi bundle tải, nên không import được từ đây. Test này là sợi dây
    // duy nhất giữ hai chỗ bằng nhau.
    expect(THEME_STORAGE_KEY).toBe("v9-theme");
  });
});
```

- [ ] **Step 3.2: Chạy, xác nhận đỏ vì thiếu module**

```bash
bun test apps/staff/src/lib/theme.test.ts
```

Kỳ vọng: FAIL `Cannot find module './theme'`.

- [ ] **Step 3.3: Viết `theme.ts`**

```ts
/**
 * Lựa chọn theme của người dùng. BA trạng thái, không phải hai — "theo hệ điều
 * hành" là một lựa chọn riêng, không phải sự vắng mặt của lựa chọn.
 *
 * Quyết định A của design doc §3: mặc định SÁNG (giữ lập luận "đọc nhiều giờ
 * dưới ánh sáng gara" đã ghi trong `index.css`), người dùng ghi đè được.
 */
export type ThemeChoice = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

/** ⚠️ Script chống nháy trắng trong `index.html` chép tay chuỗi này. Đổi thì đổi cả hai. */
export const THEME_STORAGE_KEY = "v9-theme";

const CHOICES: readonly string[] = ["light", "dark", "system"];

/** `localStorage` là dữ liệu không tin được: người dùng sửa được, bản cũ ghi được. */
export function parseChoice(raw: string | null): ThemeChoice {
  return raw !== null && CHOICES.includes(raw) ? (raw as ThemeChoice) : "system";
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): EffectiveTheme {
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
}

export function nextChoice(current: ThemeChoice): ThemeChoice {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

/** sRGB của `--color-canvas` từng theme. Manifest và thẻ meta không đọc được biến CSS. */
const CANVAS_HEX: Record<EffectiveTheme, string> = { light: "#f8fafc", dark: "#0a111a" };

export function readChoice(): ThemeChoice {
  try {
    return parseChoice(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Safari chế độ riêng tư ném khi đọc `localStorage`. Không có lựa chọn lưu
    // được thì đi theo hệ điều hành — đúng mặc định.
    return "system";
  }
}

export function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* không lưu được thì thôi — theme của phiên này vẫn đúng */
  }

  // Thanh trạng thái của trình duyệt / PWA. Thuộc tính `media` của thẻ
  // `theme-color` chỉ theo được HỆ ĐIỀU HÀNH, không theo được lựa chọn tay —
  // nên khi người dùng ép theme, phải cập nhật bằng script.
  const effective = resolveTheme(choice, matchMedia("(prefers-color-scheme: dark)").matches);
  document
    .querySelector('meta[name="theme-color"]:not([media])')
    ?.setAttribute("content", CANVAS_HEX[effective]);
}
```

- [ ] **Step 3.4: Chạy test, xác nhận xanh**

```bash
bun test apps/staff/src/lib/theme.test.ts
```

Kỳ vọng: 9 pass.

- [ ] **Step 3.5: Script chống nháy trắng trong `index.html`**

Trong `apps/staff/index.html`, thay thẻ `<meta name="theme-color" …>` hiện tại bằng:

```html
<!--
      Ba thẻ, và cả ba đều cần thiết:

      • Hai thẻ có `media` phục vụ trường hợp THEO HỆ ĐIỀU HÀNH — trình duyệt tự
        chọn, không cần script, nên chúng đúng ngay cả trước khi bundle tải.
      • Thẻ KHÔNG có `media` là thứ `applyChoice()` (src/lib/theme.ts) ghi đè khi
        người dùng ép theme bằng tay; `media` không diễn đạt được "người dùng đã
        chọn", chỉ diễn đạt được "hệ điều hành đang ở chế độ nào".

      Giá trị là sRGB của `--color-canvas` từng theme (src/index.css). Manifest
      trong `vite.config.ts` cũng chép tay `#f8fafc` — đổi canvas SÁNG thì phải
      đổi cả ba chỗ.
    -->
<meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0a111a" media="(prefers-color-scheme: dark)" />
<meta name="theme-color" content="#f8fafc" />
<!--
      Chống nháy trắng. PHẢI là script ĐỒNG BỘ trong `<head>`, chạy trước khung
      hình đầu tiên. Đặt việc này trong React là muộn: người dùng thấy một nháy
      sáng mỗi lần mở app, và trên PWA khởi động lạnh thì rất rõ.

      Chép tay khoá "v9-theme" vì script này chạy TRƯỚC khi bundle tải nên không
      import được. `theme.test.ts` là sợi dây giữ hai chỗ bằng nhau.
    -->
<script>
  try {
    var c = localStorage.getItem("v9-theme");
    if (c === "light" || c === "dark") document.documentElement.setAttribute("data-theme", c);
  } catch (e) {
    /* Safari riêng tư ném khi đọc localStorage — đi theo hệ điều hành */
  }
</script>
```

- [ ] **Step 3.6: Cập nhật `vite.config.ts`**

Đổi `background_color` và `theme_color` trong manifest từ `"#fafafa"` thành `"#f8fafc"` (canvas sáng
mới), và cập nhật chú thích ngay trên nó cho khớp giá trị.

- [ ] **Step 3.7: Viết `ui/theme-toggle.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icon";
import { applyChoice, nextChoice, readChoice, type ThemeChoice } from "../../lib/theme";

/**
 * ⚠️ `ui/` KHÔNG được biết domain — component này chỉ biết theme, không biết
 * `Me` hay `StaffRole`.
 *
 * MỘT nút xoay vòng ba trạng thái, không phải ba nút radio: nó nằm ở chân
 * sidebar cạnh "Đổi mật khẩu"/"Đăng xuất", nơi mỗi hàng là một hành động. Nhãn
 * luôn nói trạng thái HIỆN TẠI, không nói trạng thái kế tiếp — "Giao diện: Tối"
 * đọc được một mình, còn "Chuyển sang sáng" thì bắt người đọc suy ngược.
 */
const LABEL: Record<ThemeChoice, string> = {
  system: "Theo máy",
  light: "Sáng",
  dark: "Tối",
};

const ICON: Record<ThemeChoice, IconName> = {
  system: "monitor",
  light: "sun",
  dark: "moon",
};

export function ThemeToggle({ className = "" }: { readonly className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  // Đọc trong effect chứ không trong `useState(readChoice)`: `readChoice` chạm
  // `localStorage`, và giữ khởi tạo state thuần thì component render được ở bất
  // kỳ đâu không có DOM. Script trong `index.html` đã đặt `data-theme` đúng từ
  // trước khung hình đầu, nên không có nháy dù state ở đây bắt đầu là "system".
  useEffect(() => {
    setChoice(readChoice());
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = nextChoice(choice);
        setChoice(next);
        applyChoice(next);
      }}
      className={className}
    >
      <Icon name={ICON[choice]} />
      <span className="flex-1 text-left">Giao diện: {LABEL[choice]}</span>
    </button>
  );
}
```

- [ ] **Step 3.8: Thêm ba icon vào `ui/icon.tsx`**

Thêm vào dòng import từ `lucide-react`: `Monitor`, `Moon`, `Sun`. Thêm vào `ICONS`:

```ts
  /** Nút gạt theme — trạng thái "theo hệ điều hành". */
  monitor: Monitor,
  /** Nút gạt theme — ép sáng. */
  sun: Sun,
  /** Nút gạt theme — ép tối. */
  moon: Moon,
```

- [ ] **Step 3.9: Gắn nút gạt vào `app-nav.tsx`**

Trong `SidebarNav`, thêm ngay **trên** link "Đổi mật khẩu":

```tsx
<ThemeToggle className={`${TOUCH} gap-2 rounded-card px-3 text-ink hover:bg-canvas`} />
```

Trong `BottomNav`, thêm ở cùng vị trí trong khối chân của sheet **Thêm**, dùng đúng chuỗi class đó.
Thêm `import { ThemeToggle } from "../ui/theme-toggle";` ở đầu file.

- [ ] **Step 3.10: Kiểm bằng mắt trên bản BUILD**

```bash
bun run --filter @v9/staff build && bun run --filter @v9/staff preview
```

Kiểm đủ bốn điều — `vite dev` **không** kiểm được vì PWA không chạy ở đó:

1. Gạt qua ba trạng thái, mỗi lần tải lại trang: lựa chọn còn nguyên, **không có nháy trắng**.
2. Đổi theme của hệ điều hành khi đang ở "Theo máy": app đổi theo ngay.
3. Đang ở "Theo máy" + hệ điều hành tối → chọn "Sáng": app ra **sáng** (khối `@media` phải tự loại).
4. Thanh địa chỉ đổi màu theo theme.

- [ ] **Step 3.11: Typecheck + test + commit**

```bash
bun run typecheck && bun test
git add apps/staff/src/lib/theme.ts apps/staff/src/lib/theme.test.ts \
        apps/staff/src/components/ui/theme-toggle.tsx apps/staff/src/components/ui/icon.tsx \
        apps/staff/src/components/layout/app-nav.tsx apps/staff/index.html apps/staff/vite.config.ts
git commit -m "feat(staff): theme sáng/tối theo hệ điều hành, có nút gạt, không nháy trắng"
```

---

## Task 4 — Icon thành kênh thông tin thứ hai

⛔ **Đọc design doc §2.5 trước khi làm task này.** Đây không phải việc trang trí: `quá hạn` và
`cảnh báo` đo được ΔE≈0,040 dưới deuteranopia, và quét vét cạn chứng minh **không giá trị màu nào**
sửa được. Icon là kênh duy nhất còn lại.

**Files:**

- Create: `apps/staff/src/lib/status-icon.test.ts`
- Modify: `apps/staff/src/lib/rental-status.ts`, `apps/staff/src/components/ui/icon.tsx`,
  `apps/staff/src/components/ui/alert.tsx`, `apps/staff/src/components/stats/attention-list.tsx`

- [ ] **Step 4.1: Viết hàng rào hình dạng TRƯỚC**

Tạo `apps/staff/src/lib/status-icon.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { RENTAL_STATUSES } from "@v9/shared/domain/rental";
import { STATUS_ICON } from "./rental-status";

/**
 * Hàng rào cho phần GIẢM THIỂU của design doc §2.5.
 *
 * `theme-tokens.test.ts` ghi nhận một ngoại lệ mù màu đã biết (`quá hạn` ↔
 * `cảnh báo`, không sửa được bằng màu). Ngoại lệ đó chỉ chấp nhận được CHỪNG NÀO
 * kênh hình dạng còn nguyên. Test này canh đúng điều kiện đó — bỏ nó đi thì
 * ngoại lệ kia thành một lỗ tiếp cận không ai canh.
 */
describe("kênh hình dạng của trạng thái", () => {
  it("mọi trạng thái đơn thuê đều có icon", () => {
    const missing = RENTAL_STATUSES.filter((s) => !(s in STATUS_ICON));
    expect(missing).toEqual([]);
  });

  it("không hai trạng thái nào dùng chung một icon", () => {
    const names = Object.values(STATUS_ICON);
    expect(new Set(names).size).toBe(names.length);
  });

  it("hai trạng thái phái sinh cũng có icon riêng", () => {
    // `isOverdue` và `isPickupOverdue` là hai TÌNH HUỐNG khác nhau (xe đang
    // ngoài đường quá hạn vs chưa ai lấy xe) đòi hai phản ứng ngược nhau. Chúng
    // không nằm trong `RENTAL_STATUSES` nhưng vẫn phải phân biệt được bằng hình.
    expect(STATUS_ICON.OVERDUE).toBeDefined();
    expect(STATUS_ICON.PICKUP_OVERDUE).toBeDefined();
    expect(STATUS_ICON.OVERDUE).not.toBe(STATUS_ICON.PICKUP_OVERDUE);
  });
});
```

- [ ] **Step 4.2: Chạy, xác nhận đỏ**

```bash
bun test apps/staff/src/lib/status-icon.test.ts
```

Kỳ vọng: FAIL — `STATUS_ICON` chưa được export từ `rental-status.ts`.

- [ ] **Step 4.3: Thêm `STATUS_ICON` vào `rental-status.ts`**

Thêm vào cuối `apps/staff/src/lib/rental-status.ts` (giữ nguyên toàn bộ logic màu đang có):

```ts
import type { IconName } from "../components/ui/icon";

/**
 * Kênh thông tin THỨ HAI, bên cạnh màu. Không phải trang trí.
 *
 * `docs/plans/2026-09-01-staff-visual-system-design.md` §2.5 đo được: dưới
 * deuteranopia (~6% nam giới), `status-overdue` và `warning` chỉ cách nhau
 * ΔE≈0,040 — coi như cùng một màu. Một cuộc quét vét cạn L∈[0,50;0,80] ×
 * hue∈[60;105] cho kết quả RỖNG: không giá trị nào thoả đồng thời "chữ trắng
 * ≥4,5:1" và "phân biệt được ở cả bốn kiểu nhìn". Hai ràng buộc chọi nhau.
 *
 * Nên hình dạng phải gánh phần màu không gánh nổi. Chọn theo ĐỘ KHÁC NHAU CỦA
 * HÌNH (tam giác / tròn / vuông / dấu kiểm), không theo mức dễ thương của biểu
 * tượng — chúng phải phân biệt được khi màu biến mất hoàn toàn.
 *
 * `status-icon.test.ts` canh tính duy nhất. Đừng để hai trạng thái dùng chung
 * một hình, kể cả khi hai hình đó "gần nghĩa".
 */
export const STATUS_ICON = {
  BOOKED: "nav-calendar",
  ONGOING: "nav-handover",
  COMPLETED: "check",
  CANCELLED: "close",
  /** ONGOING quá `endsAt` — xe đang ngoài đường, quá hạn trả. Tam giác. */
  OVERDUE: "alert-triangle",
  /** BOOKED quá `startsAt` — chưa ai lấy xe. Tròn. */
  PICKUP_OVERDUE: "clock",
} as const satisfies Record<string, IconName>;
```

- [ ] **Step 4.4: Thêm icon còn thiếu vào `ui/icon.tsx`**

Thêm vào import từ `lucide-react`: `AlertTriangle`, `CalendarCheck`, `Clock`, `Info`. Thêm vào
`ICONS`:

```ts
  /** Quá hạn trả — xe đang ngoài đường. Tam giác: hình cảnh báo mạnh nhất. */
  "alert-triangle": AlertTriangle,
  /** Chưa ai lấy xe. Tròn — khác hẳn tam giác kể cả khi mất màu. */
  clock: Clock,
  /** Phải trả hôm nay. */
  "calendar-check": CalendarCheck,
  /** Tone `info` của Alert. */
  info: Info,
```

- [ ] **Step 4.5: Chạy hàng rào, xác nhận xanh**

```bash
bun test apps/staff/src/lib/status-icon.test.ts
```

Kỳ vọng: 3 pass.

- [ ] **Step 4.6: `Alert` mang icon theo tone**

Trong `apps/staff/src/components/ui/alert.tsx`, thêm map và đổi phần render:

```tsx
/**
 * Icon theo tone. Trước đó ba tone chỉ khác nhau bằng MÀU — tức thông tin đi
 * bằng đúng một kênh, trượt SC 1.4.1, và người mù màu đỏ–lục không phân biệt
 * được `error` với `warning`. Đây cùng một lớp lỗi mà §2.5 của design doc đo
 * được trên chip trạng thái.
 */
const TONE_ICON: Record<AlertTone, IconName> = {
  error: "alert-triangle",
  warning: "clock",
  info: "info",
};
```

Đổi thân component thành:

```tsx
return (
  <p
    role={liveMode === "assertive" ? "alert" : "status"}
    aria-live={liveMode}
    className={`flex items-start gap-2 rounded-card p-3 text-sm ${TONE[tone]}`}
  >
    <Icon name={TONE_ICON[tone]} className="mt-0.5" />
    <span className="flex-1">{children}</span>
  </p>
);
```

Thêm `import { Icon, type IconName } from "./icon";` ở đầu file.

- [ ] **Step 4.7: `AttentionList` — chấm thành hình theo loại việc**

Trong `apps/staff/src/components/stats/attention-list.tsx`, đổi interface `Row`: thay
`dotClassName: string` bằng hai trường:

```ts
interface Row {
  readonly key: string;
  readonly label: string;
  readonly to: "/calendar" | "/staff";
  readonly icon: IconName;
  readonly className: string;
}
```

Ba chỗ `rows.push` đổi tương ứng:

```ts
      icon: "alert-triangle",
      className: "text-status-overdue",
```

```ts
      icon: "calendar-check",
      className: "text-warning",
```

```ts
      icon: "nav-staff",
      className: "text-accent",
```

Trong JSX, thay `<StatusDot className={row.dotClassName} />` bằng
`<Icon name={row.icon} className={row.className} />`, và bỏ `StatusDot` khỏi import.

> **Vì sao đổi:** ba dòng này hiện dùng **cùng một hình tròn**, chỉ khác màu — và hai dòng đầu là
> đúng cặp màu đo được ΔE≈0,040 dưới deuteranopia. Chúng nằm **cạnh nhau** trên màn hình.

- [ ] **Step 4.8: Kiểm bằng mắt + typecheck + test**

```bash
bun run typecheck && bun test
bun run --filter @v9/staff dev
```

Mở `/`, xác nhận ba dòng "Cần chú ý" có ba hình khác nhau. Chụp màn hình rồi mở bằng công cụ mô phỏng
mù màu của DevTools (Rendering → Emulate vision deficiencies → Deuteranopia): hai dòng đầu **vẫn phân
biệt được**.

- [ ] **Step 4.9: Commit**

```bash
git add apps/staff/src/lib/rental-status.ts apps/staff/src/lib/status-icon.test.ts \
        apps/staff/src/components/ui/icon.tsx apps/staff/src/components/ui/alert.tsx \
        apps/staff/src/components/stats/attention-list.tsx
git commit -m "fix(staff): trạng thái mang hình dạng riêng, không chỉ màu riêng

Đo được: 'quá hạn' và 'cảnh báo' cách nhau ΔE≈0,040 dưới deuteranopia — coi như
cùng màu, và hai dòng đó nằm CẠNH NHAU trong 'Cần chú ý'. Quét vét cạn cho kết
quả rỗng: không giá trị màu nào thoả cả hai ràng buộc. Nên hình gánh phần màu
không gánh nổi."
```

---

## Task 4b — Icon trạng thái trên **thanh đơn của lịch**

> **Vì sao có task này:** Task 4 land xong thì `STATUS_ICON` chỉ có **một** chỗ gọi trong app
> (`attention-list.tsx`, và chỉ khoá `.OVERDUE`). Bốn khoá còn lại chưa render ở đâu. Plan gốc định
> đóng lỗ đó bằng `components/rentals/status-chip.tsx` cho hai bảng khách hàng — **đó là lời giải sai
> cho vấn đề đúng.**

### Đo lại chỗ nào thật sự thủng

| Chỗ                                                         | Kênh đang có                                                                         | Kết luận                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `customer-table.tsx:210` · `customer-rental-history.tsx:89` | màu + **nhãn chữ nhìn thấy được** (`STATUS_LABEL`)                                   | **Đủ.** Chữ là kênh thứ hai hợp lệ. Icon ở đây là trang trí. |
| `calendar-timeline.tsx:189-199`                             | màu + chữ, nhưng chữ là **`customerName`**; trạng thái chỉ ở `title=` + `aria-label` | ⛔ **Thủng**                                                 |
| `calendar-month.tsx:205-207`                                | màu + chữ, nhưng chữ là **tên xe**; trạng thái chỉ ở `title=` + `aria-label`         | ⛔ **Thủng**                                                 |

`aria-label` phục vụ trình đọc màn hình — đủ. `title=` **không bao giờ bắn khi chạm**, mà đây là PWA
dùng trên điện thoại trong gara. Nên với người dùng **nhìn thấy, dùng chạm, mù màu**, trạng thái trên
lịch đi bằng **màu và chỉ màu**. Đây đúng là chỗ critique 2026-09-01 chấm Recognition 2/10.

Cặp nguy hiểm cụ thể: `quá hạn` (đỏ **đặc**) ↔ `đã trả` (xám **đặc**) — ΔE **0,073** dưới protanopia,
cả hai nền đặc nên **cách tô không tách được**, và cả hai đều xuất hiện trên lịch. (`đã đặt` ↔
`đang thuê` ở 0,077 thì **không** cần lo: cách tô viền-vs-đặc sống sót qua mọi kiểu mù màu.)

### Phạm vi

**Files:**

- Modify: `apps/staff/src/lib/rental-status.ts` — thêm `statusIconOf(rental, now): IconName`
- Modify: `apps/staff/src/components/rentals/calendar-timeline.tsx`
- Modify: `apps/staff/src/components/rentals/calendar-month.tsx`

**Không đụng** hai bảng khách hàng — chúng đã có nhãn chữ. **Không tạo** `status-chip.tsx`; nó bị bỏ
khỏi plan vì hai chỗ định dùng nó không cần nó.

- [ ] **Step 4b.1: Viết test cho `statusIconOf` TRƯỚC**

Nó phải suy ra hai trạng thái **phái sinh** đúng như `rentalChipClass` đang làm — dùng chung
`isOverdue`/`isPickupOverdue` của `@v9/shared/domain/rental`, **không** định nghĩa lại:

```ts
import { describe, expect, it } from "bun:test";
import { STATUS_ICON, statusIconOf } from "./rental-status";

const NOW = new Date("2026-09-10T00:00:00+07:00");
const at = (d: string) => new Date(`${d}T00:00:00+07:00`);

describe("statusIconOf — hình phải khớp CÙNG luật với màu", () => {
  it("ONGOING quá hạn trả → OVERDUE, không phải ONGOING", () => {
    const r = { status: "ONGOING" as const, startsAt: at("2026-09-01"), endsAt: at("2026-09-05") };
    expect(statusIconOf(r, NOW)).toBe(STATUS_ICON.OVERDUE);
  });

  it("BOOKED quá giờ lấy → PICKUP_OVERDUE, không phải BOOKED", () => {
    const r = { status: "BOOKED" as const, startsAt: at("2026-09-05"), endsAt: at("2026-09-20") };
    expect(statusIconOf(r, NOW)).toBe(STATUS_ICON.PICKUP_OVERDUE);
  });

  it("ONGOING chưa tới hạn → ONGOING", () => {
    const r = { status: "ONGOING" as const, startsAt: at("2026-09-05"), endsAt: at("2026-09-20") };
    expect(statusIconOf(r, NOW)).toBe(STATUS_ICON.ONGOING);
  });

  it("COMPLETED → COMPLETED, không bị luật quá hạn cướp", () => {
    const r = {
      status: "COMPLETED" as const,
      startsAt: at("2026-09-01"),
      endsAt: at("2026-09-05"),
    };
    expect(statusIconOf(r, NOW)).toBe(STATUS_ICON.COMPLETED);
  });
});
```

⚠️ Ca cuối là ca dễ sai nhất: `COMPLETED` có `endsAt` trong quá khứ, nên một cách viết ngây thơ sẽ
gán nó thành `OVERDUE`. `isOverdue` của shared đã lọc theo `status === "ONGOING"` — **dùng lại nó**.

- [ ] **Step 4b.2: Chạy, xác nhận đỏ vì thiếu export** (`statusIconOf` chưa tồn tại), không phải lỗi cú pháp.

- [ ] **Step 4b.3: Viết `statusIconOf`**, đặt ngay dưới `STATUS_ICON` trong `rental-status.ts`. Nhận
      cùng hình dạng structural mà `rentalChipClass` nhận (`{ status, startsAt, endsAt }`) để hai
      hàm không bao giờ bất đồng về "quá hạn là gì".

- [ ] **Step 4b.4: Chạy, xác nhận xanh.**

- [ ] **Step 4b.5: Render icon trên thanh timeline** (`calendar-timeline.tsx:188-199`).

  Dùng `<Icon name={statusIconOf(rental, now)} size="sm" />` — **`size="sm"` (12px)**, cùng cỡ
  dấu "còn tiếp" đã có trong thanh. Đặt **trước** `customerName`, trong cùng `flex gap-1`.

  ⚠️ Thanh đơn hẹp và `customerName` đang `truncate`. Icon `shrink-0` (đã có sẵn trong `Icon`)
  nên nó không bị bóp; chỗ nhường là tên khách. Đó là đánh đổi đúng: tên khách còn đọc được một
  phần vẫn hữu ích, còn trạng thái sai màu thì vô dụng hoàn toàn.

- [ ] **Step 4b.6: Render icon trên chip tháng** (`calendar-month.tsx:205-207`), cùng cách.

- [ ] **Step 4b.7: Kiểm mắt trên bản BUILD**, ở 390px và 1440px, cả hai chế độ lịch:
  1. Mỗi thanh/chip có icon, và icon **khớp màu** (thanh đỏ đặc phải mang tam giác).
  2. DevTools → Rendering → **Achromatopsia** (phép thử nặng nhất): hai thanh `quá hạn` và
     `đã trả` **vẫn phân biệt được**.
  3. Tên khách vẫn đọc được ở thanh hẹp nhất — chụp màn hình chỗ hẹp nhất tìm được.

- [ ] **Step 4b.8: Commit** — `feat(staff): thanh đơn trên lịch mang hình trạng thái, không chỉ màu`

---

## Task 5 — Token chuyển động + trạng thái nền

> ⛔ **Bẫy do Task 3 để lại — đọc trước khi viết dòng CSS đầu tiên.**
>
> App nay có nút gạt theme đổi **22 biến màu cùng lúc**. Nếu `--duration-*`/`--ease-*` được gắn vào
> một transition màu **diện rộng** (`*`, `body`, hay `:root`), mỗi lần gạt sẽ **cross-fade cả
> trang** — trong khi `color-scheme` đổi **tức thì**. Kết quả: nửa giây giao diện lai, thanh cuộn và
> control gốc đã đổi màu còn nền thì đang bò.
>
> Hai lời giải, chọn một và ghi lý do:
>
> 1. **Không** đưa `--color-*` vào bất kỳ transition toàn cục nào — chỉ animate màu ở phần tử cụ thể
>    (nút, hàng), đúng như §4.3 của design doc đã quy định.
> 2. Nếu vẫn muốn transition rộng: thêm một class `theme-switching` do `applyChoice` bật/tắt quanh
>    lúc đổi, và `transition: none !important` khi nó có mặt.
>
> Design doc §4.3 đã nghiêng về (1) — "chỉ animate `background-color`/`border-color` ở
> `--duration-instant` trên phần tử đơn". Đây là ghi chú để việc đó là một **quyết định**, không phải
> một chỗ may mà không đụng tới.

**Files:**

- Modify: `apps/staff/src/index.css`, `apps/staff/src/components/ui/button.tsx`

- [ ] **Step 5.1: Thêm token chuyển động vào `@theme`**

```css
/*
   * ── Chuyển động ──────────────────────────────────────────────────────────
   *
   * Luận điểm: chuyển động ở đây tồn tại để CHỨNG MINH CÓ CHUYỆN VỪA XẢY RA,
   * không để trang trí. Lỗi P0 nặng nhất theo bản critique 2026-09-01 là ảnh
   * chụp màn hình ngay sau khi tạo đơn thành công TRÙNG KHÍT TỪNG BYTE với ảnh
   * trước đó — app làm xong việc mà không nói gì.
   *
   * Trần CỨNG 400ms. App này được dùng hàng trăm lần mỗi ca; hoạt ảnh dài là
   * thuế thu ở mỗi lần dùng. Vào chậm hơn ra: thứ người dùng vừa gọi ra phải
   * tới nhanh, thứ họ vừa bỏ đi phải biến mất nhanh hơn nữa.
   */
--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
--ease-standard: cubic-bezier(0.2, 0, 0, 1);

--duration-instant: 120ms;
--duration-quick: 180ms;
--duration-panel: 280ms;
```

- [ ] **Step 5.2: Thêm khối reduced-motion vào `@layer base`**

```css
/*
   * Bỏ ĐƯỜNG ĐI, giữ ĐÍCH ĐẾN. Bỏ hẳn hiệu ứng là lấy mất thông tin của đúng
   * người đã bật cờ này.
   *
   * `1ms` chứ không `0s`: với `0s` một số trình duyệt KHÔNG bắn
   * `transitionend`/`animationend`, và bất kỳ logic nào chờ sự kiện đó sẽ treo.
   *
   * ⚠️ Quét toàn cục này KHÔNG đủ một mình. Xung "vừa đổi" ở `rental-detail-sheet`
   * có bản thay thế riêng (nền tô nhạt giữ 2s) — xem chú thích ở đó. Không có
   * nó thì người bật cờ quay lại đúng lỗi P0 mô tả ở `@theme`.
   */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5.3: `Button` — thêm transition**

Trong `apps/staff/src/components/ui/button.tsx`, đổi hằng `BASE`:

```ts
const BASE =
  "inline-flex min-h-11 items-center justify-center rounded-card px-4 text-sm font-semibold transition-[background-color,border-color] duration-instant ease-standard disabled:cursor-not-allowed disabled:opacity-50";
```

> Chỉ animate `background-color` và `border-color` — hai thứ sinh paint chứ không sinh layout.
> **Không** thêm `transform` cho nút: nút nằm trong hàng bảng và trong sheet, và một nút nhích lên
> khi rê chuột làm hàng bên cạnh trông như bị lệch.

- [ ] **Step 5.4: Hàng bấm được — `AttentionList`**

Trong `attention-list.tsx`, đổi hằng `ROW`:

```ts
const ROW =
  "flex min-h-11 items-center justify-between gap-3 rounded-card px-3 text-sm text-ink transition-colors duration-instant ease-standard hover:bg-canvas";
```

- [ ] **Step 5.5: Kiểm reduced-motion**

```bash
bun run --filter @v9/staff dev
```

DevTools → Rendering → **Emulate `prefers-reduced-motion: reduce`**. Rê chuột lên nút và hàng: màu
vẫn đổi, chỉ **không có** quãng chuyển. Đây là điều đúng — mất chuyển động, không mất phản hồi.

- [ ] **Step 5.6: Typecheck + test + commit**

```bash
bun run typecheck && bun test
git add apps/staff/src/index.css apps/staff/src/components/ui/button.tsx \
        apps/staff/src/components/stats/attention-list.tsx
git commit -m "feat(staff): token chuyển động + trạng thái nền, tôn trọng prefers-reduced-motion"
```

---

## Task 6 — Modal vào/ra

⛔ **Đây là chỗ dễ hỏng nhất của cả plan.** `ui/modal.tsx` dùng `<dialog>` gốc + `showModal()`.
Animate nó **không** phải chuyện thêm một dòng `transition`.

**Files:**

- Modify: `apps/staff/src/components/ui/modal.tsx`

- [ ] **Step 6.1: Thêm CSS cho lớp phủ vào `index.css`, trong `@layer base`**

```css
/*
   * ── Hiệu ứng vào/ra của `<dialog>` ───────────────────────────────────────
   *
   * BA thứ, thiếu một là hỏng theo ba kiểu khác nhau — và cả ba đều hỏng ÂM
   * THẦM, CSS vẫn build:
   *
   *   • `@starting-style` — thiếu thì KHÔNG CÓ hiệu ứng vào. Phần tử vừa được
   *     tạo không có giá trị cũ để nội suy từ đó; khối này cấp giá trị đó.
   *   • `display … allow-discrete` — thiếu thì `display: none` áp ngay lập tức
   *     và hiệu ứng RA bị cắt cụt, không thấy gì.
   *   • `overlay … allow-discrete` — thiếu thì dialog rơi khỏi top layer trước
   *     khi chạy xong hiệu ứng ra, và panel NHẢY XUỐNG dưới lớp mờ một khung hình.
   *
   * Ba hướng vào khác nhau theo `data-placement`, vì hướng phải khớp nơi panel
   * neo: sheet trượt lên từ đáy là quy ước gốc của điện thoại; hộp thoại giữa
   * màn thì phóng nhẹ. Dùng chung một hướng cho cả ba là chỗ dễ làm ẩu nhất.
   */
dialog[open] {
  transition:
    opacity var(--duration-panel) var(--ease-enter),
    display var(--duration-panel) allow-discrete,
    overlay var(--duration-panel) allow-discrete;
  opacity: 1;
}
@starting-style {
  dialog[open] {
    opacity: 0;
  }
}
dialog:not([open]) {
  opacity: 0;
  transition-duration: var(--duration-quick);
  transition-timing-function: var(--ease-exit);
}

dialog[open] > [data-panel] {
  transition: transform var(--duration-panel) var(--ease-enter);
  transform: none;
}
@starting-style {
  dialog[open] > [data-panel][data-placement="bottom"],
  dialog[open] > [data-panel][data-placement="adaptive"] {
    transform: translateY(100%);
  }
  dialog[open] > [data-panel][data-placement="top"] {
    transform: translateY(-12px);
  }
}
/* Từ 640px, `adaptive` chuyển sang hộp thoại giữa màn — vào bằng phóng nhẹ,
     không trượt: nó không neo vào cạnh nào để mà trượt tới. */
@media (width >= 40rem) {
  @starting-style {
    dialog[open] > [data-panel][data-placement="adaptive"] {
      transform: scale(0.98);
    }
  }
}
```

- [ ] **Step 6.2: Gắn thuộc tính vào panel trong `modal.tsx`**

Trên `<div ref={panelRef} …>`, thêm hai thuộc tính:

```tsx
        data-panel=""
        data-placement={placement}
```

> Dùng thuộc tính `data-*` chứ không phải class Tailwind: ba hướng vào khác nhau cần
> `@starting-style`, mà đó là at-rule — không diễn đạt được bằng utility. Selector thuộc tính giữ
> toàn bộ luật ở một chỗ trong `index.css`, cạnh chú thích giải thích ba cái bẫy.

- [ ] **Step 6.3: Kiểm trên bản BUILD**

```bash
bun run --filter @v9/staff build && bun run --filter @v9/staff preview
```

Kiểm cả ba lớp phủ, ở **cả hai** bề rộng (390px và 1440px):

1. Sheet **Thêm** (bottom nav, <768px) — trượt lên từ đáy.
2. Sheet chi tiết đơn (chạm thanh trên lịch) — trượt lên ở 390px, **phóng nhẹ** ở 1440px.
3. Form lên đơn (nút `+ Lên đơn`) — rơi xuống nhẹ từ trên.

Rồi đóng từng cái và xác nhận: **hiệu ứng ra chạy hết**, panel **không nhảy xuống** dưới lớp mờ ở
khung hình cuối. Nếu nó nhảy → thiếu `overlay … allow-discrete`.

- [ ] **Step 6.4: Kiểm bàn phím không hỏng**

Với mỗi lớp phủ: mở bằng bàn phím, xác nhận `Esc` vẫn đóng, Tab vẫn bị bẫy trong panel, và tiêu điểm
vẫn trả về nút đã mở nó. Hiệu ứng **không được** đụng tới bốn hành vi mà `showModal()` cấp.

- [ ] **Step 6.5: Commit**

```bash
git add apps/staff/src/index.css apps/staff/src/components/ui/modal.tsx
git commit -m "feat(staff): lớp phủ có hiệu ứng vào/ra theo vị trí neo

<dialog> cần @starting-style + allow-discrete cho display VÀ overlay — thiếu cái
thứ ba thì panel nhảy xuống dưới lớp mờ ở khung hình cuối."
```

---

## Task 7 — Khoảnh khắc được dàn dựng: bàn giao xe

Đây là **một** khoảnh khắc được dàn dựng của cả đợt, và là thứ trực tiếp chữa lỗi P0.

**Files:**

- Modify: `apps/staff/src/index.css`, `apps/staff/src/components/rentals/rental-detail-sheet.tsx`

- [ ] **Step 7.1: Thêm animation "vừa đổi" vào `index.css`**

```css
/*
   * ── Khoảnh khắc được dàn dựng: đơn vừa đổi trạng thái ────────────────────
   *
   * Nhân viên bấm `Đã giao xe`: `handed_over_at` được đặt, đơn chuyển
   * BOOKED → ONGOING, xe rời cửa hàng, và doanh thu thôi đứng ở 0 ₫ — bốn thứ
   * xảy ra cùng lúc ở bốn chỗ khác nhau. Critique đo được rằng hành động này
   * hiện KHÔNG sinh phản hồi nào.
   *
   * Vòng sáng chạy trên `::after` với `transform`/`opacity`, KHÔNG dùng
   * `box-shadow`: phần tử này nằm trong danh sách, tức thuộc nhóm lặp lại.
   *
   * Chạy MỘT nhịp rồi tắt. Vòng xung lặp mãi là một lời cảnh báo, không phải
   * một lời xác nhận.
   */
@keyframes v9-just-changed {
  from {
    opacity: 0.55;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.04);
  }
}

@utility just-changed {
  position: relative;
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--color-accent-soft);
    pointer-events: none;
    animation: v9-just-changed 600ms var(--ease-exit) 1 both;
  }
}

/*
   * Bản thay thế cho reduced-motion — BẮT BUỘC, không phải tuỳ chọn.
   *
   * Quét toàn cục ở trên biến animation thành 1ms, tức vòng sáng biến mất hoàn
   * toàn. Nếu dừng ở đó thì người bật cờ này quay lại ĐÚNG lỗi P0 ban đầu: app
   * làm xong việc mà không nói gì. Nền tô giữ 2s nói cùng một điều mà không cần
   * chuyển động nào.
   */
@media (prefers-reduced-motion: reduce) {
  .just-changed::after {
    animation: none;
    opacity: 0.55;
    transition: opacity 1ms linear 2s;
  }
  .just-changed[data-settled]::after {
    opacity: 0;
  }
}
```

- [ ] **Step 7.2: Gắn vào `rental-detail-sheet.tsx`**

Trong `RentalDetailSheet`, thêm state đánh dấu vừa đổi và gắn class lên hàng trạng thái:

```tsx
/**
 * Đơn vừa đổi trạng thái trong phiên này. Dùng để chạy vòng sáng MỘT nhịp —
 * xem `@utility just-changed` ở `index.css` và design doc §4.1.
 *
 * State cục bộ chứ không suy từ dữ liệu: "vừa đổi" là một sự kiện của phiên
 * làm việc này, không phải một thuộc tính của đơn. Tải lại trang thì nó biến
 * mất, và đó là đúng.
 */
const [justChanged, setJustChanged] = useState(false);
```

Trong `onSuccess` của mutation `change`, thêm `setJustChanged(true);`.

Trên phần tử bọc chip trạng thái trong JSX, thêm:

```tsx
        className={justChanged ? "just-changed" : undefined}
```

- [ ] **Step 7.3: Kiểm bằng tay**

```bash
bun run --filter @v9/staff dev
```

Tạo một đơn, mở sheet chi tiết từ lịch, bấm `Đã giao xe`. Xác nhận:

1. Chip đổi **cả hình lẫn màu** (`nav-calendar` → `nav-handover`, viền → nền đặc).
2. Vòng sáng chạy **đúng một nhịp** rồi tắt.
3. Bật `prefers-reduced-motion: reduce` trong DevTools, làm lại: **nền tô vẫn hiện** rồi tự tắt —
   không mất phản hồi.

- [ ] **Step 7.4: Typecheck + test + commit**

```bash
bun run typecheck && bun test
git add apps/staff/src/index.css apps/staff/src/components/rentals/rental-detail-sheet.tsx
git commit -m "feat(staff): bàn giao xe có phản hồi thị giác — chữa lỗi P0 'không có gì đổi'"
```

---

## Task 8 — Dọn component

**Files:**

- Modify: `apps/staff/src/pages/staff-list-page.tsx`, `apps/staff/src/pages/health-page.tsx`

- [ ] **Step 8.1: Bỏ `<main>` lồng nhau**

`AppShell` (`components/layout/app-shell.tsx`) đã bọc `children` trong **một** `<main>`. Hai trang
này lồng thêm một cái nữa — hai landmark cho cùng một nội dung, và cộng dồn padding của cả hai lớp.
Hệ quả đo được: `h1` cao **40px** ở `/staff` so với **16px** ở `/customers`.

Ở cả hai file, đổi `<main …>` ngoài cùng thành `<div className="flex flex-col gap-4">` và bỏ các class
`min-h-screen`/`page-gutter`/`py-*` của nó — `AppShell` đã lo cả ba.

> Luật này viết rõ trong chú thích của **bốn** file khác (`stats-page.tsx:19-21`,
> `customers-list-page.tsx:86`, `calendar-page.tsx:9`, `customer-detail-page.tsx:44`) và bị phá ở hai
> file này.

- [ ] **Step 8.2: Kiểm bằng đo, không bằng mắt**

```bash
bun run --filter @v9/staff dev
```

Trong DevTools console, ở `/staff` rồi ở `/customers`:

```js
getComputedStyle(document.querySelector("h1")).fontSize;
```

Hai giá trị phải **bằng nhau**. Và `document.querySelectorAll("main").length` phải bằng `1` ở mọi
trang.

- [ ] **Step 8.3: Commit**

```bash
git add apps/staff/src/pages/staff-list-page.tsx apps/staff/src/pages/health-page.tsx
git commit -m "fix(staff): bỏ <main> lồng nhau ở /staff và /health

h1 đo được 40px ở /staff so với 16px ở /customers — hai landmark cho cùng nội
dung, và padding cộng dồn hai lớp."
```

---

## Task 9 — 🚦 Gate impeccable

**Đây là gate, không phải một bước dọn dẹp.** Không task nào trước đó được coi là xong cho tới khi
gate này xanh. Nếu gate tìm ra lỗi, **quay lại sửa ở task sở hữu nó** rồi chạy lại gate.

- [ ] **Step 9.1: Hook detector phải sạch**

Hook design của impeccable chạy tự động sau mỗi lần sửa file UI. Đọc lại output của nó cho mọi file
đã đụng ở Task 2–8. Bất kỳ finding nào chưa xử lý → xử lý bây giờ.

- [ ] **Step 9.2: Chụp màn hình có hệ thống**

Trên bản **build** (`build` + `preview`), chụp **mọi** màn ở **bốn** tổ hợp:

|          | 390×844 | 1440×900 |
| -------- | ------- | -------- |
| **sáng** | ✓       | ✓        |
| **tối**  | ✓       | ✓        |

Màn phải chụp: `/` · `/calendar` (cả `timeline` và `month`) · `/customers` · `/customers/:id` ·
`/requests` · `/staff` · `/login` · `/signup` · `/forgot-password` · `/change-password` ·
`/pending-approval` · sheet chi tiết đơn · form lên đơn · sheet Thêm.

Chụp **một loạt**, không phải mỗi lần một tấm — craft floor của impeccable yêu cầu kiểm theo vòng
gộp, không phải vòng lặp mở.

- [ ] **Step 9.3: Chạy audit**

```
/impeccable audit apps/staff
```

Nó kiểm những thứ hàng rào test **không** kiểm được: tương phản trên nội dung thật, khoảng cách đã
tính toán, đo dòng chữ, thứ tự tiêu điểm bàn phím, hành vi responsive.

- [ ] **Step 9.3b: Hai món nợ đã biết, đã định vị — xác nhận rồi sửa trong đợt gộp**

Hai chỗ dưới đây được tìm ra trong Task 8b, cùng **một lớp lỗi** với thứ Task 8b vừa dọn, nhưng cần
một quyết định nên để lại cho đợt sửa gộp của gate:

1. **`pages/fallback-pages.tsx` — `<main>` lồng nhau trên đường lỗi.** `NotFoundPage` và
   `RouteErrorPage` dùng `ui/page-shell.tsx` (khung dành cho trang đứng **ngoài** `AppShell`), mà
   chúng được gắn làm **mặc định của router**, nên chúng render tại chính route đã hỏng. Đo được:
   `/customers/id-sai/sau` → **`main = 2`, `nav = 2`**.

   Chú thích trong chính file đó biện minh `PageShell` cho ca **chưa đăng nhập** — và biện minh đó
   **đúng**. Nên lời giải không phải đổi `PageShell`, mà là **hai fallback**: bản đứng ngoài shell
   giữ nguyên, cộng một bản trong-shell (`<div>`) đăng ký ở `protectedLayoutRoute`. TanStack Router
   cho khai `notFoundComponent`/`errorComponent` theo từng route.

   `RoutePendingPage` đã là `<div>` trần — không đụng.

2. ✅ **ĐÃ XONG** (`69702e3`) — `BEAT_MS = 600` (TSX) và `600ms` (`@utility`) nay có hàng rào
   `motion-budget.test.ts` canh, cùng với trần 400ms. Giữ mục này để gate biết là đã đóng.

   ~~**`BEAT_MS = 600` (TSX) và `600ms` (`@utility` trong `index.css`) khớp nhau bằng tay.**~~ Lệch một
   trong hai thì vòng sáng hoặc bị cắt giữa chừng, hoặc sheet đóng trước khi nó chạy xong. Chú thích
   đã nói ra, nhưng **không có gì ép**. Cân nhắc một test đọc cả hai chỗ — cùng khuôn
   `theme.test.ts` đang giữ khoá `localStorage` khớp giữa `theme.ts` và `index.html`.

- [ ] **Step 9.4: Bốn thứ phải tự kiểm, vì test không bắt được**

1. **Theme tối trên nội dung thật** — hàng rào chỉ đo cặp token. Nó **không** biết một chuỗi class ở
   đâu đó hard-code `bg-white`. Quét: `grep -rn "bg-white\|text-black\|bg-gray\|border-gray" apps/staff/src`
   phải ra **rỗng**.
2. **Ảnh chụp trước/sau khi bàn giao phải KHÁC NHAU** — đây chính là lỗi P0. Chụp `/` trước và sau,
   so bằng `md5sum`. Hai giá trị **phải khác**.
3. **Không có mục Layout nào khi chạy hiệu ứng** — Performance panel lúc mở/đóng modal và lúc cuộn
   bảng khách hàng. Có `Layout`/`Recalculate Style` nghĩa là ngân sách §4.3 bị phá.
4. **CPU throttle 4×** — mô phỏng điện thoại rẻ tiền trong gara. Hiệu ứng vẫn phải mượt.

- [ ] **Step 9.5: Sửa hết finding rồi chạy lại đúng MỘT vòng**

Gộp mọi sửa thành một đợt, rồi chụp lại một vòng để xác nhận. **Dừng ở đó** — craft floor cấm vòng
lặp mở: "build fully, inspect once with a batched round, fix everything it shows in one batch,
confirm with at most one more round, and stop polishing."

- [ ] **Step 9.6: Commit cuối**

```bash
git add -u apps/staff
git commit -m "polish(staff): sửa các finding của gate impeccable"
```

---

## Task 10 — Đồng bộ tài liệu

Ba chỗ tài liệu đang trôi (design doc §9), cộng hai chỗ đợt này làm cũ đi.

- [ ] **Step 10.1: Sửa `docs/workspaces/staff.md`**

| Đang ghi                                                       | Sửa thành                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/index.css` **cố ý không khai `@theme` riêng**             | khai đầy đủ từ đợt Plan B; đợt 2026-09-01 thêm bảng theme tối và token chuyển động          |
| `public/icon-{192,512}.png` hiện là **ô màu đặc**              | logo mô tô thật, land 2026-09-01                                                            |
| `impeccable: audit nhẹ, **không polish trừ khi được yêu cầu**` | đã được yêu cầu và đã chạy 2026-09-01; xem `docs/plans/2026-09-01-staff-visual-system-*.md` |

- [ ] **Step 10.2: Sửa chú thích trong `apps/staff/index.html`**

Chú thích cạnh `apple-touch-icon` vẫn ghi _"File đang trỏ tới vẫn là ô màu đặc … chờ logo thật của
shop"_. Sai từ 2026-09-01. Thay bằng ghi chú rằng logo đã có, và giữ nguyên phần giải thích **vì sao
thẻ này cần thiết** (iOS không đọc `icons` của manifest) — đó vẫn đúng và vẫn đáng giữ.

- [ ] **Step 10.3: Sửa chú thích trong `ui/skeleton.tsx`**

Nó khai _"`animate-pulse` là animation DUY NHẤT trong app, nên đây cũng là chỗ duy nhất phải tôn
trọng `prefers-reduced-motion`"_. Sai sau Task 5. Thay bằng con trỏ tới khối reduced-motion toàn cục
ở `index.css`.

- [ ] **Step 10.4: Cập nhật `docs/ROADMAP.md`**

Thêm mục "đã xong" cho đợt này, và **gỡ** dòng _"Icon thật cho `apps/staff` — `public/icon-{192,512}.png`
đang là ô màu đặc"_ khỏi nhóm "chặn ở người". Nó đã xong.

> ⚠️ **Không** gỡ mục "màu accent của `DESIGN.md`" — mục đó nói về `apps/web` và **vẫn đang chặn**.
> Logo đã land được vẽ TỪ `--color-accent` của `apps/staff`, không phải rút RA TỪ nhận diện thật của
> shop. Màu thương hiệu thật vẫn chưa có.

- [ ] **Step 10.5: Commit**

```bash
git add docs/workspaces/staff.md docs/ROADMAP.md apps/staff/index.html \
        apps/staff/src/components/ui/skeleton.tsx
git commit -m "docs: đồng bộ tài liệu với hệ thị giác mới của apps/staff"
```

---

## Self-review của plan

**Phủ design doc:**

| Mục design doc                          | Task    |
| --------------------------------------- | ------- |
| §1.1 accent tràn gamut                  | 2       |
| §1.2 `status-ongoing` trùng accent      | 2       |
| §1.3 tách `border-strong`               | 2       |
| §2.1–2.4 bảng token hai theme           | 2       |
| §2.3b `accent-hover`/`active` đảo chiều | 2       |
| §2.5 mù màu + kênh hình dạng            | 4       |
| §3 cơ chế theme + bốn cái bẫy           | 3       |
| §4.2 token chuyển động                  | 5       |
| §4.4 bảng kê tám chỗ                    | 5, 6, 7 |
| §4.5 bẫy `<dialog>`                     | 6       |
| §4.6 reduced-motion                     | 5, 7    |
| §5 icon                                 | 3, 4    |
| §6 component                            | 4, 8    |
| §7 cách kiểm chứng → test hàng rào      | 1, 2, 4 |
| §9 tài liệu trôi                        | 10      |

**Lỗ đã biết, cố ý để lại:**

- §6 mục 1 ("hai hệ thiết kế song song — `auth/*` và `staff/*` bỏ qua `ui/`") **không có task**. Đó
  là một đợt refactor riêng chạm 6 file form; gộp vào đây làm plan này không land nổi từng phần. Ghi
  vào `docs/DEBT.md` thay vì làm dở.
- §4.4 mục 5 (skeleton → nội dung) và mục 7 (badge) chưa có task riêng — chúng rẻ và nên gộp vào
  Task 5 nếu còn thời gian, nhưng không phải điều kiện để gate xanh.

**Thứ tự bắt buộc:** 1 → 2 → 3 và 1 → 2 → 4 (hàng rào phải có trước khi đổi token). 5 → 6 → 7 (token
chuyển động trước khi dùng). 9 sau tất cả. 10 bất cứ lúc nào sau 8.
