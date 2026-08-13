import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../lib/api";
import { signOut } from "../../lib/auth";
import { errorMessage } from "../../lib/errors";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

export function ChangePasswordForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  /**
   * `signOut` sau khi thành công KHÔNG phải một lựa chọn UX — server đã thu hồi
   * MỌI session, kể cả session đang dùng để gọi chính request này, ngay bên
   * trong `changePassword` trước khi trả 200 (xem comment ở
   * `POST /staff/password/change`, `apps/api/src/routes/staff.ts`). Tức là lúc
   * `onSuccess` chạy tới đây, cookie trên trình duyệt đã là cookie CHẾT.
   *
   * Gọi `signOut` ở đây không "đăng xuất" ai cả — việc đó server đã làm xong.
   * Nó chỉ khiến trình duyệt BỎ cái cookie chết đó và dọn cache (`qc.clear()`
   * bên trong `signOut`), thay vì để người dùng đứng nguyên trên trang này rồi
   * dính 401 khó hiểu ở request kế tiếp — lúc đó họ không biết vì sao vừa đổi
   * mật khẩu xong đã "mất đăng nhập".
   */
  const changePassword = useMutation({
    mutationFn: async () => {
      const res = await api.staff.password.change.post({ currentPassword, newPassword });
      if (res.error) {
        throw new Error(errorMessage(res.error.value, "Không đổi được mật khẩu, thử lại sau"));
      }
    },
    onSuccess: async () => {
      await signOut(qc);
      await navigate({ to: "/login", search: { reason: "password-changed" } });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        changePassword.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      <TextField
        label="Mật khẩu hiện tại"
        type="password"
        required
        minLength={8}
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <TextField
        label="Mật khẩu mới (ít nhất 8 ký tự)"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      {changePassword.error && (
        <p className="text-sm text-red-600">{changePassword.error.message}</p>
      )}
      <SubmitButton pending={changePassword.isPending} pendingLabel="Đang đổi…">
        Đổi mật khẩu
      </SubmitButton>
    </form>
  );
}
