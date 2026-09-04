import { SHOP_TIMEZONE, type RentalStatus } from "@v9/shared/domain/rental";
import { useLayoutVariant } from "../../hooks/use-layout-variant";
import { STATUS_LABEL, lastMomentOf, rentalChipClass, statusIconOf } from "../../lib/rental-status";
import { Icon } from "../ui/icon";

/**
 * Hình dạng HẸP NHẤT một dòng cần để vẽ được — không phải `RentalQueueRow`.
 *
 * Cùng lý lẽ `rentalChipClass` đã ghi khi nó nhận `{ status; startsAt; endsAt }`
 * thay vì `CalendarRental`: hai màn (hàng đợi, sổ cái) đưa hai kiểu hàng khác
 * nhau vào đây, và buộc chúng về một kiểu cụ thể là kéo cả hợp đồng API vào một
 * component trình bày.
 */
export interface RentalListItem {
  readonly id: string;
  readonly status: RentalStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly totalAmount: number;
  readonly customerName?: string | undefined;
  readonly vehicleMake: string;
  readonly vehicleModel: string;
  readonly vehiclePlate: string | null;
}

/**
 * Mốc nào được hiện, và nhãn nào đi kèm — CÙNG luật `whenOf`/`WHEN_LABEL` của
 * `customers/customer-table.tsx`, và cùng lý do: `ONGOING` hỏi "bao giờ phải trả
 * xe", `BOOKED` hỏi "bao giờ tới lấy". Đưa ngày trả cho một đơn chưa giao xe là
 * trả lời sai câu hỏi bằng một con số trông rất đúng.
 *
 * `COMPLETED`/`CANCELLED` không tới được ở chế độ hàng đợi nhưng CÓ ở sổ cái,
 * nên chúng phải có nhánh thật: hiện mốc kết thúc, nhãn "Xong".
 *
 * `lastMomentOf` cho mọi nhánh đọc `endsAt`: `endsAt` là biên MỞ, in nó trần là
 * sai đúng một ngày ở mọi đơn kết thúc lúc nửa đêm.
 */
function whenOf(r: RentalListItem): { label: string; at: Date } {
  if (r.status === "BOOKED") return { label: "Lấy", at: r.startsAt };
  if (r.status === "ONGOING") return { label: "Trả", at: lastMomentOf(r.endsAt) };
  return { label: "Xong", at: lastMomentOf(r.endsAt) };
}

/** GIỜ có mặt vì "9h sáng" và "9h tối" là hai câu trả lời khác hẳn nhau — cùng `WHEN_FMT`. */
const WHEN_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

const MONEY_FMT = new Intl.NumberFormat("vi-VN");

function vehicleLabel(r: RentalListItem): string {
  return r.vehiclePlate
    ? `${r.vehicleMake} ${r.vehicleModel} · ${r.vehiclePlate}`
    : `${r.vehicleMake} ${r.vehicleModel}`;
}

/**
 * Chip trạng thái — màu VÀ hình, không bao giờ chỉ màu. THUẦN TRÌNH BÀY: không
 * còn là nút bấm — xem `RentalList`, ô tên khách mới là vùng bấm mở sheet.
 *
 * `statusIconOf` bắt buộc chứ không trang trí: `status-icon.test.ts` khoá song
 * ánh màu ↔ hình vì dưới deuteranopia sáu trạng thái không tách được bằng màu.
 * Nhãn chữ cũng nằm ngay trong chip chứ không trong `title=` — app này là PWA
 * dùng trên điện thoại, và ở đó `title` không bao giờ hiện.
 */
function StatusChip({ rental, now }: { readonly rental: RentalListItem; readonly now: Date }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-card px-2 py-1 text-xs font-medium ${rentalChipClass(rental, now)}`}
    >
      {/* Không truyền `aria-hidden` ở đây — `Icon` đã tự gắn nó (icon trong app
          này luôn đi kèm nhãn chữ, nên trình đọc màn hình không cần đọc đúp). */}
      <Icon name={statusIconOf(rental, now)} />
      {STATUS_LABEL[rental.status]}
    </span>
  );
}

interface RentalListProps {
  readonly rows: readonly RentalListItem[];
  readonly now: Date;
  readonly onOpen: (id: string) => void;
}

/**
 * Chọn MỘT hình dạng, không dựng cả hai rồi ẩn bằng CSS — cùng quyết định
 * `staff-table.tsx` đã ghi.
 *
 * Vì sao thẻ (khuôn `/staff`) chứ không phải cuộn ngang (khuôn `/customers`):
 * dòng đơn thuê mang sáu trường, và chế độ hàng đợi LÀ chế độ điện thoại — bắt
 * cuộn ngang để đọc cột "trả lúc mấy giờ" trên màn 375px là trả giá đúng ở nơi
 * app được dùng nhiều nhất.
 */
export function RentalList({ rows, now, onOpen }: RentalListProps) {
  if (useLayoutVariant() === "mobile") {
    return (
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex min-h-11 w-full flex-col items-start gap-1 rounded-card border border-border card-pad text-left transition-[background-color] duration-(--duration-instant) ease-standard hover:bg-canvas"
            >
              <StatusChip rental={r} now={now} />
              <span className="font-semibold text-ink">{r.customerName ?? "—"}</span>
              <span className="text-sm text-muted">{vehicleLabel(r)}</span>
              <span className="text-sm text-ink tabular-nums">
                {whenOf(r).label} {WHEN_FMT.format(whenOf(r).at)}
              </span>
              <span className="text-sm text-muted tabular-nums">
                {MONEY_FMT.format(r.totalAmount)} ₫
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          {/* `scope="col"` ở MỌI ô tiêu đề — thiếu nó, trình đọc màn hình đọc
              bảng này thành một chuỗi giá trị không nhãn. */}
          <tr className="border-b border-border text-muted">
            <th scope="col" className="card-pad">
              Trạng thái
            </th>
            <th scope="col" className="card-pad">
              Khách
            </th>
            <th scope="col" className="card-pad">
              Xe
            </th>
            <th scope="col" className="card-pad">
              Mốc
            </th>
            <th scope="col" className="card-pad text-right">
              Tiền
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const when = whenOf(r);
            return (
              <tr key={r.id} className="border-b border-border align-top">
                <td className="card-pad">
                  <StatusChip rental={r} now={now} />
                </td>
                {/* `p-0` trên `<td>` + `card-pad flex min-h-11 items-start` trên
                    chính nút — cùng khuôn `customer-table.tsx`: tên khách là vùng
                    bấm mở sheet, KHÔNG phải chip trạng thái. Một hàng bấm được mà
                    không phải phần tử tương tác (`<tr onClick>`) thì bàn phím
                    không tới được và trình đọc màn hình không thông báo được;
                    khoanh vùng bấm vào chip thì màn rộng chỉ bấm trúng một ô nhỏ
                    trong khi màn hẹp cả thẻ bấm được — hai lối vào khác nhau cho
                    cùng một hành động. */}
                <td className="p-0">
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="card-pad flex min-h-11 w-full items-start text-left font-semibold text-ink"
                  >
                    {r.customerName ?? "—"}
                  </button>
                </td>
                <td className="card-pad text-muted">{vehicleLabel(r)}</td>
                <td className="card-pad whitespace-nowrap tabular-nums text-ink">
                  {when.label} {WHEN_FMT.format(when.at)}
                </td>
                <td className="card-pad text-right tabular-nums text-muted">
                  {MONEY_FMT.format(r.totalAmount)} ₫
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
