import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import { errorMessage } from "../../lib/errors";
import type { GridWindow } from "../../lib/calendar-layout";
import { fleetQuery, rentalsQuery, type CalendarRental, type FleetVehicle } from "../../lib/rentals";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { CalendarMonth } from "./calendar-month";
import { CalendarTimeline } from "./calendar-timeline";

/**
 * Vỏ của trang Lịch (Task 6, Plan C). Sở hữu: state ở URL, đo breakpoint, fetch,
 * điều hướng khoảng (‹ › Hôm nay), nút chuyển chế độ, và ba trạng thái tải/lỗi/rỗng.
 * `calendar-timeline.tsx`/`calendar-month.tsx` chỉ VẼ đúng `GridWindow` nhận được —
 * xem hợp đồng ở đầu hai file đó.
 *
 * ⚠️ File này KHÔNG import `@v9/shared` (barrel) — chỉ `@v9/shared/domain/rental`.
 * `components/rentals/` bị hàng rào boundaries chặn khỏi `shared-root`.
 */

// ── State ở URL ──────────────────────────────────────────────────────────

/**
 * Danh sách RUNTIME là nguồn sự thật, kiểu `CalendarView` suy ra từ nó — CÙNG
 * KHUÔN `LOGIN_REASONS`/`LoginReason` ở `lib/guard-decision.ts` (task này được
 * yêu cầu chép nguyên khuôn đó). Thêm một chế độ mới mà quên thêm vào đây là
 * KHÔNG THỂ: `CalendarView` không tồn tại độc lập ở type-level, nên gọi
 * `switchView("week")` khi `"week"` chưa có trong mảng là lỗi biên dịch ngay
 * tại chỗ gọi, không phải một cú rơi im lặng về `DEFAULT_VIEW`.
 *
 * Đặt ở ĐÂY (component file) thay vì một file `lib/` riêng (khuôn thật của
 * `LOGIN_REASONS`) vì phạm vi Task 6 chỉ cho tạo đúng một file mới
 * (`rental-calendar.tsx`) — xem đầu bài. `router.tsx` import lại từ đây cho
 * `validateSearch`; không đặt ở `router.tsx` vì `RentalCalendar` bên dưới cũng
 * cần đọc `CalendarView`, và import ngược lại `router.tsx` từ một component
 * dựng ra chu trình module (cùng lý do `login-page.tsx` dùng `useSearch({
 * strict: false })` thay vì import route object — xem comment ở đó).
 */
export const CALENDAR_VIEWS = ["timeline", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const DEFAULT_VIEW: CalendarView = "timeline";

export interface CalendarSearch {
  readonly view: CalendarView;
  readonly from?: string; // YYYY-MM-DD theo giờ VN; vắng mặt = "hôm nay"
}

/**
 * `validateSearch` của route `/calendar` — ĐÚNG khuôn `loginRoute` đã dùng cho
 * `?reason=`: chỉ nhận giá trị nằm trong danh sách trắng, giá trị lạ bị lọc
 * (không throw, không crash).
 *
 * ⚠️ `?from=` là text người dùng GÕ ĐƯỢC: `2026-13-45`, `hôm nay`, chuỗi rỗng
 * đều tới đây nguyên văn. Quyết định rõ ràng (không để `Invalid Date` lọt ra
 * lưới): SAI HÌNH DẠNG hoặc SAI NGÀY LỊCH → coi như KHÔNG có `from` → component
 * tự rơi về "hôm nay". `parseYmd` xác nhận cả hai vế (đúng `\d{4}-\d{2}-\d{2}`
 * VÀ đúng ngày lịch thật — `2026-13-45` sai vì tháng 13, `2026-02-30` sai vì
 * tháng 2 không có ngày 30) trước khi tin chuỗi này.
 */
export function validateCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  const foundView = CALENDAR_VIEWS.find((v) => v === search["view"]);
  const rawFrom = search["from"];
  const from = typeof rawFrom === "string" && parseYmd(rawFrom) ? rawFrom : undefined;
  return { view: foundView ?? DEFAULT_VIEW, from };
}

// ── Y-M-D theo giờ VN — bản RIÊNG của file này, có chủ ý ───────────────────

interface Ymd {
  readonly year: number;
  readonly month: number; // 1-based
  readonly day: number;
}

/**
 * "Khoảng nào đang xem" là quyết định RANGE SELECTION thuộc file này (xem hợp
 * đồng ở đầu `calendar-month.tsx`), KHÔNG thuộc `lib/calendar-layout.ts` — file
 * đó cố tình không export `zonedYmd`/`zonedMidnight`/`tzOffsetMs` vì chúng là
 * chi tiết NỘI BỘ của việc đặt thanh lên lưới, không phải tiện ích dùng chung.
 * Ba hàm dưới đây làm lại ĐÚNG kỹ thuật đó (Intl + tự tra lệch múi giờ tại
 * chính thời điểm cần, KHÔNG hardcode "+7 giờ" dù Asia/Ho_Chi_Minh không có
 * DST — cùng lý lẽ đã ghi ở `calendar-layout.ts`) cho nhu cầu riêng của file
 * này: đọc "hôm nay", và đổi một Y-M-D bất kỳ thành đúng instant 00:00 giờ VN
 * để làm biên `GridWindow`. Hai bản độc lập, cùng kỹ thuật, khác mục đích —
 * không phải bản sao lười của cùng một trách nhiệm.
 */
function zonedYmdOf(instant: Date): Ymd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function zonedTodayYmd(): Ymd {
  return zonedYmdOf(new Date());
}

function tzOffsetMsAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

function zonedMidnightOf(ymd: Ymd): Date {
  const guessMs = Date.UTC(ymd.year, ymd.month - 1, ymd.day);
  const offset = tzOffsetMsAt(new Date(guessMs));
  return new Date(guessMs - offset);
}

// ── Số học lịch THUẦN (Y-M-D → Y-M-D), không phụ thuộc múi giờ ─────────────
// `Date.UTC` tự chuẩn hoá tràn tháng/năm/ngày — an toàn để cộng số nguyên tuỳ ý.

function addDays(ymd: Ymd, delta: number): Ymd {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Cộng NGUYÊN tháng, luôn chốt về ngày 1 — đủ dùng cho "lật sang tháng khác";
 *  neo tháng không cần giữ đúng ngày-trong-tháng cũ (xem `monthWindow`, chỉ đọc
 *  `year`/`month` của neo). */
function addMonths(ymd: Ymd, delta: number): Ymd {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: 1 };
}

/** 0 = Chủ Nhật … 6 = Thứ Bảy. */
function weekdayOf(ymd: Ymd): number {
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ymdToString(ymd: Ymd): string {
  const pad = (n: number, len: number) => String(n).padStart(len, "0");
  return `${pad(ymd.year, 4)}-${pad(ymd.month, 2)}-${pad(ymd.day, 2)}`;
}

/** `null` khi KHÔNG phải một ngày lịch thật — sai hình dạng (`"hôm nay"`, chuỗi
 *  rỗng) hoặc đúng hình dạng nhưng sai ngày (`2026-13-45`, `2026-02-30`).
 *  `Date.UTC` tự "lăn" ngày tràn thành một ngày khác thay vì báo lỗi, nên phải
 *  tự kiểm biên tháng/ngày TRƯỚC khi tin chuỗi input. */
function parseYmd(raw: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

// ── GridWindow: hai chế độ, hai luật khác nhau ──────────────────────────────

function timelineWindow(anchor: Ymd, dayCount: number): GridWindow {
  return { from: zonedMidnightOf(anchor), to: zonedMidnightOf(addDays(anchor, dayCount)) };
}

/**
 * Đúng hợp đồng đã ghi ở đầu `calendar-month.tsx`: `from` là 00:00 giờ VN của
 * Thứ Hai ngay-trước-hoặc-đúng ngày 1 của tháng chứa `anchor`; `to` (nửa mở) là
 * 00:00 giờ VN của Thứ Hai kế tiếp SAU Chủ Nhật cuối cùng của tuần chứa ngày
 * cuối tháng — tổng số ngày trong cửa sổ luôn là bội số của 7 (35 hoặc 42).
 */
function monthWindow(anchor: Ymd): GridWindow {
  const monthStart: Ymd = { year: anchor.year, month: anchor.month, day: 1 };
  const startDow = weekdayOf(monthStart);
  const gridStart = addDays(monthStart, -((startDow + 6) % 7)); // lùi về Thứ Hai

  const monthEnd: Ymd = { year: anchor.year, month: anchor.month, day: daysInMonth(anchor.year, anchor.month) };
  const endDow = weekdayOf(monthEnd);
  const sunday = addDays(monthEnd, (7 - endDow) % 7); // tiến tới Chủ Nhật
  const gridEndExclusive = addDays(sunday, 1); // Thứ Hai kế tiếp — biên nửa mở

  return { from: zonedMidnightOf(gridStart), to: zonedMidnightOf(gridEndExclusive) };
}

// ── Breakpoint: 7/10/14 ngày, đo bằng matchMedia ────────────────────────────

const MD_QUERY = "(min-width: 768px)";
const XL_QUERY = "(min-width: 1280px)";

/**
 * PHẢI khớp đúng hai ngưỡng `md`/`xl` mặc định của Tailwind mà
 * `calendar-timeline.tsx` dùng để đổi độ rộng cột xe (xem hợp đồng ở đầu file
 * đó) — lệch ngưỡng thì tiêu đề cột (đổi ở CSS) và số cột thật (đổi ở đây,
 * bằng JS) không khớp nhau khi bề rộng màn hình nằm giữa hai mốc.
 */
function currentDayCount(): 7 | 10 | 14 {
  if (typeof window === "undefined") return 7;
  if (window.matchMedia(XL_QUERY).matches) return 14;
  if (window.matchMedia(MD_QUERY).matches) return 10;
  return 7;
}

function subscribeToBreakpoint(callback: () => void): () => void {
  const mdList = window.matchMedia(MD_QUERY);
  const xlList = window.matchMedia(XL_QUERY);
  mdList.addEventListener("change", callback);
  xlList.addEventListener("change", callback);
  return () => {
    mdList.removeEventListener("change", callback);
    xlList.removeEventListener("change", callback);
  };
}

/**
 * `useSyncExternalStore`, KHÔNG `useEffect` + `useState`: effect chạy SAU lần
 * vẽ đầu tiên, nên một state khởi tạo tạm rồi effect sửa lại đúng là nhịp
 * "vẽ sai rồi vẽ lại" mà hợp đồng của `calendar-timeline.tsx` cấm — component
 * đó phải "luôn nhận đúng dữ liệu ngay lần vẽ đầu tiên". `getSnapshot` gọi
 * `matchMedia` NGAY trong lần render đầu nên `gridWindow` tính từ nó luôn đúng
 * từ đầu, không có round-trip rỗng-rồi-đầy.
 */
function useCalendarDayCount(): 7 | 10 | 14 {
  return useSyncExternalStore(subscribeToBreakpoint, currentDayCount, () => 7);
}

// ── Trình bày ────────────────────────────────────────────────────────────

const RANGE_DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Nhãn hai nút chuyển chế độ — `Record<CalendarView, string>` bắt buộc đủ
 *  nhánh, giống `STATUS_LABEL` ở `lib/rental-status.ts`: thêm một chế độ vào
 *  `CALENDAR_VIEWS` mà quên thêm nhãn ở đây là lỗi biên dịch. */
const VIEW_LABEL: Record<CalendarView, string> = {
  timeline: "Timeline",
  month: "Tháng",
};

/** Nhánh vẽ lưới theo chế độ — `never` cuối cùng là hàng rào giống
 *  `router.tsx` (`const unhandled: never = decision`): thêm một `CalendarView`
 *  mới mà quên thêm nhánh vẽ ở đây là lỗi biên dịch, không phải một cú rơi im
 *  lặng về Timeline. */
function renderGrid(
  view: CalendarView,
  vehicles: readonly FleetVehicle[],
  rentals: readonly CalendarRental[],
  gridWindow: GridWindow,
) {
  if (view === "timeline") {
    return <CalendarTimeline vehicles={vehicles} rentals={rentals} gridWindow={gridWindow} />;
  }
  if (view === "month") {
    return <CalendarMonth vehicles={vehicles} rentals={rentals} gridWindow={gridWindow} />;
  }
  const unhandled: never = view;
  throw new Error(`Chế độ lịch chưa xử lý: ${String(unhandled)}`);
}

export function RentalCalendar() {
  const navigate = useNavigate({ from: "/calendar" });
  // `strict: false` để không phải import ngược `router.tsx` (chu trình module)
  // — cùng lý do đã ghi ở `pages/login-page.tsx`. Giá trị đã qua
  // `validateCalendarSearch` ở trên nên `view` luôn nằm trong `CALENDAR_VIEWS`
  // và `from` (nếu có) luôn đúng hình dạng `YYYY-MM-DD` — `parseYmd` dưới đây
  // chỉ CHUYỂN chuỗi đã-biết-hợp-lệ đó thành `Ymd` có cấu trúc, không phải
  // kiểm tra lại từ đầu.
  const search = useSearch({ strict: false });
  const view: CalendarView = search.view ?? DEFAULT_VIEW;
  const anchor = (search.from ? parseYmd(search.from) : null) ?? zonedTodayYmd();

  const dayCount = useCalendarDayCount();
  const gridWindow: GridWindow = view === "month" ? monthWindow(anchor) : timelineWindow(anchor, dayCount);

  // Chỉ fetch đúng khoảng chế độ ĐANG XEM cần — không union cả hai chế độ lại
  // để "sẵn sàng chuyển tức thì". Timeline tối đa 14 ngày, tháng tối đa 42 ngày
  // (đệm đủ tuần) — cả hai đều xa ngưỡng `MAX_RANGE_DAYS = 92` của
  // `GET /rentals` (400 `INVALID_RANGE` nếu vượt). Đổi chế độ gọi lại query
  // với `queryKey` khác — chấp nhận một nhịp tải lại, đổi lấy không bao giờ
  // tới gần ngưỡng dù người dùng bấm "tháng sau" bao nhiêu lần: mỗi lần tính
  // lại `gridWindow` từ neo hiện tại, không cộng dồn.
  const fleet = useQuery(fleetQuery);
  const rentals = useQuery(rentalsQuery(gridWindow.from, gridWindow.to));

  function updateFrom(next: Ymd): void {
    void navigate({ search: (prev) => ({ ...prev, from: ymdToString(next) }) });
  }
  function goToday(): void {
    updateFrom(zonedTodayYmd());
  }
  function goPrev(): void {
    updateFrom(view === "month" ? addMonths(anchor, -1) : addDays(anchor, -dayCount));
  }
  function goNext(): void {
    updateFrom(view === "month" ? addMonths(anchor, 1) : addDays(anchor, dayCount));
  }
  function switchView(next: CalendarView): void {
    void navigate({ search: (prev) => ({ ...prev, view: next }) });
  }

  let rangeLabel: string;
  if (view === "month") {
    rangeLabel = `Tháng ${String(anchor.month)}/${String(anchor.year)}`;
  } else {
    const lastDay = addDays(anchor, dayCount - 1);
    rangeLabel = `${RANGE_DATE_FMT.format(zonedMidnightOf(anchor))} – ${RANGE_DATE_FMT.format(zonedMidnightOf(lastDay))}`;
  }

  const isLoading = fleet.isPending || rentals.isPending;
  const fleetFailed = fleet.data !== undefined && !fleet.data.ok;
  const vehicles = fleet.data?.ok ? fleet.data.vehicles : [];
  const noFleet = fleet.data?.ok === true && vehicles.length === 0;
  const rentalsFailed = rentals.data !== undefined && !rentals.data.ok;

  // Toolbar (điều hướng khoảng + nút chuyển chế độ) bị ẩn CHỈ khi đã xác nhận
  // đội xe rỗng — không có gì để lật khi không có hàng nào để vẽ. Mọi trạng
  // thái khác (tải/lỗi/có dữ liệu) đều giữ toolbar, để người dùng vẫn đổi được
  // khoảng/chế độ trong lúc chờ hoặc sau khi thấy lỗi.
  const showToolbar = !(!isLoading && !fleetFailed && noFleet);

  return (
    <div className="flex flex-col gap-4">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" onClick={goPrev} aria-label="Kỳ trước">
              ‹
            </Button>
            <span className="text-sm font-medium text-ink">{rangeLabel}</span>
            <Button type="button" variant="ghost" onClick={goNext} aria-label="Kỳ sau">
              ›
            </Button>
            <Button type="button" variant="ghost" onClick={goToday}>
              Hôm nay
            </Button>
          </div>

          <div role="group" aria-label="Chế độ xem" className="flex items-center gap-1 rounded-card border border-border p-1">
            {CALENDAR_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => switchView(v)}
                className={`min-h-11 rounded-card px-3 text-sm font-medium ${
                  view === v ? "bg-accent text-accent-ink" : "text-ink hover:bg-canvas"
                }`}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div>
          <p className="text-sm text-muted">Đang tải lịch…</p>
          {/* Khung giữ đúng chỗ — dữ liệu tới không làm trang nhảy layout. */}
          <div className="mt-2 min-h-96 animate-pulse rounded-card border border-border bg-canvas" />
        </div>
      )}

      {/*
       * `fleetQuery`/`rentalsQuery` nay giữ cả `value` lỗi gốc (xem `lib/rentals.ts`),
       * nên `errorMessage()` đọc được đúng `message` tiếng Việt backend đã viết,
       * thay vì luôn rơi về câu chung chung.
       */}
      {!isLoading && fleetFailed && (
        <Alert tone="error">
          {errorMessage(
            fleet.data?.ok === false ? fleet.data.value : null,
            "Không tải được đội xe. Thử tải lại trang.",
          )}
        </Alert>
      )}

      {!isLoading && !fleetFailed && noFleet && (
        <Alert tone="warning">Chưa có xe trong đội. Thêm xe trong Directus.</Alert>
      )}

      {!isLoading && !fleetFailed && !noFleet && rentalsFailed && (
        <Alert tone="error">
          {errorMessage(
            rentals.data?.ok === false ? rentals.data.value : null,
            "Không tải được lịch thuê. Thử tải lại trang.",
          )}
        </Alert>
      )}

      {!isLoading &&
        !fleetFailed &&
        !noFleet &&
        !rentalsFailed &&
        rentals.data?.ok === true &&
        renderGrid(view, vehicles, rentals.data.rentals, gridWindow)}
    </div>
  );
}
