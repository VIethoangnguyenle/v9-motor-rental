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

  // KHÔNG mang `mt-*` của riêng mình: `staff-list-page.tsx` nay là một
  // `flex flex-col gap-4`, nên `mt-3` cộng dồn với `gap-4` thành 28px. Nhịp dọc
  // thuộc về container cha — cùng lý lẽ đã ghi ở `customer-rental-history.tsx`.
  return (
    <Alert tone="info">
        Mã đặt lại mật khẩu cho <strong>{issuedCode.name}</strong>:{" "}
        <strong className="tracking-widest">{issuedCode.code}</strong> — đọc cho nhân viên qua Zalo.
      Mã sống 10 phút và chỉ dùng được một lần.
    </Alert>
  );
}
