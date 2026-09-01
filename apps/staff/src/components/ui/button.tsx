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
/**
 * `disabled:cursor-not-allowed` đi kèm `disabled:opacity-50`: mờ đi nói "không
 * dùng được" cho người NHÌN thấy, con trỏ nói cùng điều đó cho người đang rê
 * chuột tới bấm. Vòng focus không khai ở đây — `:focus-visible` toàn cục ở
 * `index.css` lo, xem lý lẽ ở đó.
 */
const BASE =
  "inline-flex min-h-11 items-center justify-center rounded-card px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Mỗi biến thể có đủ default · hover · active. Bản trước chỉ có default và
 * disabled: rê chuột lên nút "Tạo đơn" không có phản hồi nào, và sáu chỗ khác
 * trong app đã tự vá bằng `hover:bg-canvas` viết tại chỗ.
 *
 * `disabled:hover:` không cần khai: `:hover` trên phần tử `disabled` không kích
 * hoạt ở trình duyệt hiện đại, nên nút bị vô hiệu tự nó đã không đổi màu.
 */
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent-active",
  // Nút ghost đứng trên CẢ `canvas` lẫn `surface`, mà hai màu đó chỉ chênh nhau
  // 1,05:1 — nên chỉ đổi nền là gần như vô hình trên một trong hai. Viền đậm
  // lên (`border` → `muted`) mới là thứ đọc được ở mọi nền.
  ghost: "border border-border text-ink hover:border-muted hover:bg-canvas active:bg-border",
};

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  return <button {...rest} className={`${BASE} ${VARIANT[variant]} ${className ?? ""}`} />;
}
