import { Link } from "@tanstack/react-router";
import type { CustomerListRow } from "../../lib/customers";

interface CustomerTableProps {
  readonly rows: readonly CustomerListRow[];
  /** `q`/`page` đang xem, đi cùng sang trang chi tiết để nút back quay lại đúng đây. */
  readonly listSearch: { readonly q: string; readonly page: number };
}

/**
 * `<table>` 4 cột, cùng khuôn `staff-table.tsx`: `overflow-x-auto` bọc NGOÀI
 * khoanh vùng cuộn ngang vào đúng khối này, `min-w-[560px]` giữ đủ chỗ cho 4
 * cột đọc được mà không bóp chữ chồng nhau ở 375px — arbitrary value cho
 * WIDTH, spacing fence chỉ khoá p/m/gap nên không chặn giá trị này.
 */
export function CustomerTable({ rows, listSearch }: CustomerTableProps) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="card-pad">Họ tên</th>
            <th className="card-pad">Điện thoại</th>
            <th className="card-pad">Ghi chú</th>
            <th className="card-pad">Số đơn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border align-top">
              <td className="card-pad">
                <Link
                  to="/customers/$id"
                  params={{ id: row.id }}
                  search={listSearch}
                  className="font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {row.fullName}
                </Link>
              </td>
              <td className="card-pad">{row.phone}</td>
              <td className="card-pad text-muted">{row.note ?? "—"}</td>
              <td className="card-pad">{row.rentalCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
