import { Alert } from "../ui/alert";

/**
 * Giữ cả tên: chủ shop đọc mã qua Zalo cho một CON NGƯỜI, nên màn hình phải
 * nói mã này của ai. UUID không giúp được việc đó.
 */
export function ResetCodeNotice({ ma }: { readonly ma: { ten: string; code: string } | null }) {
  if (!ma) return null;

  return (
    <div className="mt-3">
      <Alert tone="info">
        Mã đặt lại mật khẩu cho <strong>{ma.ten}</strong>:{" "}
        <strong className="tracking-widest">{ma.code}</strong> — đọc cho nhân viên qua Zalo. Mã sống
        10 phút và chỉ dùng được một lần.
      </Alert>
    </div>
  );
}
