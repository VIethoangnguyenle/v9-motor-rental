import { Elysia, t } from "elysia";
import { staffGuard } from "../plugins/staff-guard";
import { countPendingStaff } from "../services/staff";
import { getStatsSummary, getVehicleRevenue } from "../services/stats";

const periodSchema = t.Object({
  amount: t.Integer(),
  orders: t.Integer(),
  prevAmount: t.Integer(),
});

export const stats = new Elysia({ name: "stats" })
  // Chỉ để suy kiểu `staff` trong context — `staff-guard` dedupe theo `name`,
  // nên `.use()` lại ở đây KHÔNG chạy lại hook lần hai. Bảo vệ thật đã có sẵn
  // từ `index.ts` (mặc định chặn, `/stats/summary` không có trong
  // `PUBLIC_ROUTES`). Cùng lý do `routes/staff.ts` và `routes/rentals.ts` làm
  // vậy.
  .use(staffGuard)

  .get(
    "/stats/summary",
    async ({ staff }) => {
      const summary = await getStatsSummary(new Date());

      // `pendingStaff` CHỈ dành cho OWNER — STAFF không được thấy số nhân viên chờ
      // duyệt. Field tuỳ chọn thay vì một endpoint riêng: Home cần tất cả cùng lúc,
      // và tách ra là năm spinner lệch nhau cho một màn hình.
      const pendingStaff = staff?.role === "OWNER" ? await countPendingStaff() : undefined;

      return {
        ...summary,
        attention: {
          ...summary.attention,
          ...(pendingStaff === undefined ? {} : { pendingStaff }),
        },
      };
    },
    {
      response: {
        200: t.Object({
          revenue: t.Object({
            today: periodSchema,
            thisWeek: periodSchema,
            thisMonth: periodSchema,
          }),
          attention: t.Object({
            overdue: t.Integer(),
            dueToday: t.Integer(),
            pickupOverdue: t.Integer(),
            overdueFrom: t.Nullable(t.String()),
            pickupOverdueFrom: t.Nullable(t.String()),
            pendingStaff: t.Optional(t.Integer()),
          }),
        }),
      },
    },
  )

  /**
   * Doanh thu theo TỪNG xe, cho màn Đội xe.
   *
   * Route riêng chứ không phải một field thêm vào `/fleet`: hai bên có nhịp đổi
   * khác nhau — danh sách đội xe đổi khi chủ shop sửa xe, còn số liệu đổi mỗi lần
   * một đơn hoàn tất — nên gộp làm một là bắt bộ nhớ đệm của phía gọi phải chọn
   * nhịp chậm hơn cho cả hai.
   *
   * KHÔNG giới hạn theo OWNER: `/fleet` đã trả giá cho mọi nhân viên ACTIVE, nên
   * doanh thu theo xe không lộ thêm loại dữ liệu nào mới. Hàng rào OWNER của màn
   * Đội xe nằm ở đường GHI (`routes/fleet.ts`) và ở `beforeLoad` của route
   * `apps/staff`.
   */
  .get("/stats/vehicles", () => getVehicleRevenue(), {
    response: {
      200: t.Array(
        t.Object({
          vehicleId: t.String({ format: "uuid" }),
          revenue: t.Integer(),
          orders: t.Integer(),
          days: t.Integer(),
          ongoingRevenue: t.Integer(),
          ongoingOrders: t.Integer(),
        }),
      ),
    },
  });
