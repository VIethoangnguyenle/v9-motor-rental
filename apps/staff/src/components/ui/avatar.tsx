/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Avatar nhận MỌI thứ qua prop.
 *
 * ## Vì sao `name` và `seed` là HAI prop, không phải một
 *
 * Chữ cái lấy từ `name`; màu sinh từ `seed` (chỗ gọi truyền `id`). Tách ra vì
 * hai thứ này có tuổi thọ khác nhau: sửa một lỗi chính tả trong tên phải đổi
 * chữ cái, nhưng KHÔNG được đổi màu — người ta nhận ra đồng nghiệp bằng vệt màu
 * ở mép mắt trước khi đọc kịp chữ, nên buộc màu vào tên nghĩa là một lần sửa
 * chính tả làm người đó "thành người khác" ở cả ba màn hình cùng lúc.
 *
 * ## Đây là BƯỚC 1 của phương án ảnh, không phải bản rút gọn của nó
 *
 * Ngày có ảnh tải lên, component này nhận thêm một prop `src?: string` và render
 * `<img>` khi có, rơi về chữ cái khi không — `name`/`seed` vẫn cần nguyên vẹn vì
 * ai chưa có ảnh thì vẫn phải rơi về đúng cái đang thấy ở đây. Không có gì trong
 * file này phải viết lại cho bước đó.
 */

/**
 * ⛔ Ba hằng dưới đây là CẢ bảng màu avatar. Chúng KHÔNG nằm trong `index.css`
 * và đó là chủ ý: ba hàng rào token (`theme-tokens` · `motion-budget` ·
 * `spacing-fence`) khoá đúng 22 tên token ở cả ba khối, nên thêm một token màu
 * là phải khai ba chỗ và khai lại bảng ngoại lệ mù màu — cho một màu mà mỗi
 * người dùng lại mang một giá trị khác nhau thì bộ máy đó không mô tả nổi.
 *
 * Đổi lại, hàng rào của chúng nằm ở `lib/avatar-color.test.ts`: nó ĐỌC THẲNG
 * chuỗi CSS mà `avatarTintForHue` trả về, không đọc ba hằng này, nên sửa hằng
 * hay sửa chuỗi đều bị bắt.
 *
 * ### `TILE_C = 0.093` — trần gamut sRGB, không phải lựa chọn thẩm mỹ
 *
 * `maxChroma` phụ thuộc hue rất mạnh, và một `C` DUY NHẤT cho mọi hue phải ≤ trị
 * NHỎ NHẤT trên cả vòng. Ở `L=55%`, quét đủ 360 hue:
 *
 *   hue 255 (lam)     → 0.181
 *   hue 164 (lục)     → 0.117
 *   hue  75 (hổ phách)→ 0.116
 *   hue 195 (lam-lục) → 0.093   ← SÀN
 *
 * Sàn nằm ở lam-lục, KHÔNG ở hổ phách — ngược với trực giác "vàng hẹp nhất" mà
 * bảng token vàng/lam của app dễ gợi ra. `C = 0.094` là hue 195–2xx tràn gamut.
 *
 * ### `TILE_L_PERCENT = 55` — giải ngược từ 4,5:1 với chữ trắng, ở hue TỆ NHẤT
 *
 * Tương phản WCAG dùng độ sáng TƯƠNG ĐỐI, không dùng `L` của OKLCh, nên cùng một
 * `L` cho tương phản khác nhau ở mỗi hue và phải QUÉT chứ không giải một hue rồi
 * suy ra cả vòng. Quét 360 hue với chữ trắng: min **4,5977:1** tại hue 164, max
 * 5,1318:1 tại hue 0. `L=57%` cho 4,2371:1 — trượt AA.
 *
 * ### Vì sao MỘT bảng cho cả hai theme, không phải hai
 *
 * Nền và chữ của avatar đều là màu tuyệt đối, không token nào, nên cặp này
 * KHÔNG đổi theo theme — 4,5977:1 là con số đúng ở cả sáng lẫn tối, chứng minh
 * một lần thay vì hai bảng chờ nhau lệch đi (app này đã có sẵn một ca như thế:
 * bảng tối chép hai lần trong `index.css` và phải có test riêng canh chúng bằng
 * nhau).
 *
 * Cái mà theme ĐÚNG LÀ có ảnh hưởng là ô màu so với NỀN TRANG, và `L=55%` được
 * chọn nằm giữa hai bề mặt nên nó nổi ở CẢ HAI: 4,13:1 ở chỗ tệ nhất của bảng
 * sáng (`surface-sunken`), 3,34:1 ở chỗ tệ nhất của bảng tối (`surface`). Một ô
 * nhạt (`L≈92%`) sẽ đạt trần chroma 0.038 — nhạt tới mức sáu người ra sáu vệt
 * gần như cùng màu — và một ô đậm (`L≈30%`) thì biến mất trên nền tối.
 */
const TILE_L_PERCENT = 55;
const TILE_C = 0.093;

/**
 * Chữ TRẮNG TUYỆT ĐỐI, không phải `--color-accent-ink`.
 *
 * `accent-ink` lật theo theme (trắng ở sáng, xanh đen ở tối) vì nó luôn đứng
 * trên `--color-accent`, thứ cũng lật. Nền avatar thì KHÔNG lật, nên mượn token
 * đó là để chữ hoá xanh đen trên một ô vẫn sáng — 1,9:1 ở hue tệ nhất.
 */
const TILE_INK = "oklch(100% 0 0)";

/**
 * Băm ổn định `seed` → hue nguyên trong [0, 360).
 *
 * FNV-1a 32-bit cộng một bước avalanche kiểu murmur3. Bước avalanche KHÔNG thừa:
 * `% 360` chỉ đọc các bit THẤP, mà FNV-1a trộn bit thấp kém nhất — hai id chỉ
 * khác nhau ở ký tự cuối vẫn ra hai hue cách nhau đúng bằng hiệu hai ký tự đó.
 * (Đo χ² trên 120k UUID/36 thùng: raw 36,6 · có avalanche 35,4, ngưỡng 95% là
 * 49,8 — cả hai ĐỀU đồng đều, nên đây là lựa chọn về cấu trúc chứ không phải một
 * lỗi phân bố đã đo được.)
 *
 * `Math.imul` chứ không `*`: nhân 32-bit trong `Number` vượt 2^53 và mất bit
 * thấp — tức mất đúng phần mà `% 360` sắp đọc.
 *
 * ⚠️ Hue là SỐ NGUYÊN, và đó là điều làm phép quét 0–359 của hàng rào thành
 * VÉT CẠN chứ không phải lấy mẫu: không có hue nào khác tồn tại được.
 */
export function avatarHue(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) % 360;
}

/**
 * Nền + chữ cho một hue, dưới dạng chuỗi CSS.
 *
 * Export TÁCH khỏi `avatarHue` để hàng rào quét được đủ 360 hue qua ĐÚNG đường
 * mà component đi — chôn phép dựng màu trong thân component thì hàng rào chỉ
 * kiểm được một bản chép tay của nó.
 */
export function avatarTintForHue(hue: number): { readonly bg: string; readonly ink: string } {
  // `L` khai thẳng bằng PHẦN TRĂM NGUYÊN chứ không phải `0.55 * 100`: phép nhân
  // đó cho `55.00000000000001` trong dấu phẩy động của JS, và chuỗi CSS sinh ra
  // sẽ mang cái đuôi ấy ra tận DOM.
  return {
    bg: `oklch(${String(TILE_L_PERCENT)}% ${String(TILE_C)} ${String(hue)})`,
    ink: TILE_INK,
  };
}

/**
 * Chữ đầu của từ ĐẦU + chữ đầu của từ CUỐI: "Nguyễn Văn An" → "NA". Một từ thì
 * một chữ. Lấy hai chữ ĐẦU của họ ("NG") thì mọi người họ Nguyễn ra cùng một
 * cặp; lấy hai từ đầu ("NV") thì lót "Văn"/"Thị" nuốt mất chữ mang thông tin.
 *
 * **Giữ nguyên dấu.** "Ế" là một chữ cái hợp lệ; bỏ dấu là Anh hoá tên người,
 * và không có ràng buộc kỹ thuật nào đòi phải bỏ — `toUpperCase()` của JS ánh xạ
 * được chữ Việt có dấu (hàng rào canh `Đ` · `Ế` · `Ứ` · `Ơ`).
 *
 * `normalize("NFC")` TRƯỚC khi cắt, và đây là chỗ duy nhất trong hàm có thể sai
 * lặng lẽ: ở dạng NFD, "Ế" là ba code point (E + ◌̂ + ◌́) nên lấy phần tử đầu ra
 * đúng chữ "E" trần — một cái tên bị bỏ dấu mà không ai gõ lệnh nào để bỏ. Dữ
 * liệu từ Postgres thường đã NFC, nhưng "thường" không phải một hàng rào.
 *
 * `Array.from` chứ không `[0]`: `[0]` cắt theo đơn vị UTF-16 nên một tên bắt đầu
 * bằng ký tự ngoài BMP ra nửa cặp thay thế, tức một ô vuông trắng.
 */
export function avatarInitials(name: string): string {
  const words = name
    .normalize("NFC")
    .split(/\s+/u)
    .filter((w) => w.length > 0);
  // Tên rỗng hoặc chỉ khoảng trắng: một ô màu KHÔNG có chữ trông giống một lỗi
  // render, còn "?" nói đúng thứ hệ thống biết — "chưa đọc được tên này".
  if (words.length === 0) return "?";
  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1] ?? "")[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * `sm` cho hàng danh sách và chân thanh điều hướng, `md` cho khối tài khoản ở
 * `/settings`.
 *
 * KHÔNG dùng thang của `Icon` (20px cố định): avatar chứa HAI chữ cái, còn icon
 * là một hình. Ở 20px, hai chữ phải xuống dưới 10px mới vừa — nhỏ hơn mọi cỡ chữ
 * khác trên màn. 28px giữ được `text-xs` (12px), cỡ chữ nhỏ nhất hệ này đang
 * dùng; đó là lý do chọn 28 chứ không phải một ngưỡng đo được.
 *
 * Cái giá của 28px đã đo: ở sidebar hẹp nhất (168px), hàng Cài đặt còn 55px cho
 * tên thay vì 63px như hồi hình dẫn đầu là bánh răng 20px. Cả hai đều cắt tên,
 * nên 8px đó không đổi thứ đọc được thành thứ không đọc được.
 */
const SIZE: Record<"sm" | "md", string> = {
  sm: "size-7 text-xs",
  md: "size-10 text-sm",
};

export function Avatar({
  name,
  seed,
  size = "sm",
  className = "",
}: {
  readonly name: string;
  /** Nguồn của MÀU. Truyền `id`, đừng truyền tên — xem chú thích đầu file. */
  readonly seed: string;
  readonly size?: "sm" | "md";
  readonly className?: string;
}) {
  const { bg, ink } = avatarTintForHue(avatarHue(seed));
  return (
    <span
      // `aria-hidden`: ở cả ba chỗ dùng, avatar đứng CẠNH chính cái tên nó viết
      // tắt. Để trình đọc màn hình đọc "N T" rồi đọc tiếp "Nguyễn Văn Test" là
      // bắt người ta nghe cùng một thông tin hai lần, lần đầu ở dạng khó hiểu
      // hơn. Nó là hình trang trí, đúng nghĩa của từ đó.
      aria-hidden
      // `shrink-0`: trong hàng flex của chân nav (sidebar 168px) tên bị `truncate`
      // co lại — không có nó thì ô tròn bị bóp thành bầu dục thay vì để chữ cắt.
      // `leading-none`: cỡ dòng mặc định của `text-xs` là 16px trong một ô 28px,
      // đủ để hai chữ cái lệch tâm xuống dưới một hai pixel.
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold select-none ${SIZE[size]} ${className}`}
      // Màu inline, KHÔNG qua `@theme`: mỗi người một hue nên đây không phải một
      // token — nó là dữ liệu. Xem khối chú thích ở đầu file.
      style={{ backgroundColor: bg, color: ink }}
    >
      {avatarInitials(name)}
    </span>
  );
}
