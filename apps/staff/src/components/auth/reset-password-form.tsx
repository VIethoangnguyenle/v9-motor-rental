import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { Alert } from "../ui/alert";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

export function ResetPasswordForm({
  email,
  code,
  onCodeChange,
  newPassword,
  onNewPasswordChange,
  notice,
  error,
  onError,
  onBack,
}: {
  readonly email: string;
  readonly code: string;
  readonly onCodeChange: (value: string) => void;
  readonly newPassword: string;
  readonly onNewPasswordChange: (value: string) => void;
  readonly notice: string | null;
  readonly error: string | null;
  readonly onError: (text: string | null) => void;
  readonly onBack: () => void;
}) {
  const navigate = useNavigate();

  /**
   * Thông điệp của backend phân biệt được mã sai · mã hết hạn · mật khẩu yếu.
   * Gộp cả ba thành "mã không đúng" làm người dùng gõ lại mã đúng mãi mãi.
   */
  const confirmReset = useMutation({
    mutationFn: () =>
      api.staff["password-reset"].confirm.post({ email, code, matKhauMoi: newPassword }),
    onMutate: () => onError(null),
    onSuccess: (res) => {
      if (res.error) onError(errorMessage(res.error.value, "Không đổi được mật khẩu, thử lại sau"));
      else void navigate({ to: "/login" });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        confirmReset.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      {/* `Alert` chứ không `<p>` trần: câu này là KẾT QUẢ của bước 1 mà người
          dùng vừa bấm và đang chờ ("Nếu email tồn tại, mã 6 số đã được gửi") —
          một `<p>` không mang `role`/`aria-live` thì nó hiện lên mà trình đọc
          màn hình không đọc ra. Cùng con bug đã sửa ở ba form xác thực kia. */}
      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="warning">{error}</Alert>}
      {/* Ghi chú chỉ có ở bản dev. Đi qua token (`border`/`canvas`/`muted`) thay
          vì `bg-gray-100` thô — và KHÔNG dùng `Alert`: nó không phải trạng thái
          của thao tác người dùng vừa làm, nên không đáng được đọc ra. */}
      {import.meta.env.DEV && (
        <p className="rounded-card border border-border bg-canvas p-2 text-sm text-muted">
          Môi trường dev: mã luôn là 999999
        </p>
      )}

      <TextField
        label="Mã 6 số"
        inputMode="numeric"
        required
        minLength={6}
        maxLength={6}
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        className="tracking-widest"
      />
      <TextField
        label="Mật khẩu mới (ít nhất 8 ký tự)"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => onNewPasswordChange(e.target.value)}
      />

      <SubmitButton pending={confirmReset.isPending} pendingLabel="Đang đổi…">
        Đặt mật khẩu mới
      </SubmitButton>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center self-start text-sm underline"
      >
        Đổi email khác
      </button>
    </form>
  );
}
