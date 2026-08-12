/** Ba mức, ba nền — dùng lại đúng ba class đang rải rác trong các trang hiện tại. */
type AlertTone = "error" | "warning" | "info";

const TONE: Record<AlertTone, string> = {
  error: "bg-red-100 text-red-800",
  warning: "bg-amber-100",
  info: "bg-gray-100",
};

export function Alert({ tone, children }: { readonly tone: AlertTone; readonly children: React.ReactNode }) {
  return <p className={`rounded p-3 text-sm ${TONE[tone]}`}>{children}</p>;
}
