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
