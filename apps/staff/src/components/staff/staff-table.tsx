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

/**
 * Một `<table>` 6 cột không co vừa 375px mà không vỡ chữ. `overflow-x-auto` bọc
 * NGOÀI bảng khoanh vùng cuộn ngang vào đúng khối này — `AppShell` (Task 5) đặt
 * `overflow-y-auto` ở vùng nội dung chứ không phải `overflow-x`, nên khối bọc ở
 * đây là chỗ DUY NHẤT chịu trách nhiệm không để bảng đẩy cả trang cuộn ngang.
 * `min-w-[640px]` giữ đủ chỗ cho 6 cột đọc được thay vì bị bóp chữ chồng nhau;
 * đây là arbitrary value cho WIDTH — spacing fence chỉ khoá p/m/gap nên không
 * chặn giá trị này.
 */
export function StaffTable({ rows, me, busy, onApprove, onDisable, onIssueCode }: StaffTableProps) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          {/* `scope="col"` ở MỌI ô tiêu đề — `customer-rental-history.tsx` và
              `customer-table.tsx` đã có, bảng này thì chưa. Thiếu nó, trình đọc
              màn hình không gắn được ô dữ liệu với tiêu đề cột của nó, và một
              bảng 6 cột đọc ra thành một chuỗi giá trị không nhãn. */}
          <tr className="border-b border-border text-muted">
            <th scope="col" className="card-pad">Họ tên</th>
            <th scope="col" className="card-pad">Email</th>
            <th scope="col" className="card-pad">Điện thoại</th>
            <th scope="col" className="card-pad">Vai trò</th>
            <th scope="col" className="card-pad">Trạng thái</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border align-top">
              <td className="card-pad">{row.fullName}</td>
              <td className="card-pad">{row.email}</td>
              <td className="card-pad">{row.phone ?? "—"}</td>
              <td className="card-pad">{row.role}</td>
              <td className="card-pad">{row.status}</td>
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
    </div>
  );
}
