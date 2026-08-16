import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import type { Vnd } from "@v9/shared/domain/money";
import { client } from "../db";

export interface PeriodStat {
  readonly amount: Vnd;
  readonly orders: number;
  readonly prevAmount: Vnd;
}

export interface StatsSummary {
  readonly revenue: {
    readonly today: PeriodStat;
    readonly thisWeek: PeriodStat;
    readonly thisMonth: PeriodStat;
  };
  readonly attention: {
    readonly overdue: number;
    readonly dueToday: number;
  };
}

/** Hình dạng đúng một hàng mà câu truy vấn dưới trả về — dùng để type Bun.SQL, không `as`. */
interface StatsRow {
  today_amount: number;
  today_orders: number;
  prev_day_amount: number;
  week_amount: number;
  week_orders: number;
  prev_week_amount: number;
  month_amount: number;
  month_orders: number;
  prev_month_amount: number;
  overdue: number;
  due_today: number;
}

/**
 * ⚠️ `now` là THAM SỐ chứ không phải `now()` của SQL, và đó là điều kiện để test
 * được. Lỗi múi giờ ở đây TỰ BIẾN MẤT lúc 7h sáng: cắt kỳ bằng UTC thì từ 0h đến
 * 7h giờ VN mọi đơn bị đếm vào NGÀY HÔM TRƯỚC, rồi số tự đúng lại. Một test chạy
 * lúc 10h sáng sẽ xanh mãi mãi.
 *
 * Phép cắt kỳ làm trong Postgres chứ không trong JS: đó là chỗ duy nhất trong
 * stack này biết chắc múi giờ. `date_trunc('week', ...)` bắt đầu từ THỨ HAI —
 * đúng quy ước VN.
 *
 * Doanh thu lọc đúng một điều kiện `handed_over_at IS NOT NULL`, KHÔNG kiểm trạng
 * thái: ràng buộc ở DB đã ép `handed_over_at IS NOT NULL ⟺ status IN
 * ('ONGOING','COMPLETED')`, nên đơn huỷ hay chưa giao không thể lọt vào.
 */
export async function getStatsSummary(now: Date): Promise<StatsSummary> {
  const tz = SHOP_TIMEZONE;

  const rows: StatsRow[] = await client`
    WITH b AS (
      SELECT
        date_trunc('day',   ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS day_start,
        date_trunc('week',  ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS week_start,
        date_trunc('month', ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS month_start
    ),
    r AS (SELECT total_amount, handed_over_at FROM rentals WHERE handed_over_at IS NOT NULL)
    SELECT
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.day_start)                                                            AS today_amount,
      (SELECT COUNT(*)::int                      FROM r, b WHERE handed_over_at >= b.day_start)                                                            AS today_orders,
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.day_start - interval '1 day'   AND handed_over_at < b.day_start)      AS prev_day_amount,
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.week_start)                                                           AS week_amount,
      (SELECT COUNT(*)::int                      FROM r, b WHERE handed_over_at >= b.week_start)                                                           AS week_orders,
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.week_start - interval '1 week'  AND handed_over_at < b.week_start)    AS prev_week_amount,
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.month_start)                                                          AS month_amount,
      (SELECT COUNT(*)::int                      FROM r, b WHERE handed_over_at >= b.month_start)                                                          AS month_orders,
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.month_start - interval '1 month' AND handed_over_at < b.month_start)  AS prev_month_amount,
      (SELECT COUNT(*)::int FROM rentals, b WHERE status = 'ONGOING' AND ends_at < ${now})                                                                 AS overdue,
      (SELECT COUNT(*)::int FROM rentals, b WHERE status = 'ONGOING' AND ends_at >= b.day_start AND ends_at < b.day_start + interval '1 day')              AS due_today`;

  const row = rows[0];
  if (!row) throw new Error("truy vấn thống kê không trả về hàng nào");

  return {
    revenue: {
      today: { amount: row.today_amount, orders: row.today_orders, prevAmount: row.prev_day_amount },
      thisWeek: { amount: row.week_amount, orders: row.week_orders, prevAmount: row.prev_week_amount },
      thisMonth: { amount: row.month_amount, orders: row.month_orders, prevAmount: row.prev_month_amount },
    },
    attention: { overdue: row.overdue, dueToday: row.due_today },
  };
}
