import type { NextConfig } from "next";

// Đọc LÚC BUILD. Đổi NEXT_PUBLIC_DIRECTUS_URL bắt buộc phải build lại image của web —
// cùng bản chất với VITE_API_URL của apps/staff.
const directus = new URL(process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "http://localhost:8055");

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: `${import.meta.dirname}/../..`,
  images: {
    // Thiếu khối này thì next/image TỪ CHỐI THẲNG ảnh từ Directus, không phải cảnh báo.
    remotePatterns: [
      {
        protocol: directus.protocol === "https:" ? "https" : "http",
        hostname: directus.hostname,
        port: directus.port,
        pathname: "/assets/**",
      },
    ],
    // ⚠️ remotePatterns ĐÚNG mà ảnh vẫn hỏng ở dev — đây là chốt chặn thứ hai.
    //
    // Next 16.3 thêm SSRF guard trong fetchExternalImage: từ chối mọi ảnh remote
    // có host resolve về IP private, rồi báo ra ngoài thành 400 `"url" parameter
    // is not allowed` — thông báo trỏ nhầm hoàn toàn sang remotePatterns. Ở dev,
    // Directus là localhost:8055 nên MỌI ảnh xe bị chặn. Đổi sang IP LAN không
    // cứu được: 192.168.x.x cũng là private.
    //
    // CHỈ mở ở dev. Prod trỏ vào data.<domain> công khai, và bật cờ này ở prod là
    // mở đúng lỗ SSRF mà guard sinh ra để bịt — optimizer sẽ chịu fetch những URL
    // nội bộ do người ngoài đưa vào.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
};

export default config;
