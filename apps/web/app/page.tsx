import messages from "@/messages/vi.json";
import { api } from "@/lib/api";

// SEO quan trọng với site công khai → ISR thay vì force-dynamic.
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
