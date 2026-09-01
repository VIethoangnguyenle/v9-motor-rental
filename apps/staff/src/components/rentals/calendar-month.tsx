import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import { dayColumns, gridEdgeClip, placeBar, type GridWindow } from "../../lib/calendar-layout";
import type { CalendarRental, FleetVehicle } from "../../lib/rentals";
import { STATUS_LABEL, rentalChipClass, statusIconOf } from "../../lib/rental-status";
import { Icon } from "../ui/icon";

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
  /** Chạm vào một chip đơn — mở sheet chi tiết. Xem `CalendarTimelineProps`. */
  readonly onSelect: (rental: CalendarRental) => void;
  /**
   * Chạm vào "+k nữa" — mở Timeline neo vào đúng ngày đó.
   *
   * Trước đây "+k nữa" là một `<div>` trơ: từ đơn thứ tư trở đi của một ngày
   * KHÔNG có đường nào chạm tới trong chế độ Tháng, và cũng không có gì gợi ý
   * rằng chúng ở đâu. Điều hướng thuộc `rental-calendar.tsx` (nó sở hữu URL),
   * nên component này chỉ báo ra ngày được chạm.
   */
  readonly onShowDay: (date: Date) => void;
}

const WEEKDAY_HEADER = ["Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7", "CN"];

/**
 * Cùng lý lẽ `WEEKDAY_FMT`/`DATE_FMT` ở `calendar-timeline.tsx`: định dạng
 * NGÀY theo giờ shop bằng `Intl` với `timeZone` tường minh, không suy tay từ
 * các field UTC của instant (nửa đêm giờ VN lệch UTC 7 tiếng, đọc nhầm ngày).
 */
const DAY_FMT = new Intl.DateTimeFormat("vi-VN", { timeZone: SHOP_TIMEZONE, day: "numeric" });
const DAY_MONTH_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "numeric",
  month: "short",
});

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
 * chiều ngang (điện thoại ~51px/ô, đo ở 390px); hơn 3 dòng ở độ rộng đó thì tên
 * xe bị truncate tới mức vô nghĩa, lúc ấy "+k nữa" là thông tin hữu ích hơn một
 * dòng chip thứ tư không đọc nổi.
 *
 * Con số này KHÔNG giảm khi chip cao lên 24px (xem `CHIP` bên dưới): giảm nó đi
 * một dòng là đẩy thêm một đơn nữa ra khỏi tầm chạm trực tiếp, mà chi phí giữ
 * nguyên chỉ là ô cao thêm ~8px. Ô lịch tháng cao lên là chấp nhận được — lưới
 * vốn đã cuộn.
 */
const MAX_CHIPS = 3;

/**
 * Chip đơn thuê trong ô ngày. `min-h-6` = 24px là **ngưỡng WCAG 2.2 SC 2.5.8
 * (Target Size Minimum, mức AA)**, không phải một con số thẩm mỹ.
 *
 * Bản trước không khai chiều cao gì cả, nên chip cao đúng bằng line box của
 * `text-xs`: **đo được 52 × 16 px, xếp cách nhau 2px** (`gap-0.5`). Vừa dưới
 * ngưỡng 24px, vừa không lọt ngoại lệ giãn cách (vòng tròn 24px quanh mỗi chip
 * chồng lên chip kế bên) — trượt ở cả hai đường. Mà đây là đường DUY NHẤT mở
 * được sheet chi tiết từ lịch tháng.
 *
 * Vì sao 24px chứ không phải 44px như `ui/button.tsx` và `AppNav` tự đặt: 44px
 * × 3 chip đẩy ô ngày lên ~168px, tức một lưới 6 tuần cao hơn 1000px và mất hẳn
 * cái làm nên giá trị của chế độ Tháng — nhìn một phát thấy cả tháng. Chế độ
 * Tháng là mặt phẳng để QUÉT; mặt phẳng để LÀM là Timeline, và ở đó thanh đơn
 * mang đủ 44px. Hai chế độ, hai vai trò, đúng ngưỡng cho từng vai.
 */
const CHIP =
  "flex min-h-6 w-full items-center gap-0.5 truncate rounded-card px-1 text-left text-xs";

export function CalendarMonth({
  vehicles,
  rentals,
  gridWindow,
  onSelect,
  onShowDay,
}: CalendarMonthProps) {
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
            const isToday =
              now.getTime() >= col.date.getTime() && now.getTime() < cellEnd.getTime();

            // Tái dùng `placeBar` với cửa sổ MỘT NGÀY để hỏi "đơn này có chạm ô
            // này không" — cùng ngữ nghĩa `[from, to)` đã kiểm ở Task 1, thay vì
            // viết một điều kiện overlap thứ năm (CLAUDE.md: bốn chỗ đã phải tự
            // đồng ý với nhau bằng test, không có gì ép máy).
            //
            // Chỉ lấy CÓ/KHÔNG, không giữ `BarPlacement`: `startCol` và `span`
            // của nó là toạ độ lưới ngang của chế độ Timeline, ở đây ô ngày đã
            // là toạ độ rồi. Chevron thì hỏi `gridEdgeClip` với cửa sổ CẢ LƯỚI,
            // không phải cờ cắt của cửa sổ một-ngày này.
            const chips: CalendarRental[] = rentals
              .filter((rental) => placeBar(rental, { from: col.date, to: cellEnd }) !== null)
              .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

            const shown = chips.slice(0, MAX_CHIPS);
            const hiddenCount = chips.length - shown.length;

            return (
              <div
                key={col.date.toISOString()}
                className={`min-h-24 border-r border-b border-border p-1 last:border-r-0 ${col.isWeekend ? "bg-canvas" : "bg-surface"}`}
              >
                {/* `min-w-6` + `px-1` chứ KHÔNG `w-6` cố định: `dayLabel` trả
                    "1 thg 9" ở ngày mùng 1 (có chủ ý, xem trên), và chuỗi đó
                    không lọt vừa ô 24px — nó tràn ra ngoài vòng tròn, nơi
                    `text-accent-ink` là chữ TRẮNG trên nền ô trắng, nên ở ngày
                    hôm nay con số biến mất hẳn và badge chỉ còn chữ "thg".
                    Badge phải co giãn theo nhãn, không bắt nhãn vừa badge. */}
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs whitespace-nowrap ${
                    isToday ? "bg-accent font-semibold text-accent-ink" : "text-muted"
                  }`}
                >
                  {dayLabel(col.date)}
                </span>

                {/* `gap-1` (4px), không `gap-0.5`: hai vùng chạm 24px cách nhau
                    2px là mời chạm nhầm sang đơn bên cạnh — trên điện thoại,
                    một tay, trong gara. */}
                <div className="mt-1 flex flex-col gap-1">
                  {shown.map((rental) => {
                    const vehicle = vehicleById.get(rental.vehicleId);
                    const edge = gridEdgeClip(rental, gridWindow, globalIndex, cols.length);
                    const label = vehicle
                      ? `${vehicle.make} ${vehicle.model}`
                      : (rental.customerName ?? "—");
                    return (
                      <button
                        key={rental.id}
                        type="button"
                        onClick={() => onSelect(rental)}
                        title={`${vehicle ? `${vehicle.make} ${vehicle.model}` : "?"} · ${rental.customerName ?? "—"} · ${STATUS_LABEL[rental.status]}`}
                        aria-label={`${label} · ${rental.customerName ?? "Khách chưa rõ"} · ${STATUS_LABEL[rental.status]} — xem chi tiết`}
                        className={`${CHIP} ${rentalChipClass(rental, now)}`}
                      >
                        {/* `size="sm"` (12px) cho cả ba icon: chúng nằm trong
                            một chip `text-xs`, cỡ mặc định 20px sẽ nuốt mất nhãn
                            đứng cạnh. Cỡ đi qua PROP — `className="size-3"` hỏng
                            im lặng, xem `ui/icon.tsx`.

                            `‹`/`›` đọc `gridEdgeClip` chứ KHÔNG đọc `placement`:
                            `placement` cắt theo Ô NGÀY, mà chip lặp ở mỗi ô đơn
                            phủ, nên cờ đó bật ở mọi ô giữa và mũi tên chỉ nói
                            lại thứ ô bên cạnh đã cho thấy. Lý lẽ ở
                            `calendar-layout.ts`. Chúng đứng sát hai mép chip vì
                            mũi tên chỉ ra ngoài LƯỚI. */}
                        {edge.start && <Icon name="chevron-left" size="sm" />}
                        {/* Chữ trên chip này là TÊN XE, nên trạng thái ở đây
                            cũng đi bằng màu và CHỈ màu — lý lẽ đầy đủ ở
                            `calendar-timeline.tsx`, chỗ gọi `statusIconOf` kia.
                            Chế độ Tháng còn ngặt hơn: trên 390px chip rộng
                            41,8px, nhãn xe vốn đã chỉ còn một ký tự, nên hình là
                            thứ DUY NHẤT còn đọc được ở bề rộng đó.

                            `now` dùng chung với `rentalChipClass` ngay trên:
                            hình và màu của MỘT chip phải suy từ cùng một thời
                            điểm. */}
                        <Icon name={statusIconOf(rental, now)} size="sm" />
                        <span className="min-w-0 truncate">{label}</span>
                        {edge.end && <Icon name="chevron-right" size="sm" />}
                      </button>
                    );
                  })}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onShowDay(col.date)}
                      aria-label={`Còn ${String(hiddenCount)} đơn nữa ngày ${DAY_MONTH_FMT.format(col.date)} — xem trên Timeline`}
                      className={`${CHIP} text-muted underline underline-offset-2`}
                    >
                      +{String(hiddenCount)} nữa
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
