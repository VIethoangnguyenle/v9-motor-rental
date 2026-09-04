import messages from "@/messages/vi.json";
import { CONTAINER } from "./layout";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 h-16 border-b border-hairline bg-canvas">
      <div className={`${CONTAINER} flex h-full items-center justify-between gap-10`}>
        <a
          href="/"
          className="label-upper flex items-center gap-3 text-lg whitespace-nowrap text-ink no-underline"
          style={{ fontSize: 18 }}
        >
          {/*
            Mark dùng NGUYÊN BẢN, đủ màu — khác bản một màu mà `apps/staff` dùng.
            Ở đó nền sáng và app có ba trạng thái theme nên mark phải đi theo màu
            chữ; ở đây nền là `canvas` đen tuyền cố định (`DESIGN.md` §1), tức
            đúng môi trường mà mark được vẽ ra để sống: nét trắng, ba răng
            `#f72b28`.

            `<img>` chứ không `next/image`: đây là một SVG tĩnh 32px, không phải
            ảnh nội dung. `next/image` không tối ưu SVG, và `DESIGN.md` §8 đòi
            `next/image` + `priority` cho ảnh HERO vì đó là LCP — một logo trong
            thanh đầu không phải thứ đó.

            `alt=""` + `aria-hidden`: tên thương hiệu đã nằm ngay cạnh dưới dạng
            chữ thật, nên để mark mang alt nữa là đọc hai lần.
          */}
          <img
            src="/brand/v9-mark.svg"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0"
          />
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
