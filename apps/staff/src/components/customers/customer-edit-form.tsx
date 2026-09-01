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
        onChange={(e) => setFullName(e.target.value)}
      />
      <TextField
        label="Số điện thoại"
        required
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <TextField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />

      {update.error && <Alert tone="error">{update.error.message}</Alert>}
      {update.isSuccess && <Alert tone="info">Đã lưu thay đổi.</Alert>}

      <div>
        <SubmitButton pending={update.isPending} pendingLabel="Đang lưu…">
          Lưu thay đổi
        </SubmitButton>
      </div>
    </form>
  );
}
