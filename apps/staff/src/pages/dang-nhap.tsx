import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { dangNhap } from "../lib/auth";

export function DangNhapPage() {
  const navigate = useNavigate();
  // `strict: false` để trang không phải import ngược `router.tsx` (chu trình
  // module). Giá trị đã được `validateSearch` của route lọc còn đúng danh sách
  // trắng — chỉ "disabled" | "no-profile" | "password-changed" | undefined.
  const search = useSearch({ strict: false });
  const [email, setEmail] = useState("");
  const [matKhau, setMatKhau] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDangGui(true);
    setLoi(null);
    const res = await dangNhap(email, matKhau);
    setDangGui(false);
    // Không tự lo PENDING/DISABLED ở đây: guard của `/` đọc `/staff/me` rồi đẩy
    // đi đúng chỗ. Một bản sao của luật đó ở đây là bản sao sẽ lệch.
    if (res.ok) await navigate({ to: "/" });
    else setLoi(res.message);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Đăng nhập</h1>

      {search.ly_do === "disabled" && (
        <p className="mt-3 rounded bg-amber-100 p-3 text-sm">
          Tài khoản của bạn đã bị khoá. Liên hệ chủ shop.
        </p>
      )}
      {search.ly_do === "no-profile" && (
        <p className="mt-3 rounded bg-amber-100 p-3 text-sm">
          Tài khoản chưa có hồ sơ nhân viên. Liên hệ chủ shop để được tạo hồ sơ.
        </p>
      )}

      <form onSubmit={(e) => void submit(e)} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mật khẩu
          <input
            type="password"
            required
            autoComplete="current-password"
            value={matKhau}
            onChange={(e) => setMatKhau(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        {loi && <p className="text-sm text-red-600">{loi}</p>}

        <button
          type="submit"
          disabled={dangGui}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {dangGui ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>

      <div className="mt-4 flex justify-between text-sm">
        <Link to="/dang-ky" className="underline">
          Tạo tài khoản
        </Link>
        <Link to="/quen-mat-khau" className="underline">
          Quên mật khẩu
        </Link>
      </div>
    </main>
  );
}
