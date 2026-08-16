import { isOverdue, type RentalStatus } from "@v9/shared/domain/rental";
import type { CalendarRental } from "./rentals";

/**
 * Nhãn + màu hiển thị cho một đơn thuê trên lịch — DÙNG CHUNG giữa
 * `calendar-timeline.tsx` và `calendar-month.tsx` để hai màn hình không lệch
 * màu/chữ cho cùng một trạng thái. Từng viết hai bản riêng lúc nháp đầu; gộp
 * lại đây vì đó chính là kiểu "bản sao thứ hai sẽ lệch" mà CLAUDE.md cảnh báo,
 * chỉ khác ở tầng trình bày thay vì tầng domain.
 */
export const STATUS_LABEL: Record<RentalStatus, string> = {
  BOOKED: "Đã đặt",
  ONGOING: "Đang thuê",
  COMPLETED: "Đã trả",
  CANCELLED: "Đã huỷ",
};

/**
 * `CANCELLED` không bao giờ tới được đây trên thực tế — `GET /rentals` lọc
 * `status <> 'CANCELLED'` (`apps/api/src/services/rentals.ts`), nên nó không
 * nằm trong `CalendarRental[]`. Vẫn map đủ bốn nhánh để `Record<RentalStatus,
 * string>` biên dịch (thiếu một nhánh là lỗi biên dịch, không phải một status
 * lặng lẽ không có màu); mượn tông `completed` (xám) cho nhánh không thể xảy
 * ra này thay vì bịa thêm một token màu ngoài bốn cái `index.css` đã khai.
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
 * Class Tailwind cho nền/chữ của một thanh/chip đơn thuê trên lịch.
 *
 * "Quá hạn" tính bằng `isOverdue()` (`@v9/shared/domain/rental`) — MỘT định
 * nghĩa, API và UI dùng chung — rồi GHI ĐÈ lên màu trạng thái gốc. Nó không
 * phải một nhánh của `status`, nên không nằm trong `STATUS_CLASS`; viết lại
 * điều kiện "quá hạn" bằng tay ở đây là đúng lỗi mà `isOverdue` sinh ra để
 * tránh.
 */
export function rentalChipClass(rental: CalendarRental, now: Date): string {
  if (isOverdue(rental, now)) return "bg-status-overdue text-accent-ink";
  return STATUS_CLASS[rental.status];
}
