import type { Me } from "../../lib/me";
import { AppNav } from "./app-nav";

/**
 * Khung layout của mọi trang được bảo vệ. Nhận `me` qua prop và chuyển thẳng
 * xuống `AppNav` — shell KHÔNG tự gọi `useMe()`. Nó chỉ dựng khung (sidebar ↔
 * bottom nav ↔ vùng nội dung cuộn), không biết gì về cách lấy danh tính. Điều đó
 * thuộc về nơi gọi nó (`protectedLayoutRoute`) — tách domain khỏi layout để cả
 * hai test và tái dùng được độc lập.
 *
 * Đăng xuất KHÔNG đi qua đây: nó là một nút trên `/settings`
 * (`pages/settings-page.tsx`), tự gọi `signOut` + `navigate` tại chỗ. Đừng thêm
 * lại một prop `onSignOut` — nó phải xuyên bốn tầng (`router` → `AppShell` →
 * `AppNav` → `SidebarNav`/`BottomNav`) để tới một chỗ vốn đã có sẵn
 * `useNavigate` và `useQueryClient`.
 *
 * Ba breakpoint khớp thang cách đã khai ở `index.css`/Task 2:
 *   <768        không sidebar, điều hướng chuyển xuống bottom nav 56px + pb-safe
 *   768–1279    sidebar rộng 168px
 *   ≥1280       sidebar giãn ra 208px
 *
 * `w-52` (13rem = 208px) NẰM trên thang cách mặc định của Tailwind nên dùng
 * được thẳng tên lớp. `168px` (10.5rem) thì KHÔNG — thang mặc định nhảy từ 160px
 * (`w-40`) sang 176px (`w-44`), không có bậc nào đúng 168px. `w-[168px]` là
 * arbitrary value cho WIDTH, không phải padding/margin/gap, nên hàng rào thang
 * cách ở `spacing-fence.test.ts` (chỉ khoá nhóm khoảng cách) không chặn nó.
 */
export function AppShell({
  me,
  children,
}: {
  readonly me: Me | null;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row">
      {/*
       * Bỏ qua điều hướng (WCAG 2.4.1 Bypass Blocks, mức A).
       *
       * App đã có landmark `<nav>`/`<main>`, mà kỹ thuật ARIA11 được chấp nhận
       * là cách thoả SC này — nên đây không phải sửa một vi phạm, mà là bịt chỗ
       * mà landmark KHÔNG giúp được: người dùng **chỉ dùng bàn phím, không dùng
       * trình đọc màn hình**. Họ không có danh sách landmark để nhảy, nên trước
       * link này họ phải Tab qua 7 mục nav trên MỌI trang.
       *
       * `sr-only` cho tới khi nhận tiêu điểm — chỉ bàn phím mới tới được nó, nên
       * dùng `focus:` chứ không `focus-visible:`.
       */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-card focus:border focus:border-border focus:bg-surface focus:px-4 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Bỏ qua điều hướng
      </a>
      {/*
       * Sidebar: chỉ hiện ≥768. `shrink-0` để hàng flex không bóp nó lại khi
       * nội dung bên phải dài; tự cao hết chiều dọc nhờ `align-items: stretch`
       * mặc định của flex-row, không cần khai `h-full` hay `overflow` riêng —
       * sidebar không cuộn, chỉ vùng nội dung mới cuộn.
       */}
      <aside className="hidden shrink-0 border-r border-border bg-surface md:flex md:w-[168px] xl:w-52">
        <AppNav variant="sidebar" me={me} />
      </aside>

      {/*
       * Vùng cuộn DUY NHẤT bọc cả nội dung lẫn bottom nav. Bottom nav dùng
       * `position: sticky` — sticky CHỈ có tác dụng bên trong một vùng cuộn
       * đang hoạt động, nên nó phải là con của CHÍNH div này, không phải anh em
       * của nó. Đặt `overflow-y-auto` ở đây (không phải ở `body`) nghĩa là
       * sidebar không bị cuốn theo khi nội dung dài.
       */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* `tabIndex={-1}`: không có nó thì nhảy `#main` chỉ cuộn màn hình mà
            KHÔNG chuyển tiêu điểm — lần Tab kế tiếp lại quay về ngay sau skip
            link, tức nút đầu tiên của nav, và link trở thành vô dụng. */}
        {/*
          `max-w-app` (1440px, khai ở `index.css`) + `mx-auto`: TRẦN bề rộng nội dung.

          Không có nó, `main` giãn theo cửa sổ — đo ở 1920px: `main` rộng 1712px
          và dòng văn xuôi dài nhất chạy **1664px ≈ 208ch**, trong khi ngưỡng đọc
          được là 65–75ch. Hệ quả không chỉ ở chữ: hàng "Cần chú ý" kéo ngang
          1650px với mũi tên mắc kẹt tận mép phải, nên mắt phải đi hết bề ngang
          màn hình mới tới chỗ bấm; ba thẻ doanh thu phình ~550px cho một con số.

          Con số và lý lẽ chọn 1440 nằm cạnh chỗ khai token, không chép lại ở đây.

          `w-full` bắt buộc đi kèm: `main` là flex item của cột dọc bọc ngoài, và
          `max-width` một mình không ép nó nở ra trước khi bị chặn.
        */}
        <main id="main" tabIndex={-1} className="page-gutter mx-auto w-full max-w-app flex-1 py-4">
          {children}
        </main>
        <AppNav variant="bottom" me={me} />
      </div>
    </div>
  );
}
