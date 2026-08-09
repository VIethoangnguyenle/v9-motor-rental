import type { ReactNode } from "react";
import { Archivo } from "next/font/google";
import messages from "@/messages/vi.json";
import "./globals.css";

// DESIGN.md §3: một họ font duy nhất. Subset "vietnamese" là BẮT BUỘC —
// thiếu nó thì dấu tiếng Việt rơi về font hệ thống và cả trang lộn xộn.
// Chỉ nạp 3 trọng lượng đang thật sự dùng: 300 thân bài, 400 lead, 700 display.
const archivo = Archivo({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "700"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata = {
  title: messages.site.title,
  description: messages.site.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "vi"} className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
