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
 * `CANCELLED` KHÔNG còn là nhánh chết. Trên lịch thì đúng là nó không tới được
 * (`GET /rentals` lọc `status <> 'CANCELLED'`, xem `apps/api/src/services/rentals.ts`),
 * nhưng `customer-rental-history.tsx` cố ý hiện CẢ đơn đã huỷ — đó là một phần
 * thật của quan hệ với khách — nên từ đợt này nhánh đó được render thật.
 *
 * Nó dùng chung tông xám của `completed`, và đó vẫn là lựa chọn đúng: hai
 * trạng thái này là hai cách KẾT THÚC, không còn việc gì để làm với chúng, nên
 * chúng phải lùi lại phía sau. Phân biệt bằng nhãn ("Đã trả" vs "Đã huỷ"),
 * không bằng màu — bịa thêm token màu thứ năm là phá đúng thứ mà đầu
 * `index.css` mua được bằng cách đo contrast cho bốn token hiện có.
 *
 * Vẫn map đủ bốn nhánh để `Record<RentalStatus, string>` biên dịch: thiếu một
 * nhánh là lỗi biên dịch, không phải một status lặng lẽ không có màu.
 */
const STATUS_CLASS: Record<RentalStatus, string> = {
  // "Đã đặt" tô nền NHẠT + viền (không phải nền đặc) — đúng cách `index.css`
  // ghi: phân biệt BOOKED/ONGOING bằng CÁCH TÔ, không bằng độ sáng.
  BOOKED: "border border-status-booked bg-status-booked/15 text-status-booked",
  ONGOING: "bg-status-ongoing text-accent-ink",
  COMPLETED: "bg-status-completed text-accent-ink",
  CANCELLED: "bg-status-completed text-accent-ink",
};

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
 * Hai vị từ, MỘT màu — và đó là chủ ý, không phải lười đặt token:
 *
 * - `isOverdue` = ONGOING quá `endsAt` → xe đang nằm ngoài đường quá hạn trả.
 * - `isPickupOverdue` = BOOKED quá `startsAt` → khách chưa tới lấy, hoặc (đắt
 *   hơn nhiều) nhân viên đã giao xe mà quên bấm "đã giao".
 *
 * `status-overdue` không có nghĩa "trễ hẹn trả"; nó có nghĩa "dòng này cần một
 * con người xử lý NGAY", và cả hai ca đều đúng như vậy. Phân biệt hai ca bằng
 * NHÃN chứ không bằng màu: chip đỏ ghi "Đang thuê" là xe trễ về, chip đỏ ghi
 * "Đã đặt" là chưa ai lấy xe — `STATUS_LABEL` đã nói rõ. Thêm token màu thứ
 * năm thì phải đo lại contrast (xem đầu `index.css`: bốn token hiện có đều
 * được đo trước khi dùng), mà nó chỉ mã hoá lại thứ nhãn đã nói.
 *
 * Thứ tự kiểm không ảnh hưởng kết quả: hai vị từ lọc hai `status` khác nhau
 * nên loại trừ nhau — tính chất đó được khoá bằng test ở `rental.test.ts`.
 *
 * Hệ quả CÓ Ý trên lịch: một `BOOKED` đã qua giờ hẹn giờ tô đỏ ở cả timeline
 * lẫn lịch tháng, không riêng màn Khách hàng. Đối xứng với hành vi sẵn có của
 * `isOverdue` (một ONGOING quá hạn cũng đỏ mãi cho tới khi ai đó đóng đơn), và
 * lịch mới là màn hình mà nhân viên nhìn nhiều nhất trong ca.
 */
export function rentalChipClass(
  rental: { status: RentalStatus; startsAt: Date; endsAt: Date },
  now: Date,
): string {
  if (isOverdue(rental, now) || isPickupOverdue(rental, now)) {
    return "bg-status-overdue text-accent-ink";
  }
  return STATUS_CLASS[rental.status];
}
