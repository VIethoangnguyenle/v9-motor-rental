import type { Metadata } from "next";
import Link from "next/link";
import { CONTAINER } from "../_components/layout";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";
import { fetchVehicles } from "@/lib/vehicles";
import messages from "@/messages/vi.json";
import { RequestForm } from "./request-form";

/**
 * ISR 300s, cùng nhịp `/xe`: thứ duy nhất động trên trang này là DANH SÁCH xe
 * trong ô chọn, và nó đổi đúng khi shop đăng thêm xe. Bản thân form không cần
 * render lại — nó là Server Action, không phải dữ liệu.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${messages.request.heading} · ${messages.site.title}`,
  description: messages.request.lead,
  // Trang form không có giá trị tìm kiếm và không nên cạnh tranh với trang xe
  // trong kết quả. `follow` để link tới `/xe` bên dưới vẫn được đi theo.
  robots: { index: false, follow: true },
};

export default async function RequestPage({
  searchParams,
}: {
  // Next 16: `searchParams` là Promise trong server component.
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params["xe"];
  const requested = typeof raw === "string" ? raw : null;

  const { vehicles, failed } = await fetchVehicles();

  // Chỉ chấp nhận slug thật sự có trong danh mục. Một `?xe=` bịa không được phép
  // biến thành `<option>` — nó sẽ chết ở API và khách không hiểu vì sao.
  const selectedSlug =
    requested !== null && vehicles.some((v) => v.slug === requested) ? requested : null;

  return (
    <>
      <SiteHeader />
      <main>
        <section className="py-section">
          <div className={CONTAINER}>
            <h1 className="display-lg m-0 text-ink">{messages.request.heading}</h1>
            <p className="mt-4 max-w-[60ch] text-body-strong">{messages.request.lead}</p>

            <div className="mt-10 max-w-[46rem]">
              {failed ? (
                // KHÔNG nói "chưa có xe nào" khi thật ra là không gọi được API —
                // cùng lý lẽ `fetchVehicles` đã ghi: đó là một câu sai về shop.
                <p className="text-body">{messages.vehicles.loadFailed}</p>
              ) : vehicles.length === 0 ? (
                <p className="text-body">{messages.request.noVehicles}</p>
              ) : (
                <RequestForm vehicles={vehicles} selectedSlug={selectedSlug} />
              )}

              {selectedSlug !== null && (
                <Link
                  href={`/xe/${selectedSlug}`}
                  className="label-upper mt-10 inline-block text-ink hover:underline"
                >
                  {messages.request.backToVehicle}
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
