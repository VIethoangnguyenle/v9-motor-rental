import { Link } from "@tanstack/react-router";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Icon } from "../components/ui/icon";
import { PageShell } from "../components/ui/page-shell";
import { Skeleton } from "../components/ui/skeleton";

/**
 * Hai màn hình mà TanStack Router dựng khi không có gì khớp, hoặc khi một route
 * ném lỗi. Không khai thì router dùng bản mặc định của thư viện — **tiếng Anh**,
 * trong một app toàn tiếng Việt, và không có đường nào đi tiếp ngoài nút Back.
 *
 * `router.tsx` đã lo đúng chuyện này cho một ca hẹp (comment ở nhánh
 * `signOutThenRedirect`: "signOut hỏng thì `throw redirect` không chạy, và
 * TanStack dựng màn lỗi mặc định tiếng Anh — trên chính đường guard, tức chỗ tệ
 * nhất để kẹt lại"). Cái thiếu là hàng rào CHUNG cho mọi route còn lại.
 *
 * ── VÌ SAO MỖI MÀN CÓ HAI BẢN ─────────────────────────────────────────────
 *
 * Bản `PageShell` bên dưới đúng cho ca **chưa đăng nhập** (gõ nhầm URL trước khi
 * vào, hoặc `AppShell` chưa kịp dựng): màn hình đó không có nav, nên nó phải tự
 * mang nền và khung hẹp của mình. Lý lẽ đó không đổi.
 *
 * Nhưng gắn CHÍNH bản đó làm mặc định của router thì nó cũng render tại một
 * route **đã nằm trong** `AppShell` — và ở đó `PageShell` là `<main>` thứ hai
 * lồng trong `<main>`, cộng thêm `min-h-screen` và `page-gutter` thứ hai. Đo
 * được ở `/customers/id-sai/sau`: `main = 2`, và cột nội dung tụt vào giữa với
 * lề gấp đôi trong khi sidebar bị bóp lại. Cùng con bug đã sửa cho
 * `/change-password` — file đó nay là `<div className="max-w-sm">`, không phải
 * `PageShell`.
 *
 * Nên: giữ nguyên bản ngoài shell làm mặc định của router, và khai thêm bản
 * trong-shell (`<div>` trần, đúng khuôn `RoutePendingPage` và
 * `ChangePasswordPage`) ở `protectedLayoutRoute` — TanStack cho khai
 * `notFoundComponent`/`errorComponent` theo từng route, nên route nào biết mình
 * nằm trong shell thì tự mang bản đúng.
 *
 * Thân của mỗi màn nằm trong một component dùng chung: hai bản chỉ khác KHUNG,
 * và chép nội dung ra làm hai là chép ra hai chỗ để lệch nhau.
 */
function NotFoundBody() {
  return (
    <>
      <p className="mt-3 text-sm text-muted">
        Đường dẫn này không có trong app. Có thể bạn gõ nhầm, hoặc mở một link cũ từ hồi trang đó
        còn tồn tại.
      </p>
      {/* `min-h-11` khớp ngưỡng vùng chạm app tự đặt — đây có thể là thứ duy
          nhất bấm được trên màn hình, nên nó phải bấm trúng được. */}
      <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-sm underline">
        <Icon name="arrow-left" className="mr-1" />
        Về trang Thống kê
      </Link>
    </>
  );
}

export function NotFoundPage() {
  return (
    <PageShell title="Không tìm thấy trang">
      <NotFoundBody />
    </PageShell>
  );
}

/** Bản 404 cho route đã nằm TRONG `AppShell` — xem chú thích khối ở trên. */
export function NotFoundInShell() {
  return (
    <div className="max-w-sm">
      <h1 className="text-xl font-bold text-ink">Không tìm thấy trang</h1>
      <NotFoundBody />
    </div>
  );
}

/**
 * Lỗi chưa bắt được ở một route.
 *
 * Hiện `error.message` chứ không nuốt: thông điệp của backend trong app này
 * được viết bằng tiếng Việt và nói đúng chuyện gì xảy ra (`lib/errors.ts`), nên
 * giấu nó đi là bỏ mất thứ hữu ích nhất trên màn hình. Nếu đó là lỗi runtime
 * của JS thì câu tiếng Anh vẫn tốt hơn một ô trống — người dùng đọc nó cho chủ
 * shop qua Zalo được.
 */
function RouteErrorBody({ error }: { readonly error: Error }) {
  return (
    <div className="mt-3 flex flex-col items-start gap-3">
      <Alert tone="error">{error.message}</Alert>
      <p className="text-sm text-muted">
        Tải lại trang thường là đủ. Nếu vẫn lỗi, chụp màn hình này gửi cho chủ shop.
      </p>
      {/*
       * `window.location.reload()` chứ không phải `router.invalidate()`: tới
       * được đây nghĩa là một thứ gì đó trong cây React đã ném, và state của
       * cây đó không còn đáng tin. Nạp lại từ đầu là hành động DUY NHẤT chắc
       * chắn dọn sạch, và nó cũng là thứ người dùng sẽ tự làm.
       */}
      <Button type="button" onClick={() => window.location.reload()}>
        Tải lại trang
      </Button>
    </div>
  );
}

export function RouteErrorPage({ error }: { readonly error: Error }) {
  return (
    <PageShell title="Có lỗi xảy ra">
      <RouteErrorBody error={error} />
    </PageShell>
  );
}

/** Bản màn lỗi cho route đã nằm TRONG `AppShell` — xem chú thích khối ở trên. */
export function RouteErrorInShell({ error }: { readonly error: Error }) {
  return (
    <div className="max-w-sm">
      <h1 className="text-xl font-bold text-ink">Có lỗi xảy ra</h1>
      <RouteErrorBody error={error} />
    </div>
  );
}

/**
 * Trang đang tải chunk của chính nó (xem khai báo `lazy` ở `router.tsx`).
 *
 * Không dùng `PageShell`: màn này hiện BÊN TRONG `AppShell` cho mọi route được
 * bảo vệ, nên một `min-h-screen` nữa sẽ đẩy nav ra khỏi màn hình. Chỉ là mấy
 * khối giữ chỗ, đúng nhịp `flex flex-col gap-4` mà mọi trang nghiệp vụ dùng.
 */
export function RoutePendingPage() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-64" />
    </div>
  );
}
