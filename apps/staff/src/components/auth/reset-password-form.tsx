import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../../lib/api";
import { thongDiepLoi } from "../../lib/loi";
import { Alert } from "../ui/alert";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

export function ResetPasswordForm({
  email,
  code,
  onCodeChange,
  matKhauMoi,
  onMatKhauMoiChange,
  ghiChu,
  loi,
  onError,
  onBack,
}: {
  readonly email: string;
  readonly code: string;
  readonly onCodeChange: (value: string) => void;
  readonly matKhauMoi: string;
  readonly onMatKhauMoiChange: (value: string) => void;
  readonly ghiChu: string | null;
  readonly loi: string | null;
  readonly onError: (text: string | null) => void;
  readonly onBack: () => void;
}) {
  const navigate = useNavigate();

  /**
   * Thông điệp của backend phân biệt được mã sai · mã hết hạn · mật khẩu yếu.
   * Gộp cả ba thành "mã không đúng" làm người dùng gõ lại mã đúng mãi mãi.
   */
  const xacNhan = useMutation({
    mutationFn: () => api.staff["password-reset"].confirm.post({ email, code, matKhauMoi }),
    onMutate: () => onError(null),
    onSuccess: (res) => {
      if (res.error) onError(thongDiepLoi(res.error.value, "Không đổi được mật khẩu, thử lại sau"));
      else void navigate({ to: "/dang-nhap" });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        xacNhan.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      {ghiChu && <p className="text-sm text-gray-600">{ghiChu}</p>}
      {loi && <Alert tone="warning">{loi}</Alert>}
      {import.meta.env.DEV && (
        <p className="rounded bg-gray-100 p-2 text-sm">Môi trường dev: mã luôn là 999999</p>
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
        value={matKhauMoi}
        onChange={(e) => onMatKhauMoiChange(e.target.value)}
      />

      <SubmitButton pending={xacNhan.isPending} pendingLabel="Đang đổi…">
        Đặt mật khẩu mới
      </SubmitButton>
      <button type="button" onClick={onBack} className="text-sm underline">
        Đổi email khác
      </button>
    </form>
  );
}
