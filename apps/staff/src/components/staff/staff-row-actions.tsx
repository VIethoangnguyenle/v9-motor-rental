import type { Me, StaffRow } from "../../lib/me";

interface StaffRowActionsProps {
  readonly nv: StaffRow;
  readonly me: Me | null;
  readonly busy: boolean;
  readonly onApprove: (id: string) => void;
  readonly onDisable: (id: string) => void;
  readonly onIssueCode: (nv: { id: string; ten: string }) => void;
}

/** `<td>` các nút hành động cho một dòng nhân viên. */
export function StaffRowActions({
  nv,
  me,
  busy,
  onApprove,
  onDisable,
  onIssueCode,
}: StaffRowActionsProps) {
  return (
    <td className="flex flex-wrap gap-2 py-2">
      {nv.status === "PENDING" && (
        <button
          onClick={() => onApprove(nv.id)}
          disabled={busy}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          Duyệt
        </button>
      )}
      {/* Tự khoá mình bị backend chặn (`TU_KHOA_MINH`); ẩn nút để không
          mời người ta bấm vào một lỗi đã biết trước. */}
      {nv.status === "ACTIVE" && nv.id !== me?.id && (
        <button
          onClick={() => onDisable(nv.id)}
          disabled={busy}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          Khoá
        </button>
      )}
      <button
        onClick={() => onIssueCode({ id: nv.id, ten: nv.fullName })}
        disabled={busy}
        className="rounded border px-2 py-1 disabled:opacity-50"
      >
        Phát mã
      </button>
    </td>
  );
}
