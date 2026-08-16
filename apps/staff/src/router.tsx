/* eslint-disable @typescript-eslint/only-throw-error --
 * `throw redirect({ ... })` là API CÔNG BỐ của TanStack Router, không phải một
 * cách ném bậy: `redirect()` trả về một object `Redirect` mà router bắt lại
 * trong `beforeLoad` để đổi đích điều hướng. Không có biến thể `return` — trả về
 * thay vì ném thì guard chạy xong rồi trang vẫn render.
 *
 * Luật này chặn `throw "chuỗi"`; ở đây nó bắt nhầm. Tắt trong PHẠM VI FILE NÀY
 * (file bảng route, chỗ duy nhất trong app có `throw redirect`) thay vì nới luật
 * ở `eslint.config.js` — nới ở đó là nới cho cả repo, và file đó có bộ probe
 * riêng phải chạy lại mỗi lần đụng vào (xem CLAUDE.md gốc).
 */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { AppShell } from "./components/layout/app-shell";
import { hasSession, signOut } from "./lib/auth";
import { LOGIN_REASONS, decideEntry, type LoginReason } from "./lib/guard-decision";
import { ensureMe } from "./lib/me";
import { CalendarPage } from "./pages/calendar-page";
import { ChangePasswordPage } from "./pages/change-password-page";
import { PendingApprovalPage } from "./pages/pending-approval-page";
import { SignupPage } from "./pages/signup-page";
import { LoginPage } from "./pages/login-page";
import { HealthPage } from "./pages/health-page";
import { StaffListPage } from "./pages/staff-list-page";
import { StatsPage } from "./pages/stats-page";
import { ForgotPasswordPage } from "./pages/forgot-password-page";

/**
 * Hai nhánh, một hàng rào. Mọi route CẦN đăng nhập treo dưới `protectedLayoutRoute`, nên
 * thêm một trang mới mà quên bảo vệ là chuyện không xảy ra được: chỗ duy nhất
 * để treo là `getParentRoute`, và cả hai lựa chọn đều hiện ra trong diff.
 *
 * Không kiểm quyền trong từng component. Một trang quên gọi `useQuery(meQuery)`
 * rồi tự kiểm là một trang mở toang, và nó im lặng — §6 design doc.
 */
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
});

/** Layout route (`id`, không `path`): nhóm route lại mà không thêm đoạn URL nào. */
const publicLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "public",
  component: Outlet,
});

/**
 * Component của `protectedLayoutRoute`: khoác `AppShell` quanh `Outlet` nên MỌI
 * route con — hiện tại và sau này — tự có nav mà không ai phải nhớ gọi `AppNav`
 * ở từng trang (xem Task 7, design doc).
 *
 * `me` đọc bằng `protectedLayoutRoute.useRouteContext()`, KHÔNG bằng `useMe()`.
 * `beforeLoad` bên dưới đã gán `{ me }` vào context ở nhánh "allow" (case
 * DUY NHẤT còn sống tới component này — mọi nhánh khác `throw redirect`), nên dữ
 * liệu đã CÓ SẴN, đã đúng kiểu `Me` (không phải `Me | null`), và đọc nó không đụng
 * TanStack Query — không có rủi ro background refetch mà `useMe()` có thể gây ra
 * (mặc định `staleTime: 0` của `meQuery`). Route context là cache RẺ hơn: nó chỉ
 * là object JS gắn theo route match, không phải một subscription.
 */
function ProtectedShell() {
  const { me } = protectedLayoutRoute.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut(queryClient);
    await navigate({ to: "/login" });
  }

  return (
    <AppShell me={me} onSignOut={() => void handleSignOut()}>
      <Outlet />
    </AppShell>
  );
}

/**
 * Guard. Mọi route treo dưới nhánh này (kể cả `/health`, xem comment ở
 * `healthRoute`) đều chạy qua `beforeLoad` này trước khi render — đó là bằng
 * chứng end-to-end rằng guard chạy, không phải một trang test rỗng không ai mở.
 *
 * `ensureMe` đi qua `ensureQueryData`, nên lần điều hướng sau đọc cache chứ không
 * bắn thêm request — guard không được biến mỗi cú click thành một vòng mạng.
 */
const protectedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  component: ProtectedShell,
  beforeLoad: async ({ context }) => {
    // KHÔNG gọi `ensureMe` khi chưa có session: nó sẽ bắn một request `/staff/me`
    // chắc chắn 401 trên mọi lần mở app lúc chưa đăng nhập.
    const sessionExists = await hasSession();
    const result = sessionExists ? await ensureMe(context.queryClient) : null;
    const decision = decideEntry(sessionExists, result);

    if (decision.type === "allow") return { me: decision.me };

    // Đăng xuất TRƯỚC khi chuyển trang: để nguyên session của người bị khoá thì
    // họ quay lại `/` và guard chạy lại đúng vòng này mãi mãi.
    if (decision.type === "signOutThenRedirect") {
      // signOut hỏng thì VẪN phải đẩy người dùng ra ngoài. Để lọt exception ở đây
      // là `throw redirect` không chạy, và TanStack dựng màn lỗi mặc định tiếng
      // Anh — trên chính đường guard, tức chỗ tệ nhất để kẹt lại. Cache đã được
      // `signOut` dọn trong `finally` rồi, nên bỏ qua lỗi ở đây không để lại
      // dữ liệu người cũ.
      try {
        await signOut(context.queryClient);
      } catch {
        // Cố ý nuốt: không có hành động nào khác đúng hơn là chuyển trang.
      }
      throw redirect({ to: decision.to, search: { reason: decision.reason } });
    }

    // `decision.to` truyền động được và vẫn được kiểm kiểu: `redirect({ to })` nhận
    // `RedirectTarget` — thay bằng một đường dẫn không có trong cây route là TS2322.
    //
    // `never` dưới đây là hàng rào, không phải phòng thủ thừa: thêm một arm vào
    // `EntryDecision` mà quên xử lý ở đây là **lỗi biên dịch**, thay vì một cú rơi
    // im lặng về `/login` — đúng kiểu hỏng mà cả pha này sinh ra để diệt.
    if (decision.type !== "redirect") {
      const unhandled: never = decision;
      throw new Error(`decideEntry trả về nhánh chưa xử lý: ${JSON.stringify(unhandled)}`);
    }
    throw redirect({ to: decision.to });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/login",
  // Chỉ nhận giá trị trong danh sách trắng — LẤY TỪ `LOGIN_REASONS`, không chép
  // tay từng chuỗi: thêm một `LoginReason` mới mà quên sửa chỗ này (rất dễ quên,
  // vì `tsc` không báo gì) trước đây sẽ lặng lẽ lọc mất lý do và người dùng thấy
  // trang đăng nhập trắng trơn, không banner. Query string là dữ liệu người dùng
  // gõ được — để lọt chuỗi tuỳ ý vào đây là để lọt nó vào JSX của trang đăng nhập.
  validateSearch: (search: Record<string, unknown>): { reason?: LoginReason } => {
    const found = LOGIN_REASONS.find((r) => r === search["reason"]);
    return found ? { reason: found } : {};
  },
  component: LoginPage,
});

const signupRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/signup",
  component: SignupPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});

/**
 * `/pending-approval` là route CÔNG KHAI dù chỉ người đã đăng nhập mới thấy nội dung
 * thật: nó phải mở được bởi tài khoản PENDING, mà PENDING là đúng cái guard trên
 * kia đá ra. Treo nó dưới `protectedLayoutRoute` thì thành vòng lặp chuyển hướng.
 */
const pendingApprovalRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/pending-approval",
  component: PendingApprovalPage,
});

const homeRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/",
  component: StatsPage,
});

/**
 * `HealthPage` chuyển từ `/` sang đây, KHÔNG bị xoá — Task 3 (Plan C) quyết định
 * và ghi lý do ở commit message. Nó vẫn là bằng chứng end-to-end rẻ nhất rằng
 * guard chạy VÀ `/health` phía API tới được: một route treo dưới
 * `protectedLayoutRoute`, gọi một request thật, hiện được `status`. Xoá thẳng thì
 * mất phép thử đó; để nguyên ở `/` thì chủ shop mở app thấy chữ "scaffold" thay vì
 * số liệu — cả hai đều tệ hơn có một route chẩn đoán riêng, không lên `AppNav`.
 */
const healthRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/health",
  component: HealthPage,
});

/**
 * Placeholder — xem comment đầu `pages/calendar-page.tsx`. Đăng ký SỚM (Task 3)
 * chỉ để `AttentionList` có đích bấm được thật; nội dung lịch thật là Task 4–6.
 */
const calendarRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/calendar",
  component: CalendarPage,
});

/**
 * Chỉ OWNER. Kiểm ở `beforeLoad` chứ KHÔNG ở trong component: một điều kiện
 * trong JSX là điều kiện có thể quên ở trang tiếp theo, còn ở đây nó nằm cạnh
 * chính chỗ khai route.
 *
 * `context.me` tới từ `beforeLoad` của `protectedLayoutRoute` — không đọc lại `/staff/me`.
 * Đây là hàng rào của TRẢI NGHIỆM, không phải của dữ liệu: `/staff/users*` đã
 * tự đòi OWNER ở server (403 `FORBIDDEN`). Bỏ chỗ này thì STAFF thấy một
 * trang trống toàn lỗi 403, không phải thấy dữ liệu.
 */
const staffListRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/staff",
  beforeLoad: ({ context }) => {
    if (context.me.role !== "OWNER") throw redirect({ to: "/" });
  },
  component: StaffListPage,
});

/**
 * `/change-password` phải nằm dưới `protectedLayoutRoute`, không phải
 * `publicLayoutRoute`: nó gọi `POST /staff/password/change`, route đòi session
 * hợp lệ + hồ sơ `ACTIVE` (guard mặc định chặn — xem `apps/api/src/routes/staff.ts`).
 * Treo nhầm sang nhánh công khai thì trang vẫn render cho người CHƯA đăng nhập,
 * và họ chỉ biết mình bị chặn khi bấm nút xong nhận 401 — đúng kiểu hàng rào
 * "trông như đang bảo vệ" mà CLAUDE.md gốc cảnh báo.
 */
const changePasswordRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/change-password",
  component: ChangePasswordPage,
});

const routeTree = rootRoute.addChildren([
  publicLayoutRoute.addChildren([
    loginRoute,
    signupRoute,
    forgotPasswordRoute,
    pendingApprovalRoute,
  ]),
  protectedLayoutRoute.addChildren([
    homeRoute,
    staffListRoute,
    changePasswordRoute,
    healthRoute,
    calendarRoute,
  ]),
]);

/**
 * Router nhận `queryClient` qua tham số chứ không import một singleton: guard ở
 * `beforeLoad` phải ghi vào ĐÚNG cache mà `QueryClientProvider` đang phát cho
 * cây React (`main.tsx`). Hai `QueryClient` là hai cache — guard đọc `/staff/me`
 * xong mà màn hình vẫn thấy trống, và không có lỗi nào ở đâu.
 */
export const createAppRouter = (queryClient: QueryClient) =>
  createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
