import { Link } from "@tanstack/react-router";
import { SignupForm } from "../components/auth/signup-form";
import { PageShell } from "../components/ui/page-shell";

export function SignupPage() {
  return (
    <PageShell title="Tạo tài khoản nhân viên">
      <p className="mt-2 text-sm text-gray-600">
        Tài khoản cần chủ shop duyệt trước khi dùng được.
      </p>

      <SignupForm />

      <Link to="/dang-nhap" className="mt-4 inline-block text-sm underline">
        Đã có tài khoản
      </Link>
    </PageShell>
  );
}
