/**
 * Đặt thanh đơn thuê lên lưới lịch — hàm THUẦN, tách khỏi component có chủ ý,
 * cùng lý lẽ với `guard-decision.ts`: một tập ca bảng thay vì phải dựng cả cây
 * React mới bắt được lỗi thứ tự nhánh hay lệch nửa mở/nửa đóng.
 *
 * Ngữ nghĩa nửa mở `[from, to)` ở đây phải khớp với BA chỗ khác: `tstzrange '[)'`
 * ở migration 0010, `overlaps()` ở `@v9/shared`, và `listRentalsInRange` ở
 * `apps/api`. Không có gì ép máy bốn chỗ này đồng ý với nhau — chỉ có test ở
 * từng chỗ. Đơn kết thúc đúng lúc cửa sổ bắt đầu, hoặc bắt đầu đúng lúc cửa sổ
 * kết thúc, đều KHÔNG chạm cửa sổ (xem hai ca cuối của file test).
 */
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";

export interface GridWindow {
  readonly from: Date;
  readonly to: Date; // nửa mở: cột cuối là ngày TRƯỚC `to`
}

export interface DayColumn {
  readonly date: Date;
  readonly isWeekend: boolean;
}

export interface BarPlacement {
  readonly startCol: number; // 1-based, tính theo cột NGÀY (không gồm cột tên xe)
  readonly span: number;
  readonly clippedStart: boolean;
  readonly clippedEnd: boolean;
}

interface Ymd {
  readonly year: number;
  readonly month: number; // 1-based
  readonly day: number;
}

/**
 * Đọc ngày-tháng-năm của một instant THEO GIỜ `timeZone` — không phải giờ máy
 * chạy. `Date.getDate()/getDay()` đọc múi giờ của runtime; CI chạy UTC, máy dev
 * có thể không, nên hai nơi thấy hai "hôm nay" khác nhau cho cùng một instant.
 * `Intl.DateTimeFormat` với `timeZone` tường minh thì không phụ thuộc
 * `process.env.TZ` — đây là cách duy nhất đúng cho cả `TZ=UTC` lẫn
 * `TZ=America/New_York`.
 */
function zonedYmd(instant: Date, timeZone: string): Ymd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Độ lệch (ms) của `timeZone` so với UTC tại đúng thời điểm `instant` — tra
 * qua `Intl`, KHÔNG hardcode "+7 giờ". Asia/Ho_Chi_Minh không có DST nên độ
 * lệch này không đổi theo ngày, nhưng hàm không dựa vào giả định đó: nó tra
 * lại mỗi lần gọi, nên vẫn đúng nếu một ngày nào đó điều đó thay đổi.
 */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * Instant của nửa đêm (00:00) một ngày lịch theo giờ `timeZone`.
 *
 * KHÔNG bước ngày bằng cách cộng `86_400_000` ms — đó là công thức sai vô
 * tình ra đúng, chỉ đúng vì Việt Nam không có DST, và sẽ hỏng câm nín ngày nào
 * đó điều đó đổi. Thay vào đó: đoán bằng `Date.UTC(year, month, day)` (coi
 * Y-M-D như thể đã là UTC), rồi tự sửa bằng đúng độ lệch múi giờ tra được tại
 * chính thời điểm đoán đó. `Date.UTC` tự chuẩn hoá tràn tháng/năm (vd
 * `day: 32` của tháng 8 tự lăn sang 1/9) nên bước ngày ở `dayColumns` chỉ cần
 * cộng số nguyên vào `day`, không cần tính lịch tay.
 */
function zonedMidnight(ymd: Ymd, timeZone: string): Date {
  const guessMs = Date.UTC(ymd.year, ymd.month - 1, ymd.day);
  const offset = tzOffsetMs(new Date(guessMs), timeZone);
  return new Date(guessMs - offset);
}

/**
 * Khoảng cách theo NGÀY LỊCH giữa hai Y-M-D — một phép trừ, không phải một
 * vòng lặp cộng dồn. `Date.UTC(y, m, d)` của hai mốc đều là biên ngày đúng
 * trong một lịch Gregorian thuần (UTC không có DST), nên hiệu của chúng luôn
 * là bội số nguyên của một ngày — không có sai số tích luỹ để `Math.round`
 * phải che giấu, nó chỉ là lưới an toàn cho sai số dấu phẩy động.
 */
function daysBetween(a: Ymd, b: Ymd): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(diff / msPerDay);
}

/** Ngày kế tiếp — cộng NGUYÊN vào ngày lịch, không cộng mili giây. */
function nextDay(ymd: Ymd): Ymd {
  return { year: ymd.year, month: ymd.month, day: ymd.day + 1 };
}

export function dayColumns(w: GridWindow): DayColumn[] {
  const cols: DayColumn[] = [];
  let ymd = zonedYmd(w.from, SHOP_TIMEZONE);
  for (;;) {
    const date = zonedMidnight(ymd, SHOP_TIMEZONE);
    if (date.getTime() >= w.to.getTime()) break;
    // Thứ trong tuần là phép tính lịch THUẦN (Y-M-D → thứ mấy), không phụ
    // thuộc múi giờ nào cả — dùng `Date.UTC` + `getUTCDay()`, KHÔNG dùng
    // `getDay()` (đọc múi giờ máy chạy) trên `date` (một instant).
    const dow = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
    cols.push({ date, isWeekend: dow === 0 || dow === 6 });
    ymd = nextDay(ymd);
  }
  return cols;
}

export function placeBar(r: { startsAt: Date; endsAt: Date }, w: GridWindow): BarPlacement | null {
  const effectiveStart = r.startsAt.getTime() > w.from.getTime() ? r.startsAt : w.from;
  const effectiveEndMs = Math.min(r.endsAt.getTime(), w.to.getTime());

  // Nửa mở [from, to): chạm biên (bằng nhau) không tính là phủ. Hai ca cuối
  // của file test — kết thúc đúng lúc cửa sổ bắt đầu, bắt đầu đúng lúc cửa sổ
  // kết thúc — đều rơi vào đây.
  if (effectiveStart.getTime() >= effectiveEndMs) return null;

  const fromYmd = zonedYmd(w.from, SHOP_TIMEZONE);
  const startYmd = zonedYmd(effectiveStart, SHOP_TIMEZONE);
  const startCol = daysBetween(fromYmd, startYmd) + 1;

  let span = 0;
  let cursor = startYmd;
  while (zonedMidnight(cursor, SHOP_TIMEZONE).getTime() < effectiveEndMs) {
    span += 1;
    cursor = nextDay(cursor);
  }

  return {
    startCol,
    span,
    clippedStart: r.startsAt.getTime() < w.from.getTime(),
    clippedEnd: r.endsAt.getTime() > w.to.getTime(),
  };
}
