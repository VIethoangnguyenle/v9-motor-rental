import type { Me, StaffRow } from "../../lib/me";
import { StaffRowActions } from "./staff-row-actions";

interface StaffTableProps {
  readonly rows: readonly StaffRow[];
  readonly me: Me | null;
  readonly busy: boolean;
  readonly onApprove: (id: string) => void;
  readonly onDisable: (id: string) => void;
  readonly onIssueCode: (row: { id: string; name: string }) => void;
}

export function StaffTable({ rows, me, busy, onApprove, onDisable, onIssueCode }: StaffTableProps) {
  return (
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
        {rows.map((row) => (
          <tr key={row.id} className="border-b align-top">
            <td className="py-2">{row.fullName}</td>
            <td>{row.email}</td>
            <td>{row.phone ?? "—"}</td>
            <td>{row.role}</td>
            <td>{row.status}</td>
            <StaffRowActions
              row={row}
              me={me}
              busy={busy}
              onApprove={onApprove}
              onDisable={onDisable}
              onIssueCode={onIssueCode}
            />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
