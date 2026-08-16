/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Đó là điều kiện để dùng lại ở bốn màn hình nghiệp vụ sắp làm.
 */
type Variant = "primary" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
}

/**
 * `min-h-11` = 44px — ngưỡng vùng chạm, áp ở MỌI breakpoint. Mật độ thông tin cao
 * là đặc quyền của desktop; trên điện thoại nút phải bấm trúng được bằng ngón cái.
 */
const BASE =
  "inline-flex min-h-11 items-center justify-center rounded-card px-4 text-sm font-semibold disabled:opacity-50";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink",
  ghost: "border border-border text-ink",
};

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  return <button {...rest} className={`${BASE} ${VARIANT[variant]} ${className ?? ""}`} />;
}
