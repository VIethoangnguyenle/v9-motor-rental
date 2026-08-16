/**
 * Ba mức, ba nền — đi qua token thay vì `bg-red-100`/`bg-amber-100`/`bg-gray-100`
 * rải rác. `--color-warning` (`index.css`) được thêm sau file này ở đợt token
 * trượt AA (dùng trước cho chấm "phải trả hôm nay" ở `attention-list.tsx`) —
 * "warning" nay mượn ĐÚNG token đó, cùng khuôn `bg-X/10 text-X` với error/info,
 * thay vì viền `ink` trung tính nhìn y hệt "info" như bản cũ.
 */
type AlertTone = "error" | "warning" | "info";

const TONE: Record<AlertTone, string> = {
  error: "bg-status-overdue/10 text-status-overdue",
  warning: "bg-warning/10 text-warning",
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
