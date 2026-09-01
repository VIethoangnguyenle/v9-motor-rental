import type { Me, StaffRow } from "../../lib/me";
import { Button } from "../ui/button";

interface StaffRowActionsProps {
  readonly row: StaffRow;
  readonly me: Me | null;
  readonly busy: boolean;
  readonly onApprove: (id: string) => void;
  readonly onDisable: (id: string) => void;
  readonly onIssueCode: (row: { id: string; name: string }) => void;
}

/**
 * `<td>` các nút hành động cho một dòng nhân viên.
 *
 * Ba nút này từng là `<button className="rounded border px-2 py-1">` viết tay:
 * đo được **62,5 × 34 px** — trên ngưỡng 24px của WCAG 2.2 nhưng DƯỚI chuẩn
 * 44px mà chính app tuyên bố ở `ui/button.tsx`, `AppNav` và `attention-list`.
 * Đây là màn chủ shop dùng để duyệt/khoá tài khoản, và chủ shop dùng điện thoại.
 *
 * `<td>` cũng thôi làm flex container: `display: flex` trên một ô bảng lấy nó ra
 * khỏi thuật toán chia cột. Ở độ rộng hiện tại nó chưa lệch (đo: 154,7 × 46 so
 * với `<th>` 154,7 × 44,5), nhưng đó là may chứ không phải thiết kế. Bọc nội
 * dung trong một `<div>` thì ô vẫn là ô.
 */
export function StaffRowActions({
  row,
  me,
  busy,
  onApprove,
  onDisable,
  onIssueCode,
}: StaffRowActionsProps) {
  return (
    <td className="card-pad">
      <div className="flex flex-wrap gap-2">
        {row.status === "PENDING" && (
          <Button type="button" disabled={busy} onClick={() => onApprove(row.id)}>
            Duyệt
          </Button>
        )}
        {/* Tự khoá mình bị backend chặn (`CANNOT_DISABLE_SELF`); ẩn nút để không
            mời người ta bấm vào một lỗi đã biết trước. */}
        {row.status === "ACTIVE" && row.id !== me?.id && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onDisable(row.id)}
          >
            Khoá
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => onIssueCode({ id: row.id, name: row.fullName })}
        >
          Phát mã
        </Button>
      </div>
    </td>
  );
}
