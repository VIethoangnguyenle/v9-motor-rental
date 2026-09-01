import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiErrorCode } from "@v9/api";
import { api } from "../../lib/api";
import type { Customer } from "../../lib/customers";
import { errorMessage } from "../../lib/errors";
import { Alert } from "../ui/alert";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

/** Giữ `code` bên cạnh `message` — cùng lý do `RentalApiError` ở `rental-form.tsx`. */
class UpdateCustomerError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode | null,
  ) {
    super(message);
  }
}

interface CustomerEditFormProps {
  readonly customer: Customer;
  readonly onSaved: (customer: Customer) => void;
}

/**
 * Sửa tên/số điện thoại/ghi chú của một khách hàng đã có. KHÔNG có nút Xoá ở
 * đây — cố ý, không phải thiếu sót; xem comment ở `POST /customers/:id`
 * (`apps/api/src/routes/rentals.ts`) cho lý do đầy đủ.
 */
export function CustomerEditForm({ customer, onSaved }: CustomerEditFormProps) {
  const [fullName, setFullName] = useState(customer.fullName);
  const [phone, setPhone] = useState(customer.phone);
  const [note, setNote] = useState(customer.note ?? "");

  const update = useMutation({
    mutationFn: async () => {
      const res = await api.customers({ id: customer.id }).post({
        fullName,
        phone,
        note: note.trim() === "" ? null : note.trim(),
      });
      if (res.error) {
        // 409 CUSTOMER_EXISTS mang theo `existing` — nói RÕ số này đã thuộc về
        // ai, không chỉ báo "đã tồn tại" chung chung rồi bắt tự đoán.
        if (res.error.status === 409) {
          const other = res.error.value.existing;
          throw new UpdateCustomerError(
            `Số điện thoại này đã thuộc về khách hàng khác: ${other.fullName} (${other.phone})`,
            "CUSTOMER_EXISTS",
          );
        }
        throw new UpdateCustomerError(
          errorMessage(res.error.value, "Không lưu được thay đổi"),
          null,
        );
      }
      return res.data;
    },
    // Đồng bộ lại form theo giá trị ĐÃ CHUẨN HOÁ từ server (vd. số điện thoại
    // gõ "+84 913..." được lưu lại dạng "0913...") — không đợi refetch riêng.
    onSuccess: (data) => {
      setFullName(data.fullName);
      setPhone(data.phone);
      setNote(data.note ?? "");
      onSaved(data);
    },
  });

  /**
   * 409 `CUSTOMER_EXISTS` là lỗi của ĐÚNG MỘT Ô — số điện thoại vừa gõ đã thuộc
   * về khách khác. Trước đây nó chỉ hiện ở `Alert` cuối form, nên người dùng
   * trình đọc màn hình nghe "Số điện thoại này đã thuộc về khách hàng khác: …"
   * mà không có gì nối câu đó với ô cần sửa (WCAG 3.3.1, mức A).
   *
   * Mọi lỗi KHÁC giữ nguyên ở mức form: chúng không quy được về một ô.
   */
  const phoneError =
    update.error instanceof UpdateCustomerError && update.error.code === "CUSTOMER_EXISTS"
      ? update.error.message
      : undefined;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    update.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <TextField
        label="Họ và tên"
        required
        value={fullName}
        onChange={(e) => {
          setFullName(e.target.value);
          // Gõ tiếp sau khi lưu thành công thì tắt luôn thông báo "Đã lưu thay
          // đổi." — không thì nó nằm cạnh những trường đang bẩn, nói dối là
          // giá trị hiện tại đã được lưu trong khi thực ra chưa. Guard trên
          // `update.isSuccess` để không gọi `reset()` (và re-render) ở MỌI
          // phím gõ, chỉ đúng lần gõ đầu tiên sau khi thành công.
          if (update.isSuccess) update.reset();
        }}
      />
      <TextField
        label="Số điện thoại"
        required
        type="tel"
        error={phoneError}
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          if (update.isSuccess) update.reset();
        }}
      />
      <label className="flex flex-col gap-1 text-sm text-ink">
        Ghi chú
        {/* `ui/text-field.tsx` chỉ render `<input>` và KHÔNG được biết domain
            (xem comment đầu file đó) — nhồi thêm nhánh textarea vào đó là ép nó
            hiểu "ghi chú khách hàng cần nhiều dòng", một khái niệm nghiệp vụ.
            Ghi chú là free text nhiều dòng thật (số xe mượn, thói quen thanh
            toán, ghi chú CSKH…) nên viết markup tại chỗ, dùng lại đúng token
            (`min-h-11 rounded-card border border-border bg-surface px-3 py-2
            text-ink`) để không trông như một component khác trong cùng form. */}
        <textarea
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => {
            setNote(e.target.value);
            if (update.isSuccess) update.reset();
          }}
          className="min-h-11 rounded-card border border-border bg-surface px-3 py-2 text-ink"
        />
      </label>

      {/* `!phoneError`: khi lỗi đã được gắn vào ô điện thoại thì thôi lặp lại ở
          đây — cùng một câu hiện hai chỗ làm người đọc đi tìm hai vấn đề. */}
      {update.error && !phoneError && <Alert tone="error">{update.error.message}</Alert>}
      {/* Kết quả của một submit người dùng vừa chờ, không phải banner bật lên vì
          query settle — giữ mặc định `assertive` của `Alert`, KHÔNG truyền
          `live="polite"` (khác với hai banner tải dữ liệu ở
          `customers-list-page.tsx`). */}
      {update.isSuccess && <Alert tone="info">Đã lưu thay đổi.</Alert>}

      <div>
        <SubmitButton pending={update.isPending} pendingLabel="Đang lưu…">
          Lưu thay đổi
        </SubmitButton>
      </div>
    </form>
  );
}
