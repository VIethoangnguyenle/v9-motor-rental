import { describe, expect, it } from "bun:test";
import { readCss } from "./css-tokens";

/**
 * Hai hàng rào cho ngân sách chuyển động của design doc §4.2–§4.4.
 *
 * Vì sao là TEST chứ không phải một quy ước: review gộp Task 5→8b chạy bảy đột
 * biến, và hai trong số đó đi qua toàn bộ `typecheck + 437 test + lint` mà không
 * một thứ gì kêu —
 *   • `--duration-panel` 280ms → 900ms, tức phá thẳng trần CỨNG 400ms;
 *   • `BEAT_MS` 600 → 60, tức cắt cụt vòng sáng còn 1/10 nhịp.
 * Cả hai là con số nằm trong file, không phải hành vi, nên chỉ có thứ ĐỌC file
 * mới bắt được. Cùng khuôn `spacing-fence.test.ts` (quét `.tsx`) và
 * `theme.test.ts` (đối chiếu một hằng giữa hai file).
 *
 * ⚠️ Đây KHÔNG phải hàng rào cho việc hiệu ứng có chạy đúng hay không — cái đó
 * cần hạ tầng test DOM mà repo chưa có, và đã ghi thành nợ. Nó chỉ canh hai con
 * số, nhưng canh đúng hai con số đã lọt.
 */

const CSS_MS = /(\d+)ms\b/g;
const SHEET_PATH = new URL("../components/rentals/rental-detail-sheet.tsx", import.meta.url)
  .pathname;

/** Trần CỨNG của design doc §4.2. */
const HARD_CAP_MS = 400;

/**
 * Ngoại lệ DUY NHẤT của trần, khai tường minh ở đây chứ không nằm rải trong CSS.
 *
 * §4.4 mục 6 giao cho khoảnh khắc dàn dựng "600ms ×1", và §4.1 giải thích vì sao
 * lý lẽ của trần không áp cho nó: trần tính theo "app này được dùng hàng trăm
 * lần mỗi ca", còn chuỗi này chạy vài chục lần mỗi ca trên đúng một phần tử.
 *
 * Thêm một dòng vào bảng này phải là một QUYẾT ĐỊNH, không phải một lần gõ số.
 */
const CAP_EXEMPTIONS: ReadonlyArray<{ readonly utility: string; readonly ms: number }> = [
  { utility: "just-changed", ms: 600 },
];

/** Cắt khối `{...}` cân bằng ngoặc bắt đầu từ `marker`. Ném nếu không cân. */
function blockAfter(css: string, marker: string): { start: number; end: number } {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`Không tìm thấy "${marker}" trong index.css`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  throw new Error(`Khối "${marker}" không đóng ngoặc cân bằng trong index.css`);
}

describe("ngân sách chuyển động", () => {
  it("mọi thời lượng trong index.css ≤ trần 400ms, trừ ngoại lệ đã khai", async () => {
    const css = await readCss();
    const exempt = CAP_EXEMPTIONS.map((e) => ({
      ...e,
      ...blockAfter(css, `@utility ${e.utility}`),
    }));

    const offenders: string[] = [];
    let scanned = 0;

    for (const m of css.matchAll(CSS_MS)) {
      const raw = m[1];
      if (raw === undefined) throw new Error(`Regex khớp nhưng thiếu nhóm: ${m[0]}`);
      const ms = Number(raw);
      const at = m.index;
      scanned += 1;

      const inside = exempt.find((e) => at > e.start && at < e.end);
      if (inside) {
        // Trong khối được miễn: vẫn phải ĐÚNG con số đã khai. Miễn trần không
        // phải là miễn kiểm — nếu không thì `@utility just-changed` thành chỗ
        // trốn cho mọi con số.
        if (ms !== inside.ms && ms > HARD_CAP_MS) {
          offenders.push(
            `${inside.utility}: ${String(ms)}ms — bảng miễn khai ${String(inside.ms)}ms`,
          );
        }
        continue;
      }
      if (ms > HARD_CAP_MS) {
        offenders.push(`${String(ms)}ms ở vị trí ${String(at)} — trần là ${String(HARD_CAP_MS)}ms`);
      }
    }

    // Bằng chứng phép quét không rỗng: một hàng rào xanh vì khớp 0 giá trị thì
    // không canh gì cả. Hôm nay có 5 giá trị `Nms` trong file (120/180/280/600/1).
    expect(scanned).toBeGreaterThan(3);
    expect(offenders).toEqual([]);
  });

  it("BEAT_MS ở sheet khớp ĐÚNG thời lượng animation của `just-changed`", async () => {
    const css = await readCss();
    const { start, end } = blockAfter(css, "@utility just-changed");
    const cssMs = /animation:\s*v9-just-changed\s+(\d+)ms/.exec(css.slice(start, end))?.[1];

    const tsx = await Bun.file(SHEET_PATH).text();
    const tsMs = /^const BEAT_MS = (\d+);$/m.exec(tsx)?.[1];

    // Hai `toBeDefined` KHÔNG thừa: khai báo bị đổi tên thì hai `undefined` bằng
    // nhau, và hàng rào xanh trên đúng cái nó sinh ra để canh.
    expect(cssMs).toBeDefined();
    expect(tsMs).toBeDefined();
    expect(Number(tsMs)).toBe(Number(cssMs));
  });
});
