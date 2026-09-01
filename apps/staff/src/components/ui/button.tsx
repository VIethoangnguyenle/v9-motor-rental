/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Đó là điều kiện để dùng lại ở bốn màn hình nghiệp vụ sắp làm.
 */
type Variant = "primary" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  /**
   * Đang xử lý hành động của người dùng — KHÁC `disabled`.
   *
   * `disabled` nghĩa là "bạn không làm được việc này": nhãn không cần đọc, nên
   * `opacity-50` là đúng. `pending` nghĩa là "đang làm, chờ chút": nhãn ("Đang
   * tạo đơn…", "Đang huỷ…") là thông tin DUY NHẤT nói cho người dùng biết hệ
   * thống đang làm gì, và nó xuất hiện đúng lúc họ đang chờ để đọc. Trước prop
   * này cả hai dùng chung `disabled`, nên mọi nhãn "đang…" hiện ở **1,55:1**.
   *
   * WCAG 1.4.3 miễn trừ tương phản cho control bị vô hiệu — miễn trừ đó dành cho
   * thứ người dùng không cần đọc, nên nó không che được ca này.
   *
   * Chặn kích hoạt bằng `preventDefault` trong `onClick` thay vì thuộc tính
   * `disabled`: `disabled` gỡ nút khỏi tab order, nên trình duyệt bỏ tiêu điểm
   * ngay giữa lúc gửi và người dùng bàn phím mất chỗ đứng. `preventDefault` trên
   * click của nút `type="submit"` cũng chặn luôn việc submit form, nên không có
   * đường gửi hai lần.
   */
  readonly pending?: boolean;
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

export function Button({
  variant = "primary",
  pending = false,
  className,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      // `aria-disabled` chứ không `disabled`: trình đọc màn hình vẫn thông báo
      // "không dùng được", nhưng nút giữ tiêu điểm và giữ nguyên độ tương phản.
      aria-disabled={pending || undefined}
      onClick={(e) => {
        if (pending) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={`${BASE} ${VARIANT[variant]} ${pending ? "cursor-wait" : ""} ${className ?? ""}`}
    />
  );
}
