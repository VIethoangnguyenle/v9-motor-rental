import { ChangePasswordForm } from "../components/auth/change-password-form";

/**
 * ⚠️ KHÔNG dùng `ui/page-shell.tsx` ở đây, dù sáu màn xác thực đều dùng.
 *
 * `PageShell` là khung của một trang ĐỨNG NGOÀI `AppShell`: nó render
 * `<main class="min-h-screen bg-canvas">` bọc `page-gutter py-6`. Bốn thứ đó
 * đúng cho `/login` · `/signup` · `/forgot-password` · `/pending-approval` —
 * chúng treo dưới `publicLayoutRoute` nên không có khung nào bên ngoài.
 *
 * `/change-password` thì treo dưới `protectedLayoutRoute` (lý lẽ ở `router.tsx`:
 * nó gọi một endpoint đòi session + hồ sơ ACTIVE), tức nằm TRONG `AppShell`. Ở
 * đó cả bốn đều sai, không chỉ cái `<main>`:
 *   • `<main>` thứ hai — hai landmark cho cùng một nội dung;
 *   • `min-h-screen` — ép cao bằng cả màn hình bên trong một vùng đã cuộn;
 *   • `bg-canvas` · `page-gutter` · `py-6` — `AppShell` đã lo cả ba.
 * Đo được trước khi sửa: `document.querySelectorAll("main").length` ra **2** ở
 * đúng route này và **1** ở mọi route khác trong shell.
 *
 * Vì vậy KHÔNG thêm prop chọn thẻ bao cho `PageShell`: một prop chỉ chữa được
 * cái thứ nhất trong bốn, và đổi lấy một component mang hai tính cách. Trang
 * này tự dựng cột hẹp — đúng ba dòng, và đọc ra giống hệt sáu trang anh em
 * trong shell.
 *
 * `max-w-sm` KHÔNG kèm `mx-auto`: canh giữa là cử chỉ của một trang đứng một
 * mình. Trong shell, cột hẹp bám lề trái — cùng khuôn ô tìm kiếm ở
 * `customers-list-page.tsx`.
 *
 * Không `gap-*`: nhịp dọc do chính các con giữ (`mt-2` ở `<p>`, `mt-4` ở
 * `<form>`), y như bản `PageShell` cũ — đổi sang `gap` là cộng thêm một tầng
 * khoảng cách nữa lên `mt-4` sẵn có của form.
 */
export function ChangePasswordPage() {
  return (
    <div className="max-w-sm">
      <h1 className="text-xl font-bold text-ink">Đổi mật khẩu</h1>
      <p className="mt-2 text-sm text-muted">
        Đổi xong bạn sẽ bị đăng xuất và phải đăng nhập lại bằng mật khẩu mới.
      </p>

      <ChangePasswordForm />
    </div>
  );
}
