import messages from "@/messages/vi.json";
import { CONTAINER } from "./layout";

/**
 * `note` là optional để trang chủ giữ được dòng trạng thái API, còn hai trang
 * xe không phải gọi `/health` chỉ để in một chuỗi.
 */
export function SiteFooter({ note }: { note?: string }) {
  return (
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
          {messages.footer.legal}
          {note ? ` · ${note}` : ""}
        </p>
      </div>
    </footer>
  );
}
