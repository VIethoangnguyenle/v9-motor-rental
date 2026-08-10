import type { Metadata } from "next";
import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
import { CONTAINER } from "@/app/_components/layout";
import { VehicleCard } from "@/app/_components/vehicle-card";
import { fetchVehicles } from "@/lib/vehicles";
import messages from "@/messages/vi.json";

// Danh mục xe đổi vài lần một tuần, không phải vài lần một phút.
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${messages.vehicles.heading} — ${messages.site.title}`,
  description: messages.vehicles.lead,
};

export default async function VehiclesPage() {
  const vehicles = await fetchVehicles();

  return (
    <>
      <SiteHeader />
      <main>
        <section className="py-section">
          <div className={CONTAINER}>
            <h1 className="display-xl m-0 text-ink">{messages.vehicles.heading}</h1>
            <p className="mt-6 max-w-[52ch] text-lg text-body-strong">{messages.vehicles.lead}</p>

            {vehicles.length === 0 ? (
              <p className="mt-10 text-body">{messages.vehicles.empty}</p>
            ) : (
              <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {vehicles.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} />
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
