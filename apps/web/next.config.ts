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
  },
};

export default config;
