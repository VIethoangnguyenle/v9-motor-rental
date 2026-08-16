/**
 * Placeholder tối thiểu — Task 4–6 của Plan C (`docs/plans/2026-08-16-staff-stats-calendar-plan.md`)
 * mới dựng lịch thật (`calendar-timeline.tsx`, `calendar-month.tsx`, `rental-calendar.tsx`).
 *
 * Route `/calendar` được đăng ký SỚM, ở Task 3, chỉ để dòng "cần chú ý" trên màn
 * Thống kê (`components/stats/attention-list.tsx`) có một đích BẤM ĐƯỢC thật —
 * yêu cầu #6 của Task 3: "một con số không bấm được thì chủ shop phải tự đi
 * tìm". Không đăng ký route thì `<Link to="/calendar">` không biên dịch được
 * (TanStack Router chặn đích không nằm trong route tree, xem `tsc` khi thử).
 *
 * Mục "Lịch" ở `AppNav` vẫn `kind: "soon"` (vô hiệu hoá) — MỞ KHOÁ nó là việc
 * của Task 6, không phải ở đây. Route tồn tại không có nghĩa màn hình đã xong.
 */
export function CalendarPage() {
  // `<div>`, không `<main>` — `AppShell` đã có một `<main>` bọc ngoài rồi (xem
  // comment cùng lý do ở `pages/stats-page.tsx`).
  return (
    <div>
      <h1 className="text-lg font-bold text-ink">Lịch</h1>
      <p className="mt-2 text-sm text-muted">
        Đang xây — xem lịch xe theo hàng/ngày sẽ có ở đây. Trong lúc chờ, số liệu quá hạn và trả
        hôm nay đọc được từ màn Thống kê.
      </p>
    </div>
  );
}
