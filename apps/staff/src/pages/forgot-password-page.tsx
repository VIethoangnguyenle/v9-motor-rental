import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { PasswordResetMessage } from "../components/auth/request-code-form";
import { RequestCodeForm } from "../components/auth/request-code-form";
import { ResetPasswordForm } from "../components/auth/reset-password-form";
import { PageShell } from "../components/ui/page-shell";

export function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleStep1Result(message: PasswordResetMessage) {
    if (message.kind === "sent") {
      setNotice(message.text);
      setError(null);
    } else {
      setError(message.text);
      setNotice(null);
    }
    setStep(2);
  }

  return (
    <PageShell title="Quên mật khẩu">
      {step === 1 ? (
        <RequestCodeForm email={email} onEmailChange={setEmail} onDone={handleStep1Result} />
      ) : (
        <ResetPasswordForm
          email={email}
          code={code}
          onCodeChange={setCode}
          newPassword={newPassword}
          onNewPasswordChange={setNewPassword}
          notice={notice}
          error={error}
          onError={setError}
          onBack={() => {
            setStep(1);
            setError(null);
          }}
        />
      )}

      <Link to="/login" className="mt-4 inline-flex min-h-11 items-center text-sm underline">
        Quay lại đăng nhập
      </Link>
    </PageShell>
  );
}
