import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { PageShell } from "../components/ui/page-shell";
import { useMe } from "../hooks/use-me";
import { signOut } from "../lib/auth";

export function PendingApprovalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Poll: OWNER bấm duyệt ở máy khác, nhân viên không phải đoán lúc nào tải lại.
  const { me, isPending } = useMe({ refetchInterval: 15_000 });

  // Chuyển trang trong effect, KHÔNG trong thân render: `navigate` lúc render là
  // cập nhật state của component khác giữa lúc React đang render cái này.
  useEffect(() => {
    if (me?.status === "ACTIVE") void navigate({ to: "/" });
  }, [me?.status, navigate]);

  async function handleSignOut() {
    await signOut(qc);
    await navigate({ to: "/login" });
  }

  // `PageShell` như năm màn công khai còn lại. Trang này từng là màn công khai
  // DUY NHẤT tự dựng khung, nên nó lệch khỏi `/login`, `/signup`,
  // `/forgot-password` ở cả bề rộng lẫn khoảng cách hai bên.
  return (
    <PageShell title="Đang chờ duyệt">
      <div className="mt-3 flex flex-col items-start gap-4">
        {isPending ? (
          <p className="text-sm text-muted">Đang kiểm tra trạng thái…</p>
        ) : me ? (
          <p className="text-sm text-ink">
            Tài khoản <strong>{me.email}</strong> đã tạo xong và đang chờ chủ shop duyệt. Trang này
            tự cập nhật khi được duyệt.
          </p>
        ) : (
          // `null` = 401 (chưa/hết đăng nhập) hoặc 403 (đã bị khoá). Không đoán
          // ca nào: nói đúng những gì biết và để đường đăng nhập lại mở.
          //
          // `Alert tone="warning"` thay `bg-amber-100` thô: nó đi qua token, và
          // nó mang `role="status"` nên câu này được ĐỌC RA — trước đây là một
          // `<p>` trần, tức người dùng screen reader ngồi chờ một màn hình không
          // bao giờ nói gì.
          <Alert tone="warning">
            Không đọc được trạng thái tài khoản — phiên đăng nhập có thể đã hết hạn hoặc tài khoản
            đã bị khoá. Đăng nhập lại, hoặc liên hệ chủ shop.
          </Alert>
        )}

        <Button type="button" variant="ghost" onClick={() => void handleSignOut()}>
          Đăng xuất
        </Button>
      </div>
    </PageShell>
  );
}
