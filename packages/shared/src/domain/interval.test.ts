import { describe, expect, it } from "bun:test";
import { overlaps, type Interval } from "./interval";

const iv = (start: string, end: string): Interval => ({
  start: new Date(start),
  end: new Date(end),
});

describe("overlaps — nửa khoảng [start, end)", () => {
  it("hai khoảng rời nhau thì không chồng", () => {
    expect(overlaps(iv("2026-01-01", "2026-01-05"), iv("2026-01-10", "2026-01-15"))).toBe(false);
  });

  it("chồng một phần thì có", () => {
    expect(overlaps(iv("2026-01-01", "2026-01-10"), iv("2026-01-05", "2026-01-15"))).toBe(true);
  });

  it("khoảng này nằm trọn trong khoảng kia thì có", () => {
    expect(overlaps(iv("2026-01-01", "2026-01-31"), iv("2026-01-10", "2026-01-12"))).toBe(true);
  });

  it("chạm đầu-đuôi thì KHÔNG chồng — biên phải là mở", () => {
    expect(overlaps(iv("2026-01-01", "2026-01-05"), iv("2026-01-05", "2026-01-10"))).toBe(false);
  });

  it("đối xứng: đổi thứ tự tham số cho cùng kết quả", () => {
    const a = iv("2026-01-01", "2026-01-10");
    const b = iv("2026-01-05", "2026-01-15");
    expect(overlaps(a, b)).toBe(overlaps(b, a));
  });

  it("khoảng rỗng không chồng với bất cứ gì", () => {
    expect(overlaps(iv("2026-01-05", "2026-01-05"), iv("2026-01-01", "2026-01-10"))).toBe(false);
  });

  it("ném lỗi khi end đứng trước start", () => {
    expect(() => overlaps(iv("2026-01-10", "2026-01-01"), iv("2026-01-01", "2026-01-05"))).toThrow(
      "end phải >= start",
    );
  });
});
