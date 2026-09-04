import { describe, expect, it } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AttentionList } from "./attention-list";
import { validateCalendarSearch } from "../../lib/calendar-search";
import type { StatsSummary } from "../../lib/rentals";

type Attention = StatsSummary["attention"];

const NONE: Attention = {
  overdue: 0,
  dueToday: 0,
  pickupOverdue: 0,
  overdueFrom: null,
  pickupOverdueFrom: null,
};

async function renderIn(attention: Attention) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <AttentionList attention={attention} />,
  });
  const calendarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/calendar",
    validateSearch: validateCalendarSearch,
    component: () => null,
  });
  const staffRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/staff",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, calendarRoute, staffRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  // `RouterProvider` còn một lượt cập nhật state nữa SAU khi render (Transitioner
  // của router), nên `render` trần để lại cảnh báo `act(...)` ở mọi test. Bọc
  // trong `act` bất đồng bộ để lượt đó chạy hết trước khi khẳng định — nếu không,
  // thứ đang đọc là DOM giữa chừng chứ không phải DOM đã ổn định.
  // `async` ở đây KHÔNG thừa dù trong thân không có `await`: nó là thứ chọn
  // nhánh act bất đồng bộ của React. Đo được — bỏ `async` đi thì cùng bộ test
  // này in 40 cảnh báo "not wrapped in act", để lại thì 0.
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    render(<RouterProvider router={router as never} />);
  });
}

const hrefs = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));
const labels = () => screen.getAllByRole("link").map((a) => a.textContent);

describe("AttentionList", () => {
  it("dựng href thật, mỗi dòng neo vào mốc sớm nhất của nhóm mình", async () => {
    await renderIn({
      ...NONE,
      overdue: 2,
      overdueFrom: "2026-08-20",
      pickupOverdue: 3,
      pickupOverdueFrom: "2026-09-01",
    });
    expect(hrefs()).toEqual([
      "/calendar?view=timeline&from=2026-08-20",
      "/calendar?view=timeline&from=2026-09-01",
    ]);
  });

  it("dueToday KHÔNG mang from — vắng from đã có nghĩa là hôm nay", async () => {
    await renderIn({ ...NONE, dueToday: 4 });
    expect(hrefs()).toEqual(["/calendar?view=timeline"]);
  });

  it("sắp theo độ gấp: overdue → pickupOverdue → dueToday → pendingStaff", async () => {
    await renderIn({
      overdue: 1,
      dueToday: 2,
      pickupOverdue: 3,
      overdueFrom: "2026-08-20",
      pickupOverdueFrom: "2026-09-01",
      pendingStaff: 4,
    });
    expect(labels()).toEqual([
      "1 xe quá hạn chưa trả",
      "3 đơn quá giờ nhận xe",
      "2 xe phải trả hôm nay",
      "4 nhân viên chờ duyệt",
    ]);
  });

  it("đếm 0 thì KHÔNG có dòng — kể cả khi mốc neo còn null", async () => {
    await renderIn(NONE);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.getByText("Không có việc gì cần chú ý ngay lúc này.")).toBeDefined();
  });

  it("pendingStaff vắng mặt (STAFF) thì không render dòng nhân viên", async () => {
    await renderIn({ ...NONE, pickupOverdue: 1, pickupOverdueFrom: "2026-09-01" });
    expect(labels()).toEqual(["1 đơn quá giờ nhận xe"]);
  });
});
