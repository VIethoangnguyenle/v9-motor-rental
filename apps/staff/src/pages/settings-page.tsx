import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { BuildStamp } from "../components/layout/build-stamp";
import { Button } from "../components/ui/button";
import { Icon } from "../components/ui/icon";
import { ToggleGroup } from "../components/ui/toggle-group";
import { useMe } from "../hooks/use-me";
import { signOut } from "../lib/auth";
import { ROLE_LABEL } from "../lib/me";
import { applyChoice, readChoice, subscribeToTheme, type ThemeChoice } from "../lib/theme";

/**
 * Ba lựa chọn theme, hiện CÙNG LÚC — KHÔNG phải một nút xoay vòng qua ba trạng
 * thái. Nút xoay vòng là hình dạng đúng cho một hàng chật trong thanh điều
 * hướng, nơi mỗi hàng là một hành động và chỉ đủ chỗ cho một nhãn; nó sai ở một
 * trang thiết lập, nơi người ta tới để THẤY mình đang ở đâu trong một dải lựa
 * chọn, chứ không phải để bấm mù cho tới khi trúng.
 *
 * Khai ở tầng module chứ không dựng trong thân component: mảng dựng lại mỗi lần
 * render là một prop mới mỗi lần render, và nội dung nó thì không bao giờ đổi.
 */
const THEME_OPTIONS: readonly { readonly value: ThemeChoice; readonly label: string }[] = [
  { value: "system", label: "Theo máy" },
  { value: "light", label: "Sáng" },
  { value: "dark", label: "Tối" },
];

/**
 * Hàng bấm được dẫn sang một trang khác. Cùng NGUYÊN VĂN chuỗi class với `ROW`
 * của `stats/attention-list.tsx`: hai chỗ này là cùng một thứ — một hàng cao 44px
 * có chevron bên phải dẫn sang route khác — nên chúng phải phản hồi giống hệt
 * nhau khi rê chuột.
 */
const ROW =
  "flex min-h-11 items-center justify-between gap-3 rounded-card px-3 text-sm text-ink transition-[background-color] duration-(--duration-instant) ease-standard hover:bg-canvas";

/** Tiêu đề nhóm, cùng khuôn `revenue-cards.tsx` / `attention-list.tsx`. */
const GROUP_HEADING = "text-xs font-semibold tracking-wide text-muted uppercase";

/**
 * Trang Cài đặt: giao diện + tài khoản, gom về MỘT chỗ.
 *
 * Đây là chỗ ĐÚNG cho thiết lập tài khoản, và chân thanh điều hướng chỉ giữ một
 * dòng dẫn tới đây (`components/layout/app-nav.tsx`). Thêm một thiết lập mới thì
 * thêm vào trang này, không thêm hàng vào chân nav — chân nav phải chép sang cả
 * sidebar lẫn sheet "Thêm", nên mỗi hàng ở đó là hai chỗ để lệch nhau.
 *
 * KHÔNG gồm hai thứ nghe như thuộc về đây:
 *   • **Phát mã đặt lại 6 số** — việc của CHỦ SHOP làm cho NGƯỜI KHÁC, nên nó
 *     thuộc màn quản trị nhân viên (`/staff`), không thuộc trang thiết lập của
 *     chính mình.
 *   • **`/forgot-password`** — route CÔNG KHAI, dành cho người chưa đăng nhập
 *     được. Đặt lối vào nó ở đây là đặt nó sau đúng cánh cửa nó tồn tại để mở.
 *
 * `<div>`, không `<main>`: `AppShell` đã bọc `children` trong CHÍNH MỘT `<main>`
 * (xem chú thích ở `components/layout/app-shell.tsx`).
 *
 * `max-w-md` KHÔNG kèm `mx-auto` — cột hẹp bám lề trái, cùng khuôn
 * `change-password-page.tsx` và ô tìm kiếm ở `customers-list-page.tsx`: canh giữa
 * là cử chỉ của một trang đứng một mình, còn trang này nằm trong shell.
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useMe();

  // `readChoice` chạy ngay ở khung hình ĐẦU, không đợi một `useEffect`: đặt tạm
  // "system" rồi sửa sau nghĩa là khung đầu tô sáng sai ô. App dựng bằng
  // `createRoot`, không `hydrateRoot`, nên không có ràng buộc "server và client
  // phải render y hệt"; và `readChoice` tự bắt lỗi nên nơi không đọc được
  // `localStorage` (Safari riêng tư) vẫn ra "system" chứ không nổ.
  const choice = useSyncExternalStore(subscribeToTheme, readChoice);

  async function handleSignOut() {
    await signOut(qc);
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-bold text-ink">Cài đặt</h1>

      <section>
        <h2 className={GROUP_HEADING}>Tài khoản</h2>
        {/*
         * `me` là `null` khi query hỏng hoặc chưa xong. KHÔNG dựng khung rỗng và
         * cũng không đoán: guard ở `beforeLoad` đã đảm bảo có hồ sơ ACTIVE mới
         * vào được tới đây, nên `null` ở đây nghĩa là "chưa đọc xong", không
         * phải "không có ai" — nói đúng chừng đó.
         */}
        {me ? (
          <>
            <p className="mt-2 text-sm text-ink">
              {me.fullName} · {ROLE_LABEL[me.role]}
            </p>
            <p className="text-sm text-muted">{me.email}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Đang đọc hồ sơ…</p>
        )}
      </section>

      <section>
        <h2 className={GROUP_HEADING}>Giao diện</h2>
        <div className="mt-2">
          {/*
           * `aria-pressed` + `role="group"` của `ToggleGroup`, KHÔNG
           * `role="radiogroup"`. Lý lẽ của chính `ui/toggle-group.tsx` ("nút
           * LỌC/CHUYỂN CHẾ ĐỘ có hiệu lực ngay khi bấm, không phải một trường
           * trong form chờ submit") áp đúng ở đây: bấm là theme đổi tức thì,
           * không có nút Lưu nào.
           *
           * Và điều kiện thứ hai, nặng hơn: `radiogroup` HỨA một mô hình bàn
           * phím — một điểm dừng Tab cho cả nhóm, mũi tên di chuyển lựa chọn
           * (roving tabindex). `ToggleGroup` không có cái nào trong đó. Gắn
           * `radiogroup` mà không dựng kèm mô hình ấy thì trình đọc màn hình
           * đọc "nút chọn, 1 trên 3", người dùng bấm mũi tên, và KHÔNG có gì xảy
           * ra — tệ hơn hẳn ba nút bấm được bằng Enter/Space như hiện tại.
           */}
          <ToggleGroup
            label="Giao diện"
            options={THEME_OPTIONS}
            value={choice}
            onChange={applyChoice}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          &ldquo;Theo máy&rdquo; đi theo cài đặt sáng/tối của điện thoại hoặc máy tính.
        </p>
      </section>

      <section>
        <h2 className={GROUP_HEADING}>Bảo mật</h2>
        {/*
         * LINK sang `/change-password`, không nhúng form vào đây. Trang đó đứng
         * riêng vì đổi mật khẩu thành công sẽ ĐĂNG XUẤT người dùng
         * (`components/auth/change-password-form.tsx`) — một luồng kết thúc bằng
         * việc rời app không nên nằm lẫn giữa hai thiết lập đổi-là-xong.
         */}
        <div className="mt-2 flex flex-col items-start gap-3">
          <Link to="/change-password" className={`w-full ${ROW}`}>
            <span className="flex items-center gap-2">
              <Icon name="key" />
              Đổi mật khẩu
            </span>
            <Icon name="chevron-right" className="text-muted" />
          </Link>

          <Button type="button" variant="ghost" onClick={() => void handleSignOut()}>
            Đăng xuất
          </Button>
        </div>
      </section>

      {/*
       * NGOÀI nhóm "Bảo mật", dù nằm ngay dưới nút Đăng xuất: nhãn bản dựng không
       * phải một thiết lập và không liên quan gì tới bảo mật — nó là chân trang.
       *
       * ⚠️ ĐÂY là chỗ duy nhất nhãn bản dựng xuất hiện, và đó là một ĐÁNH ĐỔI đã
       * cân nhắc, không phải chỗ tiện tay. `build-stamp.tsx` lập luận rằng nó tồn
       * tại để biến "service worker đang phục vụ bản cache cũ" thành một cái liếc
       * mắt — mà liếc mắt thì cần nó nằm trong tầm nhìn ngoại vi ở MỌI trang, và ở
       * đây thì không. Cái mất là ca người dùng CHƯA nghi ngờ gì: giờ dựng đứng yên
       * mà không ai ngó tới. Cái giữ được là ca đã nghi — từ mọi trang, hàng Cài
       * đặt ở chân nav là ĐÚNG MỘT cú bấm, vẫn rẻ hơn nhiều bậc so với cách duy
       * nhất còn lại (mở DevTools đọc `navigator.serviceWorker.controller`).
       */}
      <BuildStamp />
    </div>
  );
}
