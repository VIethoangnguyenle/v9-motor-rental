import { describe, expect, it } from "bun:test";
import { formatVnd, roundVnd } from "./money";

describe("formatVnd", () => {
  it("định dạng theo kiểu Việt Nam, dấu chấm ngăn nhóm nghìn", () => {
    expect(formatVnd(1_200_000)).toBe("1.200.000 ₫");
  });

  it("số 0 vẫn ra chuỗi hợp lệ", () => {
    expect(formatVnd(0)).toBe("0 ₫");
  });

  it("số âm giữ dấu trừ, dùng cho hoàn cọc", () => {
    expect(formatVnd(-500_000)).toBe("-500.000 ₫");
  });

  it("ném lỗi khi nhận số không nguyên — VND không có đơn vị phụ", () => {
    expect(() => formatVnd(1000.5)).toThrow("VND phải là số nguyên");
  });
});

describe("roundVnd", () => {
  it("làm tròn nửa lên", () => {
    expect(roundVnd(1000.5)).toBe(1001);
  });

  it("làm tròn nửa lên kể cả với số âm", () => {
    expect(roundVnd(-1000.5)).toBe(-1000);
  });

  it("số đã nguyên thì giữ nguyên", () => {
    expect(roundVnd(1000)).toBe(1000);
  });
});
