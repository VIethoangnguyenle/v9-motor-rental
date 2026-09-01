import { useId } from "react";

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
  /** Lỗi của CHÍNH ô này — cùng hợp đồng `TextField`, xem lý lẽ ở file đó. */
  readonly error?: string;
}

export function Select({ label, error, className, children, ...select }: SelectProps) {
  const errorId = useId();
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      {label}
      {/* Class của caller nối THÊM vào, không ghi đè — cùng lý do đã ghi ở
          `text-field.tsx`. */}
      <select
        {...select}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        // `min-h-11` = 44px, cùng lý lẽ đã ghi đầy đủ ở `text-field.tsx`. File
        // này tuyên bố mình là "cùng khuôn `text-field.tsx`" nhưng thiếu đúng
        // dòng đó, nên nó tụt lại khi `TextField` được nâng lên 44px
        // (`ab47702`): đo trên bản build, `<select>` cao **39px** còn `<input>`
        // ngay dưới nó cao 44px — lệch nhau 5px trong CÙNG một form (ô "Xe" và
        // ô "Tìm khách" của form lên đơn), và dưới ngưỡng chính app đặt ra.
        className={`min-h-11 rounded-card border bg-surface px-3 py-2 text-ink ${
          error ? "border-status-overdue" : "border-border"
        } ${className ?? ""}`}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-status-overdue">
          {error}
        </p>
      )}
    </label>
  );
}
