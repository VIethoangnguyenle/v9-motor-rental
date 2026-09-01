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
  // Sáu badge trạng thái đều tô NỀN ĐẶC + chữ `accent-ink`, nên cả sáu phải được
  // đo, không phải bốn. Thiếu hai dòng này thì việc hạ `status-completed` xuống
  // L=42% (chữa hồi quy CVD) không có gì canh phía tương phản.
  ["accent-ink", "status-booked", 4.5],
  ["accent-ink", "status-completed", 4.5],
  ["border-strong", "surface", 3],
  ["status-overdue", "status-overdue-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["accent", "accent-soft", 4.5],
];

/**
 * ── Mù màu: một THUỘC TÍNH CẤU TRÚC, không phải một danh sách ca lẻ ──────────
 *
 * Sáu màu trạng thái đều tô NỀN ĐẶC với chữ `accent-ink` đè lên. Ràng buộc "chữ
 * đạt ≥4,5:1" ghim cả sáu vào một dải độ sáng hẹp — đo được L ∈ [0,42; 0,557] ở
 * bảng sáng. Mù màu thì XOÁ HUE. Còn lại đúng ~0,14 đơn vị độ sáng để chia cho
 * sáu màu, nên va chạm là điều KHÔNG TRÁNH ĐƯỢC BẰNG CÁCH CHỌN MÀU: đo hết 15
 * cặp × 3 kiểu mù màu ra 12 va chạm ở bảng sáng và 14 ở bảng tối.
 *
 * Đây là dạng tổng quát của kết luận §2.5, và nó nói rằng đuổi theo từng cặp là
 * sai hướng. Hai kênh khác gánh, và chúng gánh cho TẤT CẢ các cặp:
 *
 *   • HÌNH DẠNG — sáu icon riêng cho sáu trạng thái (Task 4, `STATUS_ICON`).
 *   • CÁCH TÔ — nền nhạt + viền so với nền đặc, đã có sẵn từ đợt trước.
 *
 * ⚠️ ĐIỀU KIỆN, KHÔNG PHẢI GHI CHÚ: bảng ngoại lệ dưới đây chỉ có giá trị KHI
 * kênh hình dạng tồn tại. Task 4 bị cắt thì ngoại lệ này hết hiệu lực và sáu
 * trạng thái quay lại chỗ chỉ phân biệt được bằng màu — tức không phân biệt được.
 *
 * Vì sao vẫn giữ hàng rào dù phải khai 26 ngoại lệ: nó là một BẢN KHOÁ, canh cả
 * HAI CHIỀU. Cặp nào tụt xuống dưới ngưỡng mà chưa khai → đỏ (đúng thứ đã để lọt
 * `đang thuê ↔ đã trả`, 0,131 → 0,100, ở vòng trước). Cặp nào đã khai mà nay qua
 * được ngưỡng → CŨNG đỏ, kèm lời nhắc xoá: một suppression rộng hơn mức cần là
 * một suppression sẽ che mất hồi quy sau này.
 *
 * Khoá ở mức `kiểu nhìn|a|b`, không phải `a|b`. Mức cặp tha luôn những kiểu nhìn
 * mà cặp đó thật ra vẫn ổn — `quá hạn ↔ cảnh báo` qua tritanopia với ΔE 0,151,
 * và một ngoại lệ mức cặp sẽ bịt mắt luôn chiều đó.
 *
 * Lý do ghi theo HỌ VA CHẠM chứ không theo con số: con số đổi mỗi lần chỉnh
 * token và sẽ mục, còn cơ chế thì không. Số đo thật in ra khi test đỏ.
 */
const CVD_VISIONS: readonly Vision[] = ["protanopia", "deuteranopia", "tritanopia"];
const CVD_THRESHOLD = 0.12;
const SEMANTIC = [
  "accent",
  "status-booked",
  "status-ongoing",
  "status-overdue",
  "status-completed",
  "warning",
] as const;

const SAME_HUE = "booked và accent cùng hue 255 — CVD xoá hue, còn lại chênh lệch L quá nhỏ";
const TRIT_BLUE = "tritanopia gộp trục lam–lục, mà accent/booked là lam còn ongoing là lam-lục";
const BLUE_VS_GREY = "booked chroma thấp, dưới CVD tụt về gần trục xám của completed";
const RED_AXIS = "trục đỏ–lục: protanopia/deuteranopia kéo đỏ về tối, chạm nhóm trung tính";
const SECTION_2_5 =
  "design doc §2.5 — không màu nào vừa đạt 4,5:1 vừa tách khỏi đỏ ở mọi kiểu nhìn";

/** `kiểu nhìn|a|b` → họ va chạm. Xem chú thích trên: khoá hai chiều, không phải tắt hàng rào. */
const CVD_EXCEPTIONS: Record<string, ReadonlyMap<string, string>> = {
  SÁNG: new Map([
    ["protanopia|accent|status-booked", SAME_HUE],
    ["deuteranopia|accent|status-booked", SAME_HUE],
    ["tritanopia|accent|status-booked", SAME_HUE],
    ["tritanopia|accent|status-ongoing", TRIT_BLUE],
    ["protanopia|status-booked|status-ongoing", TRIT_BLUE],
    ["deuteranopia|status-booked|status-ongoing", TRIT_BLUE],
    ["tritanopia|status-booked|status-ongoing", TRIT_BLUE],
    ["deuteranopia|status-booked|status-completed", BLUE_VS_GREY],
    ["tritanopia|status-booked|status-completed", BLUE_VS_GREY],
    ["protanopia|status-overdue|status-completed", RED_AXIS],
    ["protanopia|status-overdue|warning", SECTION_2_5],
    ["deuteranopia|status-overdue|warning", SECTION_2_5],
  ]),
  TỐI: new Map([
    ["protanopia|accent|status-booked", SAME_HUE],
    ["deuteranopia|accent|status-booked", SAME_HUE],
    ["tritanopia|accent|status-booked", SAME_HUE],
    ["tritanopia|accent|status-ongoing", TRIT_BLUE],
    ["protanopia|status-booked|status-ongoing", TRIT_BLUE],
    ["deuteranopia|status-booked|status-ongoing", TRIT_BLUE],
    ["tritanopia|status-booked|status-ongoing", TRIT_BLUE],
    ["protanopia|status-booked|status-completed", BLUE_VS_GREY],
    ["deuteranopia|status-booked|status-completed", BLUE_VS_GREY],
    ["tritanopia|status-booked|status-completed", BLUE_VS_GREY],
    ["deuteranopia|status-ongoing|status-completed", BLUE_VS_GREY],
    ["protanopia|status-overdue|status-completed", RED_AXIS],
    ["deuteranopia|status-overdue|status-completed", RED_AXIS],
    ["deuteranopia|status-overdue|warning", SECTION_2_5],
  ]),
};

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

    it("bảng va chạm mù màu khớp ĐÚNG bảng ngoại lệ đã khai — cả hai chiều", async () => {
      const t = await readTokens(marker);
      const declared = CVD_EXCEPTIONS[themeName];
      if (!declared) throw new Error(`Chưa khai bảng ngoại lệ CVD cho theme ${themeName}`);

      const undeclared: string[] = [];
      const stale: string[] = [];
      for (const vision of CVD_VISIONS) {
        for (const [i, a] of SEMANTIC.entries()) {
          for (const b of SEMANTIC.slice(i + 1)) {
            const key = `${vision}|${a}|${b}`;
            const d = deltaE(simulate(need(t, a), vision), simulate(need(t, b), vision));
            if (d < CVD_THRESHOLD && !declared.has(key)) {
              undeclared.push(`${key} ΔE=${d.toFixed(3)} — tụt dưới ngưỡng mà chưa khai`);
            }
            if (d >= CVD_THRESHOLD && declared.has(key)) {
              stale.push(`${key} ΔE=${d.toFixed(3)} — nay đã qua ngưỡng, XOÁ khỏi bảng ngoại lệ`);
            }
          }
        }
      }
      expect(undeclared).toEqual([]);
      expect(stale).toEqual([]);
    });
  });
}

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
