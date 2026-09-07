import { describe, expect, it, afterEach } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useLayoutVariant } from "./use-layout-variant";
import {
  restoreViewport,
  resizeViewport,
  stubViewport,
  VARIANT_AT,
} from "./use-layout-variant.testing";

describe("useLayoutVariant", () => {
  afterEach(restoreViewport);

  for (const [px, expected] of VARIANT_AT) {
    it(`${String(px)}px → ${expected}`, () => {
      stubViewport(px);
      expect(renderHook(() => useLayoutVariant()).result.current).toBe(expected);
    });
  }

  /**
   * Ca này KHÔNG có ở bản một-ngưỡng, và nó là ca duy nhất bắt được lỗi rút
   * `subscribe` về mỗi ngưỡng tablet: giữa 800px và 1200px thì
   * `(min-width: 768px)` khớp ở CẢ HAI phía, nên nó không phát `change` — chỉ
   * `(min-width: 1024px)` phát. Bỏ query thứ hai khỏi `subscribe` thì hook kẹt ở
   * `"tablet"` cho tới lần render kế tiếp vì lý do khác, và mọi ca bảng ở trên
   * vẫn xanh. Đã kiểm bằng đột biến: bỏ query đó → đúng ca này đỏ, một mình.
   */
  it("vượt ngưỡng desktop thì cập nhật, không kẹt ở tablet", () => {
    stubViewport(800);
    const { result } = renderHook(() => useLayoutVariant());
    expect(result.current).toBe("tablet");

    resizeViewport(1200);
    expect(result.current).toBe("desktop");

    resizeViewport(800);
    expect(result.current).toBe("tablet");
  });

  it("lần vẽ ĐẦU đã đúng, không phải sửa ở lần vẽ sau", () => {
    stubViewport(1440);
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
