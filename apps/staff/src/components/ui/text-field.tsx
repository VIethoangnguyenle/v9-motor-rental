/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Đó là điều kiện để dùng lại ở bốn màn hình nghiệp vụ sắp làm.
 */
interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
}

export function TextField({ label, className, ...input }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      {label}
      {/* Class của caller nối THÊM vào, không ghi đè: `className` đứng sau
          `{...input}` là nuốt im lặng mọi class truyền vào — ô nhập mã OTP cần
          `tracking-widest` và sẽ mất nó mà không có lỗi ở đâu cả. */}
      <input
        {...input}
        // `min-h-11` = 44px, khớp ngưỡng vùng chạm `ui/button.tsx` đã tuyên bố
        // áp ở MỌI breakpoint. Không có nó, chiều cao thực chỉ ~38px (line-height
        // 20 + py-2 8+8 + border 2) — dưới chuẩn chính app đặt ra, và PWA này
        // dùng một tay trong garage.
        className={`min-h-11 rounded-card border border-border bg-surface px-3 py-2 text-ink ${className ?? ""}`}
      />
    </label>
  );
}
