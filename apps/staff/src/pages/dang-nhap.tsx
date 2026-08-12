import { Link, useSearch } from "@tanstack/react-router";
import { LoginForm } from "../components/auth/login-form";
import { Alert } from "../components/ui/alert";
import { PageShell } from "../components/ui/page-shell";

export function DangNhapPage() {
  // `strict: false` để trang không phải import ngược `router.tsx` (chu trình
  // module). Giá trị đã được `validateSearch` của route lọc còn đúng danh sách
  // trắng — chỉ "disabled" | "no-profile" | "password-changed" | undefined.
  const search = useSearch({ strict: false });

  return (
    <PageShell title="Đăng nhập">
      {search.ly_do === "disabled" && (
        <div className="mt-3">
          <Alert tone="warning">Tài khoản của bạn đã bị khoá. Liên hệ chủ shop.</Alert>
        </div>
      )}
      {search.ly_do === "no-profile" && (
        <div className="mt-3">
          <Alert tone="warning">
            Tài khoản chưa có hồ sơ nhân viên. Liên hệ chủ shop để được tạo hồ sơ.
          </Alert>
        </div>
      )}

      <LoginForm />

      <div className="mt-4 flex justify-between text-sm">
        <Link to="/dang-ky" className="underline">
          Tạo tài khoản
        </Link>
        <Link to="/quen-mat-khau" className="underline">
          Quên mật khẩu
        </Link>
      </div>
    </PageShell>
  );
}
