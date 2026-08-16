import { RentalCalendar } from "../components/rentals/rental-calendar";

/**
 * Lắp lại, không tự dựng — `RentalCalendar` (Task 6) sở hữu toàn bộ state (URL),
 * fetch, điều hướng khoảng, nút chuyển chế độ, và ba trạng thái tải/lỗi/rỗng.
 * Trang này chỉ còn tiêu đề, cùng khuôn `pages/stats-page.tsx`.
 */
export function CalendarPage() {
  // `<div>`, không `<main>` — `AppShell` đã có một `<main>` bọc ngoài rồi (xem
  // comment cùng lý do ở `pages/stats-page.tsx`).
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">Lịch</h1>
      <RentalCalendar />
    </div>
  );
}
