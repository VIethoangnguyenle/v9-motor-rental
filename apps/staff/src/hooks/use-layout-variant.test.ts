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
