import { useAvatarUrl } from "../../hooks/use-avatar-url";
import { ROLE_LABEL, STATUS_LABEL, type Me, type StaffRow } from "../../lib/me";
import { Avatar } from "../ui/avatar";
import { StaffActionButtons } from "./staff-row-actions";

interface StaffCardsProps {
  readonly rows: readonly StaffRow[];
  readonly me: Me | null;
  readonly busy: boolean;
  readonly onApprove: (id: string) => void;
  readonly onDisable: (id: string) => void;
  readonly onIssueCode: (row: { id: string; name: string }) => void;
}

/** Một dòng nhân viên, tách component vì `useAvatarUrl` không gọi được trong `.map()`. */
function StaffCard({
  row,
  me,
  busy,
  onApprove,
  onDisable,
  onIssueCode,
}: StaffCardsProps & { readonly row: StaffRow }) {
  const avatarUrl = useAvatarUrl(row.id, row.avatarVersion);
  return (
    <li className="card-pad border-b border-border">
      <div className="flex items-center gap-2">
        <Avatar name={row.fullName} seed={row.id} src={avatarUrl} />
        <span className="font-semibold text-ink">{row.fullName}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{row.email}</p>
      {/* CHỮ, không phải dấu `—`.

          Trong BẢNG, `—` nằm dưới một `<th>` ghi "Điện thoại", nên nó đọc được
          là "cột này rỗng". Trên THẺ không có tiêu đề cột nào, nên cùng ký tự đó
          đứng một mình giữa email và vai trò đọc ra như dữ liệu hỏng — đo bằng
          ảnh chụp 390px: một gạch ngang trần chiếm trọn một dòng, không nói gì.

          Số điện thoại là HÀNH ĐỘNG khi có (shop chạy bằng Zalo và điện thoại),
          nên khi có thì nó là link gọi, cùng cách `customer-cards.tsx` làm. */}
      {row.phone === null ? (
        <p className="text-sm text-muted">Chưa có số điện thoại</p>
      ) : (
        <p className="text-sm">
          <a
            href={`tel:${row.phone}`}
            className="inline-flex min-h-11 items-center tabular-nums text-ink underline-offset-2 hover:underline"
          >
            {row.phone}
          </a>
        </p>
      )}
      {/* Vai trò và trạng thái đi cùng một dòng: ở bảng chúng là hai cột cạnh
          nhau, giữ nguyên quan hệ đó thì người đã quen bảng không phải học lại.
          Mỗi nhãn nằm trong `<span>` riêng — không chỉ để test truy vấn được
          từng nhãn bằng `getByText`, mà còn để trình đọc màn hình không đọc
          "Nhân viên · Chờ duyệt" như một cụm không tách được. */}
      <p className="mt-1 text-sm text-ink">
        <span>{ROLE_LABEL[row.role]}</span> · <span>{STATUS_LABEL[row.status]}</span>
      </p>
      <div className="mt-2">
        <StaffActionButtons
          row={row}
          me={me}
          busy={busy}
          onApprove={onApprove}
          onDisable={onDisable}
          onIssueCode={onIssueCode}
        />
      </div>
    </li>
  );
}

/**
 * Hình dạng thẻ của danh sách nhân viên, dùng ở màn hẹp.
 *
 * Không phải để thêm lại thứ đã mất — bảng vốn dựng đủ sáu cột và cả ba nút. Đo
 * ở 390px: khối bọc bảng là 358/640, và **0/3 nút hành động** nằm trong khung
 * nhìn. Thẻ đưa mọi trường vào tầm mắt mà không đòi ai phải phát hiện ra là bảng
 * cuộn ngang được.
 */
export function StaffCards(props: StaffCardsProps) {
  return (
    <ul className="mt-4">
      {props.rows.map((row) => (
        <StaffCard key={row.id} {...props} row={row} />
      ))}
    </ul>
  );
}
