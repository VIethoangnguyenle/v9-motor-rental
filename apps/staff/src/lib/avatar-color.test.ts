import { describe, expect, it } from "bun:test";
import { avatarHue, avatarInitials, avatarTintForHue } from "../components/ui/avatar";
import { contrast, maxChroma, oklch, type Color } from "./color-math";
import { readTokens } from "./css-tokens";

/**
 * Hàng rào cho bảng màu THỨ HAI của app — bảng sinh lúc chạy trong
 * `components/ui/avatar.tsx`.
 *
 * ## Vì sao file này nằm ở `lib/` chứ không cạnh component nó canh
 *
 * `eslint.config.js` cho file dưới `components/ui/**` đúng một type
 * (`frontend-ui`) và đúng một cạnh (`frontend-ui → frontend-ui`), nên một test
 * đặt cạnh `avatar.tsx` sẽ KHÔNG được phép import `color-math.ts` — tức không
 * đo được gì. Chiều ngược lại thì mở: `lib/` là `frontend`, và `frontend →
 * frontend-ui` hợp lệ (`lib/status-icon.test.ts` đã đi đúng đường này để lấy
 * `ICONS` từ `ui/icon.tsx`).
 *
 * Cùng lý do đó là vì sao hàm sinh màu tự chứa trong `ui/` thay vì gọi
 * `color-math`: nếu nó gọi, `ui/avatar.tsx` phải import từ `lib/` — hàng rào
 * chặn — và `color-math.ts` sẽ mất tính chất mà chú thích đầu file nó tuyên bố
 * ("KHÔNG có chỗ gọi nào trong code chạy của app… nên nó không vào bundle").
 *
 * ## Vì sao nó đọc CHUỖI CSS chứ không đọc hằng số
 *
 * `avatarTintForHue` trả về đúng chuỗi mà `style` của component gắn vào DOM, và
 * hàng rào parse chính chuỗi đó. Đọc hằng `TILE_C` thay vì chuỗi thì sửa khuôn
 * chuỗi (gõ nhầm `%`, đổi thứ tự tham số, kẹp thêm `calc()`) qua được hàng rào
 * trong khi trình duyệt vẽ ra một màu khác — đúng lớp lỗi mà `css-tokens.ts`
 * sinh ra để chặn cho `index.css`.
 */

/**
 * `oklch(55% 0.093 164)` → `Color`. Ném khi không khớp: một regex bắt hụt trả
 * `NaN`, và `oklch()` đã có guard ném cho `NaN` — nhưng ném ở ĐÂY nói được chuỗi
 * nào hỏng, còn ném trong `oklch()` thì chỉ nói "tham số không hữu hạn".
 */
function parseOklch(css: string): Color {
  const m = /^oklch\((\d+(?:\.\d+)?)% (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)\)$/.exec(css);
  if (!m?.[1] || !m[2] || !m[3]) throw new Error(`Không parse được màu avatar: ${css}`);
  return oklch(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
}

/** Cặp nền/chữ ở một hue, đã dựng lại từ chuỗi CSS thật. */
function tint(hue: number): { bg: Color; ink: Color } {
  const t = avatarTintForHue(hue);
  return { bg: parseOklch(t.bg), ink: parseOklch(t.ink) };
}

/**
 * VÉT CẠN, không lấy mẫu: `avatarHue` trả số nguyên `% 360`, nên 360 giá trị
 * dưới đây là TOÀN BỘ hue mà app có thể vẽ ra.
 */
const HUES = Array.from({ length: 360 }, (_, h) => h);

/** Hue tệ nhất theo một phép đo — báo cáo kèm hue để lần đỏ tiếp theo chỉ đúng chỗ. */
function worst(measure: (hue: number) => number): { hue: number; value: number } {
  let out = { hue: -1, value: Infinity };
  for (const hue of HUES) {
    const value = measure(hue);
    if (value < out.value) out = { hue, value };
  }
  return out;
}

describe("màu avatar — tương phản chữ/nền", () => {
  /**
   * ⚠️ MỘT phép đo phủ CẢ HAI theme, và đó là một khẳng định về cấu trúc chứ
   * không phải một chỗ làm tắt: nền và chữ avatar đều là màu tuyệt đối, không
   * tham chiếu token nào, nên cặp này không đổi khi `data-theme` đổi. Hai bảng
   * riêng cho hai theme sẽ đo cùng một cặp hai lần và thêm một chỗ để chúng
   * lệch nhau. Thứ THẬT SỰ đổi theo theme là ô màu so với nền trang — canh ở
   * `describe` dưới, và ở đó thì đọc token từ chính `index.css`.
   */
  it("mọi hue 0–359 đạt ≥ 4,5:1 giữa chữ và nền", () => {
    const w = worst((hue) => {
      const { bg, ink } = tint(hue);
      return contrast(bg, ink);
    });
    expect({ hue: w.hue, value: Number(w.value.toFixed(4)) }).toEqual({ hue: 164, value: 4.5977 });
    expect(w.value).toBeGreaterThanOrEqual(4.5);
  });

  it("mọi hue nằm TRONG gamut sRGB — nền lẫn chữ", () => {
    const clipped = HUES.filter((hue) => {
      const { bg, ink } = tint(hue);
      return bg.clipped || ink.clipped;
    });
    expect(clipped).toEqual([]);
  });

  /**
   * Khẳng định vì sao `C` là 0.093 chứ không phải một số tròn hơn: nó ĐÚNG BẰNG
   * trần gamut ở hue hẹp nhất trên cả vòng. Không có test này thì việc `C` bám
   * sát trần chỉ là một câu trong chú thích, và nấc kế tiếp (0.094) tràn gamut
   * ở hue 195 mà phép quét `clipped` bên trên vẫn xanh cho tới khi ai đó thật
   * sự nâng nó lên.
   */
  it("C bám ĐÚNG trần gamut ở hue hẹp nhất (195), và nấc kế tiếp thì tràn", () => {
    const { bg } = tint(195);
    const c = bg.lab[1] ** 2 + bg.lab[2] ** 2;
    expect(Math.sqrt(c)).toBeCloseTo(maxChroma(0.55, 195), 3);
    expect(oklch(0.55, 0.094, 195).clipped).toBe(true);
  });
});

describe("màu avatar — ô màu nổi trên nền trang, ở CẢ HAI theme", () => {
  /**
   * Đây mới là phần thật sự phụ thuộc theme, nên nó đọc token từ chính
   * `index.css` thay vì chép giá trị vào đây — chép là dựng bản sao thứ hai của
   * bảng màu, đúng thứ `css-tokens.ts` tồn tại để khỏi phải làm.
   *
   * Ngưỡng 3:1 là ngưỡng SC 1.4.11 cho thành phần giao diện. Avatar là trang trí
   * (`aria-hidden`) nên WCAG không đòi nó, nhưng con số này là thứ giữ cho
   * `L=55%` không bị đẩy về một phía: kéo lên cho sáng thì ô biến mất trên bảng
   * sáng, kéo xuống thì biến mất trên bảng tối. Không có nó, hàng rào tương phản
   * chữ/nền bên trên vẫn xanh cho một ô không ai nhìn thấy.
   */
  const CASES: readonly (readonly [string, string])[] = [
    ["@theme {", "sáng"],
    ['[data-theme="dark"] {', "tối"],
  ];

  for (const [marker, label] of CASES) {
    it(`bảng ${label}: ô màu ≥ 3:1 với canvas · surface · surface-sunken`, async () => {
      const tokens = await readTokens(marker);
      for (const name of ["canvas", "surface", "surface-sunken"] as const) {
        const surface = tokens[name];
        if (!surface) throw new Error(`index.css thiếu token --color-${name}`);
        const w = worst((hue) => contrast(tint(hue).bg, surface));
        expect({ name, value: w.value >= 3 }).toEqual({ name, value: true });
      }
    });
  }
});

describe("màu avatar — băm", () => {
  it("cùng seed luôn cho cùng hue", () => {
    const seed = "e22e1d39-2f6c-4863-9855-067531dc9166";
    expect(avatarHue(seed)).toBe(avatarHue(seed));
    expect(avatarHue(seed)).toBe(15);
  });

  it("hue luôn là số nguyên trong [0, 360) — điều làm phép quét trên thành vét cạn", () => {
    for (let i = 0; i < 500; i++) {
      const h = avatarHue(`seed-${String(i)}`);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  /**
   * Bước avalanche tồn tại vì `% 360` chỉ đọc bit THẤP, mà FNV-1a trộn bit thấp
   * kém nhất. Đo trên 26 seed chỉ khác nhau ký tự cuối (`nhan-vien-a` …
   * `nhan-vien-z`):
   *
   *   FNV-1a trần   → 179, 358, 177, 356, 175, … — hiệu liên tiếp chỉ nhận ĐÚNG
   *                   HAI giá trị (+179 / −181), tức 26 hue nằm trên một cái
   *                   thang đều và TOÀN SỐ LẺ; nửa vòng hue không với tới được.
   *   có avalanche  → 25/25 hiệu liên tiếp khác nhau.
   *
   * Ngưỡng dưới đây (> 20 hiệu phân biệt) là để canh TÍNH CHẤT đó, không phải để
   * ghim con số 25 — một hằng số băm khác vẫn đúng miễn nó phá được cái thang.
   */
  it("băm phá được cấu trúc của seed gần nhau — không rơi về thang đều", () => {
    const hues = "abcdefghijklmnopqrstuvwxyz".split("").map((c) => avatarHue(`nhan-vien-${c}`));
    const steps = new Set(hues.slice(1).map((h, i) => h - (hues[i] ?? 0)));
    expect(steps.size).toBeGreaterThan(20);
  });
});

describe("chữ cái avatar", () => {
  it("chữ đầu của từ ĐẦU + từ CUỐI", () => {
    expect(avatarInitials("Nguyễn Văn An")).toBe("NA");
    expect(avatarInitials("Trần Thị B")).toBe("TB");
  });

  it("một từ thì một chữ", () => {
    expect(avatarInitials("Hoàng")).toBe("H");
  });

  it("GIỮ DẤU — bỏ dấu là Anh hoá tên người", () => {
    expect(avatarInitials("Đặng Ế")).toBe("ĐẾ");
    expect(avatarInitials("Ứng Ơn")).toBe("ỨƠ");
  });

  /**
   * Dạng NFD là ca sai LẶNG LẼ: không normalize thì "Ế" (E + ◌̂ + ◌́) cắt ra chữ
   * "E" trần và cái tên bị bỏ dấu mà không lệnh nào bỏ. Hai chuỗi dưới đây bằng
   * nhau về mặt Unicode nhưng khác nhau về code point.
   */
  it("NFD cho cùng kết quả với NFC", () => {
    expect(avatarInitials("Đặng Ế".normalize("NFD"))).toBe("ĐẾ");
  });

  it("tên rỗng hoặc chỉ khoảng trắng KHÔNG ra chuỗi rỗng", () => {
    expect(avatarInitials("")).toBe("?");
    expect(avatarInitials("   \t\n ")).toBe("?");
  });

  it("khoảng trắng thừa hai đầu không tạo ra từ rỗng", () => {
    expect(avatarInitials("  Lê Văn C  ")).toBe("LC");
  });

  /**
   * Sáu tài khoản trong `staff_users` của môi trường dev. Hàng rào chống ĐỤNG
   * ĐỘ: hai người khác nhau ra cùng chữ cái thì chữ cái thôi không còn nhận
   * dạng được ai, và màu là kênh duy nhất còn lại — mà màu thì có thể trùng.
   */
  it("sáu tài khoản seed cho sáu cặp chữ KHÁC NHAU", () => {
    const names = [
      "Chủ shop",
      "Nguyễn Văn Test",
      "Trần Thị B",
      "Lê Văn C",
      "Phạm Thị D",
      "Nav Probe Owner",
    ];
    const initials = names.map(avatarInitials);
    expect(initials).toEqual(["CS", "NT", "TB", "LC", "PD", "NO"]);
    expect(new Set(initials).size).toBe(names.length);
  });
});
