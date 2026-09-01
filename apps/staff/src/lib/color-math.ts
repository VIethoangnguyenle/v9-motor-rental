/**
 * Toán màu cho hàng rào token. KHÔNG có chỗ gọi nào trong code chạy của app —
 * chỉ test dùng — nên nó không vào bundle. Để trong `src/` (không phải thư mục
 * test riêng) vì `index.css` nằm ở `src/` và hàng rào đọc thẳng file đó.
 *
 * ⚠️ ĐỪNG thay module này bằng `getComputedStyle`. Chromium trả về nguyên chuỗi
 * `oklch()` chứ không quy về sRGB, và với `::placeholder` nó trả màu KẾ THỪA —
 * hai cách đều cho ra số sai một cách tự tin. `index.css` đã ghi cả hai bẫy.
 */

/**
 * Dung sai khi hỏi "màu này có nằm ngoài gamut sRGB không".
 *
 * ⚠️ Bản đầu của file này để **±0.002** và biện minh bằng "sai số dấu phẩy động
 * của phép biến đổi". Lý do đó KHÔNG CÓ THẬT — đo trên ba màu sRGB thuần
 * (#FF0000, #00FF00, #0000FF) cho sai lệch lớn nhất **6,7×10⁻⁷**, tức nhỏ hơn
 * 0.002 khoảng ba nghìn lần.
 *
 * Hậu quả không phải lý thuyết: với 0.002, `oklch(52% 0.174 255)` — chính giá
 * trị đợt này đưa ra để SỬA lỗi tràn gamut của accent — có kênh đỏ tuyến tính
 * **−0,001655** và vẫn được báo là trong gamut. Chín token của hệ này rơi vào
 * cùng cái bẫy đó, vì bảng màu được sinh ra bằng chính hàm mang dung sai sai.
 *
 * Dung sai thật sự cần là để chịu **hằng số oklch làm tròn 3–4 chữ số** trong
 * test và tài liệu, không phải để chịu float. `1e-4` tách sạch hai ca:
 *
 *   #FF0000 (hằng số làm tròn)   lệch 0        → không báo tràn ✅
 *   accent 0.174 (tràn thật)     lệch 1,66e-3  → báo tràn      ✅
 *
 * Đây là bài học đắt nhất của đợt này: **công cụ đo cũng phải bị đo.** Chú thích
 * ở đầu file cảnh báo đừng tin `getComputedStyle`, mà chỗ hỏng lại nằm trong
 * chính hàm thay thế nó.
 */
const GAMUT_EPSILON = 1e-4;

export type Vision = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

export interface Color {
  /** sRGB tuyến tính, đã kẹp về [0,1]. */
  readonly rgb: readonly [number, number, number];
  /** OKLab của màu SAU khi kẹp — dùng để đo khoảng cách cảm nhận. */
  readonly lab: readonly [number, number, number];
  /** `true` nếu giá trị trước khi kẹp nằm ngoài gamut sRGB. */
  readonly clipped: boolean;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
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
  // Task 2 parse index.css bằng regex; một lần bắt hụt là Number() ra NaN, và
  // không guard thì assertion gamut xanh trên rác vì NaN < x và NaN > x đều
  // false — clipped im lặng ra `false` cho một màu không tồn tại.
  const invalid: string[] = [];
  if (!Number.isFinite(L)) invalid.push(`L=${L}`);
  if (!Number.isFinite(C)) invalid.push(`C=${C}`);
  if (!Number.isFinite(hDeg)) invalid.push(`h=${hDeg}`);
  if (invalid.length > 0) {
    throw new RangeError(`oklch() nhận tham số không hữu hạn: ${invalid.join(", ")}.`);
  }

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
  const clipped = raw.some((v) => v < -GAMUT_EPSILON || v > 1 + GAMUT_EPSILON);
  const rgb: [number, number, number] = [clamp01(raw[0]), clamp01(raw[1]), clamp01(raw[2])];
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

type Triple = readonly [number, number, number];
type Matrix = readonly [Triple, Triple, Triple];

/** Machado, Oliveira & Fernandes 2009, severity 1.0, áp trên sRGB tuyến tính. */
const CVD: Record<Vision, Matrix> = {
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
  const raw: [number, number, number] = [
    m[0][0] * c.rgb[0] + m[0][1] * c.rgb[1] + m[0][2] * c.rgb[2],
    m[1][0] * c.rgb[0] + m[1][1] * c.rgb[1] + m[1][2] * c.rgb[2],
    m[2][0] * c.rgb[0] + m[2][1] * c.rgb[1] + m[2][2] * c.rgb[2],
  ];
  // Task 4 dùng simulate() + deltaE() để chứng minh hai màu trạng thái còn
  // phân biệt được dưới mù màu; chính phép kẹp dưới đây là thứ nén ΔE lại, nên
  // cờ clipped phải phản ánh cả tràn do ma trận CVD gây ra, không chỉ tràn gốc
  // của màu nguồn — nếu không, một cặp bị kẹp im lặng trông giống một cặp
  // chưa từng chạm biên gamut.
  const clipped = c.clipped || raw.some((v) => v < -GAMUT_EPSILON || v > 1 + GAMUT_EPSILON);
  const rgb: [number, number, number] = [clamp01(raw[0]), clamp01(raw[1]), clamp01(raw[2])];
  return { rgb, lab: linearToOklab(...rgb), clipped };
}

/** Khoảng cách cảm nhận trong OKLab. Hai màu dưới 0,12 coi như khó phân biệt. */
export function deltaE(a: Color, b: Color): number {
  return Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
}
