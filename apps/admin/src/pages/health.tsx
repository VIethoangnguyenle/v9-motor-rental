import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function HealthPage() {
  const { data, error, isPending } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.get();
      if (res.error) throw new Error(JSON.stringify(res.error.value));
      return res.data;
    },
  });

  return (
    <main style={{ fontFamily: "monospace", padding: 24 }}>
      <h1>V9 Admin — scaffold</h1>
      <p>
        API health:{" "}
        <strong>{isPending ? "đang tải…" : error ? `lỗi: ${error.message}` : data.status}</strong>
      </p>
      <p>Chưa có chức năng nghiệp vụ nào. Xem CLAUDE.md.</p>
    </main>
  );
}
