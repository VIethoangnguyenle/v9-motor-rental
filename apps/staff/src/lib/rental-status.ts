import { isOverdue, isPickupOverdue, type RentalStatus } from "@v9/shared/domain/rental";

/**
 * Nhãn + màu hiển thị cho một đơn thuê — DÙNG CHUNG giữa `calendar-timeline.tsx`,
 * `calendar-month.tsx`, `customers/customer-table.tsx` và
 * `customers/customer-rental-history.tsx`, để bốn chỗ không lệch màu/chữ cho
 * cùng một trạng thái. Từng viết hai bản riêng lúc nháp đầu; gộp lại đây vì đó
 * chính là kiểu "bản sao thứ hai sẽ lệch" mà CLAUDE.md cảnh báo, chỉ khác ở
 * tầng trình bày thay vì tầng domain.
 */
export const STATUS_LABEL: Record<RentalStatus, string> = {
  BOOKED: "Đã đặt",
  ONGOING: "Đang thuê",
  COMPLETED: "Đã trả",
  CANCELLED: "Đã huỷ",
};

/**
 * Nhãn cho HÀNH ĐỘNG đưa đơn TỚI trạng thái đó — khác `STATUS_LABEL` ở trên, vốn
 * là tên của chính trạng thái. "Đã trả" là một tình trạng; "Đã nhận lại xe" là
 * việc nhân viên vừa làm xong và đang bấm để ghi nhận.
 *
 * `BOOKED` không có nhãn vì không đường hợp lệ nào DẪN TỚI `BOOKED`
 * (`availableTransitions` ở `@v9/shared/domain/rental` không bao giờ trả nó ra) —
 * nhưng `Record` vẫn bắt đủ bốn nhánh, nên thêm một trạng thái mới mà quên nhãn
 * là lỗi biên dịch, cùng khuôn `STATUS_LABEL`.
 */
export const TRANSITION_LABEL: Record<RentalStatus, string> = {
  BOOKED: "Đưa về đã đặt",
  ONGOING: "Đã giao xe",
  COMPLETED: "Đã nhận lại xe",
  CANCELLED: "Huỷ đơn",
};

/**
 * `CANCELLED` KHÔNG còn là nhánh chết. Trên lịch thì đúng là nó không tới được
 * (`GET /rentals` lọc `status <> 'CANCELLED'`, xem `apps/api/src/services/rentals.ts`),
 * nhưng `customer-rental-history.tsx` cố ý hiện CẢ đơn đã huỷ — đó là một phần
 * thật của quan hệ với khách — nên từ đợt này nhánh đó được render thật.
 *
 * Vì vậy nó KHÔNG còn được mượn nguyên màu của `COMPLETED` nữa. Trước đợt này
 * cột trạng thái của bảng lịch sử là CHỮ TRẦN, nên người đọc buộc phải đọc chữ;
 * giờ màn hình dạy rằng màu có nghĩa, mà lại im lặng đúng ở cặp này thì tệ hơn
 * là không tô màu. Hai trạng thái vẫn cùng HUE xám (cả hai đều là "đã xong,
 * không còn việc gì") nhưng khác CÁCH TÔ — đúng luật `index.css` đã tự viết cho
 * cặp booked/ongoing: "phân biệt bằng CÁCH TÔ, không bằng độ sáng".
 *
 * Không có token màu thứ năm nào được thêm.
 */
const STATUS_CLASS: Record<RentalStatus, string> = {
  // "Đã đặt" tô nền NHẠT + viền (không phải nền đặc) — đúng cách `index.css`
  // ghi: phân biệt BOOKED/ONGOING bằng CÁCH TÔ, không bằng độ sáng.
  BOOKED: "border border-status-booked bg-status-booked/15 text-status-booked",
  ONGOING: "bg-status-ongoing text-accent-ink",
  COMPLETED: "bg-status-completed text-accent-ink",
  // Đo lại đúng vai trò mới (token làm CHỮ trên chính nó pha 15% trên nền
  // trang), không chép số của vai trò cũ: 5,44:1 trên canvas · 5,70:1 trên
  // surface — qua AA chữ thường (4,5:1) có biên. Cách đo và cách tự kiểm ở
  // comment `PICKUP_OVERDUE_CLASS` bên dưới.
  CANCELLED: "border border-status-completed bg-status-completed/15 text-status-completed",
};
/** Xe đang nằm ngoài đường quá hạn trả. Nền ĐẶC — 5,41:1 với chữ trắng. */
const OVERDUE_CLASS = "bg-status-overdue text-accent-ink";

/**
 * Chưa ai lấy xe dù đã qua giờ hẹn. Cùng HUE đỏ, khác CÁCH TÔ.
 *
 * KHÔNG có `bg-status-overdue/15` như chip BOOKED, và đây là chỗ duy nhất trong
 * bộ chip lệch khỏi khuôn "viền + nền 15%". Lý do là một PHÉP ĐO, không phải
 * thẩm mỹ: token `overdue` sáng và bão hoà hơn `booked` (L55% C0.21 vs L50%
 * C0.09), nên dùng nó làm CHỮ trên chính nó pha 15% chỉ đạt **4,03:1** — trượt
 * AA chữ thường (4,5:1). Bỏ lớp nền pha đó đưa lên **5,19:1** trên canvas và
 * 5,41:1 trên surface.
 */
const PICKUP_OVERDUE_CLASS = "border border-status-overdue text-status-overdue";

/**
 * Class Tailwind cho nền/chữ của một thanh/chip đơn thuê.
 *
 * Tham số là STRUCTURAL `{ status; startsAt; endsAt }` chứ không phải
 * `CalendarRental`: màn Khách hàng cũng cần đúng bộ màu này cho `activeRental`,
 * và đó là một hình dạng hẹp hơn (`{ id, status, startsAt, endsAt }`). Đây là
 * NỚI, không phải phá — hợp của ba tham số đúng bằng hợp của `isOverdue` và
 * `isPickupOverdue`, nên không có định nghĩa "quá hạn" thứ hai nào sinh ra ở
 * tầng trình bày.
 *
 * MỘT token đỏ, HAI cách tô — và sự khác biệt đó phải nằm ở CÁCH TÔ chứ không
 * thể nằm ở nhãn:
 *
 * - `isOverdue` = ONGOING quá `endsAt` → xe đang ngoài đường quá hạn trả → ĐẶC.
 * - `isPickupOverdue` = BOOKED quá `startsAt` → chưa ai lấy xe, hoặc (đắt hơn
 *   nhiều) nhân viên đã giao mà quên bấm "đã giao" → VIỀN.
 *
 * ⚠️ Bản đầu của đợt này tô CẢ HAI bằng nền đặc và biện hộ rằng `STATUS_LABEL`
 * phân biệt giúp. Lập luận đó ĐÚNG trên hai màn Khách hàng và SAI trên lịch:
 * `calendar-timeline.tsx` in `customerName` trong thanh, `calendar-month.tsx`
 * in tên xe, còn `STATUS_LABEL` chỉ nằm trong `title=` — tức CHỈ hiện khi hover,
 * mà `apps/staff` là PWA dùng trên điện thoại và ở đó KHÔNG có hover. Một thanh
 * đỏ trên lịch khi đó không đọc được là "trễ trả" hay "chưa ai lấy" nếu không
 * chạm vào nó.
 *
 * Nó còn mâu thuẫn với màn Trang chủ: `stats.ts` đếm `overdue` bằng đúng
 * `status = 'ONGOING' AND ends_at < now` (tức chỉ `isOverdue`), rồi
 * `attention-list.tsx` hiện "N xe quá hạn chưa trả" kèm chấm đỏ và LINK THẲNG
 * sang `/calendar`. Bấm vào "3 xe quá hạn chưa trả" mà thấy năm thanh đỏ y hệt
 * nhau là một mâu thuẫn có thật, không phải chuyện thẩm mỹ.
 *
 * Cách tô mang nghĩa "xe đã rời cửa hàng chưa" (BOOKED viền vs ONGOING đặc —
 * luật `index.css` tự viết), còn hue mang nghĩa "có cần người xử lý không".
 * Hai chiều VUÔNG GÓC nhau, và đọc được cả hai mà không cần hover. Hệ quả là
 * đỏ-viền quét mắt thấy nhẹ hơn đỏ-đặc: đó là ĐÚNG thứ tự ưu tiên (xe ngoài
 * đường hơn xe còn trong shop), và cũng chính là thứ dập tắt mâu thuẫn với
 * con số ở Trang chủ.
 *
 * Thứ tự kiểm không ảnh hưởng kết quả: hai vị từ lọc hai `status` khác nhau
 * nên loại trừ nhau — khoá bằng test ở `rental.test.ts`, và toàn bộ ma trận
 * 4 status × 4 quan hệ thời gian khoá ở `rental-status.test.ts`.
 */
export function rentalChipClass(
  rental: { status: RentalStatus; startsAt: Date; endsAt: Date },
  now: Date,
): string {
  if (isOverdue(rental, now)) return OVERDUE_CLASS;
  if (isPickupOverdue(rental, now)) return PICKUP_OVERDUE_CLASS;
  return STATUS_CLASS[rental.status];
}

/**
 * Mốc CUỐI CÙNG còn nằm trong đơn, suy ra từ `endsAt` — vốn là biên MỞ.
 *
 * `[startsAt, endsAt)` là hợp đồng của cả DB (`tstzrange '[)'`), domain
 * (`packages/shared/src/domain/interval.ts`) lẫn form lên đơn (`toApiRange` ở
 * `rental-form.tsx` lưu `endsAt` = nửa đêm giờ VN của ngày SAU ngày cuối). Hiện
 * thẳng `endsAt` ra màn hình vì vậy là hiện SAI MỘT NGÀY: đơn "20/08 → 22/08"
 * đọc thành "Trả 00:00 23-08", và bảng lịch sử in "20/08/2026 – 23/08/2026".
 *
 * Lùi một mili-giây, **không** trừ 24 giờ: `endsAt` không phải lúc nào cũng rơi
 * vào nửa đêm — `scripts/seed-dev.ts:328` cố ý tạo một đơn quá hạn với
 * `ends_at` lệch 2 giờ để thanh đỏ còn giao với cửa sổ lịch đang xem, và API
 * nhận instant bất kỳ. Trừ theo NGÀY sẽ lùi đúng những đơn đó sai hẳn một ngày;
 * lùi một mili-giây đúng ở mọi giờ, và không phụ thuộc việc múi giờ shop có DST
 * hay không.
 *
 * Trả `Date` chứ không phải chuỗi đã format: ba chỗ gọi cần ba khuôn khác nhau —
 * `rental-detail-sheet.tsx` và `customer-rental-history.tsx` hiện `dd/MM/yyyy`,
 * `customer-table.tsx` hiện `HH:mm dd-MM` vì ở đó GIỜ là thông tin thật (đơn quá
 * hạn lệch giờ ở trên chính là ca đó). Trả chuỗi là ép cả ba dùng chung một khuôn.
 */
export function lastMomentOf(endsAt: Date): Date {
  return new Date(endsAt.getTime() - 1);
}
