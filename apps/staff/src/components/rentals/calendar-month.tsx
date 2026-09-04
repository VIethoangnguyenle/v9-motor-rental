import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import { dayColumns, type GridWindow } from "../../lib/calendar-layout";
import type { CalendarRental, FleetVehicle } from "../../lib/rentals";
import { dayRole } from "../../lib/rental-day";
import { Icon } from "../ui/icon";

/**
 * Ô ngày kiểu Google Calendar. Tuần bắt đầu THỨ HAI (quy ước VN, và khớp
 * `date_trunc('week')` mà `apps/api` đã dùng — xem plan Task 5).
 *
 * ## Ô ngày vẽ SỰ KIỆN, không vẽ trạng thái lặp lại
 *
 * Bản trước vẽ một chip cho MỌI đơn phủ ngày đó, nên một đơn sáu ngày sinh ra
 * sáu chip ở sáu ô liền nhau. Đo ở 390px với sáu xe cùng bận: **22/35 ô có
 * chip, năm chỗ "+k nữa", chip rộng 42px** — tức nhãn xe còn đúng một chữ cái
 * (`K…`, `D…`, `H…`), và cả tuần là cùng sáu đơn vẽ lại bảy lần. Lưới cao hơn
 * màn hình mà không trả lời được ngày nào bận hơn ngày nào.
 *
 * Một đơn sáu ngày cần người đúng HAI lần: lúc giao và lúc nhận lại. Ô ngày vì
 * vậy đếm hai việc đó (`dayRole` ở `lib/rental-day.ts`, dùng chung với bảng một
 * ngày), còn những ngày ở giữa — xe đã ra khỏi shop, không ai phải làm gì — đi
 * vào THANH ĐỘ BẬN chứ không thành chip.
 *
 * ✅ Có cho thấy mức trống: `vehicles` là toàn đội xe, nên "N/M xe đang thuê"
 * tính được và tính ĐÚNG. Bản trước của chú thích này khẳng định ngược lại
 * ("không có dữ liệu xe trống nào truyền vào component này") — sai kể từ khi
 * `vehicles` được thêm vào props để tra tên xe.
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
  /**
   * Chạm vào một ô ngày — mở đúng ngày đó (bảng một ngày ở màn hẹp, Timeline ở
   * màn rộng). Điều hướng thuộc `rental-calendar.tsx` (nó sở hữu URL), nên
   * component này chỉ báo ra ngày được chạm.
   *
   * ⚠️ CẢ Ô là một `<button>`, và trong nó KHÔNG có nút nào nữa. Bản trước cho
   * mỗi chip đơn một `<button>` riêng ở 24px — vừa là vùng chạm dưới ngưỡng 44px
   * mà chính app này tự đặt, vừa buộc "+k nữa" thành một nút thứ tư chen vào
   * cùng một ô 51px. Ở tầm THÁNG thì thứ người ta chọn là một NGÀY; chọn đúng
   * một đơn là việc của màn ngày, nơi mỗi đơn có trọn 44px.
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
 * Chiều cao ô ngày. Thấp hơn hẳn bản trước (`min-h-24` = 96px, đo thật ra 117px
 * khi đầy chip): ô giờ chứa nhiều nhất ba dòng ngắn — số ngày, hai dòng đếm
 * việc, một thanh độ bận — thay vì ba chip 24px cộng "+k nữa".
 *
 * Đổi lại, cả tháng vào vừa một màn hình nhiều hơn, mà đó chính là thứ chế độ
 * Tháng tồn tại để làm: một mặt phẳng để QUÉT.
 */
const CELL = "min-h-20";

export function CalendarMonth({ vehicles, rentals, gridWindow, onShowDay }: CalendarMonthProps) {
  const now = new Date();
  const cols = dayColumns(gridWindow);

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

            /*
             * Phân loại vai của từng đơn trong ĐÚNG ngày này bằng `dayRole`
             * (`lib/rental-day.ts`) — cùng hàm mà bảng một ngày dùng, nên hai
             * màn lịch không thể lệch nhau về "hôm nay đơn này là việc gì".
             *
             * Bản trước hỏi `placeBar` với cửa sổ một ngày, tức chỉ hỏi CÓ CHẠM
             * hay không — nên mọi ngày ở giữa một đơn dài đều thành một chip.
             */
            const roles = rentals.map((rental) => dayRole(rental, col.date, cellEnd));
            const handovers = roles.filter((r) => r === "start" || r === "start-end").length;
            const returns = roles.filter((r) => r === "end" || r === "start-end").length;
            // Xe nằm ngoài đường trong ngày này, ở bất kỳ vai nào khác `none`.
            const busy = roles.filter((r) => r !== "none").length;

            return (
              <button
                key={col.date.toISOString()}
                type="button"
                onClick={() => onShowDay(col.date)}
                aria-label={`${DAY_MONTH_FMT.format(col.date)} — ${
                  busy === 0
                    ? "không có xe nào đang thuê"
                    : `${String(busy)} trên ${String(vehicles.length)} xe đang thuê` +
                      (handovers > 0 ? `, ${String(handovers)} lượt giao` : "") +
                      (returns > 0 ? `, ${String(returns)} lượt nhận lại` : "")
                }. Xem ngày này`}
                // ⚠️ `items-stretch` TƯỜNG MINH, không dựa vào mặc định của flex.
                //
                // `<button>` mang `display: flex` nhận `align-items: center` từ UA
                // stylesheet của Chromium, KHÔNG phải `stretch` như một `<div>`.
                // Hệ quả đo được: thanh độ bận bên dưới dùng `flex-1` trong một
                // hàng có bề rộng 0, nên nó render ra `0x4px` — biến mất hoàn
                // toàn trong khi `aria-label` vẫn đọc đúng "5 trên 6 xe đang
                // thuê". Một khiếm khuyết chỉ thấy được bằng mắt hoặc bằng
                // `getBoundingClientRect`, không thấy bằng test hay bằng đọc code.
                className={`${CELL} flex flex-col items-stretch gap-1 border-r border-b border-border p-1 text-left transition-colors duration-(--duration-instant) ease-standard last:border-r-0 active:bg-canvas ${
                  col.isWeekend ? "bg-canvas" : "bg-surface"
                }`}
              >
                {/* `min-w-6` + `px-1` chứ KHÔNG `w-6` cố định: `dayLabel` trả
                    "1 thg 9" ở ngày mùng 1 (có chủ ý, xem trên), và chuỗi đó
                    không lọt vừa ô 24px — nó tràn ra ngoài vòng tròn, nơi
                    `text-accent-ink` là chữ TRẮNG trên nền ô trắng, nên ở ngày
                    hôm nay con số biến mất hẳn và badge chỉ còn chữ "thg". */}
                <span
                  className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center self-start rounded-full px-1 text-xs whitespace-nowrap ${
                    isToday ? "bg-accent font-semibold text-accent-ink" : "text-muted"
                  }`}
                >
                  {dayLabel(col.date)}
                </span>

                {/*
                  Hai dòng đếm việc. Chỉ hiện khi khác 0 — một ô ngày rỗng phải
                  ĐỌC RA LÀ RỖNG, không phải "0 giao · 0 nhận".

                  Chữ "giao"/"nhận" ẩn dưới `md`: ở 390px ô rộng 51px, chỉ đủ cho
                  hình và con số. Hình mang nghĩa ở mọi bề rộng (`nav-handover` =
                  xe rời shop, `check` = đã về), nên đây là bớt CHỮ chứ không bớt
                  thông tin — cùng lý lẽ `RANGE_DATE_SHORT_FMT` của toolbar.
                */}
                {handovers > 0 && (
                  <span className="flex items-center gap-1 text-xs whitespace-nowrap text-status-ongoing">
                    <Icon name="nav-handover" size="sm" />
                    <span className="tabular-nums">{handovers}</span>
                    <span className="hidden md:inline">giao</span>
                  </span>
                )}
                {returns > 0 && (
                  <span className="flex items-center gap-1 text-xs whitespace-nowrap text-ink-soft">
                    <Icon name="check" size="sm" />
                    <span className="tabular-nums">{returns}</span>
                    <span className="hidden md:inline">nhận</span>
                  </span>
                )}

                {/*
                  Thanh độ bận — thứ thay cho những chip "đang thuê" lặp lại.
                  Ngày ở giữa một đơn dài không có việc gì để làm, nhưng nó VẪN
                  là thông tin: bao nhiêu xe đang nằm ngoài đường, tức còn mấy
                  chiếc để nhận khách mới.

                  Thanh TỈ LỆ chứ không phải N ô nhỏ: đội xe hôm nay có 6 chiếc
                  và một ngày nào đó có 30 — sáu ô nhỏ đọc được, ba mươi thì
                  không. Con số "N/M" hiện kèm từ `md` trở lên, còn ở màn hẹp
                  `aria-label` của cả ô đã đọc đủ.

                  `mt-auto`: dính đáy ô, nên ở cả tuần nó nằm trên một đường
                  thẳng và quét mắt theo hàng ngang là so được ngày nào bận hơn.
                */}
                {busy > 0 && (
                  <span className="mt-auto flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="h-1 min-w-0 flex-1 overflow-hidden rounded-card bg-border"
                    >
                      <span
                        className="block h-full bg-status-ongoing"
                        style={{
                          width: `${String(Math.round((busy / Math.max(vehicles.length, 1)) * 100))}%`,
                        }}
                      />
                    </span>
                    <span className="hidden text-xs tabular-nums text-muted md:inline">
                      {busy}/{vehicles.length}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
