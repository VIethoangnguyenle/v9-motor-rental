import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signIn } from "../../lib/auth";
import { Alert } from "../ui/alert";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

export function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /**
   * `useMutation` thay cho cặp `dangGui`/`loi` cuộn tay — pattern đã có trong app
   * (bảng nhân viên dùng nó cho các nút hành động), không phải pattern thứ hai.
   *
   * `signIn` trả union chứ không ném (pattern 3 của repo), nên phải ném ở đây
   * thì `mutation.error` mới có gì để hiện.
   *
   * Không tự lo PENDING/DISABLED ở đây: guard của `/` đọc `/staff/me` rồi đẩy đi
   * đúng chỗ. Một bản sao của luật đó ở đây là bản sao sẽ lệch.
   */
  const login = useMutation({
    mutationFn: async () => {
      const res = await signIn(email, password);
      if (!res.ok) throw new Error(res.message);
    },
    onSuccess: () => navigate({ to: "/" }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      <TextField
        label="Email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Mật khẩu"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {/* `Alert`, KHÔNG phải `<p className="text-sm text-red-600">`. Ba lý do,
          lý do đầu là lỗi thật: `<p>` trần không mang `role`/`aria-live` nào, nên
          câu này hiện lên màn hình mà trình đọc màn hình KHÔNG đọc ra — người
          dùng bấm nút rồi nghe thấy đúng con số không. `ui/alert.tsx` đã sửa đúng
          con bug đó cho phần còn lại của app và ghi lại nguyên văn trong comment
          của nó; ba form xác thực là chỗ cuối cùng còn sót. Hai lý do còn lại:
          `text-red-600` là palette thô, đi vòng qua token `status-overdue`; và
          `assertive` mặc định của tone `error` đúng ở đây — người dùng vừa bấm
          gửi và đang đứng chờ chính câu trả lời này. */}
      {login.error && <Alert tone="error">{login.error.message}</Alert>}
      <SubmitButton pending={login.isPending} pendingLabel="Đang đăng nhập…">
        Đăng nhập
      </SubmitButton>
    </form>
  );
}
