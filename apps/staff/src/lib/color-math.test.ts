import { describe, expect, it } from "bun:test";
import { contrast, deltaE, maxChroma, oklch, simulate } from "./color-math";

/**
 * Hiệu chuẩn: hàm đo phải tái lập ĐÚNG những con số `index.css` đã công bố từ
 * đợt token trước. Không hiệu chuẩn thì mọi số mới là số của một hàm chưa ai
 * kiểm — và `index.css` đã ghi rõ một parser sai cho ra 16,69:1 cho cặp thật
 * ra là 4,38:1.
 *
 * Giá trị dưới đây là token CŨ (trước đợt này), cố ý — đó là điều làm chúng
 * thành mốc hiệu chuẩn độc lập.
 */
describe("color-math — hiệu chuẩn theo số đã công bố trong index.css", () => {
  it("accent cũ trên canvas cũ = 5,31:1", () => {
    const accent = oklch(0.52, 0.19, 255);
    const canvas = oklch(0.984, 0, 0);
    expect(contrast(accent, canvas)).toBeCloseTo(5.31, 1);
  });

  it("accent cũ trên surface = 5,56:1", () => {
    expect(contrast(oklch(0.52, 0.19, 255), oklch(1, 0, 0))).toBeCloseTo(5.56, 1);
  });

  it("muted cũ trên surface = 5,49:1", () => {
    expect(contrast(oklch(0.52, 0, 0), oklch(1, 0, 0))).toBeCloseTo(5.49, 1);
  });

  it("muted cũ trên canvas cũ = 5,26:1", () => {
    expect(contrast(oklch(0.52, 0, 0), oklch(0.984, 0, 0))).toBeCloseTo(5.26, 1);
  });

  it("border cũ trên surface = 1,35:1 — con số critique đo được", () => {
    expect(contrast(oklch(0.9, 0, 0), oklch(1, 0, 0))).toBeCloseTo(1.35, 1);
  });
});

describe("color-math — gamut", () => {
  it("phát hiện accent cũ oklch(52% 0.19 255) VƯỢT gamut sRGB", () => {
    expect(oklch(0.52, 0.19, 255).clipped).toBe(true);
  });

  it("accent mới oklch(52% 0.171 255) nằm TRONG gamut", () => {
    expect(oklch(0.52, 0.171, 255).clipped).toBe(false);
  });

  it("maxChroma đồng ý với hai khẳng định trên", () => {
    expect(maxChroma(0.52, 255)).toBeGreaterThanOrEqual(0.171);
    expect(maxChroma(0.52, 255)).toBeLessThan(0.174);
  });
});

describe("color-math — mô phỏng mù màu", () => {
  it("không đổi gì ở kiểu nhìn thường", () => {
    const c = oklch(0.55, 0.21, 27);
    const sim = simulate(c, "normal");
    expect(sim.rgb[0]).toBeCloseTo(c.rgb[0], 5);
    expect(sim.rgb[1]).toBeCloseTo(c.rgb[1], 5);
    expect(sim.rgb[2]).toBeCloseTo(c.rgb[2], 5);
  });

  it("giữ trắng gần như trắng ở cả ba kiểu mù màu — hàng ma trận CVD cộng ≈ 1, bắt lỗi gõ", () => {
    const white = oklch(1, 0, 0);
    for (const vision of ["protanopia", "deuteranopia", "tritanopia"] as const) {
      const sim = simulate(white, vision);
      expect(sim.rgb[0]).toBeCloseTo(1, 4);
      expect(sim.rgb[1]).toBeCloseTo(1, 4);
      expect(sim.rgb[2]).toBeCloseTo(1, 4);
    }
  });

  it("tái lập ΔE=0,039 giữa quá hạn và cảnh báo dưới deuteranopia (design doc §2.5)", () => {
    const overdue = simulate(oklch(0.55, 0.21, 27), "deuteranopia");
    const warning = simulate(oklch(0.52, 0.111, 75), "deuteranopia");
    expect(deltaE(overdue, warning)).toBeCloseTo(0.039, 2);
  });
});

describe("color-math — bất biến toán học", () => {
  it("lab tái lập từ (L, C·cos h, C·sin h) cho màu trong gamut — kiểm chéo hai ma trận OKLab↔OKLCh", () => {
    const L = 0.6;
    const C = 0.05;
    const hDeg = 150;
    const c = oklch(L, C, hDeg);
    expect(c.clipped).toBe(false);
    const hRad = (hDeg * Math.PI) / 180;
    expect(c.lab[0]).toBeCloseTo(L, 6);
    expect(c.lab[1]).toBeCloseTo(C * Math.cos(hRad), 6);
    expect(c.lab[2]).toBeCloseTo(C * Math.sin(hRad), 6);
  });

  it("trắng/đen = 21:1, cùng một màu = 1:1 — neo WCAG", () => {
    expect(contrast(oklch(1, 0, 0), oklch(0, 0, 0))).toBeCloseTo(21, 1);
    const c = oklch(0.5, 0.1, 30);
    expect(contrast(c, c)).toBeCloseTo(1, 6);
  });

  it("contrast đối xứng — JSDoc khẳng định, test canh", () => {
    const a = oklch(0.3, 0.05, 10);
    const b = oklch(0.8, 0.02, 200);
    expect(contrast(a, b)).toBeCloseTo(contrast(b, a), 10);
  });
});

describe("color-math — guard đầu vào", () => {
  it("ném lỗi khi tham số không hữu hạn — chặn NaN từ regex bắt hụt lọt qua im lặng", () => {
    expect(() => oklch(NaN, 0.1, 255)).toThrow();
    expect(() => oklch(0.5, Infinity, 255)).toThrow();
    expect(() => oklch(0.5, 0.1, NaN)).toThrow();
  });
});
