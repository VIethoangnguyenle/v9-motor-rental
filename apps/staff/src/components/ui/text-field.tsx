/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Đó là điều kiện để dùng lại ở bốn màn hình nghiệp vụ sắp làm.
 */
interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
}

export function TextField({ label, className, ...input }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {/* Class của caller nối THÊM vào, không ghi đè: `className` đứng sau
          `{...input}` là nuốt im lặng mọi class truyền vào — ô nhập mã OTP cần
          `tracking-widest` và sẽ mất nó mà không có lỗi ở đâu cả. */}
      <input {...input} className={`rounded border px-3 py-2 ${className ?? ""}`} />
    </label>
  );
}
