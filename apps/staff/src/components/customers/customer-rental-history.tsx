import { formatVnd } from "@v9/shared/domain/money";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import type { CustomerRental } from "../../lib/customers";
import { STATUS_LABEL } from "../../lib/rental-status";

interface CustomerRentalHistoryProps {
  readonly rentals: readonly CustomerRental[];
}

/** Cùng khuôn định dạng với `RANGE_DATE_FMT` ở `rental-calendar.tsx` — ngày/tháng/năm, giờ VN. */
const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Bảng lịch sử đơn thuê của một khách hàng — MỚI NHẤT trước (server đã sắp,
 * xem `listRentalsForCustomer`), gồm CẢ đơn đã huỷ vì đó là một phần thật của
 * quan hệ giao dịch với khách này, không phải trạng thái chiếm dụng xe.
 *
 * Nhãn trạng thái dùng lại `STATUS_LABEL` (`lib/rental-status.ts`) — CÙNG bộ
 * nhãn với lịch, không viết một bản tiếng Việt thứ hai sẽ lệch dần.
 */
export function CustomerRentalHistory({ rentals }: CustomerRentalHistoryProps) {
  if (rentals.length === 0) {
    return <p className="mt-3 text-sm text-muted">Khách hàng này chưa có đơn thuê nào.</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="card-pad">Xe</th>
            <th className="card-pad">Thời gian thuê</th>
            <th className="card-pad">Trạng thái</th>
            <th className="card-pad">Tổng tiền</th>
          </tr>
        </thead>
        <tbody>
          {rentals.map((r) => (
            <tr key={r.id} className="border-b border-border align-top">
              <td className="card-pad">
                {r.vehicleMake} {r.vehicleModel}
                {r.vehiclePlate && <span className="text-muted"> · {r.vehiclePlate}</span>}
              </td>
              <td className="card-pad">
                {DATE_FMT.format(r.startsAt)} – {DATE_FMT.format(r.endsAt)}
              </td>
              <td className="card-pad">{STATUS_LABEL[r.status]}</td>
              <td className="card-pad">{formatVnd(r.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
