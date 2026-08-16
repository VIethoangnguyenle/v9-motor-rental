import { Fragment } from "react";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import {
  dayColumns,
  placeBar,
  type BarPlacement,
  type GridWindow,
} from "../../lib/calendar-layout";
import type { CalendarRental, FleetVehicle } from "../../lib/rentals";
import { STATUS_LABEL, rentalChipClass } from "../../lib/rental-status";

/**
 * Hàng là xe, cột là ngày, mỗi thanh là một đơn. Đây là màn hình trả lời cùng
 * lúc hai câu chủ shop hỏi nhiều nhất — "xe nào đang bận tới ngày nào" và
 * "khách muốn thuê 24–27 thì còn xe nào" — vì KHOẢNG TRẮNG trong lưới CHÍNH LÀ
 * xe còn trống: không cần đọc gì, chỉ cần nhìn.
 *
 * ## Trách nhiệm responsive: PARENT đo viewport, component chỉ vẽ đúng cửa sổ nhận được
 *
 * Số ngày hiển thị (7/10/14, xem bảng breakpoint ở plan) đổi theo bề rộng màn
 * hình, nhưng đây KHÔNG chỉ là chuyện trình bày: nó quyết định luôn khoảng cần
 * gọi `GET /rentals` (nhiều ngày hơn = phải fetch nhiều hơn). Vì fetch/range
 * selection thuộc `rental-calendar.tsx` (Task 6), quyết định "mấy ngày" phải
 * đứng CÙNG PHÍA với fetch — tức là ở component đó, không phải ở đây.
 *
 * Đã chọn: **`rental-calendar.tsx` đo viewport (vd bằng `matchMedia` ở hai
 * ngưỡng 768px/1280px) rồi truyền `gridWindow` đã đúng số ngày cho breakpoint
 * hiện tại.** Component này KHÔNG tự đoán lại số ngày — nó vẽ đúng
 * `dayColumns(gridWindow).length` cột, không hơn không kém, bất kể con số đó
 * là bao nhiêu.
 *
 * Không chọn phương án "component tự báo số ngày ưa thích lên cho parent" vì
 * nó tạo một round-trip: mount lần đầu với window (tạm) sai số ngày → báo lên
 * → parent fetch lại đúng khoảng → mount lại — tức lưới TRỐNG-RỒI-ĐẦY một nhịp
 * mỗi lần đổi kích thước cửa sổ hoặc xoay màn hình. Cách đã chọn thì component
 * luôn nhận đúng dữ liệu ngay lần vẽ đầu tiên.
 *
 * Cột xe (88/112/130px) là quyết định THUẦN TRÌNH BÀY — không ảnh hưởng gì tới
 * việc fetch — nên nó là ngoại lệ hợp lý: ba class Tailwind `md:`/`xl:` bên
 * dưới tự đổi độ rộng cột theo breakpoint CSS, ĐỘC LẬP với việc parent đổi
 * `gridWindow`. Hệ quả bắt buộc: `rental-calendar.tsx` phải dùng ĐÚNG hai
 * ngưỡng 768px/1280px (khớp `md`/`xl` mặc định của Tailwind) khi đo viewport để
 * chọn số ngày — lệch ngưỡng thì tiêu đề cột ngày (đổi ở breakpoint CSS) và số
 * cột thật (đổi ở breakpoint JS của parent) sẽ không khớp nhau đúng lúc bề rộng
 * màn hình nằm giữa hai ngưỡng.
 */
export interface CalendarTimelineProps {
  readonly vehicles: readonly FleetVehicle[];
  readonly rentals: readonly CalendarRental[];
  readonly gridWindow: GridWindow;
}

/**
 * Định dạng NGÀY của một instant theo giờ shop (`SHOP_TIMEZONE`), không theo
 * giờ máy chạy — cùng lý lẽ `zonedYmd` ở `calendar-layout.ts`. `Intl` tự tính
 * đúng thứ/ngày theo múi giờ tường minh, nên không cần tự suy `getUTCDay()`
 * trên instant nửa đêm giờ VN (làm vậy SẼ sai — nửa đêm giờ VN là 17h hôm
 * trước theo UTC, `getUTCDay()` đọc nhầm sang ngày trước).
 */
const WEEKDAY_FMT = new Intl.DateTimeFormat("vi-VN", { timeZone: SHOP_TIMEZONE, weekday: "short" });
const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
});

interface Placed {
  readonly rental: CalendarRental;
  readonly placement: BarPlacement;
}

export function CalendarTimeline({ vehicles, rentals, gridWindow }: CalendarTimelineProps) {
  // `now` đọc một lần mỗi lần render, truyền THAM SỐ vào `isOverdue` (qua
  // `rentalChipClass`) — không gọi `Date.now()` rải rác trong JSX. Sai lệch vài
  // giây/phút do không nhớ lại giữa các lần render là chấp nhận được cho một
  // màu trạng thái, không phải một phép tính tiền.
  const now = new Date();
  const cols = dayColumns(gridWindow);

  const rentalsByVehicle = new Map<string, CalendarRental[]>();
  for (const r of rentals) {
    const list = rentalsByVehicle.get(r.vehicleId);
    if (list) list.push(r);
    else rentalsByVehicle.set(r.vehicleId, [r]);
  }

  return (
    // Chỉ khối này cuộn ngang — KHÔNG phải trang. `min-w-max` ở lưới bên trong
    // ép nó giữ đúng độ rộng tự nhiên (cột ngày không bị bóp lại để vừa
    // viewport), nên cuộn diễn ra ở ĐÂY, không đẩy `<body>` cuộn ngang.
    <div className="w-full overflow-x-auto rounded-card border border-border">
      <div
        // Ba biến CSS tĩnh (không nội suy runtime) cho độ rộng cột xe theo
        // breakpoint — Tailwind quét CLASS NAME lúc build, chuỗi nội suy động
        // (`w-[${n}px]`) sẽ KHÔNG được tìm thấy và sinh ra một class rỗng,
        // hỏng im lặng. Giá trị 7/10/14 ngày (động, phụ thuộc `gridWindow`) vì
        // vậy phải đi qua `style` (raw CSS, không qua Tailwind) — xem bên dưới.
        className="grid min-w-max [--veh-col:5.5rem] md:[--veh-col:7rem] xl:[--veh-col:8.125rem]"
        style={{
          gridTemplateColumns: `var(--veh-col) repeat(${String(cols.length)}, minmax(2.75rem, 1fr))`,
        }}
      >
        {/* Góc trên-trái — dính cả khi cuộn ngang, cùng hàng với header ngày. */}
        <div
          style={{ gridColumn: "1", gridRow: "1" }}
          className="sticky left-0 z-20 border-r border-b border-border bg-surface card-pad text-xs font-semibold text-muted"
        >
          Xe
        </div>

        {cols.map((col, j) => (
          <div
            key={col.date.toISOString()}
            style={{ gridColumn: String(j + 2), gridRow: "1" }}
            className={`border-b border-l border-border py-1 text-center text-xs ${col.isWeekend ? "bg-canvas" : "bg-surface"}`}
          >
            <span className="block text-muted">{WEEKDAY_FMT.format(col.date)}</span>
            <span className="block font-semibold text-ink">{DATE_FMT.format(col.date)}</span>
          </div>
        ))}

        {vehicles.map((vehicle, i) => {
          const gridRow = String(i + 2);
          const placed: Placed[] = (rentalsByVehicle.get(vehicle.id) ?? []).flatMap((rental) => {
            const placement = placeBar(rental, gridWindow);
            return placement ? [{ rental, placement }] : [];
          });

          return (
            <Fragment key={vehicle.id}>
              <div
                style={{ gridColumn: "1", gridRow }}
                className="sticky left-0 z-10 min-h-11 truncate border-r border-b border-border bg-surface card-pad text-sm text-ink"
                title={`${vehicle.make} ${vehicle.model}${vehicle.plate ? ` · ${vehicle.plate}` : ""}`}
              >
                {vehicle.make} {vehicle.model}
              </div>

              {/* Nền + thông điệp rỗng của cả hàng, trải suốt các cột ngày.
                  Các thanh đơn (bên dưới) là item RIÊNG đặt đè lên đúng vùng cột
                  của chúng trong cùng `gridRow` — CSS Grid cho phép nhiều item
                  chồng vùng, thứ tự DOM sau thì vẽ đè lên trước, nên không cần
                  z-index thủ công giữa nền hàng và thanh đơn. */}
              <div
                style={{ gridColumn: `2 / span ${String(cols.length)}`, gridRow }}
                className="relative min-h-11 border-b border-border"
              >
                {placed.length === 0 && (
                  // Yêu cầu #… của Task 4: xe trống cả kỳ là THÔNG TIN, không
                  // phải khoảng trống câm — nói thẳng, không để người xem tự đoán
                  // "trống hay chưa tải xong".
                  <span className="absolute inset-0 flex items-center px-2 text-xs text-muted">
                    trống cả kỳ
                  </span>
                )}
              </div>

              {placed.map(({ rental, placement }) => (
                <div
                  key={rental.id}
                  style={{
                    gridColumn: `${String(placement.startCol + 1)} / span ${String(placement.span)}`,
                    gridRow,
                  }}
                  className={`m-0.5 flex min-h-10 items-center gap-1 rounded-card px-2 text-xs ${rentalChipClass(rental, now)}`}
                  title={`${rental.customerName ?? "—"} · ${STATUS_LABEL[rental.status]}`}
                >
                  {/* `‹`/`›`: đơn kéo dài ra ngoài cửa sổ đang xem — không phải
                      trang trí, mà là dấu hiệu "còn tiếp" để không đọc nhầm là
                      đơn kết thúc/bắt đầu đúng mép lưới. */}
                  {placement.clippedStart && <span aria-hidden>‹</span>}
                  <span className="min-w-0 truncate">{rental.customerName ?? "—"}</span>
                  {placement.clippedEnd && <span aria-hidden>›</span>}
                </div>
              ))}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
