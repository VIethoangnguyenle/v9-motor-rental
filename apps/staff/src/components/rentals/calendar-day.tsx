import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import { dayRole } from "../../lib/rental-day";
import type { CalendarRental, FleetVehicle } from "../../lib/rentals";
import { STATUS_LABEL, lastMomentOf, rentalChipClass, statusIconOf } from "../../lib/rental-status";
import { Icon } from "../ui/icon";

const TIME_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
});

interface CalendarDayProps {
  readonly vehicles: readonly FleetVehicle[];
  /** Đơn giao với đúng ngày đang xem — `rentalsQuery` đã lọc theo cửa sổ một ngày. */
  readonly rentals: readonly CalendarRental[];
  /** 00:00 giờ shop của ngày đang xem. */
  readonly dayStart: Date;
  /** 00:00 giờ shop của ngày kế — biên MỞ, cùng hợp đồng `GridWindow`. */
  readonly dayEnd: Date;
  /** Chiều vừa lật — nội dung mới trượt VÀO từ phía nó tới. */
  readonly dir: "next" | "prev";
  readonly onSelect: (rental: CalendarRental) => void;
}

/**
 * Việc xảy ra với MỘT chiếc xe trong ĐÚNG ngày đang xem.
 *
 * Ba câu khác nhau, và phân biệt được chúng là toàn bộ giá trị của màn này:
 * hôm nay xe đi khỏi shop, hôm nay xe về, hay hôm nay xe đang ở ngoài đường cả
 * ngày. Một dòng "đang thuê" chung cho cả ba không nói được nhân viên phải làm
 * gì lúc mấy giờ.
 *
 * Phân loại vai đi qua `dayRole` (`lib/rental-day.ts`), dùng chung với lịch
 * tháng — hai màn lịch phải đồng ý về "hôm nay đơn này là việc gì", và bẫy biên
 * MỞ của `endsAt` chỉ được đóng ở MỘT chỗ. Hàm này chỉ dịch vai đó thành câu
 * chữ của riêng màn ngày (có giờ, và rẽ theo `status`).
 */
function dutyOn(
  rental: CalendarRental,
  dayStart: Date,
  dayEnd: Date,
): { readonly verb: string; readonly at: Date | null } {
  const role = dayRole(
    { startsAt: new Date(rental.startsAt), endsAt: new Date(rental.endsAt) },
    dayStart,
    dayEnd,
  );
  const startsAt = new Date(rental.startsAt);
  const lastMoment = lastMomentOf(new Date(rental.endsAt));

  // Đã trả rồi thì mọi câu đều ở QUÁ KHỨ. Không có nhánh này, một đơn
  // `COMPLETED` kết thúc sáng nay hiện thành "Nhận lại 09:00" — đọc ra là một
  // việc còn phải làm, trong khi nó đã xong.
  if (rental.status === "COMPLETED") {
    return role === "end" || role === "start-end"
      ? { verb: "Đã nhận lại", at: lastMoment }
      : { verb: "Đã xong", at: null };
  }

  if (role === "start-end") return { verb: "Giao rồi nhận lại", at: startsAt };
  if (role === "start") return { verb: "Giao", at: startsAt };
  if (role === "end") return { verb: "Nhận lại", at: lastMoment };

  /*
   * `span` — đơn phủ trọn ngày này: không có mốc nào rơi vào hôm nay, nên câu
   * phải nói TÌNH TRẠNG chứ không nói việc.
   *
   * ⚠️ Và nó phải rẽ theo `status`. Bản đầu trả "Đang ngoài đường cả ngày" cho
   * mọi đơn, nên một đơn `BOOKED` — xe còn nằm trong shop, chưa ai bàn giao —
   * hiện chip "Đã đặt" ngay cạnh dòng chữ nói xe đang chạy ngoài đường. Hai kênh
   * trên cùng một thẻ nói ngược nhau. Đo được bằng ảnh chụp 390px, không phải suy.
   */
  return rental.status === "ONGOING"
    ? { verb: "Đang ngoài đường cả ngày", at: null }
    : { verb: "Đã giữ chỗ cả ngày", at: null };
}

/** Đơn còn kéo dài sang ngày sau — mốc cuối rơi ngoài cửa sổ một ngày đang xem. */
function endsAfter(rental: CalendarRental, dayEnd: Date): boolean {
  return lastMomentOf(new Date(rental.endsAt)) >= dayEnd;
}

/**
 * Hình dạng MÀN HẸP của lịch, thay `CalendarTimeline`.
 *
 * Vì sao không giữ lưới: lưới timeline cần 974px để vẽ đủ 7 ngày × 6 xe, mà màn
 * 390px chỉ hiện được 356px — đo bằng `calendar-geometry.mjs`. Nghĩa là trên
 * điện thoại người dùng thấy cột tên xe và khoảng hai cột ngày, rồi phải cuộn
 * NGANG để đọc phần còn lại. Đợt 2026-09-03 đã làm việc cuộn đó nhìn thấy được
 * (`ScrollHint`) — nhưng nhìn thấy một thao tác dở không biến nó thành tốt, và
 * cuộn ngang trong lưới bằng một tay giữa gara thì vẫn là cuộn ngang.
 *
 * Đổi CÂU HỎI thay vì nén lưới: lưới trả lời "cả kỳ trông thế nào", còn nhân
 * viên cầm điện thoại hỏi "hôm nay xe nào đi, xe nào về". Màn này trả lời đúng
 * câu thứ hai, cuộn DỌC, và không mất gì — câu thứ nhất vẫn còn nguyên ở chế độ
 * Tháng và ở màn rộng.
 *
 * Xe CÓ VIỆC lên trên, xe trống xuống dưới. Thứ tự đội xe là thứ tự tuỳ tiện
 * (theo hãng/tên) chứ không mang thông tin nào cho câu hỏi của hôm nay; xếp
 * theo mốc giờ thì đọc từ trên xuống là đọc đúng trình tự trong ngày.
 */
export function CalendarDay({
  vehicles,
  rentals,
  dayStart,
  dayEnd,
  dir,
  onSelect,
}: CalendarDayProps) {
  // `now` đọc MỘT lần rồi truyền tham số xuống `rentalChipClass`/`statusIconOf`
  // — cùng khuôn `CalendarTimeline`: màu và hình của một đơn phải suy từ cùng
  // một thời điểm, nếu không thanh đỏ có thể mang hình xanh.
  const now = new Date();

  const byVehicle = new Map<string, CalendarRental[]>();
  for (const r of rentals) {
    const list = byVehicle.get(r.vehicleId);
    if (list) list.push(r);
    else byVehicle.set(r.vehicleId, [r]);
  }

  const busy = vehicles
    .flatMap((vehicle) => {
      const mine = byVehicle.get(vehicle.id) ?? [];
      return mine.map((rental) => ({
        vehicle,
        rental,
        duty: dutyOn(rental, dayStart, dayEnd),
      }));
    })
    // Đơn không có mốc trong ngày (xe nằm ngoài đường cả ngày) xuống cuối nhóm
    // bận: nó không đòi ai làm gì lúc mấy giờ.
    .sort((a, b) => (a.duty.at?.getTime() ?? Infinity) - (b.duty.at?.getTime() ?? Infinity));

  const busyIds = new Set(busy.map((b) => b.vehicle.id));
  const free = vehicles.filter((v) => !busyIds.has(v.id));

  return (
    <div className={`flex flex-col gap-3 ${dir === "next" ? "day-enter-next" : "day-enter-prev"}`}>
      {busy.length === 0 && (
        // Nói ra ĐIỀU KIỆN, không nói "chưa có dữ liệu": cả đội xe nằm nhà là
        // một sự thật về ngày hôm đó, không phải một màn hình chưa tải xong.
        <p className="m-0 max-w-prose rounded-card border border-border bg-surface-sunken card-pad text-sm text-ink">
          Không có xe nào đi hoặc về trong ngày này.
        </p>
      )}

      {busy.length > 0 && (
        <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
          {busy.map(({ vehicle, rental, duty }) => (
            <li key={rental.id}>
              <button
                type="button"
                onClick={() => onSelect(rental)}
                className="flex w-full min-h-11 flex-col items-start gap-1 rounded-card border border-border bg-surface card-pad text-left transition-colors duration-150 active:bg-canvas"
              >
                <span className="flex w-full flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">
                    {vehicle.make} {vehicle.model}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-card px-2 py-0.5 text-xs font-semibold ${rentalChipClass(rental, now)}`}
                  >
                    <Icon name={statusIconOf(rental, now)} size="sm" />
                    {STATUS_LABEL[rental.status]}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-ink-soft">
                  {duty.verb}
                  {duty.at === null ? "" : ` ${TIME_FMT.format(duty.at)}`}
                  {/* "đến dd-MM" chỉ có nghĩa khi đơn còn kéo dài QUA hôm nay.
                      Với đơn kết thúc đúng hôm nay nó lặp lại chính mốc vừa nêu
                      ở dòng trên — "Nhận lại 01:59 · đến 04-09" nói một điều hai
                      lần bằng hai đơn vị khác nhau. */}
                  {endsAfter(rental, dayEnd) &&
                    ` · đến ${DATE_FMT.format(lastMomentOf(new Date(rental.endsAt)))}`}
                </span>
                <span className="text-sm text-muted">{rental.customerName ?? "Khách chưa rõ"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {free.length > 0 && (
        <section className="flex flex-col gap-2">
          {/* Xe trống là THÔNG TIN, không phải phần dư — đó là câu trả lời cho
              "còn con nào cho khách đang đứng đây không". Nhưng nó không gấp,
              nên nó gom thành một khối gọn phía dưới thay vì mỗi xe một thẻ. */}
          <h3 className="m-0 text-xs font-semibold tracking-wide text-muted uppercase">
            Trống cả ngày ({free.length})
          </h3>
          <ul role="list" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {free.map((vehicle) => (
              <li
                key={vehicle.id}
                className="rounded-card border border-border bg-surface-sunken px-2 py-1 text-sm text-ink-soft"
              >
                {vehicle.make} {vehicle.model}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
