import { formatVnd } from "@v9/shared/domain/money";
import { vehicleStatusLabel } from "@v9/shared/domain/vehicle";
import type { FleetVehicle } from "../../lib/rentals";
import { fleetGroupOf, GROUP_LABEL, onRentLabel } from "../../lib/fleet-group";
import type { VehicleRevenue } from "../../lib/fleet-admin";

/**
 * Bảng đội xe — hình dạng của tablet (≥768) và desktop (≥1024).
 *
 * Hai bề rộng dùng CHUNG bảng này; khác nhau ở chỗ MỞ chi tiết, do
 * `fleet-page.tsx` quyết định (tablet: sheet phủ lên · desktop: panel cố định
 * bên phải). Bảng không biết điều đó, và đó là lý do nó chỉ nhận `onOpen`.
 *
 * `overflow-x-auto` bọc NGOÀI bảng khoanh vùng cuộn ngang vào đúng khối này —
 * `AppShell` đặt `overflow-y-auto` ở vùng nội dung chứ không `overflow-x`, nên
 * khối bọc ở đây là chỗ DUY NHẤT chịu trách nhiệm không để bảng đẩy cả trang
 * cuộn ngang. Cùng khuôn `staff-table.tsx`.
 */

const DAY_FMT = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });

/** `onRentUntil` qua JSON là chuỗi ISO dù Eden khai `Date` — nhận cả hai. */
const day = (v: Date | string | null): string | null =>
  v === null ? null : DAY_FMT.format(new Date(v));

function Availability({ vehicle, now }: { readonly vehicle: FleetVehicle; readonly now: Date }) {
  const group = fleetGroupOf({
    status: vehicle.status,
    onRentUntil: vehicle.onRentUntil === null ? null : new Date(vehicle.onRentUntil),
    nextFrom: vehicle.nextFrom === null ? null : new Date(vehicle.nextFrom),
  });
  const until = vehicle.onRentUntil === null ? null : new Date(vehicle.onRentUntil);
  const next = day(vehicle.nextFrom);
  const overdue = until !== null && until.getTime() < now.getTime();

  return (
    <span className="flex flex-col">
      <span className="text-ink">{GROUP_LABEL[group]}</span>
      {/* Chỉ MỘT dòng phụ, và nó là dòng trả lời câu hỏi kế tiếp: xe đang bận thì
          "về lúc nào", xe trống thì "có đơn từ bao giờ". Ca quá hạn đổi cả CHỮ
          lẫn MÀU — nó là việc phải làm, không phải một thông tin trung tính. */}
      {until !== null && (
        <span className={`text-xs ${overdue ? "text-status-overdue" : "text-muted"}`}>
          {onRentLabel(until, now)}
        </span>
      )}
      {until === null && next !== null && (
        <span className="text-xs text-muted">có đơn từ {next}</span>
      )}
    </span>
  );
}

export function FleetTable({
  rows,
  revenue,
  selectedId,
  compact,
  onOpen,
}: {
  readonly rows: readonly FleetVehicle[];
  readonly revenue: readonly VehicleRevenue[];
  readonly selectedId: string | null;
  /**
   * Panel chi tiết đang mở cạnh bảng — bỏ hai cột mà panel đã hiện.
   *
   * KHÔNG phải một cách "cho vừa": đo ở 1440px với panel mở, vùng còn lại cho
   * bảng là ~780px trong khi bảy cột cần ~900px để chữ không xuống dòng, và kết
   * quả là mọi ô bị bẻ hai dòng. Nới `min-w` chỉ đổi cái bóp thành cuộn ngang
   * ngay cạnh một panel — tệ hơn.
   *
   * Bỏ ĐÚNG hai cột `Biển số` và `Danh mục` vì panel đang hiện cả hai ở dạng ô
   * nhập sửa được. Lặp lại chúng trong bảng là chiếm chỗ để nói một điều người
   * dùng đang đọc ở ngay bên phải.
   */
  readonly compact: boolean;
  readonly onOpen: (id: string) => void;
}) {
  const revenueOf = (id: string) => revenue.find((r) => r.vehicleId === id);
  // MỘT `now` cho cả bảng, dựng ở lần render này: gọi `new Date()` trong từng
  // dòng cho ra những mốc lệch nhau vài mili giây, và một dòng đúng biên có thể
  // đọc ra "quá hạn" trong khi dòng bên cạnh thì không.
  const now = new Date();

  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left text-sm ${compact ? "min-w-[520px]" : "min-w-[760px]"}`}>
        <thead>
          {/* `scope="col"` ở MỌI ô tiêu đề: thiếu nó thì trình đọc màn hình không
              gắn được ô dữ liệu với tiêu đề cột, và một bảng bảy cột đọc ra thành
              một chuỗi giá trị không nhãn. */}
          <tr className="border-b border-border text-muted">
            <th scope="col" className="card-pad">
              Xe
            </th>
            <th scope="col" className="card-pad">
              Tình trạng
            </th>
            {!compact && (
              <th scope="col" className="card-pad">
                Biển số
              </th>
            )}
            <th scope="col" className="card-pad">
              Giá/ngày
            </th>
            <th scope="col" className="card-pad">
              Ảnh
            </th>
            {!compact && (
              <th scope="col" className="card-pad">
                Danh mục
              </th>
            )}
            <th scope="col" className="card-pad">
              Doanh thu
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const r = revenueOf(v.id);
            return (
              <tr
                key={v.id}
                className={`border-b border-border align-top ${
                  v.id === selectedId ? "bg-canvas" : ""
                }`}
              >
                <td className="card-pad">
                  {/*
                    Nút mang chính TÊN XE, không phải một nút "Sửa" thứ tám ở cuối
                    dòng: tên là thứ người dùng đang nhìn để tìm đúng dòng, nên nó
                    cũng là thứ đáng bấm. Cùng khuôn ô tên khách ở `rental-list.tsx`.
                  */}
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(v.id);
                    }}
                    className="min-h-11 text-left font-semibold text-ink underline-offset-2 hover:underline"
                  >
                    {v.make} {v.model}
                  </button>
                  <span className="block text-xs text-muted">{v.slug}</span>
                </td>
                <td className="card-pad">
                  <Availability vehicle={v} now={now} />
                </td>
                {!compact && <td className="card-pad tabular-nums">{v.plate ?? "—"}</td>}
                <td className="card-pad tabular-nums">{formatVnd(v.pricePerDay)}</td>
                <td className="card-pad tabular-nums">
                  {/* `0` là thông tin, không phải chỗ trống: xe chưa có ảnh hiện ra
                      là ô xám trên trang khách. Nói bằng chữ để nó đọc được. */}
                  {v.photoCount === 0 ? (
                    <span className="text-status-overdue">chưa có</span>
                  ) : (
                    v.photoCount
                  )}
                </td>
                {!compact && <td className="card-pad">{vehicleStatusLabel(v.status)}</td>}
                <td className="card-pad tabular-nums">
                  {r === undefined ? "—" : formatVnd(r.revenue)}
                  {r !== undefined && r.ongoingOrders > 0 && (
                    <span className="block text-xs text-muted">
                      +{r.ongoingOrders} đơn đang chạy
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
