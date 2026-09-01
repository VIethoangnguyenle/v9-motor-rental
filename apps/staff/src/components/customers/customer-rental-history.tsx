import { formatVnd } from "@v9/shared/domain/money";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import type { CustomerRental } from "../../lib/customers";
import { STATUS_LABEL, rentalChipClass } from "../../lib/rental-status";

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
 * Nhãn VÀ màu trạng thái đều dùng lại `lib/rental-status.ts` — cùng bộ với
 * lịch và với màn danh sách khách hàng, không viết một bản thứ hai sẽ lệch dần.
 * Trước đợt này đây là chỗ DUY NHẤT trong app in trạng thái đơn thuê bằng chữ
 * trần: cùng một thông tin, hai cách trình bày, và người đọc phải học lại cách
 * đọc khi đi từ lịch sang đây.
 *
 * KHÔNG mang `mt-*` của riêng mình: component này là flex item của một
 * `flex flex-col gap-4` ở `customer-detail-page.tsx`, nên `mt-3` cũ cộng dồn
 * với `gap-4` thành 28px — đo được trên app chạy thật, không phải suy luận.
 * Nhịp dọc thuộc về container cha; con tự thêm margin là cách nhịp đó lệch.
 */
export function CustomerRentalHistory({ rentals }: CustomerRentalHistoryProps) {
  // Một `now` cho cả bảng, truyền tham số xuống `rentalChipClass` — cùng khuôn
  // `calendar-timeline.tsx` và `customer-table.tsx`. Gọi `new Date()` ngay
  // trong JSX của từng dòng thì mỗi dòng đọc đồng hồ một lần khác nhau.
  const now = new Date();

  if (rentals.length === 0) {
    return <p className="text-sm text-muted">Khách hàng này chưa có đơn thuê nào.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th scope="col" className="card-pad">
              Xe
            </th>
            <th scope="col" className="card-pad">
              Thời gian thuê
            </th>
            <th scope="col" className="card-pad">
              Trạng thái
            </th>
            {/* Canh phải để khớp ô số bên dưới — tiêu đề lệch khỏi cột số của
                chính nó là thứ làm bảng trông "gần đúng" mà không ai chỉ được
                ra sai ở đâu. */}
            <th scope="col" className="card-pad text-right">
              Tổng tiền
            </th>
          </tr>
        </thead>
        <tbody>
          {rentals.map((r) => (
            <tr key={r.id} className="border-b border-border align-top">
              <td className="card-pad">
                {r.vehicleMake} {r.vehicleModel}
                {r.vehiclePlate && <span className="text-muted"> · {r.vehiclePlate}</span>}
              </td>
              {/* `whitespace-nowrap`: ở 560px khoảng thuê gãy giữa hai đầu mút
                  ("24/08/2026 –" / "28/08/2026") — một GIÁ TRỊ bị cắt làm đôi,
                  và `tabular-nums` thành vô nghĩa vì hai đầu mút không còn nằm
                  cùng dòng để so. Cột "Xe" thì cứ để xuống dòng: ở đó là hai
                  mẩu tin (tên xe · biển số), gãy giữa chúng là đúng chỗ. */}
              <td className="card-pad whitespace-nowrap tabular-nums">
                {DATE_FMT.format(r.startsAt)} – {DATE_FMT.format(r.endsAt)}
              </td>
              <td className="card-pad">
                <span
                  className={`inline-block rounded-card px-2 py-0.5 ${rentalChipClass(r, now)}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </td>
              <td className="card-pad text-right tabular-nums">{formatVnd(r.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
