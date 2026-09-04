import { Elysia, t } from "elysia";
import { staffGuard } from "../plugins/staff-guard";
import { countPendingStaff } from "../services/staff";
import { getStatsSummary } from "../services/stats";

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
  );
