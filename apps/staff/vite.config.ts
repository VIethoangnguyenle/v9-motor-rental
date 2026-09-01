import { execSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };

/**
 * Nhãn nhận dạng bản dựng, hiện ở chân thanh điều hướng.
 *
 * Sinh ra từ một ca thật: `vite preview` từng chạy ở ĐÚNG cổng của dev server,
 * nên service worker của bản build đăng ký vào origin đó và tiếp tục phục vụ
 * bản đã cache kể cả sau khi dev server quay lại. Trình duyệt hiện một app
 * trông đúng nhưng là bản CŨ, và không có cách nào nhìn ra — chỉ mở DevTools
 * đọc `navigator.serviceWorker.controller` mới biết.
 *
 * Ba mẩu dưới đây trả lời đúng câu "tôi đang xem bản nào":
 *   • version — nhảy khi phát hành
 *   • commit  — nhảy theo từng lần sửa, kể cả chưa bump version
 *   • giờ dựng — nhảy mỗi lần build, nên bản cache đứng yên là thấy ngay
 *
 * `git` có thể vắng mặt (build trong Docker chỉ COPY mã nguồn), nên hỏng thì
 * rơi về "nogit" chứ KHÔNG làm vỡ build.
 */
function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "nogit";
  }
}

export default defineConfig({
  // `define` thay thế bằng HẰNG CHUỖI lúc build — cùng cơ chế `VITE_API_URL`
  // (`docs/workspaces/staff.md`): đổi giá trị thì phải dựng lại, đặt lúc chạy
  // không có tác dụng gì.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    // Tailwind v4 cho Vite dùng plugin riêng, KHÔNG qua PostCSS như apps/web.
    // Hai app hai cơ chế build nên hai cách cắm — đúng, không phải thiếu nhất quán.
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // ⚠️ Đọc kỹ giới hạn của dòng dưới trước khi coi nó là hàng rào.
        //
        // `navigateFallbackDenylist` CHỈ áp cho request `mode: "navigate"`. Hôm nay
        // nó KHÔNG BAO GIỜ khớp gì: Eden và supertokens-web-js gọi API bằng `fetch`
        // sang origin khác (VITE_API_URL, mặc định :3001), còn app này chạy ở :3003 —
        // service worker không đứng giữa đường đó. Bản dựng chỉ có đúng một
        // `registerRoute` là NavigationRoute này, không có runtimeCaching nào cho API.
        //
        // Giữ lại vì nó là bảo hiểm rẻ cho một thay đổi rất dễ xảy ra: proxy API về
        // cùng origin (`staff.$ROOT_DOMAIN/auth/*`) để né CORS. Ngày đó tới mà thiếu
        // dòng này thì app shell được trả cho đường API, và hỏng trong im lặng.
        //
        // Thứ THẬT SỰ bảo vệ ca "session đã chết mà vẫn thấy màn hình cũ" là guard ở
        // `beforeLoad` của router: nó gọi /staff/me qua mạng và hỏng-thì-chặn. Đừng
        // dựa vào dòng này cho ca đó. §6 docs/plans/2026-08-10-staff-auth-design.md.
        navigateFallbackDenylist: [/^\/auth\//, /^\/staff\//],
      },
      manifest: {
        name: "V9 Motor Rental — Nhân viên",
        short_name: "V9 Staff",
        description: "Lịch, bàn giao xe, khách hàng",
        lang: "vi",
        display: "standalone",
        /*
         * ⚠️ Hai màu này TỪNG là `#111111` — gần đen, trong khi theme MẶC ĐỊNH
         * của `apps/staff` là nền sáng (`--color-canvas: oklch(98.4% 0.003 255)`).
         * Hệ quả sau khi cài: splash screen gần đen chớp lên rồi nhường chỗ cho
         * một app trắng, và thanh trạng thái mang màu không có ở đâu trong giao diện.
         *
         * `#111111` là màu của `apps/web` (nền đen tuyền, `DESIGN.md` §2) lọt
         * sang đây — đúng thứ `docs/workspaces/staff.md` dặn đừng bê qua. Manifest
         * nằm ngoài tầm với của cả detector lẫn typecheck nên nó sống sót lâu hơn
         * mọi chỗ khác.
         *
         * `#f8fafc` = sRGB của `--color-canvas` bản SÁNG. Khai lại bằng tay vì
         * manifest không đọc được biến CSS. Cùng con số đó còn nằm ở ba thẻ
         * `<meta name="theme-color">` trong `index.html` và ở `CANVAS_HEX`
         * (src/lib/theme.ts) — NĂM chỗ chép tay, kể cả hai dòng ngay dưới đây;
         * `theme.test.ts` đối chiếu cả năm với chính `index.css`.
         *
         * Chỉ có MỘT giá trị dù app có hai theme: manifest không nhận media
         * query, nên splash screen luôn là bản sáng. Thẻ meta trong `index.html`
         * mới là thứ theo được theme; đừng cố nhét biến thể tối vào đây.
         */
        background_color: "#f8fafc",
        theme_color: "#f8fafc",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
