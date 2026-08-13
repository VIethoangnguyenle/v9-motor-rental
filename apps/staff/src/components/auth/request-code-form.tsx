import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { errorCode, errorMessage } from "../../lib/errors";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

/** Kết quả bước 1 báo lại cho trang cha — `kind` chọn cách hiển thị ở bước 2. */
export interface PasswordResetMessage {
  readonly kind: "sent" | "problem";
  readonly text: string;
}

/**
 * Bước 1 LUÔN đi tiếp sang bước 2, kể cả khi request hỏng — và đó là thiết kế,
 * không phải nuốt lỗi:
 *
 *   • 200: backend cố ý trả 200 cho cả email không tồn tại (§5.1 design doc) —
 *     phân biệt được hai ca là biến endpoint này thành máy dò danh sách nhân
 *     viên của shop. Vậy nên "đã gửi" ở đây là câu điều kiện, không phải lời hứa.
 *   • 503 `CHUA_CAU_HINH_EMAIL`: chưa có SMTP — trạng thái mặc định của một prod
 *     mới dựng. Mã vẫn phát được bằng nút "Phát mã" của chủ shop, nên đường đi
 *     tiếp là CÓ THẬT: nhắn chủ shop, rồi gõ mã vào đây.
 *
 * Chặn người dùng ở bước 1 trong ca 503 là chặn đúng đường cứu duy nhất họ có.
 */
export function RequestCodeForm({
  email,
  onEmailChange,
  onDone,
}: {
  readonly email: string;
  readonly onEmailChange: (value: string) => void;
  readonly onDone: (message: PasswordResetMessage) => void;
}) {
  const requestCode = useMutation({
    mutationFn: () => api.staff["password-reset"].request.post({ email }),
    onSuccess: (res) => {
      if (res.error) {
        const message = errorMessage(res.error.value, "Không gửi được yêu cầu");
        onDone({
          kind: "problem",
          text:
            errorCode(res.error.value) === "CHUA_CAU_HINH_EMAIL"
              ? "Hệ thống chưa gửi được email — nhắn chủ shop để lấy mã, rồi gõ vào đây."
              : `${message} — nếu không nhận được mã, nhắn chủ shop để lấy mã.`,
        });
      } else {
        onDone({
          kind: "sent",
          text: "Nếu email tồn tại, mã 6 số đã được gửi. Mã sống 10 phút.",
        });
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        requestCode.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      <TextField
        label="Email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
      />
      <SubmitButton pending={requestCode.isPending} pendingLabel="Đang gửi…">
        Gửi mã
      </SubmitButton>
    </form>
  );
}
