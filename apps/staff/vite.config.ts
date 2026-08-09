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
      manifest: {
        name: "V9 Motor Rental — Nhân viên",
        short_name: "V9 Staff",
        description: "Lịch, bàn giao xe, khách hàng",
        lang: "vi",
        display: "standalone",
        background_color: "#111111",
        theme_color: "#111111",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
