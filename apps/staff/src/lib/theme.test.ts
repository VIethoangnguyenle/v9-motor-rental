import { runInNewContext } from "node:vm";
import { describe, expect, it } from "bun:test";
import { readTokens, toSrgbHex } from "./css-tokens";
import {
  CANVAS_HEX,
  THEME_COLOR_TAGS,
  THEME_STORAGE_KEY,
  nextChoice,
  parseChoice,
  resolveTheme,
  themeColorFor,
} from "./theme";

/** Đường dẫn thật tới `index.html` — ba nhóm test dưới đây đều đọc chính nó. */
const readIndexHtml = () => Bun.file(new URL("../../index.html", import.meta.url).pathname).text();

describe("parseChoice", () => {
  it("nhận ba giá trị hợp lệ", () => {
    expect(parseChoice("light")).toBe("light");
    expect(parseChoice("dark")).toBe("dark");
    expect(parseChoice("system")).toBe("system");
  });

  it("rơi về 'system' với dữ liệu rác — localStorage là dữ liệu KHÔNG TIN ĐƯỢC", () => {
    expect(parseChoice(null)).toBe("system");
    expect(parseChoice("")).toBe("system");
    expect(parseChoice("Dark")).toBe("system");
    expect(parseChoice('{"a":1}')).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("lựa chọn tường minh THẮNG hệ điều hành ở cả hai chiều", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("'system' đi theo hệ điều hành", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("nextChoice — vòng ba trạng thái", () => {
  it("system → light → dark → system", () => {
    expect(nextChoice("system")).toBe("light");
    expect(nextChoice("light")).toBe("dark");
    expect(nextChoice("dark")).toBe("system");
  });
});

describe("khoá lưu trữ", () => {
  it("giữ đúng chuỗi 'v9-theme'", () => {
    // Khoá này là hợp đồng với dữ liệu ĐÃ NẰM trên máy người dùng: đổi tên nó
    // làm mọi lựa chọn đã lưu thành mồ côi, và app im lặng quay về "theo máy"
    // trên mọi máy đang cài.
    expect(THEME_STORAGE_KEY).toBe("v9-theme");
  });

  it("khớp CHÍNH XÁC khoá mà script trong index.html dùng", async () => {
    // Script chống nháy trắng trong `index.html` chép tay khoá này — nó chạy
    // TRƯỚC khi bundle tải, nên không import được từ đây. Test này là sợi dây
    // duy nhất giữ hai chỗ bằng nhau, nên nó phải ĐỌC `index.html` thật: một
    // assertion chỉ so hằng số ở đây với hằng số viết trong test vẫn xanh khi
    // hai chỗ đã lệch nhau, tức canh đúng thứ nó không canh.
    //
    // Lệch nhau hỏng trong im lặng: script đặt `data-theme` từ một khoá không
    // ai ghi, nên nút gạt vẫn chạy đúng trong phiên và chỉ nháy trắng ở lần tải
    // sau — mà nháy trắng thì chỉ thấy trên bản build, không thấy ở `vite dev`.
    const html = await readIndexHtml();
    const key = /localStorage\.getItem\(\s*"([^"]*)"\s*\)/.exec(html)?.[1];
    expect(key).toBe(THEME_STORAGE_KEY);
  });
});

/**
 * Trang có BA thẻ `<meta name="theme-color">`, và trình duyệt chỉ dùng MỘT: thẻ
 * ĐẦU TIÊN theo thứ tự tài liệu có `media` khớp (HTML Standard, §meta
 * theme-color). Đó là chỗ bản đầu của `applyChoice` sai: nó chỉ ghi thẻ không có
 * `media`, tức thẻ ĐỨNG CUỐI — nên khi máy đang sáng mà người dùng ép TỐI, thẻ
 * `(prefers-color-scheme: light)` vẫn khớp, vẫn đứng trước, và thanh địa chỉ ở
 * lại màu sáng trên một app đã tối. Đo được trên bản build, không có lỗi ở đâu.
 *
 * `themeColorFor` trả lời "thẻ NÀY phải mang màu gì", nên lời giải không phụ
 * thuộc vào việc đọc đúng luật chọn thẻ: khi người dùng ép theme, CẢ BA thẻ đều
 * mang màu hiệu lực, nên thẻ nào thắng cũng ra cùng một màu.
 */
describe("themeColorFor", () => {
  it("theo hệ điều hành: mỗi thẻ media giữ đúng màu của theme nó phục vụ", () => {
    expect(themeColorFor("light", "system", false)).toBe(CANVAS_HEX.light);
    expect(themeColorFor("dark", "system", false)).toBe(CANVAS_HEX.dark);
    expect(themeColorFor("light", "system", true)).toBe(CANVAS_HEX.light);
    expect(themeColorFor("dark", "system", true)).toBe(CANVAS_HEX.dark);
  });

  it("theo hệ điều hành: thẻ không media đi theo máy — nó là thẻ dự phòng", () => {
    expect(themeColorFor(null, "system", true)).toBe(CANVAS_HEX.dark);
    expect(themeColorFor(null, "system", false)).toBe(CANVAS_HEX.light);
  });

  it("ép theme: MỌI thẻ mang màu hiệu lực, kể cả thẻ của theme ngược lại", () => {
    // Máy SÁNG + ép TỐI. Thẻ `(prefers-color-scheme: light)` vẫn khớp và vẫn
    // đứng đầu, nên nó phải mang màu TỐI — nếu không, thanh địa chỉ nói dối.
    expect(themeColorFor("light", "dark", false)).toBe(CANVAS_HEX.dark);
    expect(themeColorFor("dark", "dark", false)).toBe(CANVAS_HEX.dark);
    expect(themeColorFor(null, "dark", false)).toBe(CANVAS_HEX.dark);

    // Máy TỐI + ép SÁNG — chiều ngược lại, cùng một cái bẫy.
    expect(themeColorFor("dark", "light", true)).toBe(CANVAS_HEX.light);
    expect(themeColorFor("light", "light", true)).toBe(CANVAS_HEX.light);
    expect(themeColorFor(null, "light", true)).toBe(CANVAS_HEX.light);
  });
});

describe("bảng thẻ mà applyChoice duyệt", () => {
  it("mỗi selector trỏ đúng theme mà nó được gán", () => {
    // `themeColorFor` được tách ra để test được QUYẾT ĐỊNH; bảng này là chỗ ÁP
    // quyết định đó, và nó sai được mà vẫn type-safe — cả hai phần tử đều là
    // `[string, EffectiveTheme | null]`. Hoán hai cặp cho nhau thì sau khi người
    // dùng quay về "Theo máy", thẻ sáng mang màu tối và ngược lại.
    for (const [selector, theme] of THEME_COLOR_TAGS) {
      expect(/media\*="(\w+)"/.exec(selector)?.[1] ?? null).toBe(theme);
    }
  });
});

describe("màu canvas chép tay", () => {
  it("CANVAS_HEX đúng bằng --color-canvas của index.css, cả hai theme", async () => {
    // Không có khẳng định này thì năm bản chép chỉ được canh cho khớp NHAU, chứ
    // không khớp NGUỒN: ai chỉnh `--color-canvas` là cả bộ test vẫn xanh trong
    // khi thanh địa chỉ và splash screen thôi khớp nền app. Đây là mức xa nhất
    // đi được dưới ràng buộc "manifest và thẻ meta không đọc được biến CSS".
    const light = (await readTokens("@theme {"))["canvas"];
    const dark = (await readTokens(':root[data-theme="dark"] {'))["canvas"];
    if (!light || !dark) throw new Error("index.css thiếu --color-canvas ở một trong hai khối");

    expect(toSrgbHex(light)).toBe(CANVAS_HEX.light);
    expect(toSrgbHex(dark)).toBe(CANVAS_HEX.dark);
  });

  it("khớp giữa theme.ts, ba thẻ meta của index.html và manifest của vite.config.ts", async () => {
    const dir = new URL("../../", import.meta.url).pathname;
    const html = await Bun.file(`${dir}index.html`).text();
    const config = await Bun.file(`${dir}vite.config.ts`).text();

    const contentOf = (attrs: string) =>
      new RegExp(`<meta name="theme-color" content="(#[0-9a-f]{6})"${attrs}`).exec(html)?.[1];

    expect(contentOf(' media="\\(prefers-color-scheme: light\\)"')).toBe(CANVAS_HEX.light);
    expect(contentOf(' media="\\(prefers-color-scheme: dark\\)"')).toBe(CANVAS_HEX.dark);
    expect(contentOf(" />")).toBe(CANVAS_HEX.light);

    // Manifest chỉ có MỘT giá trị — nó không nhận media query, nên splash luôn sáng.
    expect(/background_color: "(#[0-9a-f]{6})"/.exec(config)?.[1]).toBe(CANVAS_HEX.light);
    expect(/theme_color: "(#[0-9a-f]{6})"/.exec(config)?.[1]).toBe(CANVAS_HEX.light);
  });
});

/**
 * Ném khi script chạm thứ DOM giả không dựng.
 *
 * Không có nó thì `undefined` trôi tiếp và test chỉ đỏ NẾU tình cờ có assertion
 * đứng sau — đo được: thêm `documentElement.classList.add(...)` vào script mà
 * vẫn 14/14 xanh. Đây là điều kiện thứ hai; điều kiện thứ nhất là `try` trong
 * chính script phải bọc HẸP (chỉ `getItem`), nếu không nó nuốt lỗi này.
 */
function strictDouble<T extends object>(target: T, name: string): T {
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return Reflect.get(t, key) as unknown;
      throw new Error(
        `DOM giả không dựng ${name}.${String(key)} — đọc lại script trong index.html`,
      );
    },
  });
}

/**
 * Chạy THẬT đoạn script trong `<head>` của `index.html`, không phải một bản chép
 * của nó, và trên các thẻ meta ĐỌC TỪ CHÍNH FILE ĐÓ, không phải một fixture gõ
 * tay — fixture gõ tay nghĩa là xoá một thẻ khỏi HTML mà harness vẫn thấy đủ ba.
 *
 * Đó là mảnh logic duy nhất của app KHÔNG import được — nó phải chạy trước khi
 * bundle tải — nên nếu test này không thực thi nó thì nó không có test nào, và
 * thứ nó canh (nháy trắng, màu thanh địa chỉ) lại là thứ chỉ bản build mới lộ.
 *
 * Giới hạn còn lại, nói thẳng ra vì nó KHÔNG được canh ở đây: harness đọc cả file
 * nên không thấy THỨ TỰ giữa script và ba thẻ meta. Thứ tự đó có một assertion
 * riêng bên dưới.
 */
async function runHeadScript(stored: string | null) {
  const html = await readIndexHtml();
  const source = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (source === undefined) throw new Error("index.html không còn script đồng bộ trong <head>");

  const metas = [...html.matchAll(/<meta name="theme-color"([^>]*)>/g)].map((m) => ({
    media: /media="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? "",
    content: /content="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? "",
  }));
  const before = metas.map((m) => m.content);

  /** Khớp selector THẬT, kể cả phần `name=` — bỏ qua nó thì đổi tên thẻ vẫn xanh. */
  const matches = (selector: string, meta: { media: string }) => {
    const name = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
    if (name !== "theme-color") return false;
    if (selector.includes(":not([media])")) return meta.media === "";
    const wanted = /media\*="(\w+)"/.exec(selector)?.[1];
    return wanted === undefined || meta.media.includes(wanted);
  };

  const attrs: Record<string, string> = {};
  const nodes = metas.map((m, i) => strictDouble(m, `meta[${String(i)}]`));
  const doc = strictDouble(
    {
      documentElement: strictDouble(
        {
          setAttribute: (k: string, v: string) => {
            attrs[k] = v;
          },
        },
        "documentElement",
      ),
      querySelector: (selector: string) => nodes.find((m) => matches(selector, m)) ?? null,
      querySelectorAll: (selector: string) => nodes.filter((m) => matches(selector, m)),
    },
    "document",
  );

  // `runInNewContext` chứ không `new Function`: đoạn kia là một script cổ điển
  // trong `<head>`, chạy nó như một thân hàm là chạy một thứ khác thứ sẽ ship.
  runInNewContext(source, {
    localStorage: strictDouble({ getItem: () => stored }, "localStorage"),
    document: doc,
  });
  return { attrs, before, contents: metas.map((m) => m.content) };
}

describe("script chống nháy trắng trong index.html", () => {
  it("ép TỐI: đặt data-theme và kéo CẢ BA thẻ theme-color về màu tối", async () => {
    // Thẻ `(prefers-color-scheme: light)` vẫn khớp trên một máy đang sáng và vẫn
    // đứng đầu, nên để nguyên nó là để thanh địa chỉ sáng trên một app đã tối —
    // ngay từ lần tải trang, trước cả khi người dùng chạm vào nút gạt.
    const { attrs, contents } = await runHeadScript("dark");
    expect(attrs["data-theme"]).toBe("dark");
    expect(contents).toEqual([CANVAS_HEX.dark, CANVAS_HEX.dark, CANVAS_HEX.dark]);
  });

  it("ép SÁNG trên máy tối: cùng một cái bẫy, chiều ngược lại", async () => {
    const { attrs, contents } = await runHeadScript("light");
    expect(attrs["data-theme"]).toBe("light");
    expect(contents).toEqual([CANVAS_HEX.light, CANVAS_HEX.light, CANVAS_HEX.light]);
  });

  it("theo máy hoặc dữ liệu rác: không chạm gì, để trình duyệt tự chọn", async () => {
    for (const stored of ["system", null, "Dark", '{"a":1}']) {
      const { attrs, before, contents } = await runHeadScript(stored);
      expect(attrs["data-theme"]).toBeUndefined();
      expect(contents).toEqual(before);
    }
  });

  it("đứng SAU ba thẻ meta — script đồng bộ không thấy thẻ nằm dưới nó", async () => {
    // Dời script lên trước ba thẻ là kiểu hỏng im lặng nhất trong cả file này:
    // `querySelectorAll` trả về rỗng, vòng lặp không chạy, không ném gì, và
    // harness ở trên KHÔNG thấy được vì nó đọc cả file rồi mới dựng DOM giả.
    const html = await readIndexHtml();
    // Mốc phải là THẺ (`<meta name=…`), không phải chuỗi `name="theme-color"`:
    // chính script cũng chứa chuỗi đó trong hai selector của nó, nên so với nó
    // là so script với chính mình — luôn xanh.
    expect(html.indexOf("<script>")).toBeGreaterThan(html.lastIndexOf('<meta name="theme-color"'));
  });

  it("selector trong script trỏ đúng tên thẻ đang có trong HTML", async () => {
    // `theme-colour` thay vì `theme-color` là một chữ, không lỗi ở đâu, và mọi
    // thẻ giữ nguyên màu theo hệ điều hành.
    const html = await readIndexHtml();
    const source = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const name = /querySelectorAll\('meta\[name="([^"]+)"\]'\)/.exec(source)?.[1];
    expect(name).toBeDefined();
    expect(html).toContain(`<meta name="${String(name)}"`);
  });
});
