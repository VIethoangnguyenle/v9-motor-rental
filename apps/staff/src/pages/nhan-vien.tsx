import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ResetCodeNotice } from "../components/staff/reset-code-notice";
import { StaffTable } from "../components/staff/staff-table";
import { Alert } from "../components/ui/alert";
import { useMe } from "../hooks/use-me";
import { api } from "../lib/api";
import { thongDiepLoi } from "../lib/loi";

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
  const { me } = useMe();
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

      <ResetCodeNotice ma={ma} />

      {loi && (
        <div className="mt-3">
          <Alert tone="error">{loi}</Alert>
        </div>
      )}

      <StaffTable
        rows={dsNhanVien.data ?? []}
        me={me}
        dangChay={dangChay}
        onApprove={duyet.mutate}
        onDisable={khoa.mutate}
        onIssueCode={phatMa.mutate}
      />

      {dsNhanVien.isPending && <p className="mt-3 text-sm text-gray-600">Đang tải…</p>}
      {dsNhanVien.data?.length === 0 && (
        <p className="mt-3 text-sm text-gray-600">Chưa có nhân viên nào.</p>
      )}
    </main>
  );
}
