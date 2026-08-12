import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMe } from "../hooks/use-me";
import { dangXuat } from "../lib/auth";

export function ChoDuyetPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Poll: OWNER bấm duyệt ở máy khác, nhân viên không phải đoán lúc nào tải lại.
  const { me, isPending } = useMe({ refetchInterval: 15_000 });

  // Chuyển trang trong effect, KHÔNG trong thân render: `navigate` lúc render là
  // cập nhật state của component khác giữa lúc React đang render cái này.
  useEffect(() => {
    if (me?.status === "ACTIVE") void navigate({ to: "/" });
  }, [me?.status, navigate]);

  async function thoat() {
    await dangXuat(qc);
    await navigate({ to: "/dang-nhap" });
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Đang chờ duyệt</h1>

      {isPending ? (
        <p className="mt-3 text-sm text-gray-600">Đang kiểm tra trạng thái…</p>
      ) : me ? (
        <p className="mt-3 text-sm text-gray-700">
          Tài khoản <strong>{me.email}</strong> đã tạo xong và đang chờ chủ shop duyệt. Trang này tự
          cập nhật khi được duyệt.
        </p>
      ) : (
        // `null` = 401 (chưa/hết đăng nhập) hoặc 403 (đã bị khoá). Không đoán ca
        // nào: nói đúng những gì biết và để đường đăng nhập lại mở.
        <p className="mt-3 rounded bg-amber-100 p-3 text-sm">
          Không đọc được trạng thái tài khoản — phiên đăng nhập có thể đã hết hạn hoặc tài khoản đã
          bị khoá. Đăng nhập lại, hoặc liên hệ chủ shop.
        </p>
      )}

      <button onClick={() => void thoat()} className="mt-4 rounded border px-3 py-2 text-sm">
        Đăng xuất
      </button>
    </main>
  );
}
