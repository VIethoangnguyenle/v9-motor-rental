import { describe, expect, it } from "bun:test";
import { effectiveMode, validateRentalsSearch } from "./rentals-search";

describe("validateRentalsSearch", () => {
  it("mặc định là hàng đợi, trang 1, không lọc gì", () => {
    expect(validateRentalsSearch({})).toEqual({ mode: "queue", q: "", page: 1, from: "", to: "" });
  });

  it("mode lạ rơi về hàng đợi, không throw", () => {
    expect(validateRentalsSearch({ mode: "xyz" }).mode).toBe("queue");
  });

  it("page lạ rơi về 1", () => {
    expect(validateRentalsSearch({ page: "abc" }).page).toBe(1);
    expect(validateRentalsSearch({ page: 0 }).page).toBe(1);
    expect(validateRentalsSearch({ page: 2.5 }).page).toBe(1);
  });

  it("chỉ nhận ngày đúng khuôn YYYY-MM-DD", () => {
    expect(validateRentalsSearch({ from: "2026-09-04" }).from).toBe("2026-09-04");
    expect(validateRentalsSearch({ from: "04/09/2026" }).from).toBe("");
    expect(validateRentalsSearch({ from: 20260904 }).from).toBe("");
  });
});

describe("effectiveMode", () => {
  const base = { mode: "queue", q: "", page: 1, from: "", to: "" } as const;

  it("có từ khoá ⇒ luôn là sổ cái, kể cả khi mode đang là hàng đợi", () => {
    expect(effectiveMode({ ...base, q: "bảo" })).toBe("ledger");
  });

  it("khoảng trắng không tính là từ khoá", () => {
    expect(effectiveMode({ ...base, q: "   " })).toBe("queue");
  });
});
