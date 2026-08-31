import { describe, expect, it } from "bun:test";
import { validateCustomersSearch } from "./customers-search";

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
