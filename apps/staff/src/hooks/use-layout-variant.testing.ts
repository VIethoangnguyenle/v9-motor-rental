import { act } from "@testing-library/react";
import { LAYOUT_QUERIES } from "./use-layout-variant";

/**
 * Stub `window.matchMedia` theo BỀ RỘNG, dùng chung cho mọi test cần ép một
 * hình dạng layout.
 *
 * Vì sao có file này thay vì mỗi test tự stub — ba lý do đã cắn thật:
 *
 *  1. **Ngưỡng chép tay đi lạc.** `use-layout-variant.test.ts`,
 *     `staff-table.test.tsx` và `rental-list.test.tsx` từng mỗi file một bản sao
 *     của `"(min-width: 768px)"`, và comment ở hai file tự ghi rằng đổi ngưỡng ở
 *     hook mà quên đổi ở đây thì test SAI ÂM. Ở đây thì không chép: đọc thẳng
 *     `LAYOUT_QUERIES`.
 *  2. **Stub một query thì query kia rơi xuống happy-dom.** Happy-dom mặc định
 *     rộng 1024, nên `(min-width: 1024px)` KHỚP — một test muốn ép `"mobile"`
 *     nhận về `"desktop"` mà không thấy lý do. Đây là cách hai ca của
 *     `staff-table.test.tsx` đỏ lúc hook lên hai ngưỡng.
 *  3. **`window.matchMedia` là global CẢ TIẾN TRÌNH `bun test`** (`preload` chỉ
 *     init module một lần). Không trả lại bản gốc thì stub của file chạy sau
 *     cùng còn nguyên cho mọi file test khác — kể cả file không liên quan gì tới
 *     layout. `restoreViewport()` trong `afterEach` là bắt buộc, không phải dọn
 *     dẹp cho gọn.
 *
 * Query KHÔNG phải dạng `(min-width: Npx)` — `prefers-color-scheme`,
 * `prefers-reduced-motion` mà `lib/theme.ts` và `rental-detail-sheet.tsx` dùng —
 * rơi về bản gốc happy-dom, nguyên vẹn.
 */
const MIN_WIDTH = /^\(min-width:\s*(\d+)px\)$/;

const original = window.matchMedia.bind(window);
const listeners = new Map<string, Set<() => void>>();
let width = 0;

/** Bề rộng của mỗi giá trị `LayoutVariant`, đủ xa ngưỡng để không kiểm nhầm mép. */
export const VIEWPORT = { mobile: 390, tablet: 834, desktop: 1440 } as const;

export function stubViewport(px: number): void {
  width = px;
  listeners.clear();
  window.matchMedia = ((q: string) => {
    const min = MIN_WIDTH.exec(q);
    if (min === null) return original(q);
    const threshold = Number(min[1]);
    return {
      get matches() {
        return width >= threshold;
      },
      media: q,
      addEventListener(_event: string, cb: () => void) {
        const set = listeners.get(q) ?? new Set();
        set.add(cb);
        listeners.set(q, set);
      },
      removeEventListener(_event: string, cb: () => void) {
        listeners.get(q)?.delete(cb);
      },
    };
  }) as unknown as typeof window.matchMedia;
}

/**
 * Đổi bề rộng rồi báo cho listener của những query THẬT SỰ đổi trạng thái khớp.
 *
 * ⚠️ Phép lọc "query này có đổi không" là phần KHÔNG được bỏ, dù trông như chi
 * tiết thừa. Bản đầu bắn mọi listener trong map, và khi đó nó che mất đúng lỗi
 * mà ca "vượt ngưỡng lg" sinh ra để bắt: rút `subscribe` của hook về mỗi ngưỡng
 * tablet vẫn XANH, vì listener của ngưỡng đó được gọi hộ. Đo bằng đột biến, không
 * phải suy ra. `matchMedia` thật chỉ phát `change` cho query đổi trạng thái, nên
 * một stub rộng tay hơn thực tế là một stub nói dối.
 */
export function resizeViewport(px: number): void {
  act(() => {
    const before = width;
    width = px;
    for (const [q, set] of listeners) {
      const threshold = Number(MIN_WIDTH.exec(q)?.[1]);
      if (before >= threshold === px >= threshold) continue;
      for (const cb of set) cb();
    }
  });
}

export function restoreViewport(): void {
  window.matchMedia = original;
  listeners.clear();
}

/** Bảng ngưỡng ↔ hình dạng, để test bảng-hoá khỏi phải tự suy. */
export const VARIANT_AT = [
  [375, "mobile"],
  [Number(MIN_WIDTH.exec(LAYOUT_QUERIES.tablet)?.[1]) - 1, "mobile"],
  [Number(MIN_WIDTH.exec(LAYOUT_QUERIES.tablet)?.[1]), "tablet"],
  [Number(MIN_WIDTH.exec(LAYOUT_QUERIES.desktop)?.[1]) - 1, "tablet"],
  [Number(MIN_WIDTH.exec(LAYOUT_QUERIES.desktop)?.[1]), "desktop"],
  [1440, "desktop"],
] as const;
