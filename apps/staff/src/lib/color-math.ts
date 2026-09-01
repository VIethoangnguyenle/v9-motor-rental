/**
 * Toán màu cho hàng rào token. KHÔNG có chỗ gọi nào trong code chạy của app —
 * chỉ test dùng — nên nó không vào bundle. Để trong `src/` (không phải thư mục
 * test riêng) vì `index.css` nằm ở `src/` và hàng rào đọc thẳng file đó.
 *
 * ⚠️ ĐỪNG thay module này bằng `getComputedStyle`. Chromium trả về nguyên chuỗi
 * `oklch()` chứ không quy về sRGB, và với `::placeholder` nó trả màu KẾ THỪA —
 * hai cách đều cho ra số sai một cách tự tin. `index.css` đã ghi cả hai bẫy.
 */

export type Vision = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

export interface Color {
  /** sRGB tuyến tính, đã kẹp về [0,1]. */
  readonly rgb: readonly [number, number, number];
  /** OKLab của màu SAU khi kẹp — dùng để đo khoảng cách cảm nhận. */
  readonly lab: readonly [number, number, number];
  /** `true` nếu giá trị trước khi kẹp nằm ngoài gamut sRGB. */
  readonly clipped: boolean;
}

function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** `L` ∈ [0,1] (không phải phần trăm), `C` tuyệt đối, `h` độ. */
export function oklch(L: number, C: number, hDeg: number): Color {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const raw: [number, number, number] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  // Biên ±0.002 chứ không 0: sai số dấu phẩy động của chính phép biến đổi này
  // đủ để một màu nằm ĐÚNG trên mép gamut bị báo là tràn.
  const clipped = raw.some((v) => v < -0.002 || v > 1.002);
  const rgb = raw.map((v) => Math.min(1, Math.max(0, v))) as unknown as [number, number, number];
  return { rgb, lab: linearToOklab(...rgb), clipped };
}

/** Chroma lớn nhất tại (L, h) còn nằm trong gamut sRGB. */
export function maxChroma(L: number, hDeg: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (oklch(L, mid, hDeg).clipped) hi = mid;
    else lo = mid;
  }
  return Math.floor(lo * 1000) / 1000;
}

function relativeLuminance(c: Color): number {
  return 0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2];
}

/** Tỉ lệ tương phản WCAG 2.x. Đối xứng — thứ tự tham số không quan trọng. */
export function contrast(a: Color, b: Color): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Machado, Oliveira & Fernandes 2009, severity 1.0, áp trên sRGB tuyến tính. */
const CVD: Record<Vision, readonly (readonly [number, number, number])[]> = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function simulate(c: Color, vision: Vision): Color {
  const m = CVD[vision];
  const rgb = m.map((row) =>
    Math.min(1, Math.max(0, row[0] * c.rgb[0] + row[1] * c.rgb[1] + row[2] * c.rgb[2])),
  ) as unknown as [number, number, number];
  return { rgb, lab: linearToOklab(...rgb), clipped: c.clipped };
}

/** Khoảng cách cảm nhận trong OKLab. Hai màu dưới 0,12 coi như khó phân biệt. */
export function deltaE(a: Color, b: Color): number {
  return Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
}
