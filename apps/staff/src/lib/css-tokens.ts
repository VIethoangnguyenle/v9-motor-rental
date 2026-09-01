import { oklch, type Color } from "./color-math";

/**
 * Đọc token màu THẲNG TỪ `index.css`. Chỉ test dùng — cùng khuôn `color-math.ts`,
 * đừng nối vào app.
 *
 * Ở module riêng chứ không nằm trong một file test, vì nay có HAI hàng rào cần
 * nó: `theme-tokens.test.ts` (tương phản, gamut, mù màu) và `theme.test.ts` (năm
 * bản chép tay của `--color-canvas` phải khớp chính nguồn). Chép bộ parse này ra
 * làm bản thứ hai là tự tạo đúng thứ cả hai hàng rào sinh ra để chặn.
 */
const CSS_PATH = new URL("./index.css", new URL("../", import.meta.url)).pathname;

/** Đọc token trong MỘT khối `{...}` — `@theme` cho sáng, `[data-theme="dark"]` cho tối. */
export async function readTokens(startMarker: string): Promise<Record<string, Color>> {
  // Bóc chú thích TRƯỚC khi làm bất cứ gì khác. Hai lý do, cả hai đã dựng lại
  // được thành "hàng rào xanh trên file hỏng":
  //   • `matchAll` duyệt tuần tự và ghi đè, nên một khai báo nằm trong chú thích
  //     mà đứng SAU sẽ THẮNG khai báo thật. Một dòng vô hại kiểu
  //     `/* Giá trị trước đợt này: --color-status-ongoing: oklch(55.7% ...) */`
  //     đủ để che một token đang trượt AA. File kia viết chú thích rất dày và
  //     đã có sẵn hai chỗ trích giá trị token cũ — nó thoát chỉ vì tình cờ chưa
  //     viết ở dạng `--color-x: ...`.
  //   • bộ đếm ngoặc bên dưới không phân biệt ngoặc trong chú thích với ngoặc
  //     thật, nên một `{` lẻ trong văn xuôi làm lệch toàn bộ phép cắt khối.
  const css = (await Bun.file(CSS_PATH).text()).replace(/\/\*[\s\S]*?\*\//g, "");
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
  // `end` còn -1 nghĩa là ngoặc không cân bằng. KHÔNG được bỏ qua: `slice(start, -1)`
  // không ném lỗi, nó trả gần trọn file — khối SÁNG khi đó nuốt luôn hai khối TỐI
  // và last-wins làm bảng sáng bị ĐO BẰNG GIÁ TRỊ TỐI. Contrast và gamut vẫn xanh
  // (bảng tối tự nó nhất quán); chỉ CVD đỏ, và nó đỏ theo cách tệ nhất — thông báo
  // rủ người đọc thêm ba ngoại lệ TỐI vào bảng SÁNG, tức bịt mắt hàng rào vĩnh viễn.
  if (end === -1) {
    throw new Error(`Khối "${startMarker}" không đóng ngoặc cân bằng trong index.css`);
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

/**
 * Mã hoá sRGB sang `#rrggbb`.
 *
 * `Color.rgb` là sRGB TUYẾN TÍNH đã kẹp về [0,1] (xem `color-math.ts`), nên phải
 * đi qua hàm truyền của sRGB trước khi nhân 255 — bỏ bước đó thì `#f8fafc` ra
 * `#fbfcfd`, sai vừa đủ để trông như một sai số làm tròn vô hại.
 */
export function toSrgbHex(color: Color): string {
  return `#${color.rgb
    .map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
