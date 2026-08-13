import { Alert } from "../ui/alert";

/**
 * Giữ cả tên: chủ shop đọc mã qua Zalo cho một CON NGƯỜI, nên màn hình phải
 * nói mã này của ai. UUID không giúp được việc đó.
 */
export function ResetCodeNotice({
  issuedCode,
}: {
  readonly issuedCode: { name: string; code: string } | null;
}) {
  if (!issuedCode) return null;

  return (
    <div className="mt-3">
      <Alert tone="info">
        Mã đặt lại mật khẩu cho <strong>{issuedCode.name}</strong>:{" "}
        <strong className="tracking-widest">{issuedCode.code}</strong> — đọc cho nhân viên qua Zalo.
        Mã sống 10 phút và chỉ dùng được một lần.
      </Alert>
    </div>
  );
}
