import type { ReactNode } from "react";
import messages from "@/messages/vi.json";

export const metadata = {
  title: messages.site.title,
  description: messages.site.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "vi"}>
      <body>{children}</body>
    </html>
  );
}
