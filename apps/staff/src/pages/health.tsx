import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { api } from "../lib/api";
import { dangXuat } from "../lib/auth";
import { meQuery } from "../lib/me";

export function HealthPage() {
  const navigate = useNavigate();
  // Cache đã ấm: guard của router gọi `layMe` trước khi trang này render.
  const { data: me } = useQuery(meQuery);

  const { data, error, isPending } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.get();
      if (res.error) throw new Error(JSON.stringify(res.error.value));
      return res.data;
    },
  });

  async function thoat() {
    await dangXuat();
    await navigate({ to: "/dang-nhap" });
  }

  return (
    <main className="p-6 font-mono">
      {/* Thanh điều hướng tối thiểu. Không có nó thì OWNER đăng nhập xong không
          có đường nào tới /nhan-vien, và không có đường nào đăng xuất. */}
      <nav className="flex items-center gap-4 border-b pb-3 text-sm">
        <strong>{me?.fullName}</strong>
        <span className="text-gray-600">{me?.role}</span>
        {me?.role === "OWNER" && (
          <Link to="/nhan-vien" className="underline">
            Nhân viên
          </Link>
        )}
        <button onClick={() => void thoat()} className="ml-auto underline">
          Đăng xuất
        </button>
      </nav>

      <h1 className="mt-4 text-xl font-bold">V9 Staff — scaffold</h1>
      <p className="mt-3">
        API health:{" "}
        <strong>{isPending ? "đang tải…" : error ? `lỗi: ${error.message}` : data.status}</strong>
      </p>
      <p className="mt-3 text-gray-600">Chưa có chức năng nghiệp vụ nào. Xem CLAUDE.md.</p>
    </main>
  );
}
