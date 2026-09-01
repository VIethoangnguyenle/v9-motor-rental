import { describe, expect, it } from "bun:test";
import { contrast, deltaE, simulate, type Color, type Vision } from "./color-math";
import { readTokens } from "./css-tokens";

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

/**
 * Toàn bộ 22 token màu mà MỖI khối phải khai — cả ba khối (`@theme`, `@media`,
 * `[data-theme="dark"]`) đều phải khai đúng bộ này, không thiếu không thừa.
 *
 * Không có khẳng định này thì DANH SÁCH token không được canh, chỉ có GIÁ TRỊ.
 * Dựng lại được: xoá `accent-hover` và `accent-active` khỏi `@theme` mà giữ hai
 * khối tối → hàng rào xanh, trong khi `components/ui/button.tsx` dùng thật cả hai
 * (`hover:bg-accent-hover active:bg-accent-active`) — nút chính mất hover/active
 * ở theme sáng và không có gì kêu. Chỉ 12/22 token có tên trong `PAIRS`/`SEMANTIC`;
 * mười token còn lại chỉ được test gamut chạm tới, mà test gamut chỉ thấy thứ
 * regex đã bắt được — token biến mất thì biến mất luôn khỏi phép quét.
 */
const TOKENS: readonly string[] = [
  "canvas",
  "surface",
  "surface-sunken",
  "border",
  "border-strong",
  "ink",
  "ink-soft",
  "muted",
  "accent",
  "accent-ink",
  "accent-hover",
  "accent-active",
  "status-booked",
  "status-ongoing",
  "status-overdue",
  "status-completed",
  "warning",
  "status-overdue-soft",
  "status-booked-soft",
  "status-completed-soft",
  "warning-soft",
  "accent-soft",
];

/** Ngưỡng ΔE cho tách ngữ nghĩa ở MẮT THƯỜNG — khái niệm khác `CVD_THRESHOLD`. */
const SEMANTIC_DELTA_E_MIN = 0.12;

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
    it("khai ĐÚNG bộ 22 token — không thiếu, không thừa", async () => {
      const t = await readTokens(marker);
      expect(Object.keys(t).sort()).toEqual([...TOKENS].sort());
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
      expect(deltaE(need(t, "status-ongoing"), need(t, "accent"))).toBeGreaterThan(
        SEMANTIC_DELTA_E_MIN,
      );
    });

    it("bảng va chạm mù màu khớp ĐÚNG bảng ngoại lệ đã khai — cả hai chiều", async () => {
      const t = await readTokens(marker);
      const declared = CVD_EXCEPTIONS[themeName];
      if (!declared) throw new Error(`Chưa khai bảng ngoại lệ CVD cho theme ${themeName}`);

      const undeclared: string[] = [];
      const stale: string[] = [];
      const seen = new Set<string>();
      for (const vision of CVD_VISIONS) {
        for (const [i, a] of SEMANTIC.entries()) {
          for (const b of SEMANTIC.slice(i + 1)) {
            const key = `${vision}|${a}|${b}`;
            seen.add(key);
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

      // "Canh hai chiều" chỉ đúng TRONG không gian khoá thật sự được sinh ra. Một
      // mục khai sai — đảo thứ tự cặp, gõ nhầm tên kiểu nhìn, trỏ token không tồn
      // tại — không khớp khoá nào, nên không bị chiều `stale` chạm tới và nằm đó im
      // lặng như một suppression tưởng là đang có tác dụng. Đáng lo vì bảng này
      // chính là phần bị sửa tay dưới áp lực, lúc hàng rào vừa đỏ.
      expect([...declared.keys()].filter((k) => !seen.has(k))).toEqual([]);
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

  // Khối `@media` không nằm trong vòng lặp theme ở trên, nên nó cần khẳng định
  // bộ token của riêng nó. Cũng là chỗ chặn "xanh trên hư vô": marker hay regex
  // gãy thì cả hai bên cùng rỗng và phép so sánh dưới đây không so gì cả.
  expect(Object.keys(viaMedia).sort()).toEqual([...TOKENS].sort());

  const keys = [...new Set([...Object.keys(viaAttr), ...Object.keys(viaMedia)])].sort();
  const diff = keys.filter((k) => {
    const a = viaAttr[k];
    const b = viaMedia[k];
    return a === undefined || b === undefined || String(a.rgb) !== String(b.rgb);
  });
  expect(diff).toEqual([]);
});
