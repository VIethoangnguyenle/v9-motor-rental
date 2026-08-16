/**
 * Ba mức, ba nền — nay đi qua token thay vì `bg-red-100`/`bg-amber-100`/`bg-gray-100`
 * rải rác. `index.css` chưa có token màu hổ phách (chỉ bốn màu trạng thái đơn thuê +
 * `accent`, không cái nào vàng) nên "warning" mượn viền `ink` đậm thay vì một nền màu
 * riêng — vẫn phân biệt được với "error" (đỏ, mượn `status-overdue`) và "info" (xanh,
 * mượn `accent`) mà không bịa token mới ngoài phạm vi việc này.
 */
type AlertTone = "error" | "warning" | "info";

const TONE: Record<AlertTone, string> = {
  error: "bg-status-overdue/10 text-status-overdue",
  warning: "border border-ink/30 bg-surface text-ink",
  info: "bg-accent/10 text-accent",
};

export function Alert({
  tone,
  children,
}: {
  readonly tone: AlertTone;
  readonly children: React.ReactNode;
}) {
  return <p className={`rounded-card p-3 text-sm ${TONE[tone]}`}>{children}</p>;
}
