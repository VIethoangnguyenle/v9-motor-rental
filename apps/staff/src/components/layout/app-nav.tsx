import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAvatarUrl } from "../../hooks/use-avatar-url";
import { ROLE_LABEL, type Me } from "../../lib/me";
import { Modal } from "../ui/modal";
import { newRequestCountQuery } from "../../lib/requests";
import { Avatar } from "../ui/avatar";
import { Icon, type IconName } from "../ui/icon";

/**
 * Bảy điểm đến, hai hình dạng. `NAV_ITEMS` là danh sách duy nhất — sidebar
 * (≥768) hiện cả bảy; bottom nav (<768) chỉ có chỗ cho hai cái đầu trực tiếp
 * (Thống kê, Lịch), phần còn lại nằm sau nút **Thêm**. Một nguồn dữ liệu duy
 * nhất nghĩa là thêm một mục mới chỉ sửa MỘT chỗ, không phải nhớ sửa cả hai
 * hình dạng.
 *
 * `kind: "soon"` = tính năng chưa xây (Plan C+). Với các mục còn lại, route
 * CHƯA TỒN TẠI nên phần tử KHÔNG được là `<Link>` — một link tới route không
 * tồn tại là một cú 404 trong chính app của mình. `Lịch` (Task 6) và `Đơn
 * thuê` (Task 9) đã MỞ KHOÁ theo cùng khuôn: route đăng ký trước, nội dung
 * nghiệp vụ thật land sau (`RentalCalendar` ở `pages/calendar-page.tsx`,
 * `RentalsPage` ở `pages/rentals-page.tsx`), rồi mới chuyển sang `kind:
 * "link"` — không còn là ngoại lệ "có route nhưng chưa render được". Render
 * bằng `<button disabled>` cho các mục còn `"soon"`: không bấm được, không
 * nằm trong tab order, và trình đọc màn hình biết nó là nút bị vô hiệu hoá
 * chứ không phải nút hỏng.
 */
type NavItem =
  | {
      readonly kind: "link";
      readonly label: string;
      /** Hình nhận dạng điểm đến. Bảy dòng chữ cùng cỡ cùng màu thì mắt phải
       *  ĐỌC mới biết mình ở đâu; icon cho nhận ra bằng hình dạng. */
      readonly icon: IconName;
      readonly to: "/" | "/staff" | "/calendar" | "/customers" | "/requests" | "/rentals";
      /** Hiện số việc đang chờ cạnh nhãn. Chỉ `/requests` dùng, xem `AppNav`. */
      readonly badge?: "newRequests";
      readonly ownerOnly?: true;
    }
  | { readonly kind: "soon"; readonly label: string; readonly icon: IconName };

const NAV_ITEMS: readonly NavItem[] = [
  { kind: "link", label: "Thống kê", to: "/", icon: "nav-stats" },
  { kind: "link", label: "Lịch", to: "/calendar", icon: "nav-calendar" },
  { kind: "link", label: "Yêu cầu", to: "/requests", badge: "newRequests", icon: "nav-requests" },
  { kind: "link", label: "Đơn thuê", to: "/rentals", icon: "nav-rentals" },
  { kind: "link", label: "Khách hàng", to: "/customers", icon: "nav-customers" },
  { kind: "soon", label: "Bàn giao", icon: "nav-handover" },
  // Chỉ hiện với OWNER — đây là hàng rào của TRẢI NGHIỆM, không phải của dữ
  // liệu: `beforeLoad` của route `/staff` và `/staff/users*` ở server mới là
  // hàng rào thật (403 FORBIDDEN). Bỏ điều kiện ở đây thì STAFF thấy một link
  // dẫn tới trang trống toàn lỗi 403, không phải thấy dữ liệu.
  { kind: "link", label: "Nhân viên", to: "/staff", ownerOnly: true, icon: "nav-staff" },
];

function visibleFor(item: NavItem, me: Me | null): boolean {
  return !("ownerOnly" in item && item.ownerOnly) || me?.role === "OWNER";
}

/** Vùng chạm tối thiểu 44×44 ở MỌI biến thể — cùng ngưỡng đã áp cho `Button` (`ui/button.tsx`). */
const TOUCH = "flex min-h-11 min-w-11 items-center";

/**
 * Hàng bấm được: nền chạy tới `canvas` trong 120ms thay vì nhảy, cùng token với
 * `Button` và `stats/attention-list.tsx` — hai thứ bấm được thì phản hồi phải
 * giống nhau (design doc §4.4 mục 1).
 *
 * Khai một chỗ vì file này dựng hàng bấm được ở BỐN chỗ — mục điều hướng và hàng
 * Cài đặt, mỗi thứ hai bản (sidebar và sheet "Thêm"): bốn bản chép tay là bốn chỗ
 * để lệch nhau.
 *
 * KHÔNG gộp vào `TOUCH`: ba mục bottom nav cũng dùng `TOUCH` mà không có nền
 * hover nào — thêm transition ở đó là một khai báo không animate gì.
 *
 * Cú pháp `duration-(--duration-instant)` chứ không `duration-instant`, và
 * `transition-[background-color]` chứ không `transition-colors`: lý lẽ đầy đủ ở
 * `index.css` (chỗ khai token) và `stats/attention-list.tsx` (vòng tiêu điểm).
 */
const HOVER_ROW =
  "transition-[background-color] duration-(--duration-instant) ease-standard hover:bg-canvas";

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
}: {
  readonly variant: "sidebar" | "bottom";
  readonly me: Me | null;
}) {
  if (variant === "sidebar") return <SidebarNav me={me} />;
  return <BottomNav me={me} />;
}

/**
 * ⛔ Chân thanh điều hướng giữ ĐÚNG MỘT dòng. Thiết lập tài khoản mới đi vào
 * `/settings` (`pages/settings-page.tsx`), KHÔNG thêm hàng thứ hai ở đây: mỗi
 * hàng thêm vào đáy nav là một thứ cạnh tranh chú ý với chính bảy điểm đến bên
 * trên nó, và phải chép sang cả sheet "Thêm" — hai bản để lệch nhau.
 *
 * Dòng này là một LỐI ĐI, không phải một hành động. Đó là lý do nó là `Link` có
 * chevron chứ không phải nút, và là lý do "Đăng xuất" không được phép quay lại
 * đây: một nút phá huỷ phiên nằm lẫn trong danh sách điểm đến là một nút bấm
 * nhầm.
 *
 * Tên người dùng làm NHÃN, không phải chữ "Cài đặt": chân nav phải hiện danh
 * tính, nên gộp hai việc vào một hàng thay vì tiêu hai dòng cho chúng. Nhưng tên
 * người không nói được nó dẫn đi đâu, nên có thêm `sr-only` "Cài đặt" — tên khả
 * dụng đọc ra "Cài đặt Nguyễn Văn A · Chủ shop", tức CHỨA nguyên văn chữ đang
 * nhìn thấy (WCAG 2.5.3 Label in Name). Một `aria-label` thì ĐÈ LÊN chữ đó và
 * làm hỏng đúng tiêu chí ấy; đừng đổi sang cách đó.
 *
 * `onNavigate` chỉ bản trong sheet cần, để đóng sheet khi bấm — bản sidebar
 * không có gì phải đóng.
 */
function SettingsRow({
  me,
  onNavigate,
}: {
  readonly me: Me | null;
  readonly onNavigate?: () => void;
}) {
  // Gọi vô điều kiện (luật của hook), nhưng KHÔNG tốn request nào khi chưa có hồ
  // sơ hoặc người này chưa có ảnh — `version === null` thì hook không fetch.
  const avatarUrl = useAvatarUrl(me?.id ?? "", me?.avatarVersion ?? null);
  return (
    <Link
      to="/settings"
      onClick={onNavigate}
      className={`${TOUCH} justify-between gap-2 rounded-card px-3 text-ink ${HOVER_ROW}`}
      activeProps={{ className: "bg-canvas font-semibold" }}
    >
      {/* `min-w-0`: không có nó thì `truncate` của con không cắt được — mục flex
          mặc định `min-width: auto`, tức nó nở theo nội dung và đẩy chevron ra
          ngoài thay vì để chữ bị cắt. */}
      <span className="flex min-w-0 items-center gap-2">
        {me ? (
          <>
            {/* Avatar THAY bánh răng, không đứng cạnh nó. Hàng này đã mang danh
                tính người dùng làm nhãn (xem chú thích của `SettingsRow`), nên
                hình dẫn đầu phải nói cùng điều đó; hai hình trong một hàng 44px
                bị `truncate` bóp thì cái thứ hai chỉ ăn mất chỗ của tên. Điểm
                đến vẫn đọc được: chevron nói "dẫn đi đâu đó" và `sr-only` nói
                thẳng "Cài đặt". */}
            <Avatar name={me.fullName} seed={me.id} src={avatarUrl} />
            <span className="sr-only">Cài đặt</span>
            <span className="truncate">
              {me.fullName} · {ROLE_LABEL[me.role]}
            </span>
          </>
        ) : (
          // `me` chưa đọc xong: hiện tên MÀN HÌNH, không phải một khuôn có chỗ
          // trống. Nội suy thẳng `me?.fullName` vào đây cho ra đúng chuỗi " · "
          // trơ trọi ở khoảnh khắc đó — một dòng không đọc ra nghĩa gì. Và khi
          // chưa có tên thì cũng chưa có avatar để vẽ: bánh răng là hình đúng
          // cho một hàng lúc này chỉ nói được "Cài đặt".
          <>
            <Icon name="settings" />
            <span className="truncate">Cài đặt</span>
          </>
        )}
      </span>
      <Icon name="chevron-right" className="text-muted" />
    </Link>
  );
}

/**
 * Số yêu cầu chưa xử lý, hiện cạnh nhãn "Yêu cầu".
 *
 * `null` = chưa biết (query lỗi hoặc đang tải) và khi đó KHÔNG vẽ gì. Một badge
 * "0" khi thực ra không đọc được số là nói dối theo hướng nguy hiểm nhất ở đây:
 * nhân viên tin rằng không có việc gì chờ.
 */
function NewRequestBadge() {
  const { data } = useQuery(newRequestCountQuery);
  if (data === null || data === undefined || data === 0) return null;
  return (
    <span
      className="rounded-card bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink"
      aria-label={`${String(data)} yêu cầu chưa xử lý`}
    >
      {data}
    </span>
  );
}

function SidebarNav({ me }: { readonly me: Me | null }) {
  return (
    // Cùng `aria-label` với bottom nav, và điều đó ĐÚNG chứ không phải trùng
    // lặp: `AppShell` dựng cả hai biến thể, nhưng `hidden md:flex` / `md:hidden`
    // cho `display: none` nên tại mỗi bề rộng chỉ một cái nằm trong cây a11y.
    // Trước đây bản sidebar không có tên nào, nên nó hiện ra trong danh sách
    // landmark chỉ là "navigation".
    <nav aria-label="Điều hướng chính" className="flex h-full w-full flex-col p-3 text-sm">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => visibleFor(item, me)).map((item) => (
          <li key={item.label}>
            {item.kind === "link" ? (
              <Link
                to={item.to}
                className={`${TOUCH} rounded-card px-3 text-ink ${HOVER_ROW}`}
                activeProps={{ className: "bg-canvas font-semibold" }}
              >
                <span className="flex w-full items-center gap-2">
                  <Icon name={item.icon} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge === "newRequests" && <NewRequestBadge />}
                </span>
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className={`${TOUCH} w-full gap-2 rounded-card px-3 text-muted`}
              >
                <Icon name={item.icon} />
                <span className="flex-1 truncate text-left">{item.label}</span>
                <span className="rounded-card bg-canvas px-2 py-0.5 text-xs text-muted">
                  sắp có
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Chân sidebar: một dòng, đẩy xuống đáy bằng `mt-auto`. */}
      <div className="mt-auto border-t border-border pt-3">
        <SettingsRow me={me} />
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
function BottomNav({ me }: { readonly me: Me | null }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = () => setMoreOpen(false);

  /*
   * Đóng sheet khi cửa sổ vượt qua 768px — cùng ngưỡng `md` mà `AppShell` dùng
   * để đổi bottom nav ↔ sidebar.
   *
   * Cần thiết vì `<dialog>` nằm ở TOP LAYER: bản `<div>` cũ mang `md:hidden` nên
   * xoay ngang điện thoại hay kéo rộng cửa sổ là sheet tự biến mất theo CSS,
   * nhưng một phần tử top layer vẽ trên mọi thứ và `md:hidden` của thanh nav cha
   * không còn che nó giúp. Không có effect này thì mở sheet ở 400px rồi xoay
   * ngang sẽ để lại một sheet điện thoại nằm giữa layout desktop.
   *
   * Kiểm `mq.matches` NGAY chứ không chỉ nghe `change`: `AppNav` được `AppShell`
   * dựng ở cả hai biến thể cùng lúc, nên `BottomNav` vẫn mount ở ≥768px.
   */
  useEffect(() => {
    if (!moreOpen) return;
    const mq = window.matchMedia("(min-width: 768px)");
    if (mq.matches) {
      setMoreOpen(false);
      return;
    }
    const onChange = () => {
      if (mq.matches) setMoreOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [moreOpen]);

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
          <Icon name="nav-stats" />
          {home?.label}
        </Link>

        <Link
          to={lich?.kind === "link" ? lich.to : "/calendar"}
          className={`${TOUCH} flex-1 flex-col justify-center gap-0.5 text-ink`}
          activeProps={{ className: "font-semibold" }}
        >
          <Icon name="nav-calendar" />
          {lich?.label}
        </Link>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`${TOUCH} flex-1 flex-col justify-center gap-0.5 text-ink`}
        >
          <Icon name="plus" />
          Thêm
        </button>
      </nav>

      {/*
       * "Thêm" mở SHEET, không phải trang riêng — chọn sheet vì nó không đòi
       * thêm route: mọi trang mới đều phải khai trong `router.tsx`. Sheet là
       * state cục bộ trong component.
       *
       * Trước đây đây là lớp phủ DỞ NHẤT trong ba lớp phủ của app: không đóng
       * được bằng Esc, không đưa tiêu điểm vào, không trả tiêu điểm về, không
       * bẫy Tab — mà nó lại là ĐIỀU HƯỚNG CHÍNH trên điện thoại, tức người dùng
       * bàn phím mở nó ra là không có đường ra. `ui/modal.tsx` (`showModal()`)
       * cho cả bốn thứ đó.
       */}
      {moreOpen && (
        <Modal label="Thêm" placement="bottom" onClose={closeMore}>
          {(close) => (
            <div>
              <ul className="flex flex-col gap-1 p-3">
                {moreItems.map((item) => (
                  <li key={item.label}>
                    {item.kind === "link" ? (
                      <Link
                        to={item.to}
                        onClick={close}
                        className={`${TOUCH} gap-2 rounded-card px-3 text-ink ${HOVER_ROW}`}
                      >
                        <Icon name={item.icon} />
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className={`${TOUCH} w-full gap-2 rounded-card px-3 text-muted`}
                      >
                        <Icon name={item.icon} />
                        <span className="flex-1 truncate text-left">{item.label}</span>
                        <span className="rounded-card bg-canvas px-2 py-0.5 text-xs text-muted">
                          sắp có
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {/* Cùng MỘT `SettingsRow` với sidebar — chân nav ở hai hình dạng
                  phải dẫn tới cùng một chỗ và trông như nhau. `close` để sheet
                  không còn nằm đó sau khi đã chuyển trang. */}
              <div className="border-t border-border p-3">
                <SettingsRow me={me} onNavigate={close} />
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
