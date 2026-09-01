import { Link, useSearch } from "@tanstack/react-router";
import { LoginForm } from "../components/auth/login-form";
import { Alert } from "../components/ui/alert";
import { PageShell } from "../components/ui/page-shell";

export function LoginPage() {
  // `strict: false` để trang không phải import ngược `router.tsx` (chu trình
  // module). Giá trị đã được `validateSearch` của route lọc còn đúng danh sách
  // trắng — chỉ "disabled" | "no-profile" | "password-changed" | undefined.
  const search = useSearch({ strict: false });

  return (
    <PageShell title="Đăng nhập">
      {search.reason === "disabled" && (
        <div className="mt-3">
          <Alert tone="warning">Tài khoản của bạn đã bị khoá. Liên hệ chủ shop.</Alert>
        </div>
      )}
      {search.reason === "no-profile" && (
        <div className="mt-3">
          <Alert tone="warning">
            Tài khoản chưa có hồ sơ nhân viên. Liên hệ chủ shop để được tạo hồ sơ.
          </Alert>
        </div>
      )}
      {search.reason === "password-changed" && (
        <div className="mt-3">
          <Alert tone="info">Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.</Alert>
        </div>
      )}

      <LoginForm />

      {/* `flex min-h-11 items-center` trên CHÍNH thẻ link, không phải trên hàng
          bọc: hàng cao 44px mà link vẫn là một line box 20px thì vùng chạm không
          đổi — đo được 96 × 20 px ở bản trước. Đây là màn hình đầu tiên của một
          PWA dùng bằng một tay, nên hai lối đi duy nhất ra khỏi nó phải bấm
          trúng được. */}
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/signup" className="flex min-h-11 items-center underline">
          Tạo tài khoản
        </Link>
        <Link to="/forgot-password" className="flex min-h-11 items-center underline">
          Quên mật khẩu
        </Link>
      </div>
    </PageShell>
  );
}
