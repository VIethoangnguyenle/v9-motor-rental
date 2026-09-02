import { ROLE_LABEL, STATUS_LABEL, type Me, type StaffRow } from "../../lib/me";
import { Avatar } from "../ui/avatar";
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
            <th scope="col" className="card-pad">
              Họ tên
            </th>
            <th scope="col" className="card-pad">
              Email
            </th>
            <th scope="col" className="card-pad">
              Điện thoại
            </th>
            <th scope="col" className="card-pad">
              Vai trò
            </th>
            <th scope="col" className="card-pad">
              Trạng thái
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border align-top">
              {/*
               * Avatar nằm TRONG ô "Họ tên", KHÔNG phải một cột thứ 7.
               *
               * Vì nó là phần tử đầu của ô đầu, mép trái của nó CHÍNH LÀ mép
               * trái của cột — tức nó thẳng hàng y hệt như khi có cột riêng.
               * Cột riêng thì trả thêm ba thứ mà không đổi lại được gì: ~44px
               * bề ngang cho một bảng đã phải cuộn ở 390px, một `<th>` không có
               * gì để đọc lên (avatar là `aria-hidden`), và một ô rỗng nữa cho
               * người dùng bàn phím đi qua ở mỗi dòng.
               *
               * `items-center` chứ không theo `align-top` của `<tr>`: ô này chỉ
               * có một dòng chữ, và một hình 28px canh theo mép trên của một
               * dòng 20px thì thò xuống dưới đường chân chữ.
               */}
              <td className="card-pad">
                <span className="flex items-center gap-2">
                  <Avatar name={row.fullName} seed={row.id} />
                  {row.fullName}
                </span>
              </td>
              <td className="card-pad">{row.email}</td>
              <td className="card-pad">{row.phone ?? "—"}</td>
              {/* Tra bảng, KHÔNG in thẳng hằng số. `/settings` đã hiện "Chủ shop";
                  để bảng này in "OWNER" là hai từ vựng cho cùng một thứ, ở hai
                  màn hình mà chủ shop đi qua lại giữa chúng. Hai cột sửa CÙNG
                  LÚC: sửa một cột thì màn này tự mâu thuẫn với chính nó. */}
              <td className="card-pad">{ROLE_LABEL[row.role]}</td>
              <td className="card-pad">{STATUS_LABEL[row.status]}</td>
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
