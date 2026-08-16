import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import { dayColumns, placeBar, type BarPlacement, type GridWindow } from "../../lib/calendar-layout";
import type { CalendarRental, FleetVehicle } from "../../lib/rentals";
import { STATUS_LABEL, rentalChipClass } from "../../lib/rental-status";

/**
 * Ô ngày kiểu Google Calendar. Tuần bắt đầu THỨ HAI (quy ước VN, và khớp
 * `date_trunc('week')` mà `apps/api` đã dùng — xem plan Task 5).
 *
 * ⚠️ KHÔNG cho thấy xe nào còn trống — thứ TRỐNG thì không xuất hiện trên một
 * lưới ngày. Đây là giới hạn ĐÃ BIẾT và có chủ ý (design doc §9), lý do
 * `calendar-timeline.tsx` tồn tại song song. Đừng vá nó ở đây bằng cách bịa
 * thêm badge kiểu "còn N xe trống" — không có dữ liệu "xe trống" nào truyền
 * vào component này để tính đúng số đó, và tính sai một con số như vậy còn tệ
 * hơn không hiện gì.
 *
 * ## `gridWindow` PHẢI đã dính Thứ Hai và đệm đủ tuần — component không tự tính lại
 *
 * Cùng lý lẽ đã chọn ở `calendar-timeline.tsx`: "tháng nào đang xem" là một
 * quyết định RANGE SELECTION, thuộc `rental-calendar.tsx` (Task 6), không
 * thuộc component trình bày này. Component chỉ gọi `dayColumns(gridWindow)`
 * (hàm thuần của Task 1, đã xử lý đúng múi giờ VN) và chia mảng kết quả thành
 * từng nhóm 7 ngày — nó KHÔNG tự đi tìm "đầu tháng" hay "Thứ Hai gần nhất"
 * (việc đó cần đọc Y-M-D theo giờ VN từ một instant bất kỳ, tức đúng phần khó
 * mà `calendar-layout.ts` cố tình KHÔNG export — viết lại ở đây là dựng thêm
 * một bản suy múi giờ thứ năm, nguy cơ lệch với bốn chỗ CLAUDE.md đã liệt kê).
 *
 * Hợp đồng cho `rental-calendar.tsx`: `gridWindow.from` phải là 00:00 giờ VN
 * của một ngày THỨ HAI (Thứ Hai ngay trước hoặc đúng ngày 1 của tháng cần
 * xem), và `gridWindow.to` (nửa mở) phải là 00:00 giờ VN của Thứ Hai kế tiếp
 * SAU Chủ Nhật cuối cùng của tuần chứa ngày cuối tháng — tức tổng số ngày
 * trong cửa sổ luôn là bội số của 7 (35 hoặc 42 tuỳ tháng). Component này
 * KHÔNG kiểm điều kiện đó lúc chạy (không phải việc của một component trình
 * bày); sai hợp đồng cho ra lưới lệch tuần, không phải lỗi hiện rõ.
 */
export interface CalendarMonthProps {
  readonly vehicles: readonly FleetVehicle[];
  readonly rentals: readonly CalendarRental[];
  readonly gridWindow: GridWindow;
}

const WEEKDAY_HEADER = ["Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7", "CN"];

/**
 * Cùng lý lẽ `WEEKDAY_FMT`/`DATE_FMT` ở `calendar-timeline.tsx`: định dạng
 * NGÀY theo giờ shop bằng `Intl` với `timeZone` tường minh, không suy tay từ
 * các field UTC của instant (nửa đêm giờ VN lệch UTC 7 tiếng, đọc nhầm ngày).
 */
const DAY_FMT = new Intl.DateTimeFormat("vi-VN", { timeZone: SHOP_TIMEZONE, day: "numeric" });
const DAY_MONTH_FMT = new Intl.DateTimeFormat("vi-VN", { timeZone: SHOP_TIMEZONE, day: "numeric", month: "short" });

/** Ngày 1 của tháng hiện kèm tên tháng — nếu không, một ô "1" ở rìa lưới (đầu
 *  tháng sau/cuối tháng trước đệm vào) dễ đọc nhầm là ngày 1 của tháng đang xem. */
function dayLabel(date: Date): string {
  const plain = DAY_FMT.format(date);
  return plain === "1" ? DAY_MONTH_FMT.format(date) : plain;
}

/**
 * Tối đa 3 dòng đơn mỗi ô trước khi gộp thành "+k nữa".
 *
 * Vì sao 3, không phải 4 hay 5: ô lịch tháng chia đều 7 cột nên đã hẹp theo
 * chiều ngang (điện thoại ~50px/ô); giữ chiều cao ô gần vuông (không kéo dài
 * để nhét thêm dòng) nghĩa là số dòng chip phải nhỏ. 3 chip (~1rem/dòng) cộng
 * số ngày + khoảng đệm vừa một ô ~6rem cao — đọc được cả trên điện thoại. Hơn
 * 3 dòng ở độ rộng ~50px thì tên khách/xe bị truncate tới mức vô nghĩa, lúc đó
 * "+k nữa" là thông tin hữu ích hơn dòng chip thứ tư không đọc nổi.
 */
const MAX_CHIPS = 3;

interface Chip {
  readonly rental: CalendarRental;
  readonly placement: BarPlacement;
}

export function CalendarMonth({ vehicles, rentals, gridWindow }: CalendarMonthProps) {
  const now = new Date();
  const cols = dayColumns(gridWindow);
  const vehicleById = new Map(vehicles.map((v) => [v.id, v] as const));

  const weeks: (typeof cols)[] = [];
  for (let i = 0; i < cols.length; i += 7) weeks.push(cols.slice(i, i + 7));

  return (
    <div className="overflow-hidden rounded-card border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-canvas text-center text-xs font-semibold text-muted">
        {WEEKDAY_HEADER.map((label) => (
          <div key={label} className="card-pad">
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        // Chìa khoá theo ngày ĐẦU tuần (đủ duy nhất trong `gridWindow`, ổn định
        // giữa các lần render) — không dùng index `wi` một mình để tránh thói
        // quen key-theo-index khi danh sách có thể đổi thứ tự sau này.
        <div key={week[0]?.date.toISOString() ?? String(wi)} className="grid grid-cols-7">
          {week.map((col, di) => {
            const globalIndex = wi * 7 + di;
            // Biên NGÀY kế tiếp lấy từ chính cột kế trong mảng đã tính sẵn của
            // `dayColumns` — KHÔNG cộng `86_400_000` ms tay (bẫy đã ghi ở
            // `calendar-layout.ts`: chỉ đúng vì VN không DST, sai lặng nếu điều
            // đó đổi). Cột cuối cùng của cả lưới thì lấy `gridWindow.to`.
            const cellEnd = cols[globalIndex + 1]?.date ?? gridWindow.to;
            const isToday = now.getTime() >= col.date.getTime() && now.getTime() < cellEnd.getTime();

            // Tái dùng `placeBar` với cửa sổ MỘT NGÀY để hỏi "đơn này có chạm ô
            // này không" — cùng ngữ nghĩa `[from, to)` đã kiểm ở Task 1, thay vì
            // viết một điều kiện overlap thứ năm (CLAUDE.md: bốn chỗ đã phải tự
            // đồng ý với nhau bằng test, không có gì ép máy).
            const chips: Chip[] = rentals
              .flatMap((rental) => {
                const placement = placeBar(rental, { from: col.date, to: cellEnd });
                return placement ? [{ rental, placement }] : [];
              })
              .sort((a, b) => a.rental.startsAt.getTime() - b.rental.startsAt.getTime());

            const shown = chips.slice(0, MAX_CHIPS);
            const hiddenCount = chips.length - shown.length;

            return (
              <div
                key={col.date.toISOString()}
                className={`min-h-24 border-r border-b border-border p-1 last:border-r-0 ${col.isWeekend ? "bg-canvas" : "bg-surface"}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-accent font-semibold text-accent-ink" : "text-muted"
                  }`}
                >
                  {dayLabel(col.date)}
                </span>

                <div className="mt-1 flex flex-col gap-0.5">
                  {shown.map(({ rental, placement }) => {
                    const vehicle = vehicleById.get(rental.vehicleId);
                    const label = vehicle ? `${vehicle.make} ${vehicle.model}` : (rental.customerName ?? "—");
                    return (
                      <div
                        key={rental.id}
                        title={`${vehicle ? `${vehicle.make} ${vehicle.model}` : "?"} · ${rental.customerName ?? "—"} · ${STATUS_LABEL[rental.status]}`}
                        className={`truncate rounded-card px-1 text-xs ${rentalChipClass(rental, now)}`}
                      >
                        {placement.clippedStart && <span aria-hidden>‹</span>}
                        {label}
                        {placement.clippedEnd && <span aria-hidden>›</span>}
                      </div>
                    );
                  })}
                  {hiddenCount > 0 && <div className="px-1 text-xs text-muted">+{String(hiddenCount)} nữa</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
