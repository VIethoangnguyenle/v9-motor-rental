import messages from "@/messages/vi.json";
import { api } from "@/lib/api";

// SEO quan trọng với site công khai → ISR thay vì force-dynamic.
//
// App này KHÔNG chốt đơn và KHÔNG đọc availability thời gian thực — khách chỉ gửi
// yêu cầu, nhân viên chốt trong apps/staff. Vì vậy trang xe tĩnh hoàn toàn được,
// đúng lý do Next được chọn. Xem §3.3 của
// docs/plans/2026-08-05-round2-directus-staff-design.md.
export const revalidate = 60;

export default async function Page() {
  const { data, error } = await api.health.get();

  return (
    <main style={{ fontFamily: "monospace", padding: 24 }}>
      <h1>{messages.site.title}</h1>
      <p>{messages.site.tagline}</p>
      <p>
        {messages.scaffold.apiHealth}:{" "}
        <strong>{error ? `lỗi: ${JSON.stringify(error.value)}` : data.status}</strong>
      </p>
      <p>{messages.scaffold.notice}</p>
    </main>
  );
}
