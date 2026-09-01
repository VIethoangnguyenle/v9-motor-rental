/**
 * State ở URL của trang Lịch, và số học Y-M-D thuần mà nó cần để kiểm.
 *
 * Tách khỏi `components/rentals/rental-calendar.tsx` vì một lý do ĐO ĐƯỢC, không
 * phải vì gọn: `router.tsx` phải import `validateCalendarSearch` lúc khai route,
 * nên chừng nào hàm đó còn nằm chung file với component, mọi thứ component ấy
 * import — `CalendarTimeline`, `CalendarMonth`, `RentalDetailSheet`,
 * `HandoverPhotos`, `HandoverDetails` — đều bị kéo vào chunk chính, kể cả khi
 * route được khai `lazyRouteComponent`. Tức code splitting KHÔNG có tác dụng gì.
 *
 * Đây cũng là chỗ mà chính `rental-calendar.tsx` đã nói nó thuộc về: comment ở
 * đó ghi "đặt ở đây (component file) thay vì một file `lib/` riêng (khuôn thật
 * của `LOGIN_REASONS`) vì phạm vi Task 6 chỉ cho tạo đúng một file mới". Ràng
 * buộc đó hết hiệu lực từ lâu. Nay khuôn khớp `lib/customers-search.ts`.
 */

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

export const DEFAULT_VIEW: CalendarView = "timeline";

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

// ── Y-M-D: số học lịch THUẦN, không phụ thuộc múi giờ ───────────────────────
//
// `Date.UTC` tự chuẩn hoá tràn tháng/năm/ngày — an toàn để cộng số nguyên tuỳ ý.
// Việc quy đổi Y-M-D ↔ instant theo giờ shop KHÔNG ở đây: nó cần `SHOP_TIMEZONE`
// và thuộc về `rental-calendar.tsx`, nơi chọn khoảng đang xem.

export interface Ymd {
  readonly year: number;
  readonly month: number; // 1-based
  readonly day: number;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function ymdToString(ymd: Ymd): string {
  const pad = (n: number, len: number) => String(n).padStart(len, "0");
  return `${pad(ymd.year, 4)}-${pad(ymd.month, 2)}-${pad(ymd.day, 2)}`;
}

/** `null` khi KHÔNG phải một ngày lịch thật — sai hình dạng (`"hôm nay"`, chuỗi
 *  rỗng) hoặc đúng hình dạng nhưng sai ngày (`2026-13-45`, `2026-02-30`).
 *  `Date.UTC` tự "lăn" ngày tràn thành một ngày khác thay vì báo lỗi, nên phải
 *  tự kiểm biên tháng/ngày TRƯỚC khi tin chuỗi input. */
export function parseYmd(raw: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}
