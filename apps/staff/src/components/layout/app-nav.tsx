import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Me } from "../../lib/me";

/**
 * Sáu điểm đến, hai hình dạng. `NAV_ITEMS` là danh sách duy nhất — sidebar
 * (≥768) hiện cả sáu; bottom nav (<768) chỉ có chỗ cho hai cái đầu trực tiếp
 * (Thống kê, Lịch), phần còn lại nằm sau nút **Thêm**. Một nguồn dữ liệu duy
 * nhất nghĩa là thêm một mục mới chỉ sửa MỘT chỗ, không phải nhớ sửa cả hai
 * hình dạng.
 *
 * `kind: "soon"` = tính năng chưa xây (Plan C+). Với các mục còn lại, route
 * CHƯA TỒN TẠI nên phần tử KHÔNG được là `<Link>` — một link tới route không
 * tồn tại là một cú 404 trong chính app của mình. `Lịch` đã MỞ KHOÁ ở Task 6:
 * route `/calendar` (đăng ký ở Task 3) nay có nội dung nghiệp vụ thật
 * (`RentalCalendar`, xem `pages/calendar-page.tsx`), nên chuyển hẳn sang
 * `kind: "link"` — không còn là ngoại lệ "có route nhưng chưa render được".
 * Render bằng `<button disabled>` cho các mục còn `"soon"`: không bấm được,
 * không nằm trong tab order, và trình đọc màn hình biết nó là nút bị vô hiệu
 * hoá chứ không phải nút hỏng.
 */
type NavItem =
  | {
      readonly kind: "link";
      readonly label: string;
      readonly to: "/" | "/staff" | "/calendar" | "/customers";
      readonly ownerOnly?: true;
    }
  | { readonly kind: "soon"; readonly label: string };

const NAV_ITEMS: readonly NavItem[] = [
  { kind: "link", label: "Thống kê", to: "/" },
  { kind: "link", label: "Lịch", to: "/calendar" },
  { kind: "soon", label: "Đơn thuê" },
  { kind: "link", label: "Khách hàng", to: "/customers" },
  { kind: "soon", label: "Bàn giao" },
  // Chỉ hiện với OWNER — đây là hàng rào của TRẢI NGHIỆM, không phải của dữ
  // liệu: `beforeLoad` của route `/staff` và `/staff/users*` ở server mới là
  // hàng rào thật (403 FORBIDDEN). Bỏ điều kiện ở đây thì STAFF thấy một link
  // dẫn tới trang trống toàn lỗi 403, không phải thấy dữ liệu.
  { kind: "link", label: "Nhân viên", to: "/staff", ownerOnly: true },
];

function visibleFor(item: NavItem, me: Me | null): boolean {
  return !("ownerOnly" in item && item.ownerOnly) || me?.role === "OWNER";
}

/** Vùng chạm tối thiểu 44×44 ở MỌI biến thể — cùng ngưỡng đã áp cho `Button` (`ui/button.tsx`). */
const TOUCH = "flex min-h-11 min-w-11 items-center";

/**
 * Thanh điều hướng, hai biến thể. `AppShell` (Task 5) gọi component này HAI
 * LẦN — một lần trong `<aside>` với `variant="sidebar"`, một lần trong vùng
 * cuộn với `variant="bottom"` — vì hai biến thể nằm ở hai vị trí khác nhau
 * trong cây DOM (sidebar đứng ngoài vùng cuộn; bottom nav phải nằm TRONG vùng
 * cuộn để `position: sticky` có tác dụng). CSS ẩn/hiện một phần tử không di
 * chuyển nó sang cha khác được, nên hai lần gọi là cách duy nhất, không phải
 * một Fragment chứa cả hai.
 */
export function AppNav({
  // `variant` BẮT BUỘC, không có giá trị mặc định. Từng có mặc định `"bottom"` trong
  // đúng một khoảng: giữa lúc file này được viết lại và lúc `health-page.tsx` thôi tự
  // render nav — nó chỉ tồn tại để chỗ gọi cũ còn biên dịch được. Chỗ gọi đó đã biến mất,
  // nên mặc định thành nợ: nó biến "quên truyền variant" từ lỗi biên dịch thành một thanh
  // nav lặng lẽ render sai biến thể.
  variant,
  me,
  onSignOut,
}: {
  readonly variant: "sidebar" | "bottom";
  readonly me: Me | null;
  readonly onSignOut: () => void;
}) {
  if (variant === "sidebar") return <SidebarNav me={me} onSignOut={onSignOut} />;
  return <BottomNav me={me} onSignOut={onSignOut} />;
}

function SidebarNav({ me, onSignOut }: { readonly me: Me | null; readonly onSignOut: () => void }) {
  return (
    <nav className="flex h-full w-full flex-col p-3 text-sm">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => visibleFor(item, me)).map((item) => (
          <li key={item.label}>
            {item.kind === "link" ? (
              <Link
                to={item.to}
                className={`${TOUCH} rounded-card px-3 text-ink hover:bg-canvas`}
                activeProps={{ className: "bg-canvas font-semibold" }}
              >
                {item.label}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className={`${TOUCH} w-full justify-between rounded-card px-3 text-muted`}
              >
                {item.label}
                <span className="rounded-card bg-canvas px-2 py-0.5 text-xs text-muted">
                  sắp có
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Chân sidebar: danh tính + hai hành động tài khoản, đẩy xuống đáy bằng `mt-auto`. */}
      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-3">
        <p className="truncate px-3 text-xs text-muted">
          {me?.fullName} · {me?.role}
        </p>
        <Link
          to="/change-password"
          className={`${TOUCH} rounded-card px-3 text-ink hover:bg-canvas`}
        >
          Đổi mật khẩu
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className={`${TOUCH} rounded-card px-3 text-left text-ink hover:bg-canvas`}
        >
          Đăng xuất
        </button>
      </div>
    </nav>
  );
}

/**
 * Đúng 3 ô trực tiếp (Thống kê · Lịch · Thêm), không phải 4. Bảng mục ở
 * CLAUDE.md/design doc gán CHỈ Thống kê và Lịch cho bottom nav trực tiếp —
 * bốn mục còn lại (Đơn thuê, Khách hàng, Bàn giao, Nhân viên) và hai hành động
 * tài khoản đều "trong Thêm". Làm đúng bảng đó cho ra 3 ô, không phải 4: phần
 * mô tả ("bốn ô ~85px") không khớp với chính bảng nó đi kèm. Ưu tiên bảng —
 * nó cụ thể tới từng route — và 3 ô rộng hơn 4 ô nên vẫn thoả mọi ngưỡng vùng
 * chạm/chữ mà phần mô tả kia đang bảo vệ.
 */
function BottomNav({ me, onSignOut }: { readonly me: Me | null; readonly onSignOut: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = () => setMoreOpen(false);

  const [home, lich, ...rest] = NAV_ITEMS;
  const moreItems = rest.filter((item) => visibleFor(item, me));

  return (
    <>
      <nav
        className="sticky bottom-0 z-10 flex min-h-14 shrink-0 items-stretch border-t border-border bg-surface pb-safe text-xs md:hidden"
        aria-label="Điều hướng chính"
      >
        <Link
          to={home?.kind === "link" ? home.to : "/"}
          className={`${TOUCH} flex-1 flex-col justify-center gap-0.5 text-ink`}
          activeProps={{ className: "font-semibold" }}
        >
          {home?.label}
        </Link>

        <Link
          to={lich?.kind === "link" ? lich.to : "/calendar"}
          className={`${TOUCH} flex-1 flex-col justify-center gap-0.5 text-ink`}
          activeProps={{ className: "font-semibold" }}
        >
          {lich?.label}
        </Link>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`${TOUCH} flex-1 flex-col justify-center gap-0.5 text-ink`}
        >
          Thêm
        </button>
      </nav>

      {/*
       * "Thêm" mở SHEET, không phải trang riêng — chọn sheet vì nó không đòi
       * thêm route: mọi trang mới đều phải khai trong `router.tsx`, mà Task 6
       * này bị cấm sửa file ngoài `components/layout/`. Sheet là state cục bộ
       * trong component, dựng bằng `fixed` (không phải `sticky`) vì đây là lớp
       * phủ TẠM THỜI đứng trên toàn trang, khác hẳn bài toán "nav luôn ở đáy"
       * mà `BottomNav` giải bằng sticky.
       */}
      {moreOpen && (
        <div className="fixed inset-0 z-20 md:hidden">
          <button
            type="button"
            aria-label="Đóng"
            onClick={closeMore}
            className="absolute inset-0 bg-ink/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Thêm"
            className="absolute inset-x-0 bottom-0 rounded-t-card border-t border-border bg-surface pb-safe"
          >
            <ul className="flex flex-col gap-1 p-3">
              {moreItems.map((item) => (
                <li key={item.label}>
                  {item.kind === "link" ? (
                    <Link
                      to={item.to}
                      onClick={closeMore}
                      className={`${TOUCH} rounded-card px-3 text-ink hover:bg-canvas`}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className={`${TOUCH} w-full justify-between rounded-card px-3 text-muted`}
                    >
                      {item.label}
                      <span className="rounded-card bg-canvas px-2 py-0.5 text-xs text-muted">
                        sắp có
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-1 border-t border-border p-3">
              <p className="truncate px-3 text-xs text-muted">
                {me?.fullName} · {me?.role}
              </p>
              <Link
                to="/change-password"
                onClick={closeMore}
                className={`${TOUCH} rounded-card px-3 text-ink hover:bg-canvas`}
              >
                Đổi mật khẩu
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMore();
                  onSignOut();
                }}
                className={`${TOUCH} rounded-card px-3 text-left text-ink hover:bg-canvas`}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
