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

/**
 * `undefined` (mặc định) = TOÀN SHOP — đường gọi thật ở `routes/stats.ts` không
 * bao giờ truyền field này, vì số của chủ shop phải cộng dồn mọi nhân viên.
 *
 * `createdBy` không phải một tham số bịa ra để phục vụ test: "doanh thu theo
 * nhân viên" là thứ một chủ shop có lý do thật để hỏi một ngày nào đó ("Minh bán
 * được bao nhiêu tuần này"), và nó đúng là trục mà `rentals.created_by` đã ghi
 * sẵn cho mọi đơn — không cần thêm cột hay suy luận gì mới. Test dùng lại đúng
 * field nghiệp vụ này để lọc theo nhân viên seed của chính nó, thay vì xoá cả
 * bảng `rentals` trước mỗi lần chạy — xem `stats.test.ts`.
 */
export interface StatsFilter {
  readonly createdBy?: string;
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
 *
 * `filter?.createdBy` mặc định `undefined` → cả hai vế `WHERE` bên dưới rơi vào
 * nhánh `IS NULL`, tức KHÔNG lọc gì — số ra đúng bằng bản trước khi có tham số
 * này. Viết bằng MỘT hình dạng câu SQL duy nhất
 * (`${createdBy}::text IS NULL OR created_by = ${createdBy}`) thay vì dựng hai
 * câu SQL khác nhau tuỳ có/không filter: Bun.SQL không có `sql.fragment` kiểu
 * postgres.js để ghép điều kiện động vào template, và literal `undefined` non-null
 * cho ra `col IS NULL` — không phải kiểu chuỗi ta cần so `= created_by`. Ép kiểu
 * `::text` là bắt buộc: không có nó, tham số `null` không có kiểu để Postgres suy
 * ra, và câu lệnh lỗi `could not determine data type of parameter`.
 */
export async function getStatsSummary(now: Date, filter?: StatsFilter): Promise<StatsSummary> {
  const tz = SHOP_TIMEZONE;
  const createdBy = filter?.createdBy ?? null;

  const rows: StatsRow[] = await client`
    WITH b AS (
      SELECT
        date_trunc('day',   ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS day_start,
        date_trunc('week',  ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS week_start,
        date_trunc('month', ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS month_start
    ),
    r AS (
      SELECT total_amount, handed_over_at
      FROM rentals
      WHERE handed_over_at IS NOT NULL
        AND (${createdBy}::text IS NULL OR created_by = ${createdBy})
    )
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
      (SELECT COUNT(*)::int FROM rentals, b WHERE status = 'ONGOING' AND ends_at < ${now}
        AND (${createdBy}::text IS NULL OR created_by = ${createdBy}))                                                                                      AS overdue,
      (SELECT COUNT(*)::int FROM rentals, b WHERE status = 'ONGOING' AND ends_at >= b.day_start AND ends_at < b.day_start + interval '1 day'
        AND (${createdBy}::text IS NULL OR created_by = ${createdBy}))                                                                                      AS due_today`;

  const row = rows[0];
  if (!row) throw new Error("truy vấn thống kê không trả về hàng nào");

  return {
    revenue: {
      today: {
        amount: row.today_amount,
        orders: row.today_orders,
        prevAmount: row.prev_day_amount,
      },
      thisWeek: {
        amount: row.week_amount,
        orders: row.week_orders,
        prevAmount: row.prev_week_amount,
      },
      thisMonth: {
        amount: row.month_amount,
        orders: row.month_orders,
        prevAmount: row.prev_month_amount,
      },
    },
    attention: { overdue: row.overdue, dueToday: row.due_today },
  };
}
