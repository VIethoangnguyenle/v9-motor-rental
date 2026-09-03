import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { SHOP_TIMEZONE, type RentalStatus } from "@v9/shared/domain/rental";
import { errorMessage } from "../../lib/errors";
import type { GridWindow } from "../../lib/calendar-layout";
// State ở URL + số học Y-M-D nay ở `lib/`, để `router.tsx` import validator mà
// KHÔNG kéo cả cây component của trang Lịch vào chunk chính. Xem đầu file đó.
import {
  CALENDAR_VIEWS,
  DEFAULT_VIEW,
  daysInMonth,
  parseYmd,
  ymdToString,
  type CalendarView,
  type Ymd,
} from "../../lib/calendar-search";
import {
  fleetQuery,
  rentalsQuery,
  type CalendarRental,
  type FleetVehicle,
} from "../../lib/rentals";
import { Alert } from "../ui/alert";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { ToggleGroup } from "../ui/toggle-group";
import { CalendarMonth } from "./calendar-month";
import { CalendarTimeline } from "./calendar-timeline";
import { RentalDetailSheet } from "./rental-detail-sheet";
import { STATUS_LABEL } from "../../lib/rental-status";

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

// ── Y-M-D theo giờ VN — bản RIÊNG của file này, có chủ ý ───────────────────

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

  const monthEnd: Ymd = {
    year: anchor.year,
    month: anchor.month,
    day: daysInMonth(anchor.year, anchor.month),
  };
  const endDow = weekdayOf(monthEnd);
  const sunday = addDays(monthEnd, (7 - endDow) % 7); // tiến tới Chủ Nhật
  const gridEndExclusive = addDays(sunday, 1); // Thứ Hai kế tiếp — biên nửa mở

  return { from: zonedMidnightOf(gridStart), to: zonedMidnightOf(gridEndExclusive) };
}

// ── Breakpoint: 7/10/14 ngày, đo bằng ResizeObserver trên vùng lưới ─────────

/** Ba ngưỡng cũ, nhưng áp lên bề rộng VÙNG LƯỚI thay vì bề rộng cửa sổ. */
export function dayCountForWidth(gridWidth: number): 7 | 10 | 14 {
  if (gridWidth >= 1280) return 14;
  if (gridWidth >= 768) return 10;
  return 7;
}

/**
 * `useSyncExternalStore`, KHÔNG `useEffect` + `useState`: effect chạy SAU lần
 * vẽ đầu tiên, nên một state khởi tạo tạm rồi effect sửa lại đúng là nhịp
 * "vẽ sai rồi vẽ lại". `getSnapshot` đọc `gridRef.current.clientWidth` — bề
 * rộng THẬT của vùng lưới, sau khi sidebar/layout đã ăn bớt phần của nó — chứ
 * không phải `matchMedia` trên cửa sổ như bản cũ: đo cửa sổ từng trả 14 ngày ở
 * 1280px trong khi sidebar ăn ~258px chỉ còn 1022px cho lưới (đóng #5, xem
 * `dayCountForWidth`).
 *
 * `gridRef` trỏ vào khối bọc ngoài cùng của trang — luôn tồn tại từ lần render
 * đầu, không đợi tải dữ liệu xong — nên `ResizeObserver` gắn được ngay ở lần
 * mount đầu. Cái giá phải trả so với bản `matchMedia` cũ: KHÔNG còn đúng ngay
 * từ khung hình đầu tiên (window đã tồn tại TRƯỚC khi component mount, còn nút
 * DOM của `gridRef` thì chưa khi `getSnapshot` chạy lần đầu) — snapshot đầu
 * trả 7 (qua `getServerSnapshot` bên dưới) cho tới khi `ResizeObserver` bắn
 * lần đo đầu tiên. Cùng đánh đổi `ScrollHint` ở `calendar-timeline.tsx` đã
 * chấp nhận cho `hasMore`.
 */
function useCalendarDayCount(gridRef: RefObject<HTMLElement | null>): 7 | 10 | 14 {
  return useSyncExternalStore(
    (callback) => {
      const el = gridRef.current;
      if (!el) return () => {};
      const observer = new ResizeObserver(callback);
      observer.observe(el);
      return () => {
        observer.disconnect();
      };
    },
    () => {
      const el = gridRef.current;
      return el ? dayCountForWidth(el.clientWidth) : 7;
    },
    () => 7,
  );
}

// ── Trình bày ────────────────────────────────────────────────────────────

const RANGE_DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Không năm — dùng ở màn hẹp (Task 11): năm đã nằm trong ngữ cảnh trang, nêu
 *  lại trên mỗi lần lật khoảng chỉ tốn chỗ mà đầu trang thì đang chật. */
const RANGE_DATE_SHORT_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
});

/** Nhãn hai nút chuyển chế độ — `Record<CalendarView, string>` bắt buộc đủ
 *  nhánh, giống `STATUS_LABEL` ở `lib/rental-status.ts`: thêm một chế độ vào
 *  `CALENDAR_VIEWS` mà quên thêm nhãn ở đây là lỗi biên dịch. */
const VIEW_LABEL: Record<CalendarView, string> = {
  timeline: "Timeline",
  month: "Tháng",
};

/**
 * Nút ‹ › của toolbar — KHÔNG dùng `Button` (Task 11). `BASE` của `Button` cố
 * định `px-4` cho MỌI biến thể, kể cả nút chỉ có icon; hai nút này đứng cạnh
 * nhãn khoảng ngày và `ToggleGroup` trong CÙNG một hàng, nên phần đệm ngang dư
 * ra cho chữ (mà icon không cần) là đúng phần khiến hàng không gộp vừa ở
 * 390px (đóng #8). `min-w-11` (44px) thay `px-4` — vẫn đúng vùng chạm, chỉ bỏ
 * đệm không cần thiết. Cùng tinh thần `ui/toggle-group.tsx` đã chọn tự viết
 * `<button>` thay vì bọc `Button` khi khuôn có sẵn không vừa.
 */
const NAV_ICON_BTN =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-card border border-border text-ink transition-[background-color,border-color] duration-(--duration-instant) ease-standard hover:border-muted hover:bg-canvas active:bg-border";

/**
 * "Hôm nay" — cùng lý do `NAV_ICON_BTN`: `px-3` (thay `px-4` của `Button`) đứng
 * MỘT MÌNH trên nút tự viết này thay vì cộng vào chuỗi class của `Button`, nơi
 * nó không thắng nổi `px-4` của `BASE` (hai utility cùng đặc trưng, thứ tự
 * trong stylesheet — sinh ra từ lượt quét toàn repo của Tailwind, không phải
 * thứ tự trong JSX — mới là thứ quyết định ai đè ai). Đã ĐO: gắn `className="px-3"`
 * thẳng vào `<Button>` không đổi bề rộng render — `px-4` vẫn thắng.
 */
const NAV_TEXT_BTN = `${NAV_ICON_BTN} px-3 text-sm font-semibold`;

/** Nhánh vẽ lưới theo chế độ — `never` cuối cùng là hàng rào giống
 *  `router.tsx` (`const unhandled: never = decision`): thêm một `CalendarView`
 *  mới mà quên thêm nhánh vẽ ở đây là lỗi biên dịch, không phải một cú rơi im
 *  lặng về Timeline. */
function renderGrid(
  view: CalendarView,
  vehicles: readonly FleetVehicle[],
  rentals: readonly CalendarRental[],
  gridWindow: GridWindow,
  onSelect: (rental: CalendarRental) => void,
  onShowDay: (date: Date) => void,
) {
  if (view === "timeline") {
    return (
      <CalendarTimeline
        vehicles={vehicles}
        rentals={rentals}
        gridWindow={gridWindow}
        onSelect={onSelect}
      />
    );
  }
  if (view === "month") {
    return (
      <CalendarMonth
        vehicles={vehicles}
        rentals={rentals}
        gridWindow={gridWindow}
        onSelect={onSelect}
        onShowDay={onShowDay}
      />
    );
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

  // Bọc ngoài cùng của trang — xem `useCalendarDayCount` để biết vì sao đo ở
  // đây, không đo `window`.
  const gridRef = useRef<HTMLDivElement>(null);
  const dayCount = useCalendarDayCount(gridRef);
  const gridWindow: GridWindow =
    view === "month" ? monthWindow(anchor) : timelineWindow(anchor, dayCount);

  // Chỉ fetch đúng khoảng chế độ ĐANG XEM cần — không union cả hai chế độ lại
  // để "sẵn sàng chuyển tức thì". Timeline tối đa 14 ngày, tháng tối đa 42 ngày
  // (đệm đủ tuần) — cả hai đều xa ngưỡng `MAX_RANGE_DAYS = 92` của
  // `GET /rentals` (400 `INVALID_RANGE` nếu vượt). Đổi chế độ gọi lại query
  // với `queryKey` khác — chấp nhận một nhịp tải lại, đổi lấy không bao giờ
  // tới gần ngưỡng dù người dùng bấm "tháng sau" bao nhiêu lần: mỗi lần tính
  // lại `gridWindow` từ neo hiện tại, không cộng dồn.
  const fleet = useQuery(fleetQuery);
  const rentals = useQuery(rentalsQuery(gridWindow.from, gridWindow.to));

  // Đơn đang mở sheet, và câu xác nhận sau khi đổi trạng thái xong. Giữ ID chứ
  // KHÔNG giữ nguyên đối tượng rental: sau `invalidateQueries` danh sách được
  // fetch lại, và một bản sao cũ trong state sẽ hiện trạng thái đã lỗi thời.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changed, setChanged] = useState<string | null>(null);

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
  /**
   * "+k nữa" trên một ô lịch tháng → sang Timeline neo vào đúng ngày đó.
   *
   * Đổi CẢ `view` lẫn `from` trong MỘT lần navigate, không phải hai: hai lần
   * điều hướng liên tiếp đẻ ra hai history entry, và Back sẽ đưa người dùng về
   * một trạng thái trung gian họ chưa từng thấy (Timeline ở ngày cũ).
   *
   * Ngày đi qua `zonedYmdOf` chứ không `toISOString().slice(0,10)`: `col.date`
   * là instant nửa đêm giờ VN, tức 17h hôm TRƯỚC theo UTC — cắt chuỗi ISO ra sẽ
   * neo lịch sai một ngày. Cùng cái bẫy `calendar-timeline.tsx` đã ghi.
   */
  function showDay(date: Date): void {
    void navigate({
      search: (prev) => ({ ...prev, view: "timeline", from: ymdToString(zonedYmdOf(date)) }),
    });
  }

  // Nhãn đầy đủ (desktop) và nhãn rút gọn (màn hẹp, không năm) — xem
  // `RANGE_DATE_SHORT_FMT`. Chế độ tháng đã đủ ngắn (`Tháng 9/2026`) nên dùng
  // chung một nhãn cho cả hai bề rộng.
  let rangeLabel: string;
  let rangeLabelShort: string;
  if (view === "month") {
    rangeLabel = `Tháng ${String(anchor.month)}/${String(anchor.year)}`;
    rangeLabelShort = rangeLabel;
  } else {
    const lastDay = addDays(anchor, dayCount - 1);
    const from = zonedMidnightOf(anchor);
    const to = zonedMidnightOf(lastDay);
    rangeLabel = `${RANGE_DATE_FMT.format(from)} – ${RANGE_DATE_FMT.format(to)}`;
    rangeLabelShort = `${RANGE_DATE_SHORT_FMT.format(from)} – ${RANGE_DATE_SHORT_FMT.format(to)}`;
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

  // Đọc lại từ danh sách vừa fetch, không từ state — xem chú thích `selectedId`.
  const allRentals = rentals.data?.ok === true ? rentals.data.rentals : [];
  const fresh = selectedId === null ? null : (allRentals.find((r) => r.id === selectedId) ?? null);

  /*
   * ⚠️ Bản đang mở được GHIM, không suy thẳng từ `fresh`.
   *
   * `listRentalsInRange` (`apps/api/src/services/rentals.ts`) lọc
   * `status <> 'CANCELLED'`, có test canh. Nên trên đường `→ CANCELLED`:
   * `invalidateQueries(["rentals"])` → refetch → đơn vừa huỷ RƠI KHỎI danh sách
   * → `fresh` ra `null` → sheet bị gỡ ngay commit kế. Đo được hệ quả: vòng sáng
   * sống đúng bằng RTT của refetch chứ không phải 600ms, và hiệu ứng ra không có
   * lấy một khung hình — đúng lớp lỗi mà `ui/modal.tsx` đã ghi thành luật.
   *
   * Ghim rồi thì `RentalDetailSheet` tự sở hữu khoảnh khắc đóng của nó ở CẢ BA
   * chuyển trạng thái: nhịp vòng sáng chạy xong, sheet gọi `close`, hiệu ứng ra
   * chạy đủ, `onClose` mới gỡ.
   *
   * Ghim KHÔNG làm chip đứng yên ở trạng thái cũ: sheet vẽ chip từ kết quả
   * mutation đã được server xác nhận, không đợi vòng refetch — xem `shownStatus`
   * ở `rental-detail-sheet.tsx`.
   */
  const pinned = useRef(fresh);
  if (fresh !== null) pinned.current = fresh;
  const selected = selectedId === null ? null : pinned.current;

  return (
    <div ref={gridRef} className="flex flex-col gap-4">
      {/*
       * Task 11 (đóng #8): ba cụm — điều hướng khoảng, "Hôm nay", chuyển chế độ —
       * gộp vào MỘT `flex flex-wrap`, không còn hai tầng lồng nhau (nhóm điều
       * hướng bọc riêng + `justify-between` đẩy `ToggleGroup` ra mép phải). Lồng
       * hai tầng khiến mỗi tầng wrap độc lập, đo được ba hàng riêng ở 390px
       * (lưới bắt đầu ở 29% màn hình). Gộp phẳng thì mọi nút cùng tham gia MỘT
       * vòng wrap, xếp kín tới đâu hay tới đó.
       */}
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={goPrev} aria-label="Kỳ trước" className={NAV_ICON_BTN}>
            <Icon name="chevron-left" />
          </button>
          <span className="text-sm font-medium text-ink">
            {/* Rút ngắn ở màn hẹp (bỏ năm — đã nằm trong ngữ cảnh trang) để một
                cụm ngày không một mình chiếm hết bề rộng còn lại của hàng. */}
            <span className="sm:hidden">{rangeLabelShort}</span>
            <span className="hidden sm:inline">{rangeLabel}</span>
          </span>
          <button type="button" onClick={goNext} aria-label="Kỳ sau" className={NAV_ICON_BTN}>
            <Icon name="chevron-right" />
          </button>
          <button type="button" onClick={goToday} className={NAV_TEXT_BTN}>
            Hôm nay
          </button>

          {/* Khung có viền bọc ngoài đã bỏ: cùng thao tác này ở `requests-page.tsx`
              là những nút rời, và hai hình dạng cho một khuôn là drift. Xem lý
              lẽ chọn hình dạng nào ở `ui/toggle-group.tsx`. */}
          <ToggleGroup
            label="Chế độ xem"
            options={CALENDAR_VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v] }))}
            value={view}
            onChange={switchView}
          />
        </div>
      )}

      {changed && (
        <Alert tone="info" live="polite">
          {changed}
        </Alert>
      )}

      {isLoading && (
        <div>
          <p className="text-sm text-muted">Đang tải lịch…</p>
          {/* Khung giữ đúng chỗ — dữ liệu tới không làm trang nhảy layout. Khối
              này từng viết tại chỗ bằng `animate-pulse`; nay đi qua
              `ui/skeleton.tsx` để sáu màn còn lại dùng chung một hình dạng, và
              để `prefers-reduced-motion` được tôn trọng ở đúng một nơi. */}
          <Skeleton className="mt-2 min-h-96" />
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
        renderGrid(
          view,
          vehicles,
          rentals.data.rentals,
          gridWindow,
          (r) => {
            setChanged(null);
            setSelectedId(r.id);
          },
          showDay,
        )}

      {selected && (
        <RentalDetailSheet
          rental={selected}
          vehicle={vehicles.find((v) => v.id === selected.vehicleId)}
          onClose={() => setSelectedId(null)}
          /*
           * ⚠️ `onChanged` KHÔNG gỡ sheet nữa — chỉ `onClose` mới được làm việc đó.
           *
           * Gỡ ở đây là gỡ `<dialog>` thẳng khỏi cây, không đi qua
           * `dialog.close()`, tức đúng đường mà `ui/modal.tsx` ghi thành luật là
           * làm mất hiệu ứng ra. Đo được trên bản build trước khi sửa: sheet còn
           * ở t=585ms và biến mất ở t=620ms, trong khi hiệu ứng ra 180ms lẽ ra
           * phải giữ nó tới ~780ms.
           *
           * Nay `rental-detail-sheet.tsx` tự gọi `close` sau khi vòng sáng chạy
           * hết nhịp; `close` bắn event `close` của `<dialog>`, `Modal` chờ hiệu
           * ứng ra xong rồi mới gọi `onClose` — và `onClose` mới là chỗ
           * `setSelectedId(null)`. Thứ tự: vòng sáng → hiệu ứng ra → gỡ.
           */
          onChanged={(to: RentalStatus) => {
            setChanged(`Đã cập nhật: ${STATUS_LABEL[to].toLowerCase()}.`);
          }}
        />
      )}
    </div>
  );
}
