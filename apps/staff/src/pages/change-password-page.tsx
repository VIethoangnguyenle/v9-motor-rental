import { ChangePasswordForm } from "../components/auth/change-password-form";
import { PageShell } from "../components/ui/page-shell";

export function ChangePasswordPage() {
  return (
    <PageShell title="Đổi mật khẩu">
      <p className="mt-2 text-sm text-muted">
        Đổi xong bạn sẽ bị đăng xuất và phải đăng nhập lại bằng mật khẩu mới.
      </p>

      <ChangePasswordForm />
    </PageShell>
  );
}
