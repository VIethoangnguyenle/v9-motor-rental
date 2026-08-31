import { describe, expect, it } from "bun:test";
import { shouldResyncSearchText, validateCustomersSearch } from "./customers-search";

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

describe("shouldResyncSearchText", () => {
  /**
   * Bug thật: Back/Forward của trình duyệt trong khi `CustomersListPage`
   * KHÔNG unmount chỉ đổi `q` từ URL, không chạm `searchText` state. Thiếu
   * đồng bộ này, effect debounce thấy `searchText` cũ khác `q` mới rồi ghi
   * giá trị CŨ ngược lại URL — đá hỏng chính nút Back. Ca này mô phỏng đúng
   * repro: gõ "nguyen" (lastQ đuổi theo thành "nguyen"), rồi Back về `q=""`.
   */
  it("q đổi từ bên ngoài (Back/Forward) → phải đồng bộ", () => {
    expect(shouldResyncSearchText("", "nguyen")).toBe(true);
    expect(shouldResyncSearchText("nguyen", "")).toBe(true);
  });

  it("q không đổi (vd. chỉ đổi page khi phân trang) → không đồng bộ", () => {
    expect(shouldResyncSearchText("nguyen", "nguyen")).toBe(false);
    expect(shouldResyncSearchText("", "")).toBe(false);
  });
});
