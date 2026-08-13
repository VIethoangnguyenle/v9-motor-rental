import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signUp } from "../../lib/auth";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

/**
 * `soDienThoai` là field optional ở backend (`plugins/auth.ts` khai
 * `{ id: "soDienThoai", optional: true }`) nên form cũng không bắt buộc — hai
 * bên lệch nhau thì người dùng bị chặn ở client vì một luật server không có.
 */
const FIELDS = [
  { key: "hoTen", label: "Họ và tên", type: "text", required: true, autoComplete: "name" },
  { key: "soDienThoai", label: "Số điện thoại", type: "tel", required: false, autoComplete: "tel" },
  { key: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  {
    key: "matKhau",
    label: "Mật khẩu (ít nhất 8 ký tự)",
    type: "password",
    required: true,
    autoComplete: "new-password",
  },
] as const;

export function SignupForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ hoTen: "", soDienThoai: "", email: "", matKhau: "" });

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
    onSuccess: () => navigate({ to: "/cho-duyet" }),
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
          minLength={key === "matKhau" ? 8 : undefined}
          autoComplete={autoComplete}
          value={form[key]}
          onChange={set(key)}
        />
      ))}
      {signup.error && <p className="text-sm text-red-600">{signup.error.message}</p>}
      <SubmitButton pending={signup.isPending} pendingLabel="Đang gửi…">
        Đăng ký
      </SubmitButton>
    </form>
  );
}
