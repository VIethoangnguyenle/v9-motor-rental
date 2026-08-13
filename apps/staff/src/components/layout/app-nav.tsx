import { Link } from "@tanstack/react-router";
import type { Me } from "../../lib/me";

/**
 * Thanh điều hướng tối thiểu, và "tối thiểu" là có chủ ý: không có nó thì đăng
 * nhập xong không có đường nào tới `/staff` và không có đường nào đăng xuất.
 * Trước đây chôn trong trang health, nên `/staff` phải tự chế một link
 * "← Trang chủ" thay vì dùng chung nav thật.
 *
 * Link `/staff` chỉ hiện với OWNER — đây là hàng rào của TRẢI NGHIỆM, không
 * phải của dữ liệu: `beforeLoad` của route đó và `/staff/users*` ở server mới là
 * hàng rào thật. Bỏ điều kiện ở đây thì STAFF thấy một link dẫn tới trang trống
 * toàn lỗi 403, không phải thấy dữ liệu.
 */
export function AppNav({
  me,
  onSignOut,
}: {
  readonly me: Me | null;
  readonly onSignOut: () => void;
}) {
  return (
    <nav className="flex items-center gap-4 border-b pb-3 text-sm">
      <strong>{me?.fullName}</strong>
      <span className="text-gray-600">{me?.role}</span>
      {me?.role === "OWNER" && (
        <Link to="/staff" className="underline">
          Nhân viên
        </Link>
      )}
      <Link to="/change-password" className="underline">
        Đổi mật khẩu
      </Link>
      <button onClick={onSignOut} className="ml-auto underline">
        Đăng xuất
      </button>
    </nav>
  );
}
