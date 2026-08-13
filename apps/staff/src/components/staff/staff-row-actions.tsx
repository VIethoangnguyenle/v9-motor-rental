import type { Me, StaffRow } from "../../lib/me";

interface StaffRowActionsProps {
  readonly row: StaffRow;
  readonly me: Me | null;
  readonly busy: boolean;
  readonly onApprove: (id: string) => void;
  readonly onDisable: (id: string) => void;
  readonly onIssueCode: (row: { id: string; name: string }) => void;
}

/** `<td>` các nút hành động cho một dòng nhân viên. */
export function StaffRowActions({
  row,
  me,
  busy,
  onApprove,
  onDisable,
  onIssueCode,
}: StaffRowActionsProps) {
  return (
    <td className="flex flex-wrap gap-2 py-2">
      {row.status === "PENDING" && (
        <button
          onClick={() => onApprove(row.id)}
          disabled={busy}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          Duyệt
        </button>
      )}
      {/* Tự khoá mình bị backend chặn (`TU_KHOA_MINH`); ẩn nút để không
          mời người ta bấm vào một lỗi đã biết trước. */}
      {row.status === "ACTIVE" && row.id !== me?.id && (
        <button
          onClick={() => onDisable(row.id)}
          disabled={busy}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          Khoá
        </button>
      )}
      <button
        onClick={() => onIssueCode({ id: row.id, name: row.fullName })}
        disabled={busy}
        className="rounded border px-2 py-1 disabled:opacity-50"
      >
        Phát mã
      </button>
    </td>
  );
}
