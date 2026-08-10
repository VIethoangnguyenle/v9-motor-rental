import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
import { CONTAINER } from "@/app/_components/layout";
import { VehicleCard } from "@/app/_components/vehicle-card";
import { api } from "@/lib/api";
import { fetchVehicles } from "@/lib/vehicles";
import messages from "@/messages/vi.json";

// SEO quan trọng với site công khai → ISR thay vì force-dynamic.
//
// App này KHÔNG chốt đơn và KHÔNG đọc availability thời gian thực — khách chỉ gửi
// yêu cầu, nhân viên chốt trong apps/staff. Vì vậy trang xe tĩnh hoàn toàn được,
// đúng lý do Next được chọn. Xem §3.3 của
// docs/plans/2026-08-05-round2-directus-staff-design.md.
export const revalidate = 60;

/**
 * Ảnh hero là ẢNH AI SINH, không phải xe của shop. Nhãn dưới góc phải phải còn
 * nguyên cho tới khi thay bằng ảnh thật — gỡ nhãn mà không thay ảnh là nói dối
 * khách. PRODUCT.md nguyên tắc #2.
 *
 * Nhãn này CHỈ còn ở hero: ảnh trong lưới xe giờ là ảnh thật lấy từ Directus,
 * gắn nhãn "ảnh tạm" lên chúng cũng là nói sai — theo chiều ngược lại.
 */
function PlaceholderTag() {
  return (
    <span className="caption-text absolute right-3 bottom-3 border border-hairline bg-canvas/70 px-2 py-0.5 text-body">
      {messages.placeholder.imageTag}
    </span>
  );
}

export default async function Page() {
  // Song song, không nối tiếp: hai request không phụ thuộc nhau, chờ lần lượt
  // chỉ cộng thêm latency vào chính lần build/revalidate.
  const [{ data, error }, { vehicles, failed }] = await Promise.all([
    api.health.get(),
    fetchVehicles(),
  ]);
  const apiStatus = error ? "lỗi" : data.status;

  // Trang chủ là cửa sổ, không phải danh mục: ba chiếc đầu rồi mời sang /xe.
  const featured = vehicles.slice(0, 3);

  return (
    <>
      <SiteHeader />

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
                <Link
                  href="/xe"
                  className="btn-shape border-ink bg-transparent text-ink no-underline transition-colors hover:bg-ink hover:text-canvas"
                >
                  {messages.hero.secondaryCta}
                </Link>
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

        {/* ── Lưới xe: đội xe THẬT từ API, không còn dữ liệu dựng thử ── */}
        <section id="doi-xe" className="pb-section">
          <div className={CONTAINER}>
            <h2 className="display-lg m-0 text-ink">{messages.vehicles.heading}</h2>
            <p className="mt-4 text-lg text-body-strong">{messages.vehicles.lead}</p>

            {failed ? (
              // Không gọi được API. KHÔNG được nói "chưa có xe nào được đăng" ở
              // đây — đó là một câu sai về shop, và nó bị nướng vào HTML tĩnh.
              <p className="mt-10 text-body">{messages.vehicles.loadFailed}</p>
            ) : featured.length === 0 ? (
              // Chưa đăng xe nào — nói thẳng với khách bằng câu của họ, không
              // để lại lưới rỗng trông như trang hỏng.
              <p className="mt-10 text-body">{messages.vehicles.empty}</p>
            ) : (
              <>
                <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {featured.map((v) => (
                    <VehicleCard key={v.id} vehicle={v} />
                  ))}
                </div>
                <Link
                  href="/xe"
                  className="label-upper mt-10 inline-block text-ink hover:underline"
                >
                  {messages.vehicles.all}
                </Link>
              </>
            )}
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

      <SiteFooter note={`${messages.scaffold.apiHealth}: ${apiStatus}`} />
    </>
  );
}
