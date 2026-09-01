/**
 * Lựa chọn theme của người dùng. BA trạng thái, không phải hai — "theo hệ điều
 * hành" là một lựa chọn riêng, không phải sự vắng mặt của lựa chọn.
 *
 * Quyết định A của design doc §3: mặc định SÁNG (giữ lập luận "đọc nhiều giờ
 * dưới ánh sáng gara" đã ghi trong `index.css`), người dùng ghi đè được.
 */
export type ThemeChoice = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

/** ⚠️ Script chống nháy trắng trong `index.html` chép tay chuỗi này. Đổi thì đổi cả hai. */
export const THEME_STORAGE_KEY = "v9-theme";

const CHOICES: readonly string[] = ["light", "dark", "system"];

/** `localStorage` là dữ liệu không tin được: người dùng sửa được, bản cũ ghi được. */
export function parseChoice(raw: string | null): ThemeChoice {
  return raw !== null && CHOICES.includes(raw) ? (raw as ThemeChoice) : "system";
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): EffectiveTheme {
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
}

export function nextChoice(current: ThemeChoice): ThemeChoice {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

/**
 * sRGB của `--color-canvas` từng theme. Manifest và thẻ meta không đọc được biến
 * CSS, nên đây là bản chép tay — `theme.test.ts` đối chiếu nó với chính
 * `index.css`, và với bốn bản chép còn lại.
 *
 * @internal export chỉ để test đọc được; app dùng nó qua `themeColorFor`.
 */
export const CANVAS_HEX: Record<EffectiveTheme, string> = { light: "#f8fafc", dark: "#0a111a" };

/**
 * Nội dung đúng cho MỘT thẻ `<meta name="theme-color">`, biết `media` của chính
 * thẻ đó (`null` = thẻ không có `media`).
 *
 * Trình duyệt dùng đúng MỘT thẻ: thẻ đầu tiên theo thứ tự tài liệu có `media`
 * khớp. Nên ghi mỗi thẻ không-media là KHÔNG ĐỦ — nó đứng cuối, và khi người
 * dùng ép TỐI trên một máy đang SÁNG thì thẻ `(prefers-color-scheme: light)`
 * khớp trước và thanh địa chỉ ở lại màu sáng trên một app đã tối.
 *
 * Cách chữa ở đây không dựa vào luật chọn thẻ: hễ người dùng ép theme thì CẢ BA
 * thẻ mang cùng một màu, nên thẻ nào thắng cũng cho ra màu đúng.
 *
 * @internal export chỉ để test đọc được; app gọi nó qua `applyChoice`.
 */
export function themeColorFor(
  media: EffectiveTheme | null,
  choice: ThemeChoice,
  systemPrefersDark: boolean,
): string {
  if (choice !== "system") return CANVAS_HEX[choice];
  return CANVAS_HEX[media ?? resolveTheme(choice, systemPrefersDark)];
}

/**
 * Ba thẻ của `index.html`, khai bằng selector thay vì đọc thuộc tính `media` rồi
 * đoán nghĩa chuỗi: thẻ nào phục vụ theme nào là chuyện của MARKUP, và selector
 * nói thẳng điều đó. Thẻ vắng mặt thì bỏ qua — thiếu thẻ meta không được phép
 * làm hỏng việc đổi theme.
 *
 * Cặp có `media` dựng BẰNG CẤU TẠO từ chính tên theme, không gõ tay hai dòng
 * song song: `themeColorFor` được tách ra để test được QUYẾT ĐỊNH, nhưng vòng
 * lặp ÁP quyết định đó thì không hàng rào nào chạm tới. Hoán đổi hai cặp bằng
 * tay qua được cả typecheck lẫn cả bộ test, và hậu quả là sau khi người dùng
 * quay về "Theo máy" thì thẻ sáng mang màu tối và ngược lại. Viết như dưới đây
 * thì cái sai đó không biểu diễn được — nhưng ai đó gõ lại hai dòng bằng tay
 * thì nó biểu diễn được trở lại, nên vẫn có một test đọc thẳng bảng này.
 *
 * @internal export chỉ để test đọc được, cùng khuôn `isPublicRoute` ở
 * `apps/api/src/plugins/staff-guard.ts`.
 */
export const THEME_COLOR_TAGS: readonly (readonly [string, EffectiveTheme | null])[] = [
  ...(["light", "dark"] as const).map(
    (theme) => [`meta[name="theme-color"][media*="${theme}"]`, theme] as const,
  ),
  ['meta[name="theme-color"]:not([media])', null],
];

export function readChoice(): ThemeChoice {
  try {
    return parseChoice(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Safari chế độ riêng tư ném khi đọc `localStorage`. Không có lựa chọn lưu
    // được thì đi theo hệ điều hành — đúng mặc định.
    return "system";
  }
}

export function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* không lưu được thì thôi — theme của phiên này vẫn đúng */
  }

  // Thanh trạng thái của trình duyệt / PWA. Thuộc tính `media` của thẻ
  // `theme-color` chỉ theo được HỆ ĐIỀU HÀNH, không theo được lựa chọn tay —
  // nên khi người dùng ép theme, phải cập nhật bằng script. Xem `themeColorFor`
  // về việc vì sao phải ghi CẢ BA thẻ chứ không riêng thẻ không-media.
  const systemPrefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  for (const [selector, media] of THEME_COLOR_TAGS) {
    document
      .querySelector(selector)
      ?.setAttribute("content", themeColorFor(media, choice, systemPrefersDark));
  }
}
