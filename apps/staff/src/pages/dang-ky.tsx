import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { dangKy } from "../lib/auth";

/**
 * `soDienThoai` là field optional ở backend (`plugins/auth.ts` khai
 * `{ id: "soDienThoai", optional: true }`) nên form cũng không bắt buộc — hai
 * bên lệch nhau thì người dùng bị chặn ở client vì một luật server không có.
 */
const TRUONG = [
  { key: "hoTen", nhan: "Họ và tên", type: "text", batBuoc: true, autoComplete: "name" },
  { key: "soDienThoai", nhan: "Số điện thoại", type: "tel", batBuoc: false, autoComplete: "tel" },
  { key: "email", nhan: "Email", type: "email", batBuoc: true, autoComplete: "email" },
  {
    key: "matKhau",
    nhan: "Mật khẩu (ít nhất 8 ký tự)",
    type: "password",
    batBuoc: true,
    autoComplete: "new-password",
  },
] as const;

export function DangKyPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ hoTen: "", soDienThoai: "", email: "", matKhau: "" });
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((truoc) => ({ ...truoc, [k]: e.target.value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDangGui(true);
    setLoi(null);
    const res = await dangKy(form);
    setDangGui(false);
    // Đăng ký xong SuperTokens đã tạo session, nhưng tài khoản ở trạng thái chờ
    // duyệt — nên đi thẳng tới màn giải thích, không phải trang chủ (trang chủ
    // sẽ đá về đây, chỉ tốn thêm một vòng).
    if (res.ok) await navigate({ to: "/cho-duyet" });
    else setLoi(res.message);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Tạo tài khoản nhân viên</h1>
      <p className="mt-2 text-sm text-gray-600">
        Tài khoản cần chủ shop duyệt trước khi dùng được.
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-4 flex flex-col gap-3">
        {TRUONG.map(({ key, nhan, type, batBuoc, autoComplete }) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            {nhan}
            <input
              type={type}
              required={batBuoc}
              minLength={key === "matKhau" ? 8 : undefined}
              autoComplete={autoComplete}
              value={form[key]}
              onChange={set(key)}
              className="rounded border px-3 py-2"
            />
          </label>
        ))}

        {loi && <p className="text-sm text-red-600">{loi}</p>}

        <button
          type="submit"
          disabled={dangGui}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {dangGui ? "Đang gửi…" : "Đăng ký"}
        </button>
      </form>

      <Link to="/dang-nhap" className="mt-4 inline-block text-sm underline">
        Đã có tài khoản
      </Link>
    </main>
  );
}
