import type { Me } from "../../lib/me";
import { AppNav } from "./app-nav";

/**
 * Khung layout của mọi trang được bảo vệ. Nhận `me`/`onSignOut` qua prop và
 * chuyển thẳng xuống `AppNav` — shell KHÔNG tự gọi `useMe()` hay `signOut()`.
 * Nó chỉ dựng khung (sidebar ↔ bottom nav ↔ vùng nội dung cuộn), không biết gì
 * về cách lấy danh tính hay cách đăng xuất. Điều đó thuộc về nơi gọi nó
 * (`protectedLayoutRoute`, xem Task 7) — tách domain khỏi layout để cả hai test
 * và tái dùng được độc lập.
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
  onSignOut,
  children,
}: {
  readonly me: Me | null;
  readonly onSignOut: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row">
      {/*
       * Sidebar: chỉ hiện ≥768. `shrink-0` để hàng flex không bóp nó lại khi
       * nội dung bên phải dài; tự cao hết chiều dọc nhờ `align-items: stretch`
       * mặc định của flex-row, không cần khai `h-full` hay `overflow` riêng —
       * sidebar không cuộn, chỉ vùng nội dung mới cuộn.
       */}
      <aside className="hidden shrink-0 border-r border-border bg-surface md:flex md:w-[168px] xl:w-52">
        <AppNav variant="sidebar" me={me} onSignOut={onSignOut} />
      </aside>

      {/*
       * Vùng cuộn DUY NHẤT bọc cả nội dung lẫn bottom nav. Bottom nav dùng
       * `position: sticky` — sticky CHỈ có tác dụng bên trong một vùng cuộn
       * đang hoạt động, nên nó phải là con của CHÍNH div này, không phải anh em
       * của nó. Đặt `overflow-y-auto` ở đây (không phải ở `body`) nghĩa là
       * sidebar không bị cuốn theo khi nội dung dài.
       */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <main className="page-gutter flex-1 py-4">{children}</main>
        <AppNav variant="bottom" me={me} onSignOut={onSignOut} />
      </div>
    </div>
  );
}
