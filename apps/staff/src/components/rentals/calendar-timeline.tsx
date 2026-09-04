import { Fragment, useRef, useSyncExternalStore } from "react";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import {
  dayColumns,
  placeBar,
  type BarPlacement,
  type GridWindow,
} from "../../lib/calendar-layout";
import type { CalendarRental, FleetVehicle } from "../../lib/rentals";
import { STATUS_LABEL, rentalChipClass, statusIconOf } from "../../lib/rental-status";
import { Icon } from "../ui/icon";

/**
 * Hàng là xe, cột là ngày, mỗi thanh là một đơn. Đây là màn hình trả lời cùng
 * lúc hai câu chủ shop hỏi nhiều nhất — "xe nào đang bận tới ngày nào" và
 * "khách muốn thuê 24–27 thì còn xe nào" — vì KHOẢNG TRẮNG trong lưới CHÍNH LÀ
 * xe còn trống: không cần đọc gì, chỉ cần nhìn.
 *
 * ## Trách nhiệm responsive: PARENT đo VÙNG LƯỚI, component chỉ vẽ đúng khung nhận được
 *
 * Số ngày hiển thị (7/10/14, xem bảng breakpoint ở plan) đổi theo bề rộng
 * lưới, nhưng đây KHÔNG chỉ là chuyện trình bày: nó quyết định luôn khoảng cần
 * gọi `GET /rentals` (nhiều ngày hơn = phải fetch nhiều hơn). Vì fetch/range
 * selection thuộc `rental-calendar.tsx` (Task 6), quyết định "mấy ngày" phải
 * đứng CÙNG PHÍA với fetch — tức là ở component đó, không phải ở đây.
 *
 * Đã chọn: **`rental-calendar.tsx` đo bề rộng THẬT của vùng lưới bằng
 * `ResizeObserver` (Task 10 — không phải `matchMedia` trên cửa sổ nữa) rồi
 * truyền `gridWindow` đã đúng số ngày cho bề rộng hiện có.** Component này
 * KHÔNG tự đoán lại số ngày — nó vẽ đúng `dayColumns(gridWindow).length` cột,
 * không hơn không kém, bất kể con số đó là bao nhiêu.
 *
 * Không chọn phương án "component tự báo số ngày ưa thích lên cho parent" vì
 * nó tạo một round-trip: mount lần đầu sai số ngày → báo lên → parent fetch
 * lại đúng khoảng → mount lại — tức lưới TRỐNG-RỒI-ĐẦY một nhịp mỗi lần đổi
 * kích thước. Cách đã chọn thì `gridWindow` nhận được luôn đã đúng số ngày
 * cho bề rộng lưới TẠI THỜI ĐIỂM component này render — parent tự chịu phần
 * "đo trước lần vẽ đầu của chính nó ra sao" (xem đánh đổi ghi ở
 * `useCalendarDayCount`), component ở đây không phải đoán rồi tự sửa.
 *
 * Cột xe (120/120/130px — base/md/xl, xem `--veh-col` bên dưới) là quyết định
 * THUẦN TRÌNH BÀY — không ảnh hưởng gì tới việc fetch — nên nó là ngoại lệ hợp
 * lý: class Tailwind `xl:` bên dưới tự đổi độ rộng cột theo breakpoint CSS của
 * CỬA SỔ, ĐỘC LẬP với việc parent đổi `gridWindow`.
 *
 * Dãy này ĐƠN ĐIỆU không giảm, và trước đợt 2026-09-04 thì KHÔNG: bản cũ có
 * `md:[--veh-col:7rem]` nên dãy là 120 > 112 < 130 — cột xe ở tablet hẹp hơn cả
 * điện thoại rồi mới rộng lại ở desktop. Đã bỏ override ở `md` thay vì nới nó
 * lên: tên xe rộng nhất đo được cần 119px (`vehicle-column.mjs`), tức 112px ở
 * `md` là giá trị DUY NHẤT trong dãy không đủ chỗ, còn 120px của base thì đủ.
 * Bỏ đi vừa làm dãy đơn điệu vừa xoá chỗ hẹp nhất, và bớt một class phải giữ
 * đúng.
 *
 * ⚠️ Từ Task 10, đây là HAI GỐC QUY CHIẾU KHÁC NHAU dùng chung ba con số
 * 768/1280: `rental-calendar.tsx` đo bề rộng VÙNG LƯỚI (đóng #5 — sidebar ăn
 * mất phần cửa sổ), còn `md:`/`xl:` dưới đây vẫn đo bề rộng CỬA SỔ. Hai bên
 * khớp nhau khi lưới chiếm gần hết cửa sổ (mobile, hoặc desktop không sidebar
 * cạnh tranh), nhưng có thể LỆCH khi vùng lưới hẹp hơn cửa sổ đáng kể (đúng
 * kịch bản #5): số cột đã đúng theo Task 10, nhưng cột có thể vẽ theo bề rộng
 * `xl:` (rộng hơn) dù lưới không thật sự rộng bằng cửa sổ. Chấp nhận được vì
 * độ rộng cột chỉ ảnh hưởng trình bày, không ảnh hưởng số cột/khoảng fetch —
 * nhưng đừng đọc nhầm ba con số này là "cùng đo một thứ" như trước Task 10.
 */
export interface CalendarTimelineProps {
  readonly vehicles: readonly FleetVehicle[];
  readonly rentals: readonly CalendarRental[];
  readonly gridWindow: GridWindow;
  /** Chạm vào một thanh đơn — mở sheet chi tiết. `title` không bao giờ hiện
   *  trên điện thoại, nên trạng thái phải đọc được NGAY TRÊN thanh (icon của
   *  `statusIconOf`); sheet là chỗ đọc phần còn lại của đơn, không phải chỗ duy
   *  nhất đọc trạng thái. */
  readonly onSelect: (rental: CalendarRental) => void;
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

/**
 * Vệt mờ ở mép phải, chỉ hiện khi còn phần chưa xem.
 *
 * Tách thành component export được vì nó là thứ DUY NHẤT của file này test được
 * mà không cần layout thật: happy-dom không tính layout, nên `scrollWidth` phải
 * đặt tay — dễ làm với một ref giả, không làm được với cả `CalendarTimeline`.
 *
 * `aria-hidden`: tín hiệu thị giác thuần. Người dùng trình đọc màn hình đã có
 * vùng `overflow` gốc để điều hướng, thêm một node nữa chỉ là nhiễu.
 */
export function ScrollHint({
  scrollerRef,
}: {
  readonly scrollerRef: React.RefObject<HTMLElement | null>;
}) {
  const hasMore = useSyncExternalStore(
    (onChange) => {
      const el = scrollerRef.current;
      if (!el) return () => {};
      el.addEventListener("scroll", onChange, { passive: true });
      const ro = new ResizeObserver(onChange);
      ro.observe(el);
      return () => {
        el.removeEventListener("scroll", onChange);
        ro.disconnect();
      };
    },
    () => {
      const el = scrollerRef.current;
      if (!el) return false;
      // `- 1`: bề rộng sau layout là số thực, `scrollLeft` làm tròn khác nhau
      // giữa các trình duyệt. Không có biên này thì cuộn hết vẫn còn thừa 0,5px
      // và vệt mờ kẹt ở trạng thái bật — đúng lỗi mà ca test thứ hai canh.
      return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    },
    () => false,
  );

  return (
    <span
      aria-hidden="true"
      data-scroll-hint=""
      data-more={hasMore ? "true" : "false"}
      className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas to-transparent opacity-0 transition-opacity data-[more=true]:opacity-100"
    />
  );
}

export function CalendarTimeline({
  vehicles,
  rentals,
  gridWindow,
  onSelect,
}: CalendarTimelineProps) {
  // `now` đọc một lần mỗi lần render, truyền THAM SỐ vào `isOverdue` (qua
  // `rentalChipClass`) — không gọi `Date.now()` rải rác trong JSX. Sai lệch vài
  // giây/phút do không nhớ lại giữa các lần render là chấp nhận được cho một
  // màu trạng thái, không phải một phép tính tiền.
  const now = new Date();
  const cols = dayColumns(gridWindow);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const rentalsByVehicle = new Map<string, CalendarRental[]>();
  for (const r of rentals) {
    const list = rentalsByVehicle.get(r.vehicleId);
    if (list) list.push(r);
    else rentalsByVehicle.set(r.vehicleId, [r]);
  }

  return (
    // Chỉ khối này cuộn ngang — KHÔNG phải trang. Khi lưới rộng hơn khối này
    // (dữ liệu dày, hoặc khung quá hẹp), cuộn diễn ra ở ĐÂY, không đẩy `<body>`
    // cuộn ngang.
    <div className="relative">
      <div ref={scrollerRef} className="w-full overflow-x-auto rounded-card border border-border">
        <div
          // Ba biến CSS tĩnh (không nội suy runtime) cho độ rộng cột xe theo
          // breakpoint — Tailwind quét CLASS NAME lúc build, chuỗi nội suy động
          // (`w-[${n}px]`) sẽ KHÔNG được tìm thấy và sinh ra một class rỗng,
          // hỏng im lặng. Giá trị 7/10/14 ngày (động, phụ thuộc `gridWindow`) vì
          // vậy phải đi qua `style` (raw CSS, không qua Tailwind) — xem bên dưới.
          /*
           * KHÔNG còn `min-w-max`. Nó ép lưới giữ bề rộng MAX-CONTENT, tức mỗi
           * cột ngày nở ra theo tên khách dài nhất nằm trong nó — nên lưới luôn
           * rộng hơn khung và luôn phải cuộn ngang, càng nhiều ngày càng tệ. Đo
           * ở 1920px: khung 1392px, lưới cần 1841px, tức **cuộn 449px** và bốn
           * ngày cuối của kỳ 14 ngày không bao giờ nhìn thấy nếu không kéo.
           *
           * Nó từng đúng: nó bảo vệ ca màn HẸP, nơi cột ngày sẽ bị bóp dưới
           * ngưỡng đọc được. Nhưng từ khi màn hẹp chuyển sang bảng một ngày
           * (`calendar-day.tsx`), component này chỉ còn chạy ở ≥768px — và ở đó
           * `minmax(2.75rem, 1fr)` một mình đã giữ sàn 44px: 14 ngày trong
           * 1392px cho ra ~99px/cột, 10 ngày trong 768px cho ra ~77px/cột. Sàn
           * không bao giờ chạm tới, nên thứ `min-w-max` bảo vệ đã không còn.
           *
           * Bỏ nó thì cột co về `1fr`, tên khách trong thanh `truncate` (đã có
           * sẵn `min-w-0 truncate`), và CẢ KỲ nhìn thấy được cùng lúc — đúng thứ
           * chế độ Timeline tồn tại để làm.
           */
          className="grid [--veh-col:7.5rem] xl:[--veh-col:8.125rem]"
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
                  className="sticky left-0 z-10 min-h-12 border-r border-b border-border bg-surface card-pad text-sm leading-tight text-ink"
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
                  className="relative min-h-12 border-b border-border"
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
                  <button
                    key={rental.id}
                    type="button"
                    onClick={() => onSelect(rental)}
                    style={{
                      gridColumn: `${String(placement.startCol + 1)} / span ${String(placement.span)}`,
                      gridRow,
                    }}
                    // `min-h-11` = 44px, ngưỡng vùng chạm app tự đặt (`ui/button.tsx`).
                    // Hàng phải là `min-h-12` (48px) để chứa nó: `m-0.5` ăn 2px mỗi
                    // đầu, nên trong một hàng 44px thanh chỉ cao được 40px — đúng
                    // con số đo được ở bản trước, dưới chuẩn của chính app này.
                    //
                    // `relative` KHÔNG phải trang trí: nền hàng ngay trên là
                    // `position: relative` (nó neo nhãn "trống cả kỳ" tuyệt đối),
                    // và một phần tử ĐƯỢC ĐỊNH VỊ luôn vẽ đè lên anh em KHÔNG được
                    // định vị bất kể thứ tự DOM. Thanh đơn từng là `<div>` trơ nên
                    // không ai thấy; thành `<button>` thì nền hàng nuốt hết cú
                    // chạm và sheet không bao giờ mở. Đo bằng `elementFromPoint`
                    // ở giữa thanh: trả về nền hàng, không phải thanh.
                    className={`relative m-0.5 flex min-h-11 items-center gap-1 rounded-card px-2 text-left text-xs ${rentalChipClass(rental, now)}`}
                    title={`${rental.customerName ?? "—"} · ${STATUS_LABEL[rental.status]}`}
                    aria-label={`${rental.customerName ?? "Khách chưa rõ"} · ${STATUS_LABEL[rental.status]} — xem chi tiết`}
                  >
                    {/* `‹`/`›`: đơn kéo dài ra ngoài cửa sổ đang xem — không phải
                      trang trí, mà là dấu hiệu "còn tiếp" để không đọc nhầm là
                      đơn kết thúc/bắt đầu đúng mép lưới. Chúng đứng SÁT hai mép
                      thanh vì mũi tên chỉ ra ngoài lưới; kẹp icon trạng thái vào
                      giữa mép và mũi tên thì mũi tên hoá ra đang chỉ vào nó. */}
                    {/* `size="sm"` (12px) cho cả ba icon trong thanh: chúng nằm
                      trong một chip `text-xs`, cỡ mặc định 20px sẽ nuốt mất tên
                      khách đứng cạnh. Cỡ đi qua PROP — `className="size-3"` hỏng
                      im lặng, xem `ui/icon.tsx`. */}
                    {placement.clippedStart && <Icon name="chevron-left" size="sm" />}
                    {/* Chữ trên thanh này là TÊN KHÁCH, nên không có icon thì
                      trạng thái đi bằng màu và CHỈ màu: `title=` không bao giờ
                      bắn khi chạm, và app này chạy trên điện thoại trong gara.

                      Màu một mình không đủ, và đó là chuyện đã GHI NHẬN chứ
                      không phải phòng xa: `theme-tokens.test.ts` giữ sẵn ngoại
                      lệ `protanopia|status-overdue|status-completed`. Hai nền
                      đó đều ĐẶC nên cách tô cũng không tách được chúng. Đo trên
                      bản build dưới lọc achromatopsia, lấy pixel nền thanh:
                      `quá hạn` ra xám 106, `đang thuê` 119, `đã trả` 77 — ba
                      thanh đặc nằm trong một dải hẹp.

                      `now` dùng chung với `rentalChipClass` ngay trên, không
                      gọi `new Date()` lần nữa: hình và màu của MỘT thanh phải
                      suy từ cùng một thời điểm. */}
                    <Icon name={statusIconOf(rental, now)} size="sm" />
                    <span className="min-w-0 truncate">{rental.customerName ?? "—"}</span>
                    {placement.clippedEnd && <Icon name="chevron-right" size="sm" />}
                  </button>
                ))}
              </Fragment>
            );
          })}
        </div>
      </div>
      <ScrollHint scrollerRef={scrollerRef} />
    </div>
  );
}
