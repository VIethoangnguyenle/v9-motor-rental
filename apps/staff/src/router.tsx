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
import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { coSession, dangXuat } from "./lib/auth";
import { layMe } from "./lib/me";
import { ChoDuyetPage } from "./pages/cho-duyet";
import { DangKyPage } from "./pages/dang-ky";
import { DangNhapPage } from "./pages/dang-nhap";
import { HealthPage } from "./pages/health";
import { NhanVienPage } from "./pages/nhan-vien";
import { QuenMatKhauPage } from "./pages/quen-mat-khau";

/**
 * Hai nhánh, một hàng rào. Mọi route CẦN đăng nhập treo dưới `duocBaoVe`, nên
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
const congKhai = createRoute({
  getParentRoute: () => rootRoute,
  id: "cong-khai",
  component: Outlet,
});

/**
 * Guard. Trang `/` (health) nằm dưới nhánh này CÓ CHỦ Ý: nó là bằng chứng
 * end-to-end rằng guard chạy, thay vì một trang test rỗng không ai mở.
 *
 * `layMe` đi qua `ensureQueryData`, nên lần điều hướng sau đọc cache chứ không
 * bắn thêm request — guard không được biến mỗi cú click thành một vòng mạng.
 */
const duocBaoVe = createRoute({
  getParentRoute: () => rootRoute,
  id: "duoc-bao-ve",
  component: Outlet,
  beforeLoad: async ({ context }) => {
    if (!(await coSession())) throw redirect({ to: "/dang-nhap" });

    const me = await layMe(context.queryClient);
    // `null` = 401/403/mạng chết. Không phân biệt: mọi ca đều là "không vào được".
    if (!me) throw redirect({ to: "/dang-nhap" });

    if (me.status === "PENDING") throw redirect({ to: "/cho-duyet" });
    if (me.status === "DISABLED") {
      // Đăng xuất TRƯỚC khi chuyển trang: để nguyên session của người bị khoá thì
      // họ quay lại `/` và guard chạy lại đúng vòng này mãi mãi.
      await dangXuat();
      throw redirect({ to: "/dang-nhap", search: { ly_do: "da-khoa" } });
    }

    return { me };
  },
});

const dangNhapRoute = createRoute({
  getParentRoute: () => congKhai,
  path: "/dang-nhap",
  // Chỉ nhận đúng một giá trị. Query string là dữ liệu người dùng gõ được —
  // để lọt chuỗi tuỳ ý vào đây là để lọt nó vào JSX của trang đăng nhập.
  validateSearch: (search: Record<string, unknown>): { ly_do?: "da-khoa" } =>
    search["ly_do"] === "da-khoa" ? { ly_do: "da-khoa" } : {},
  component: DangNhapPage,
});

const dangKyRoute = createRoute({
  getParentRoute: () => congKhai,
  path: "/dang-ky",
  component: DangKyPage,
});

const quenMatKhauRoute = createRoute({
  getParentRoute: () => congKhai,
  path: "/quen-mat-khau",
  component: QuenMatKhauPage,
});

/**
 * `/cho-duyet` là route CÔNG KHAI dù chỉ người đã đăng nhập mới thấy nội dung
 * thật: nó phải mở được bởi tài khoản PENDING, mà PENDING là đúng cái guard trên
 * kia đá ra. Treo nó dưới `duocBaoVe` thì thành vòng lặp chuyển hướng.
 */
const choDuyetRoute = createRoute({
  getParentRoute: () => congKhai,
  path: "/cho-duyet",
  component: ChoDuyetPage,
});

const trangChuRoute = createRoute({
  getParentRoute: () => duocBaoVe,
  path: "/",
  component: HealthPage,
});

/**
 * Chỉ OWNER. Kiểm ở `beforeLoad` chứ KHÔNG ở trong component: một điều kiện
 * trong JSX là điều kiện có thể quên ở trang tiếp theo, còn ở đây nó nằm cạnh
 * chính chỗ khai route.
 *
 * `context.me` tới từ `beforeLoad` của `duocBaoVe` — không đọc lại `/staff/me`.
 * Đây là hàng rào của TRẢI NGHIỆM, không phải của dữ liệu: `/staff/users*` đã
 * tự đòi OWNER ở server (403 `THIEU_QUYEN`). Bỏ chỗ này thì STAFF thấy một
 * trang trống toàn lỗi 403, không phải thấy dữ liệu.
 */
const nhanVienRoute = createRoute({
  getParentRoute: () => duocBaoVe,
  path: "/nhan-vien",
  beforeLoad: ({ context }) => {
    if (context.me.role !== "OWNER") throw redirect({ to: "/" });
  },
  component: NhanVienPage,
});

const routeTree = rootRoute.addChildren([
  congKhai.addChildren([dangNhapRoute, dangKyRoute, quenMatKhauRoute, choDuyetRoute]),
  duocBaoVe.addChildren([trangChuRoute, nhanVienRoute]),
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
