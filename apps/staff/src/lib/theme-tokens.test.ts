import { describe, expect, it } from "bun:test";
import { contrast, deltaE, oklch, simulate, type Color, type Vision } from "./color-math";

/**
 * Dựng lại bảng §2.4 của `docs/plans/2026-09-01-staff-visual-system-design.md`
 * TỪ CHÍNH `index.css`, mỗi lần chạy test.
 *
 * Không có hàng rào này thì bảng trong design doc là ảnh chụp một thời điểm: ai
 * chỉnh một token là nó sai lặng lẽ, và không có gì kêu. Ba cặp trong bảng KHÔNG
 * CÓ BIÊN (giải ngược đúng từ ngưỡng), nên "lặng lẽ" ở đây nghĩa là trượt AA.
 *
 * Cùng khuôn với `spacing-fence.test.ts`: là test chứ không phải plugin ESLint,
 * vì `bun test` đã nằm sẵn trong CI còn đụng `eslint.config.js` thì kéo theo bốn
 * probe của skill `v9-fences`.
 */
const CSS_PATH = new URL("../index.css", import.meta.url).pathname;

/**
 * `t[name]` dưới `noUncheckedIndexedAccess` ra `Color | undefined`. Ném thay vì
 * để `undefined` trôi tiếp: một token thiếu phải làm hàng rào ĐỎ kèm tên token,
 * chứ không phải chết bằng "cannot read properties of undefined" ở tận trong
 * `contrast()` — chỗ đó không nói được token nào biến mất.
 */
function need(tokens: Record<string, Color>, name: string): Color {
  const c = tokens[name];
  if (!c) throw new Error(`index.css thiếu token --color-${name}`);
  return c;
}

/** Đọc token trong MỘT khối `{...}` — `@theme` cho sáng, `[data-theme="dark"]` cho tối. */
async function readTokens(startMarker: string): Promise<Record<string, Color>> {
  const css = await Bun.file(CSS_PATH).text();
  const start = css.indexOf(startMarker);
  if (start === -1) throw new Error(`Không tìm thấy khối "${startMarker}" trong index.css`);

  // Cắt tới dấu `}` cân bằng đầu tiên sau `{` mở khối.
  let depth = 0;
  let end = -1;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = css.slice(start, end);

  const out: Record<string, Color> = {};
  const re = /--color-([a-z0-9-]+):\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/g;
  for (const m of block.matchAll(re)) {
    const [, name, l, c, h] = m;
    if (name === undefined || l === undefined || c === undefined || h === undefined) {
      // Bốn nhóm đều BẮT BUỘC trong regex, nên tới được đây nghĩa là regex đã bị
      // sửa hỏng. Bỏ qua im lặng thì bảng token teo dần mà hàng rào vẫn xanh.
      throw new Error(`Regex khớp nhưng thiếu nhóm: ${JSON.stringify(m.slice(0, 5))}`);
    }
    out[name] = oklch(Number(l) / 100, Number(c), Number(h));
  }
  return out;
}

/** Cặp phải đạt, khớp bảng §2.4. `[chữ, nền, ngưỡng]`. */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ["ink", "surface", 4.5],
  ["ink", "canvas", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "canvas", 4.5],
  ["ink-soft", "surface", 4.5],
  ["accent", "surface", 4.5],
  ["accent-ink", "accent", 4.5],
  ["accent-ink", "status-overdue", 4.5],
  ["accent-ink", "warning", 4.5],
  ["accent-ink", "status-ongoing", 4.5],
  ["border-strong", "surface", 3],
  ["status-overdue", "status-overdue-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["accent", "accent-soft", 4.5],
];

for (const [themeName, marker] of [
  ["SÁNG", "@theme {"],
  ["TỐI", '[data-theme="dark"] {'],
] as const) {
  describe(`token ${themeName}`, () => {
    it("khai đủ mọi token mà bảng §2.4 tham chiếu", async () => {
      const t = await readTokens(marker);
      const needed = new Set(PAIRS.flatMap(([a, b]) => [a, b]));
      const missing = [...needed].filter((k) => !(k in t));
      expect(missing).toEqual([]);
    });

    it("mọi cặp §2.4 đạt ngưỡng", async () => {
      const t = await readTokens(marker);
      const failures = PAIRS.filter(
        ([fg, bg, min]) => contrast(need(t, fg), need(t, bg)) < min,
      ).map(
        ([fg, bg, min]) =>
          `${fg}/${bg} = ${contrast(need(t, fg), need(t, bg)).toFixed(2)}:1 (cần ${String(min)})`,
      );
      expect(failures).toEqual([]);
    });

    it("không token nào vượt gamut sRGB — token không được nói dối về màu nó vẽ", async () => {
      const t = await readTokens(marker);
      const clipped = Object.entries(t)
        .filter(([, c]) => c.clipped)
        .map(([k]) => k);
      expect(clipped).toEqual([]);
    });

    it("'đang thuê' KHÁC 'hành động chính' — hai nghĩa không dùng chung một màu", async () => {
      const t = await readTokens(marker);
      expect(deltaE(need(t, "status-ongoing"), need(t, "accent"))).toBeGreaterThan(0.12);
    });
  });
}

/**
 * Mù màu. Hai cặp là NGOẠI LỆ ĐÃ ĐO, không phải hai lần tắt hàng rào — mỗi cái
 * kèm số đo và lý do bên dưới. Cả hai được đỡ bằng KÊNH HÌNH DẠNG
 * (`status-icon.test.ts`), không bằng màu.
 *
 * Ngoại lệ ghi tường minh ở đây thay vì bỏ cặp đó ra khỏi danh sách: ngày ai đó
 * tìm được màu tốt hơn, test này sẽ chỉ thẳng vào chỗ cần cập nhật.
 *
 * ⚠️ Ngoại lệ thứ hai KHÔNG có trong design doc — nó lộ ra khi chạy chính hàng
 * rào này lần đầu, sau khi §2.2 đổi `status-ongoing` sang hue 200 để gỡ lỗi
 * "trùng khít accent". Bản sửa đó gỡ được lỗi ở mắt thường (ΔE 0,145) và ở
 * protanopia/deuteranopia (0,144 · 0,146), nhưng dưới tritanopia hai màu tụt về
 * ΔE 0,040 — vì tritanopia gộp cả trục lam–lục, mà `accent` là màu lam.
 *
 * Quét vét cạn (L 25–75%, cả 360 hue, chroma từ trần gamut xuống 10%) cho ra
 * ràng buộc thật, và nó chặt hơn vẻ ngoài:
 *
 *   • hue 200 (giá trị đang dùng): "trắng ≥4,5:1" đòi L ≤ 55,7%, còn "ΔE ≥0,12
 *     với accent dưới tritanopia" đòi L ≥ 65% — hai điều kiện KHÔNG giao nhau.
 *   • toàn bộ dải lục/lam-lục vướng đúng chuyện đó (hue 145 ở L=55%: ΔE 0,050).
 *   • nghiệm duy nhất nằm ở L ≤ 46%, hue 291–295, một tím xám nhạt — và mọi
 *     nghiệm đều rơi đúng vào khoảng ΔE 0,120–0,123, tức ĐÚNG ngưỡng, không
 *     biên. Hệ này đã có ba giá trị không biên; thêm cái thứ tư ở 0,120 là dựng
 *     một hàng rào đỏ lên vì làm tròn.
 *   • L=46% lại trùng `status-completed`, nên nó cũng phá luôn nhịp sáng của
 *     bốn badge (46 · 50 · 52 · 55%).
 *
 * Nên: giữ hue 200 và ghi ngoại lệ. Lỗi mà §2.2 sinh ra để sửa — "đang thuê" và
 * "hành động chính" là CÙNG MỘT MÀU — vẫn được canh riêng và canh chặt bởi test
 * "'đang thuê' KHÁC 'hành động chính'" ở trên, chạy ở mắt thường.
 */
const KNOWN_CVD_EXCEPTION = new Map([
  [
    "status-overdue|warning",
    "design doc §2.5: quét vét cạn, không màu nào vừa đạt 4,5:1 với chữ trắng vừa " +
      "tách được khỏi đỏ ở cả bốn kiểu nhìn (deuteranopia ΔE 0,040)",
  ],
  [
    "status-ongoing|accent",
    "tritanopia gộp trục lam–lục và accent là lam (ΔE 0,040); nghiệm duy nhất là " +
      "tím xám L≤46% ở đúng ngưỡng 0,120 — xem chú thích trên",
  ],
]);

describe("mù màu", () => {
  const VISIONS: Vision[] = ["protanopia", "deuteranopia", "tritanopia"];
  const SEMANTIC = ["status-overdue", "warning", "status-ongoing", "accent"] as const;

  it("mọi cặp ngữ nghĩa phân biệt được, trừ ngoại lệ đã ghi", async () => {
    const t = await readTokens("@theme {");
    const bad: string[] = [];
    for (const vision of VISIONS) {
      for (const [i, a] of SEMANTIC.entries()) {
        for (const b of SEMANTIC.slice(i + 1)) {
          const key = `${a}|${b}`;
          if (KNOWN_CVD_EXCEPTION.has(key)) continue;
          const d = deltaE(simulate(need(t, a), vision), simulate(need(t, b), vision));
          if (d < 0.12) bad.push(`${vision}: ${key} ΔE=${d.toFixed(3)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * Bảng tối chép tay HAI LẦN (`@media` + `[data-theme="dark"]`) là nợ có thật, và
 * là loại nợ không kêu: mọi test khác trong file này đọc khối `[data-theme]`, nên
 * một dòng lệch trong khối `@media` sẽ trôi qua toàn bộ hàng rào. Người dùng để
 * hệ điều hành quyết theme — tức phần lớn — lại là người duy nhất nhìn thấy khối
 * đó.
 *
 * So sánh RGB chứ không so `contrast(a, b) === 1`: tương phản bằng 1 chỉ chứng
 * minh hai màu cùng ĐỘ SÁNG, mà hai màu khác hue vẫn có thể cùng độ sáng. Đây là
 * ca kinh điển "test đo một thứ gần đúng với thứ nó tuyên bố đo".
 */
it("khối @media và khối [data-theme=dark] khai GIỐNG HỆT nhau", async () => {
  const viaAttr = await readTokens('[data-theme="dark"] {');
  const viaMedia = await readTokens(':root:not([data-theme="light"]) {');

  // Quét không rỗng: nếu regex hay marker gãy, cả hai bên cùng rỗng và phép so
  // sánh dưới đây xanh trên hư vô.
  expect(Object.keys(viaAttr).length).toBeGreaterThan(15);

  const keys = [...new Set([...Object.keys(viaAttr), ...Object.keys(viaMedia)])].sort();
  const diff = keys.filter((k) => {
    const a = viaAttr[k];
    const b = viaMedia[k];
    return a === undefined || b === undefined || String(a.rgb) !== String(b.rgb);
  });
  expect(diff).toEqual([]);
});
