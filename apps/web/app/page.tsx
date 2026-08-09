import Image from "next/image";
import { api } from "@/lib/api";
import messages from "@/messages/vi.json";
import { PLACEHOLDER_VEHICLES } from "./_placeholder-data";

// SEO quan trọng với site công khai → ISR thay vì force-dynamic.
//
// App này KHÔNG chốt đơn và KHÔNG đọc availability thời gian thực — khách chỉ gửi
// yêu cầu, nhân viên chốt trong apps/staff. Vì vậy trang xe tĩnh hoàn toàn được,
// đúng lý do Next được chọn. Xem §3.3 của
// docs/plans/2026-08-05-round2-directus-staff-design.md.
export const revalidate = 60;

const CONTAINER = "mx-auto w-full max-w-page px-6";

/**
 * Ảnh trong prototype là ẢNH AI SINH, không phải xe của shop. Nhãn dưới góc phải
 * phải còn nguyên cho tới khi thay bằng ảnh thật — gỡ nhãn mà không thay ảnh là
 * nói dối khách. PRODUCT.md nguyên tắc #2.
 */
function PlaceholderTag() {
  return (
    <span className="caption-text absolute right-3 bottom-3 border border-hairline bg-canvas/70 px-2 py-0.5 text-body">
      {messages.placeholder.imageTag}
    </span>
  );
}

export default async function Page() {
  const { data, error } = await api.health.get();
  const apiStatus = error ? "lỗi" : data.status;

  return (
    <>
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
            <a href="#doi-xe" className="label-upper text-ink hover:underline">
              {messages.nav.vehicles}
            </a>
            <a href="#thu-tuc" className="label-upper text-ink hover:underline">
              {messages.nav.howItWorks}
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Băng ảnh hero: ảnh CHÍNH LÀ băng, không khung card ──
            priority vì ảnh này là LCP của trang. DESIGN.md §8. */}
        <section className="relative flex min-h-[min(78vh,720px)] items-end overflow-hidden">
          <Image
            src="/placeholder/hero.jpg"
            alt="Mô tô phân khối lớn đỗ trong garage tối"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* Phủ đen thuần để chữ đọc được trên ảnh — không phải gradient màu,
              đây thuộc nhóm "độ sâu từ ảnh". DESIGN.md §6. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/15" />
          <div className="relative w-full py-16">
            <div className={CONTAINER}>
              <h1 className="display-xl m-0 text-ink">{messages.hero.headline}</h1>
              <p className="my-6 max-w-[46ch] text-lg text-body-strong">{messages.hero.sub}</p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="#gui-yeu-cau"
                  className="btn-shape border-ink bg-ink text-canvas no-underline transition-colors hover:bg-transparent hover:text-ink"
                >
                  {messages.booking.cta}
                </a>
                <a
                  href="#doi-xe"
                  className="btn-shape border-ink bg-transparent text-ink no-underline transition-colors hover:bg-ink hover:text-canvas"
                >
                  {messages.hero.secondaryCta}
                </a>
              </div>
            </div>
            <PlaceholderTag />
          </div>
        </section>

        {/* ── Bảng thủ tục: dữ kiện đã xác nhận trong PRODUCT.md, không bịa ── */}
        <section id="thu-tuc" className="py-section">
          <div className={CONTAINER}>
            <h2 className="display-lg m-0 text-ink">{messages.terms.heading}</h2>
            <div className="mt-10 grid grid-cols-1 gap-px border border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-4">
              {[
                messages.terms.papers,
                messages.terms.deposit,
                messages.terms.unit,
                messages.terms.delivery,
              ].map((item) => (
                <div key={item.label} className="flex flex-col gap-2 bg-surface-soft p-6">
                  <span className="display-sm text-ink">{item.value}</span>
                  <span className="label-upper text-body">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-10 max-w-[62ch]">{messages.terms.photoNote}</p>
          </div>
        </section>

        {/* ── Lưới xe ── */}
        <section id="doi-xe" className="pb-section">
          <div className={CONTAINER}>
            <h2 className="display-lg m-0 text-ink">{messages.vehicles.heading}</h2>
            <p className="mt-4 text-lg text-body-strong">{messages.vehicles.lead}</p>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {PLACEHOLDER_VEHICLES.map((v) => (
                <article key={v.id}>
                  <div className="relative aspect-[16/10] overflow-hidden bg-surface-card">
                    <Image
                      src={v.image}
                      alt={`Ảnh ${v.name} — ảnh tạm, chưa phải xe của shop`}
                      fill
                      sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                      className="object-cover"
                    />
                    <PlaceholderTag />
                  </div>
                  <div className="flex flex-col items-start gap-3 pt-6">
                    <h3 className="display-md m-0 text-ink">{v.name}</h3>
                    {/* metadata dùng text-body chứ KHÔNG text-muted:
                        muted trên surface tối chỉ 4.29:1, dưới AA. DESIGN.md §2 */}
                    <p className="m-0 text-sm text-body">{v.meta}</p>
                    <a href="#gui-yeu-cau" className="label-upper text-ink hover:underline">
                      {messages.vehicles.detail} →
                    </a>
                  </div>
                </article>
              ))}
            </div>

            <p className="caption-text mt-6 text-muted">{messages.vehicles.empty}</p>
          </div>
        </section>

        {/* ── Băng CTA: copy lấy nguyên từ messages, KHÔNG hứa xe còn trống ── */}
        <section id="gui-yeu-cau" className="border-y border-hairline py-section text-center">
          <div className={CONTAINER}>
            <h2 className="display-md m-0 text-ink">{messages.booking.cta}</h2>
            <p className="mx-auto my-6 max-w-[52ch] text-body">{messages.booking.note}</p>
            <a
              href="#gui-yeu-cau"
              className="btn-shape border-ink bg-transparent text-ink no-underline transition-colors hover:bg-ink hover:text-canvas"
            >
              {messages.booking.cta}
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline py-16">
        <div className={CONTAINER}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <h3 className="label-upper mb-4 text-ink">{messages.footer.vehicles}</h3>
              <p className="m-0 text-sm">{messages.vehicles.heading}</p>
            </div>
            <div>
              <h3 className="label-upper mb-4 text-ink">{messages.footer.rental}</h3>
              <p className="m-0 text-sm">{messages.terms.heading}</p>
            </div>
            <div>
              <h3 className="label-upper mb-4 text-ink">{messages.footer.shop}</h3>
              <p className="m-0 text-sm">{messages.site.tagline}</p>
            </div>
          </div>
          <p className="caption-text mt-10 text-muted">
            {messages.footer.legal} · {messages.scaffold.apiHealth}: {apiStatus}
          </p>
        </div>
      </footer>
    </>
  );
}
