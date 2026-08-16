import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ResetCodeNotice } from "../components/staff/reset-code-notice";
import { StaffTable } from "../components/staff/staff-table";
import { Alert } from "../components/ui/alert";
import { useMe } from "../hooks/use-me";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";

/**
 * Duyệt LUÔN đặt role `STAFF`. Đợt này cố ý không phơi việc đổi vai trò ra UI:
 * `SALES` chưa được định nghĩa làm gì (CLAUDE.md), và OWNER thứ hai được tạo
 * bằng `bun run staff:bootstrap` chứ không bằng một nút bấm nhầm được.
 * `POST /staff/users/:id/role` đã có sẵn cho lúc luật vai trò rõ hơn.
 */
const ROLE_ON_APPROVE = "STAFF" as const;

export function StaffListPage() {
  const qc = useQueryClient();
  // Cache đã ấm: guard của router gọi `ensureMe` trước khi trang này render.
  const { me } = useMe();
  const [issuedCode, setIssuedCode] = useState<{ name: string; code: string } | null>(null);

  const staffQuery = useQuery({
    queryKey: ["staff-users"],
    queryFn: async () => {
      const res = await api.staff.users.get();
      if (res.error) throw new Error(errorMessage(res.error.value, "Không tải được danh sách"));
      return res.data;
    },
  });

  const invalidateStaff = () => qc.invalidateQueries({ queryKey: ["staff-users"] });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.staff.users({ id }).approve.post({ role: ROLE_ON_APPROVE });
      if (res.error) throw new Error(errorMessage(res.error.value, "Không duyệt được"));
    },
    onSuccess: invalidateStaff,
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.staff.users({ id }).disable.post();
      if (res.error) throw new Error(errorMessage(res.error.value, "Không khoá được"));
    },
    onSuccess: invalidateStaff,
  });

  const issueCodeMutation = useMutation({
    mutationFn: async (row: { id: string; name: string }) => {
      const res = await api.staff.users({ id: row.id })["reset-code"].post();
      if (res.error) throw new Error(errorMessage(res.error.value, "Không phát được mã"));
      return { name: row.name, code: res.data.code };
    },
    onSuccess: setIssuedCode,
  });

  const busy =
    approveMutation.isPending || disableMutation.isPending || issueCodeMutation.isPending;
  const error = (
    staffQuery.error ??
    approveMutation.error ??
    disableMutation.error ??
    issueCodeMutation.error
  )?.message;

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">Nhân viên</h1>

      <ResetCodeNotice issuedCode={issuedCode} />

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <StaffTable
        rows={staffQuery.data ?? []}
        me={me}
        busy={busy}
        onApprove={approveMutation.mutate}
        onDisable={disableMutation.mutate}
        onIssueCode={issueCodeMutation.mutate}
      />

      {staffQuery.isPending && <p className="mt-3 text-sm text-gray-600">Đang tải…</p>}
      {staffQuery.data?.length === 0 && (
        <p className="mt-3 text-sm text-gray-600">Chưa có nhân viên nào.</p>
      )}
    </main>
  );
}
