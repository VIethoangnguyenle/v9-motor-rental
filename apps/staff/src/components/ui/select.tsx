/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Đó là điều kiện để dùng lại ở bốn màn hình nghiệp vụ sắp làm.
 *
 * Cùng khuôn `text-field.tsx`: chỉ khác thẻ `<select>` thay `<input>`. Sinh ra
 * cho ô chọn xe ở form lên đơn (`components/rentals/rental-form.tsx`), nhưng
 * không biết gì về "xe" — caller truyền `<option>` qua `children`.
 */
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: string;
}

export function Select({ label, className, children, ...select }: SelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      {label}
      {/* Class của caller nối THÊM vào, không ghi đè — cùng lý do đã ghi ở
          `text-field.tsx`. */}
      <select
        {...select}
        className={`rounded-card border border-border bg-surface px-3 py-2 text-ink ${className ?? ""}`}
      >
        {children}
      </select>
    </label>
  );
}
