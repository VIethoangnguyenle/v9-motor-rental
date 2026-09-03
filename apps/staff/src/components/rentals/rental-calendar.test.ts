import { describe, expect, it } from "bun:test";
import { dayCountForWidth } from "./rental-calendar";

describe("dayCountForWidth", () => {
  it("đo BỀ RỘNG VÙNG LƯỚI, không phải bề rộng cửa sổ", () => {
    // Ca thật đã đo: cửa sổ 1280px nhưng sidebar ăn ~258px nên lưới chỉ có 1022.
    // Hàm cũ hỏi matchMedia trên cửa sổ → trả 14 ngày cho một chỗ chứa được 10.
    expect(dayCountForWidth(1022)).toBe(10);
  });

  it("ba ngưỡng", () => {
    expect(dayCountForWidth(360)).toBe(7);
    expect(dayCountForWidth(767)).toBe(7);
    expect(dayCountForWidth(768)).toBe(10);
    expect(dayCountForWidth(1279)).toBe(10);
    expect(dayCountForWidth(1280)).toBe(14);
  });
});
