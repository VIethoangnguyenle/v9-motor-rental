import messages from "@/messages/vi.json";
import { CONTAINER } from "./layout";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 h-16 border-b border-hairline bg-canvas">
      <div className={`${CONTAINER} flex h-full items-center justify-between gap-10`}>
        <a
          href="/"
          className="label-upper text-lg whitespace-nowrap text-ink no-underline"
          style={{ fontSize: 18 }}
        >
          {messages.site.title}
        </a>
        {/* DESIGN.md §8 yêu cầu hamburger ở mobile — CHƯA LÀM (cần client
            component). Tạm ẩn dưới 768px để wordmark không gãy dòng. */}
        <nav className="hidden gap-10 md:flex">
          <a href="/xe" className="label-upper text-ink hover:underline">
            {messages.nav.vehicles}
          </a>
          <a href="/#thu-tuc" className="label-upper text-ink hover:underline">
            {messages.nav.howItWorks}
          </a>
        </nav>
      </div>
    </header>
  );
}
