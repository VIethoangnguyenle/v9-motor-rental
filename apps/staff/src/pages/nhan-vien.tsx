import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";
import { thongDiepLoi } from "../lib/loi";
import { meQuery } from "../lib/me";

/**
 * Duyệt LUÔN đặt role `STAFF`. Đợt này cố ý không phơi việc đổi vai trò ra UI:
 * `SALES` chưa được định nghĩa làm gì (CLAUDE.md), và OWNER thứ hai được tạo
 * bằng `bun run staff:bootstrap` chứ không bằng một nút bấm nhầm được.
 * `POST /staff/users/:id/role` đã có sẵn cho lúc luật vai trò rõ hơn.
 */
const ROLE_KHI_DUYET = "STAFF" as const;

export function NhanVienPage() {
  const qc = useQueryClient();
  // Cache đã ấm: guard của router gọi `layMe` trước khi trang này render.
  const { data: me } = useQuery(meQuery);
  // Giữ cả tên: chủ shop đọc mã qua Zalo cho một CON NGƯỜI, nên màn hình phải
  // nói mã này của ai. UUID không giúp được việc đó.
  const [ma, setMa] = useState<{ ten: string; code: string } | null>(null);

  const dsNhanVien = useQuery({
    queryKey: ["staff-users"],
    queryFn: async () => {
      const res = await api.staff.users.get();
      if (res.error) throw new Error(thongDiepLoi(res.error.value, "Không tải được danh sách"));
      return res.data;
    },
  });

  const lamMoi = () => qc.invalidateQueries({ queryKey: ["staff-users"] });

  const duyet = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.staff.users({ id }).approve.post({ role: ROLE_KHI_DUYET });
      if (res.error) throw new Error(thongDiepLoi(res.error.value, "Không duyệt được"));
    },
    onSuccess: lamMoi,
  });

  const khoa = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.staff.users({ id }).disable.post();
      if (res.error) throw new Error(thongDiepLoi(res.error.value, "Không khoá được"));
    },
    onSuccess: lamMoi,
  });

  const phatMa = useMutation({
    mutationFn: async (nv: { id: string; ten: string }) => {
      const res = await api.staff.users({ id: nv.id })["reset-code"].post();
      if (res.error) throw new Error(thongDiepLoi(res.error.value, "Không phát được mã"));
      return { ten: nv.ten, code: res.data.code };
    },
    onSuccess: setMa,
  });

  const dangChay = duyet.isPending || khoa.isPending || phatMa.isPending;
  const loi = (dsNhanVien.error ?? duyet.error ?? khoa.error ?? phatMa.error)?.message;

  return (
    <main className="p-6">
      <Link to="/" className="text-sm underline">
        ← Trang chủ
      </Link>
      <h1 className="mt-2 text-xl font-bold">Nhân viên</h1>

      {ma && (
        <p className="mt-3 rounded bg-gray-100 p-3 text-sm">
          Mã đặt lại mật khẩu cho <strong>{ma.ten}</strong>:{" "}
          <strong className="tracking-widest">{ma.code}</strong> — đọc cho nhân viên qua Zalo. Mã
          sống 10 phút và chỉ dùng được một lần.
        </p>
      )}

      {loi && <p className="mt-3 rounded bg-red-100 p-3 text-sm text-red-800">{loi}</p>}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Họ tên</th>
            <th>Email</th>
            <th>Điện thoại</th>
            <th>Vai trò</th>
            <th>Trạng thái</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {dsNhanVien.data?.map((nv) => (
            <tr key={nv.id} className="border-b align-top">
              <td className="py-2">{nv.fullName}</td>
              <td>{nv.email}</td>
              <td>{nv.phone ?? "—"}</td>
              <td>{nv.role}</td>
              <td>{nv.status}</td>
              <td className="flex flex-wrap gap-2 py-2">
                {nv.status === "PENDING" && (
                  <button
                    onClick={() => duyet.mutate(nv.id)}
                    disabled={dangChay}
                    className="rounded border px-2 py-1 disabled:opacity-50"
                  >
                    Duyệt
                  </button>
                )}
                {/* Tự khoá mình bị backend chặn (`TU_KHOA_MINH`); ẩn nút để không
                    mời người ta bấm vào một lỗi đã biết trước. */}
                {nv.status === "ACTIVE" && nv.id !== me?.id && (
                  <button
                    onClick={() => khoa.mutate(nv.id)}
                    disabled={dangChay}
                    className="rounded border px-2 py-1 disabled:opacity-50"
                  >
                    Khoá
                  </button>
                )}
                <button
                  onClick={() => phatMa.mutate({ id: nv.id, ten: nv.fullName })}
                  disabled={dangChay}
                  className="rounded border px-2 py-1 disabled:opacity-50"
                >
                  Phát mã
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dsNhanVien.isPending && <p className="mt-3 text-sm text-gray-600">Đang tải…</p>}
      {dsNhanVien.data?.length === 0 && (
        <p className="mt-3 text-sm text-gray-600">Chưa có nhân viên nào.</p>
      )}
    </main>
  );
}
