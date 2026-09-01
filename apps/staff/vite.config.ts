import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
         * ⚠️ Hai màu này TỪNG là `#111111` — gần đen, trong khi `apps/staff` là
         * app NỀN SÁNG (`--color-canvas: oklch(98.4% 0 0)`). Hệ quả sau khi cài:
         * splash screen gần đen chớp lên rồi nhường chỗ cho một app trắng, và
         * thanh trạng thái mang màu không có ở đâu trong giao diện.
         *
         * `#111111` là màu của `apps/web` (nền đen tuyền, `DESIGN.md` §2) lọt
         * sang đây — đúng thứ `docs/workspaces/staff.md` dặn đừng bê qua. Manifest
         * nằm ngoài tầm với của cả detector lẫn typecheck nên nó sống sót lâu hơn
         * mọi chỗ khác.
         *
         * `#fafafa` = sRGB của `--color-canvas`. Khai lại bằng tay vì manifest
         * không đọc được biến CSS; `index.html` (`<meta name="theme-color">`) là
         * chỗ thứ hai phải khớp.
         */
        background_color: "#fafafa",
        theme_color: "#fafafa",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
