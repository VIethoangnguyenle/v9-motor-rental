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
    <main className="p-6 font-mono">
      <h1 className="text-xl font-bold">V9 Staff — scaffold</h1>
      <p className="mt-3">
        API health:{" "}
        <strong>{isPending ? "đang tải…" : error ? `lỗi: ${error.message}` : data.status}</strong>
      </p>
      <p className="mt-3 text-gray-600">Chưa có chức năng nghiệp vụ nào. Xem CLAUDE.md.</p>
    </main>
  );
}
