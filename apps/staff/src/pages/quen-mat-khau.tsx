import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { PasswordResetMessage } from "../components/auth/request-code-form";
import { RequestCodeForm } from "../components/auth/request-code-form";
import { ResetPasswordForm } from "../components/auth/reset-password-form";
import { PageShell } from "../components/ui/page-shell";

export function QuenMatKhauPage() {
  const [buoc, setBuoc] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [matKhauMoi, setMatKhauMoi] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState<string | null>(null);

  function xuLyKetQuaBuoc1(message: PasswordResetMessage) {
    if (message.kind === "sent") {
      setGhiChu(message.text);
      setLoi(null);
    } else {
      setLoi(message.text);
      setGhiChu(null);
    }
    setBuoc(2);
  }

  return (
    <PageShell title="Quên mật khẩu">
      {buoc === 1 ? (
        <RequestCodeForm email={email} onEmailChange={setEmail} onDone={xuLyKetQuaBuoc1} />
      ) : (
        <ResetPasswordForm
          email={email}
          code={code}
          onCodeChange={setCode}
          matKhauMoi={matKhauMoi}
          onMatKhauMoiChange={setMatKhauMoi}
          ghiChu={ghiChu}
          loi={loi}
          onError={setLoi}
          onBack={() => {
            setBuoc(1);
            setLoi(null);
          }}
        />
      )}

      <Link to="/dang-nhap" className="mt-4 inline-block text-sm underline">
        Quay lại đăng nhập
      </Link>
    </PageShell>
  );
}
