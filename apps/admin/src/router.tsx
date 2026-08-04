import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { HealthPage } from "./pages/health";

// Route khai bằng code, không dùng file-based routing plugin: phiên scaffold có đúng
// một route, dựng bộ máy sinh route lúc này là chi phí không có người trả.
const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HealthPage,
});

export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
