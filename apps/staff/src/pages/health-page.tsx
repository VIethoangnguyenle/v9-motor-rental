import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AppNav } from "../components/layout/app-nav";
import { useMe } from "../hooks/use-me";
import { api } from "../lib/api";
import { signOut } from "../lib/auth";

export function HealthPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Cache đã ấm: guard của router gọi `ensureMe` trước khi trang này render.
  const { me } = useMe();

  const { data, error, isPending } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.get();
      if (res.error) throw new Error(JSON.stringify(res.error.value));
      return res.data;
    },
  });

  async function handleSignOut() {
    await signOut(qc);
    await navigate({ to: "/dang-nhap" });
  }

  return (
    <main className="p-6 font-mono">
      <AppNav me={me} onSignOut={() => void handleSignOut()} />

      <h1 className="mt-4 text-xl font-bold">V9 Staff — scaffold</h1>
      <p className="mt-3">
        API health:{" "}
        <strong>{isPending ? "đang tải…" : error ? `lỗi: ${error.message}` : data.status}</strong>
      </p>
      <p className="mt-3 text-gray-600">Chưa có chức năng nghiệp vụ nào. Xem CLAUDE.md.</p>
    </main>
  );
}
