import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { formatVnd } from "@v9/shared/domain/money";
import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
import { CONTAINER } from "@/app/_components/layout";
import { assetUrl } from "@/lib/directus";
import { fetchVehicle, fetchVehicles } from "@/lib/vehicles";
import messages from "@/messages/vi.json";

export const revalidate = 300;

// true (mặc định) là CỐ Ý: khi API chết lúc build, generateStaticParams trả []
// và không trang nào được sinh sẵn — dynamicParams giữ cho chúng vẫn render
// được lúc chạy thay vì 404 hàng loạt.
export const dynamicParams = true;

export async function generateStaticParams() {
  // Cố ý bỏ qua cờ `failed`: API chết lúc build thì danh sách rỗng là ĐÚNG hành vi
  // mong muốn ở đây — không sinh sẵn trang nào, `dynamicParams` lo phần còn lại.
  const { vehicles } = await fetchVehicles();
  return vehicles.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await fetchVehicle(slug);
  if (!vehicle) return { title: messages.site.title };

  const title = `Thuê ${vehicle.make} ${vehicle.model} tại TP.HCM`;
  const specs = [
    `${String(vehicle.engineCc)} cc`,
    vehicle.year === null ? null : `đời ${String(vehicle.year)}`,
  ].filter((s): s is string => s !== null);

  return {
    title,
    description: `${vehicle.make} ${vehicle.model} — ${specs.join(", ")}. ${formatVnd(vehicle.pricePerDay)} một ngày. Giao xe tận nơi tại TP.HCM.`,
    openGraph: {
      title,
      images: vehicle.photo ? [assetUrl(vehicle.photo.fileId)] : [],
    },
  };
}

export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vehicle = await fetchVehicle(slug);
  if (!vehicle) notFound();

  const [hero, ...rest] = vehicle.photos;
  const specs = [
    { label: messages.vehicles.specs.engine, value: `${String(vehicle.engineCc)} cc` },
    {
      label: messages.vehicles.specs.year,
      value: vehicle.year === null ? "—" : String(vehicle.year),
    },
    {
      label: messages.vehicles.specs.odo,
      value: vehicle.odoKm === null ? "—" : `${vehicle.odoKm.toLocaleString("vi-VN")} km`,
    },
    { label: messages.vehicles.specs.color, value: vehicle.color ?? "—" },
  ];

  return (
    <>
      <SiteHeader />
      <main>
        {/* Ảnh gánh năng lượng của trang — băng full-bleed, không khung card.
            DESIGN.md §6. alt LUÔN là alt lưu kèm ảnh, không bao giờ tự bịa. */}
        {hero ? (
          <section className="relative aspect-[16/9] w-full overflow-hidden bg-surface-card">
            <Image
              src={assetUrl(hero.fileId)}
              alt={hero.alt}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </section>
        ) : null}

        <section className="py-section">
          <div className={CONTAINER}>
            <h1 className="display-xl m-0 text-ink">
              {vehicle.make} {vehicle.model}
            </h1>

            <div className="mt-10 grid grid-cols-1 gap-px border border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-4">
              {specs.map((s) => (
                <div key={s.label} className="flex flex-col gap-2 bg-surface-soft p-6">
                  <span className="display-sm text-ink">{s.value}</span>
                  <span className="label-upper text-body">{s.label}</span>
                </div>
              ))}
            </div>

            {vehicle.description === null ? null : (
              <p className="mt-10 max-w-[62ch]">{vehicle.description}</p>
            )}

            <div className="mt-10 border border-hairline p-6">
              <p className="m-0 text-ink">
                <span className="display-lg">{formatVnd(vehicle.pricePerDay)}</span>
                <span className="label-upper ml-3 text-body">{messages.vehicles.perDay}</span>
              </p>
              <p className="mt-3 mb-0 text-body">
                {messages.vehicles.depositLabel}: {formatVnd(vehicle.deposit)}
              </p>
              <p className="mt-3 mb-0 text-body">{messages.vehicles.longTerm}</p>
              {/* Copy lấy nguyên từ messages.booking — KHÔNG hứa xe còn trống.
                  apps/web/AGENTS.md là luật cứng ở đây. */}
              <a
                href="/#gui-yeu-cau"
                className="btn-shape mt-6 border-ink bg-ink text-canvas no-underline transition-colors hover:bg-transparent hover:text-ink"
              >
                {messages.booking.cta}
              </a>
              <p className="caption-text mt-4 mb-0 text-body">{messages.booking.note}</p>
            </div>

            {rest.length === 0 ? null : (
              <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {rest.map((p) => (
                  <div
                    key={p.fileId}
                    className="relative aspect-[16/10] overflow-hidden bg-surface-card"
                  >
                    <Image
                      src={assetUrl(p.fileId)}
                      alt={p.alt}
                      fill
                      sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
