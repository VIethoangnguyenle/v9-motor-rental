import Image from "next/image";
import Link from "next/link";
import { formatVnd } from "@v9/shared/domain/money";
import { assetUrl } from "@/lib/directus";
import type { VehicleSummary } from "@/lib/vehicles";
import messages from "@/messages/vi.json";

export function VehicleCard({ vehicle }: { vehicle: VehicleSummary }) {
  const title = `${vehicle.make} ${vehicle.model}`;
  const specs = [
    `${String(vehicle.engineCc)} cc`,
    vehicle.year === null ? null : `đời ${String(vehicle.year)}`,
    vehicle.odoKm === null ? null : `ODO ${vehicle.odoKm.toLocaleString("vi-VN")} km`,
  ].filter((s): s is string => s !== null);

  return (
    <article>
      <Link href={`/xe/${vehicle.slug}`} className="block no-underline">
        <div className="relative aspect-[16/10] overflow-hidden bg-surface-card">
          {vehicle.photo ? (
            <Image
              src={assetUrl(vehicle.photo.fileId)}
              alt={vehicle.photo.alt}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="caption-text text-muted">{messages.vehicles.noPhoto}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-3 pt-6">
          <h3 className="display-md m-0 text-ink">{title}</h3>
          {/* text-body chứ KHÔNG text-muted: muted trên nền tối chỉ 4.29:1, dưới AA. DESIGN.md §2 */}
          <p className="m-0 text-sm text-body">{specs.join(" · ")}</p>
          <p className="m-0 text-ink">
            <span className="display-sm">{formatVnd(vehicle.pricePerDay)}</span>
            <span className="label-upper ml-2 text-body">{messages.vehicles.perDay}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
