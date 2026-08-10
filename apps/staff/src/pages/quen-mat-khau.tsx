import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";
import { maLoi, thongDiepLoi } from "../lib/loi";

export function QuenMatKhauPage() {
  const navigate = useNavigate();
  const [buoc, setBuoc] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [matKhauMoi, setMatKhauMoi] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

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
  async function guiYeuCau(e: React.FormEvent) {
    e.preventDefault();
    setDangGui(true);
    setLoi(null);
    setGhiChu(null);

    const res = await api.staff["password-reset"].request.post({ email });
    setDangGui(false);

    if (res.error) {
      const khac = thongDiepLoi(res.error.value, "Không gửi được yêu cầu");
      setLoi(
        maLoi(res.error.value) === "CHUA_CAU_HINH_EMAIL"
          ? "Hệ thống chưa gửi được email — nhắn chủ shop để lấy mã, rồi gõ vào đây."
          : `${khac} — nếu không nhận được mã, nhắn chủ shop để lấy mã.`,
      );
    } else {
      setGhiChu("Nếu email tồn tại, mã 6 số đã được gửi. Mã sống 10 phút.");
    }
    setBuoc(2);
  }

  async function xacNhan(e: React.FormEvent) {
    e.preventDefault();
    setDangGui(true);
    setLoi(null);

    const res = await api.staff["password-reset"].confirm.post({ email, code, matKhauMoi });
    setDangGui(false);

    // Thông điệp của backend phân biệt được mã sai · mã hết hạn · mật khẩu yếu.
    // Gộp cả ba thành "mã không đúng" làm người dùng gõ lại mã đúng mãi mãi.
    if (res.error) setLoi(thongDiepLoi(res.error.value, "Không đổi được mật khẩu, thử lại sau"));
    else await navigate({ to: "/dang-nhap" });
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Quên mật khẩu</h1>

      {buoc === 1 ? (
        <form onSubmit={(e) => void guiYeuCau(e)} className="mt-4 flex flex-col gap-3">
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
          <button
            type="submit"
            disabled={dangGui}
            className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            {dangGui ? "Đang gửi…" : "Gửi mã"}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void xacNhan(e)} className="mt-4 flex flex-col gap-3">
          {ghiChu && <p className="text-sm text-gray-600">{ghiChu}</p>}
          {loi && <p className="rounded bg-amber-100 p-3 text-sm">{loi}</p>}
          {import.meta.env.DEV && (
            <p className="rounded bg-gray-100 p-2 text-sm">Môi trường dev: mã luôn là 999999</p>
          )}

          <label className="flex flex-col gap-1 text-sm">
            Mã 6 số
            <input
              inputMode="numeric"
              required
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded border px-3 py-2 tracking-widest"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Mật khẩu mới (ít nhất 8 ký tự)
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={matKhauMoi}
              onChange={(e) => setMatKhauMoi(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={dangGui}
            className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            {dangGui ? "Đang đổi…" : "Đặt mật khẩu mới"}
          </button>
          <button
            type="button"
            onClick={() => {
              setBuoc(1);
              setLoi(null);
            }}
            className="text-sm underline"
          >
            Đổi email khác
          </button>
        </form>
      )}

      <Link to="/dang-nhap" className="mt-4 inline-block text-sm underline">
        Quay lại đăng nhập
      </Link>
    </main>
  );
}
