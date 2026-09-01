import { useId } from "react";

/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Đó là điều kiện để dùng lại ở bốn màn hình nghiệp vụ sắp làm.
 */
interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  /**
   * Lỗi của CHÍNH ô này. Vắng mặt = ô không có lỗi.
   *
   * Trước prop này, mọi lỗi trong app hiện ở mức FORM (một `Alert` phía trên
   * hoặc dưới) và `aria-invalid` xuất hiện **0 lần** trong toàn `src/`. Với câu
   * 409 "Số điện thoại này đã thuộc về khách hàng khác: …" thì ô điện thoại
   * CHÍNH LÀ thứ đang lỗi, nhưng không gì đánh dấu nó — người dùng trình đọc màn
   * hình nghe câu đó xong không biết phải sửa ô nào (WCAG 3.3.1 Error
   * Identification, mức A).
   *
   * ⚠️ KHÔNG phải lỗi nào cũng thuộc về một ô. "Email hoặc mật khẩu không đúng"
   * ở màn đăng nhập mơ hồ CÓ CHỦ Ý — nói rõ sai cái nào là biến form đăng nhập
   * thành máy dò tài khoản. Lỗi đó phải ở mức form, đừng gán vào ô.
   */
  readonly error?: string;
}

export function TextField({ label, error, className, ...input }: TextFieldProps) {
  // `useId` chứ không tự đếm: `aria-describedby` cần một id DUY NHẤT trên cả
  // trang, mà cùng một `TextField` được render nhiều lần (form lên đơn có hai ô
  // ngày, hai ô tiền). Trùng id thì trình đọc màn hình đọc nhầm ô.
  const errorId = useId();
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      {label}
      {/* Class của caller nối THÊM vào, không ghi đè: `className` đứng sau
          `{...input}` là nuốt im lặng mọi class truyền vào — ô nhập mã OTP cần
          `tracking-widest` và sẽ mất nó mà không có lỗi ở đâu cả. */}
      <input
        {...input}
        // `undefined` chứ không `false`: React bỏ hẳn thuộc tính khi `undefined`,
        // còn `aria-invalid="false"` là một lời khai thừa trên mọi ô sạch.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        // `min-h-11` = 44px, khớp ngưỡng vùng chạm `ui/button.tsx` đã tuyên bố
        // áp ở MỌI breakpoint. Không có nó, chiều cao thực chỉ ~38px (line-height
        // 20 + py-2 8+8 + border 2) — dưới chuẩn chính app đặt ra, và PWA này
        // dùng một tay trong garage.
        //
        // Viền đỏ là tín hiệu THỨ HAI cạnh câu chữ bên dưới, không phải tín hiệu
        // duy nhất — thông tin chỉ-bằng-màu là thứ 1.4.1 cấm. Viền
        // `status-overdue` trên `surface` đo được 5,40:1, thừa ngưỡng 3:1 cho
        // thành phần phi văn bản.
        className={`min-h-11 rounded-card border bg-surface px-3 py-2 text-ink ${
          error ? "border-status-overdue" : "border-border"
        } ${className ?? ""}`}
      />
      {error && (
        <p id={errorId} className="text-sm text-status-overdue">
          {error}
        </p>
      )}
    </label>
  );
}
