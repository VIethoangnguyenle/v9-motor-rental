import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signUp } from "../../lib/auth";
import { Alert } from "../ui/alert";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

/**
 * `phone` là field optional ở backend (`plugins/auth.ts` khai
 * `{ id: "phone", optional: true }`) nên form cũng không bắt buộc — hai
 * bên lệch nhau thì người dùng bị chặn ở client vì một luật server không có.
 */
const FIELDS = [
  { key: "fullName", label: "Họ và tên", type: "text", required: true, autoComplete: "name" },
  { key: "phone", label: "Số điện thoại", type: "tel", required: false, autoComplete: "tel" },
  { key: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  {
    key: "password",
    label: "Mật khẩu (ít nhất 8 ký tự)",
    type: "password",
    required: true,
    autoComplete: "new-password",
  },
] as const;

export function SignupForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
  };

  const signup = useMutation({
    mutationFn: async () => {
      const res = await signUp(form);
      if (!res.ok) throw new Error(res.message);
    },
    // Đăng ký xong SuperTokens đã tạo session, nhưng tài khoản ở trạng thái chờ
    // duyệt — nên đi thẳng tới màn giải thích, không phải trang chủ (trang chủ
    // sẽ đá về đây, chỉ tốn thêm một vòng).
    onSuccess: () => navigate({ to: "/pending-approval" }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        signup.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      {FIELDS.map(({ key, label, type, required, autoComplete }) => (
        <TextField
          key={key}
          label={label}
          type={type}
          required={required}
          minLength={key === "password" ? 8 : undefined}
          autoComplete={autoComplete}
          value={form[key]}
          onChange={set(key)}
        />
      ))}
      {/* `Alert`, KHÔNG phải `<p className="text-sm text-red-600">`. Ba lý do,
          lý do đầu là lỗi thật: `<p>` trần không mang `role`/`aria-live` nào, nên
          câu này hiện lên màn hình mà trình đọc màn hình KHÔNG đọc ra — người
          dùng bấm nút rồi nghe thấy đúng con số không. `ui/alert.tsx` đã sửa đúng
          con bug đó cho phần còn lại của app và ghi lại nguyên văn trong comment
          của nó; ba form xác thực là chỗ cuối cùng còn sót. Hai lý do còn lại:
          `text-red-600` là palette thô, đi vòng qua token `status-overdue`; và
          `assertive` mặc định của tone `error` đúng ở đây — người dùng vừa bấm
          gửi và đang đứng chờ chính câu trả lời này. */}
      {signup.error && <Alert tone="error">{signup.error.message}</Alert>}
      <SubmitButton pending={signup.isPending} pendingLabel="Đang gửi…">
        Đăng ký
      </SubmitButton>
    </form>
  );
}
