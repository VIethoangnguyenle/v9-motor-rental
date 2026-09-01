import { isOverdue, isPickupOverdue, type RentalStatus } from "@v9/shared/domain/rental";
import type { IconName } from "../components/ui/icon";

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
  BOOKED: "border border-status-booked bg-status-booked-soft text-status-booked",
  ONGOING: "bg-status-ongoing text-accent-ink",
  COMPLETED: "bg-status-completed text-accent-ink",
  CANCELLED: "border border-status-completed bg-status-completed-soft text-status-completed",
};
/** Xe đang nằm ngoài đường quá hạn trả. Nền ĐẶC — 5,41:1 với chữ trắng. */
const OVERDUE_CLASS = "bg-status-overdue text-accent-ink";

/**
 * Chưa ai lấy xe dù đã qua giờ hẹn. Cùng HUE đỏ, khác CÁCH TÔ.
 *
 * ⚠️ **Chip này từng KHÔNG có nền, và lý do đó đã hết hiệu lực.** Bản trước ghi:
 * dùng `overdue` làm chữ trên chính nó pha 15% chỉ đạt 4,03:1 nên phải bỏ lớp
 * nền. Số đó đúng — nhưng nó là số của một cách tô ĐÃ BỊ THAY: nền pha alpha
 * không còn tồn tại trong app, mọi mảng tô nhạt nay là token đặc `*-soft`
 * (`index.css`). Trên `status-overdue-soft`, `text-status-overdue` đo được
 * **4,78:1** — qua AA có biên. Ràng buộc duy nhất giữ chip này khỏi bộ khuôn
 * chung đã biến mất, nên nó quay về đúng khuôn của BOOKED: viền + nền nhạt +
 * chữ. Đó cũng là điều nó VỐN LÀ — một đơn `BOOKED`, chỉ là trễ.
 *
 * Hai chiều nghĩa vẫn nguyên vẹn, và đó mới là thứ phải giữ:
 *   • CÁCH TÔ = xe đã rời cửa hàng chưa. Nhạt + viền (còn trong shop) vs đặc
 *     (đang ngoài đường). Nền `soft` ở L96% vẫn nhẹ hơn nền đặc rất xa, nên thứ
 *     tự ưu tiên khi quét mắt không đổi — và mâu thuẫn với con số "N xe quá hạn
 *     chưa trả" ở Trang chủ vẫn được dập tắt như cũ.
 *   • HUE = có cần người xử lý không.
 *
 * Cách tự kiểm: tô màu vào `<canvas>` rồi đọc pixel — đừng đọc
 * `getComputedStyle().color`, Chromium trả nguyên chuỗi `oklch()` chứ không quy
 * về sRGB và một parser ngây thơ cho ra 16,69:1 cho một cặp thật ra là 4,38:1.
 * Hiệu chuẩn bằng cách tái lập các số `index.css` đã công bố trước khi tin số mới.
 */
const PICKUP_OVERDUE_CLASS =
  "border border-status-overdue bg-status-overdue-soft text-status-overdue";

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
 * Kênh thông tin THỨ HAI, bên cạnh màu. Không phải trang trí.
 *
 * `docs/plans/2026-09-01-staff-visual-system-design.md` §2.5 đo được: dưới
 * deuteranopia (~6% nam giới), `status-overdue` và `warning` chỉ cách nhau
 * ΔE≈0,040 — coi như cùng một màu. Một cuộc quét vét cạn L∈[0,50;0,80] ×
 * hue∈[60;105] cho kết quả RỖNG: không giá trị nào thoả đồng thời "chữ trắng
 * ≥4,5:1" và "phân biệt được ở cả bốn kiểu nhìn". Hai ràng buộc chọi nhau.
 *
 * §2.5b còn cho thấy đây không phải một cặp cá biệt: cả sáu trạng thái đều tô
 * nền đặc + chữ trắng, nên ràng buộc tương phản ghim chúng vào dải L rộng ~0,14
 * đơn vị, và mù màu xoá hue thì chỉ còn đúng độ sáng đó để chia cho sáu màu.
 * Hình dạng vì vậy gánh cho MỌI cặp cùng lúc, không riêng cặp nào.
 *
 * Chọn theo ĐỘ KHÁC NHAU CỦA HÌNH (tam giác / tròn / vuông / dấu kiểm / chữ
 * thập / khung xe), không theo mức dễ thương của biểu tượng — chúng phải phân
 * biệt được khi màu biến mất hoàn toàn.
 *
 * `status-icon.test.ts` canh tính duy nhất: hai trạng thái dùng chung một hình
 * là test ĐỎ. Đừng gộp, kể cả khi hai hình đó "gần nghĩa".
 */
export const STATUS_ICON = {
  /** Lịch — đơn còn nằm trên giấy, xe chưa rời shop. Khung vuông có lưới. */
  BOOKED: "nav-calendar",
  /**
   * Khung xe — xe đã rời shop. Khác `COMPLETED` tới mức không thể lẫn, và đó là
   * cặp §2.5b gọi là nguy hiểm nhất trong bảng: `ONGOING` với `COMPLETED` đều
   * tô nền ĐẶC và đứng CẠNH NHAU trong bảng lịch sử thuê của một khách quen.
   */
  ONGOING: "nav-handover",
  /** Dấu kiểm — nét hở, đối cực hình học của tam giác KÍN `OVERDUE` (§2.5c). */
  COMPLETED: "check",
  /**
   * Chữ thập, và đây là hình YẾU NHẤT trong bảng — nói ra thay vì khai là nó
   * tách bạch. `check` với `close` là hai hình DUY NHẤT ở đây không có đường
   * bao (một nét gấp, hai nét chéo), nên khi màu biến mất chúng chỉ còn khác
   * nhau ở hướng nét, chứ không khác ở silhouette như bốn hình còn lại.
   *
   * Chưa phải vấn đề đang sống: `CANCELLED` không lên lịch (xem `STATUS_CLASS`
   * ở trên), mà lịch là mặt DUY NHẤT vẽ hình trạng thái, nên hôm nay hai hình
   * này chưa từng đứng cùng một danh sách. Ngày `CANCELLED` lên lịch thì đây là
   * ô phải xem lại trước tiên.
   */
  CANCELLED: "close",
  /** ONGOING quá `endsAt` — xe đang ngoài đường, quá hạn trả. Tam giác. */
  OVERDUE: "alert-triangle",
  /** BOOKED quá `startsAt` — chưa ai lấy xe. Tròn. */
  PICKUP_OVERDUE: "clock",
} as const satisfies Record<string, IconName>;

/**
 * Hình cho một đơn thuê CỤ THỂ — khác `STATUS_ICON` ở trên, vốn chỉ là bảng tra
 * theo khoá. Hai trạng thái phái sinh (`OVERDUE`, `PICKUP_OVERDUE`) không nằm
 * trong `rental.status`; chúng suy ra từ `now`, nên phải có một hàm suy.
 *
 * Nhận CÙNG hình dạng tham số và gọi CÙNG hai vị từ với `rentalChipClass` ngay
 * trên. Đó không phải trùng lặp mà là ràng buộc: hai hàm quyết định HÌNH và MÀU
 * cho cùng một thanh đơn, nên chúng phải đồng ý về "quá hạn là gì". Lệch nhau
 * cho ra thanh đỏ mang hình xanh — hai kênh mâu thuẫn, tệ hơn hẳn một kênh
 * thiếu.
 *
 * Thứ tự hai `if` KHÔNG phải thứ đang giữ an toàn, đừng đọc nó như vậy: hai vị
 * từ lọc hai `status` RỜI NHAU (`ONGOING` và `BOOKED`) nên đảo thứ tự là no-op
 * — cùng điều `rentalChipClass` ngay trên đã ghi. Thứ giữ an toàn là dùng chung
 * hai vị từ đó và chung một `now`, và nó được ÉP chứ không phải hứa: test song
 * ánh ở `status-icon.test.ts` đỏ khi thêm một nhánh màu phái sinh mà quên thêm
 * nhánh hình tương ứng.
 *
 * Gọi lại `isOverdue`/`isPickupOverdue` của domain thay vì tự so `endsAt < now`
 * cũng vì thế, và nó chặn luôn cái bẫy `COMPLETED`: một đơn đã trả gần như luôn
 * có `endsAt` trong quá khứ, nên luật viết tay sẽ gán nó thành OVERDUE.
 * `isOverdue` đã lọc theo `status === "ONGOING"` nên nhánh đó không tới được.
 * Ca này khoá ở `status-icon.test.ts`.
 */
export function statusIconOf(
  rental: { status: RentalStatus; startsAt: Date; endsAt: Date },
  now: Date,
): IconName {
  if (isOverdue(rental, now)) return STATUS_ICON.OVERDUE;
  if (isPickupOverdue(rental, now)) return STATUS_ICON.PICKUP_OVERDUE;
  return STATUS_ICON[rental.status];
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
