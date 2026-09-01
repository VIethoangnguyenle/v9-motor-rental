import { Link } from "@tanstack/react-router";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
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
 * Dùng `PageShell` chứ không tự dựng khung: hai màn này hay xuất hiện TRƯỚC khi
 * đăng nhập (gõ nhầm URL) hoặc khi `AppShell` chưa kịp dựng, nên chúng không
 * được phụ thuộc vào nav. `PageShell` là khung hẹp không biết domain, đúng thứ
 * sáu màn xác thực đang dùng.
 */
export function NotFoundPage() {
  return (
    <PageShell title="Không tìm thấy trang">
      <p className="mt-3 text-sm text-muted">
        Đường dẫn này không có trong app. Có thể bạn gõ nhầm, hoặc mở một link cũ từ hồi trang đó
        còn tồn tại.
      </p>
      {/* `min-h-11` khớp ngưỡng vùng chạm app tự đặt — đây có thể là thứ duy
          nhất bấm được trên màn hình, nên nó phải bấm trúng được. */}
      <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-sm underline">
        ← Về trang Thống kê
      </Link>
    </PageShell>
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
export function RouteErrorPage({ error }: { readonly error: Error }) {
  return (
    <PageShell title="Có lỗi xảy ra">
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
    </PageShell>
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
