import { Button } from "./button";

/**
 * API giữ NGUYÊN (`pending`, `pendingLabel`, `children`) — sáu màn xác thực gọi
 * component này; đổi chữ ký nghĩa là đổi sáu chỗ gọi không vì lý do gì. Chỉ phần
 * render đi qua `Button` (variant mặc định `primary`, đã có vùng chạm 44px).
 *
 * `pending={pending}` chứ không `disabled={pending}`: nhãn "Đang đăng nhập…" là
 * thứ người dùng cần ĐỌC lúc đang chờ, mà `disabled` làm nó mờ còn 1,55:1. Xem
 * lý lẽ đầy đủ ở `ui/button.tsx`.
 */
interface SubmitButtonProps {
  readonly pending: boolean;
  readonly children: React.ReactNode;
  readonly pendingLabel: string;
}

export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps) {
  return (
    <Button type="submit" pending={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
