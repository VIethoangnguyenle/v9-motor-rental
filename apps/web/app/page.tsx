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

/**
 * Chỗ đặt ảnh. Chưa có ảnh thật của shop nên render khối `surface-card` kèm nhãn.
 *
 * CỐ Ý không dùng ảnh AI sinh: đã thử, và thứ nhận về là ô màu trơn (API hết
 * quota) — tức là dối trá mà chẳng được gì. Khối có nhãn thì trung thực và vẫn
 * cho thấy nhịp trang.
 *
 * Khi có ảnh thật: đổi sang next/image, `priority` cho hero (ảnh hero CHÍNH LÀ
 * LCP của trang này — DESIGN.md §8), và gỡ nhãn.
 */
function PhotoSlot({ label, className }: { label: string; className: string }) {
  return (
    <div className={className} aria-hidden="true">
      <span className="placeholder-tag">{label}</span>
    </div>
  );
}

export default async function Page() {
  const { data, error } = await api.health.get();
  const apiStatus = error ? "lỗi" : data.status;

  return (
    <>
      <header className="top-nav">
        <div className="container">
          <a className="wordmark" href="/">
            {messages.site.title}
          </a>
          <nav className="nav-links">
            <a className="label-upper text-link" href="#doi-xe">
              {messages.nav.vehicles}
            </a>
            <a className="label-upper text-link" href="#thu-tuc">
              {messages.nav.howItWorks}
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Băng ảnh hero: ảnh chính là băng, không khung card ── */}
        <section className="hero">
          <PhotoSlot label="Ảnh hero — chưa có ảnh thật" className="hero-media" />
          <div className="hero-scrim" />
          <div className="hero-inner">
            <div className="container">
              <h1 className="display-xl">{messages.hero.headline}</h1>
              <p className="title-md hero-sub">{messages.hero.sub}</p>
              <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
                <a className="btn btn-solid" href="#gui-yeu-cau">
                  {messages.booking.cta}
                </a>
                <a className="btn btn-primary" href="#doi-xe">
                  {messages.hero.secondaryCta}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Bảng thông số: dữ kiện đã xác nhận trong PRODUCT.md, không bịa ── */}
        <section className="section" id="thu-tuc">
          <div className="container">
            <h2 className="display-lg">{messages.terms.heading}</h2>
            <div className="grid-specs" style={{ marginTop: "var(--space-xl)" }}>
              {[
                messages.terms.papers,
                messages.terms.deposit,
                messages.terms.unit,
                messages.terms.delivery,
              ].map((item) => (
                <div className="spec-cell" key={item.label}>
                  <span className="display-sm">{item.value}</span>
                  <span className="label-upper spec-label">{item.label}</span>
                </div>
              ))}
            </div>
            <p style={{ maxWidth: "62ch", marginTop: "var(--space-xl)" }}>
              {messages.terms.photoNote}
            </p>
          </div>
        </section>

        {/* ── Lưới xe ── */}
        <section className="section" id="doi-xe" style={{ paddingTop: 0 }}>
          <div className="container">
            <h2 className="display-lg">{messages.vehicles.heading}</h2>
            <p className="title-md" style={{ marginTop: "var(--space-md)" }}>
              {messages.vehicles.lead}
            </p>

            <div className="grid-vehicles" style={{ marginTop: "var(--space-xl)" }}>
              {PLACEHOLDER_VEHICLES.map((v) => (
                <article className="vehicle-card" key={v.id}>
                  <PhotoSlot label={messages.placeholder.imageTag} className="vehicle-media" />
                  <div className="vehicle-body">
                    <h3 className="display-md">{v.name}</h3>
                    <p className="body-sm vehicle-meta">{v.meta}</p>
                    <a className="label-upper text-link" href="#gui-yeu-cau">
                      {messages.vehicles.detail} →
                    </a>
                  </div>
                </article>
              ))}
            </div>

            <p className="caption" style={{ marginTop: "var(--space-lg)" }}>
              {messages.vehicles.empty}
            </p>
          </div>
        </section>

        {/* ── Băng CTA: copy lấy nguyên từ messages, KHÔNG hứa xe còn trống ── */}
        <section className="section cta-band" id="gui-yeu-cau">
          <div className="container">
            <h2 className="display-md">{messages.booking.cta}</h2>
            <p className="cta-note">{messages.booking.note}</p>
            <a className="btn btn-primary" href="#gui-yeu-cau">
              {messages.booking.cta}
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-cols">
            <div className="footer-col">
              <h3 className="label-upper">{messages.footer.vehicles}</h3>
              <ul className="body-sm">
                <li>{messages.vehicles.heading}</li>
              </ul>
            </div>
            <div className="footer-col">
              <h3 className="label-upper">{messages.footer.rental}</h3>
              <ul className="body-sm">
                <li>{messages.terms.heading}</li>
              </ul>
            </div>
            <div className="footer-col">
              <h3 className="label-upper">{messages.footer.shop}</h3>
              <ul className="body-sm">
                <li>{messages.site.tagline}</li>
              </ul>
            </div>
            <div className="footer-col" />
          </div>
          <p className="caption" style={{ marginTop: "var(--space-xl)" }}>
            {messages.footer.legal} · {messages.scaffold.apiHealth}: {apiStatus}
          </p>
        </div>
      </footer>
    </>
  );
}
