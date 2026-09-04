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
      {/*
        `sr-only` ở màn hẹp, hiện lại từ `md`.
        
        Ở 390px đầu trang Lịch từng ăn 168/780px = 22% chiều cao màn hình, trong
        khi phần dưới nó là một lưới thời gian phải cuộn ngang mới đọc hết. Đòn
        bẩy kỹ thuật đã cạn: `ToggleGroup` là flex item không xẻ được, cần trọn
        ~150px, nên toolbar buộc phải xuống hai hàng.
        
        Tiêu đề này là thứ DƯ THỪA duy nhất còn lại: bottom nav đã gắn nhãn "Lịch"
        cho chính tab đang mở, ngay dưới đáy màn hình, nên chữ "Lịch" ở đỉnh trang
        nói lại một điều người dùng vừa đọc.
        
        `sr-only` chứ KHÔNG `hidden`: cấu trúc tiêu đề của tài liệu phải còn
        nguyên cho trình đọc màn hình — bottom nav thay được kênh THỊ GIÁC, không
        thay được `<h1>`. Đây cũng là lý do nó không bị xoá hẳn.
      */}
      <h1 className="sr-only text-xl font-bold text-ink md:not-sr-only">Lịch</h1>
      <RentalCalendar />
    </div>
  );
}
