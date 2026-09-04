import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useLayoutVariant } from "./use-layout-variant";

// Ngưỡng thật của hook, xem `use-layout-variant.ts` (không export, nên lặp lại
// nguyên văn ở đây — đổi ngưỡng ở hook mà quên đổi ở đây thì test này SAI ÂM,
// không phải điều tệ nhất nhưng đáng biết).
const MD_QUERY = "(min-width: 768px)";

// `window.matchMedia` là global CẢ TIẾN TRÌNH `bun test` (`preload` chỉ init
// module một lần) — không lưu lại bản gốc và trả về thì stub của file chạy
// SAU CÙNG còn nguyên cho mọi file test khác chạy sau nó, kể cả những test
// không liên quan gì tới layout variant. `lib/theme.ts`, `app-nav.tsx`,
// `rental-detail-sheet.tsx` đều gọi `matchMedia` với query KHÁC — stub chỉ
// khớp đúng `MD_QUERY`, mọi query khác rơi về bản gốc của happy-dom.
const originalMatchMedia = window.matchMedia.bind(window);

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) =>
    q === MD_QUERY
      ? {
          matches,
          media: q,
          addEventListener() {},
          removeEventListener() {},
        }
      : originalMatchMedia(q)) as unknown as typeof window.matchMedia;
}

describe("useLayoutVariant", () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

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
    // Bảo đảm HÀNH VI: không có "mobile" lọt vào lần vẽ đầu rồi mới đổi. KHÔNG
    // khoá cách triển khai — mutation-test đo được: một `useState(() =>
    // compute())` lazy-init + effect chỉ để subscribe cũng qua trót lọt cả ba
    // test của file này y hệt `useSyncExternalStore`. Test này chỉ bắt được
    // đúng biến thể `useEffect`+`useState` NGÂY THƠ (mặc định "mobile" rồi mới
    // sửa ở effect). Lý do chọn `useSyncExternalStore` là một quyết định kiến
    // trúc ghi ở `use-layout-variant.ts`, không phải thứ bài test này xác nhận.
    expect(seen).not.toContain("mobile");
  });
});
