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
    readonly pickupOverdue: number;
    /**
     * Mốc `ends_at` SỚM NHẤT trong nhóm quá hạn, dạng `YYYY-MM-DD` theo giờ
     * shop — `null` khi `overdue === 0`. Trả CHUỖI đã cắt kỳ trong Postgres
     * (`to_char`), không phải timestamp, vì nơi duy nhất dùng giá trị này là
     * `search.from` của route `/calendar` (`lib/calendar-search.ts`), vốn chỉ
     * nhận Y-M-D. Trả timestamp rồi format ở client là dựng lại đúng phép cắt
     * kỳ theo múi giờ mà `getStatsSummary` đã cố tình làm trong SQL — xem
     * JSDoc của hàm bên dưới.
     */
    readonly overdueFrom: string | null;
    /** Cùng lý lẽ `overdueFrom`, cho nhóm `pickupOverdue` (`starts_at` sớm nhất). */
    readonly pickupOverdueFrom: string | null;
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
  pickup_overdue: number;
  overdue_from: string | null;
  pickup_overdue_from: string | null;
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
        AND (${createdBy}::text IS NULL OR created_by = ${createdBy}))                                                                                      AS due_today,
      (SELECT COUNT(*)::int FROM rentals, b WHERE status = 'BOOKED' AND starts_at < ${now}
        AND (${createdBy}::text IS NULL OR created_by = ${createdBy}))                                                                                      AS pickup_overdue,
      (SELECT to_char(MIN(ends_at) AT TIME ZONE ${tz}, 'YYYY-MM-DD') FROM rentals, b WHERE status = 'ONGOING' AND ends_at < ${now}
        AND (${createdBy}::text IS NULL OR created_by = ${createdBy}))                                                                                      AS overdue_from,
      (SELECT to_char(MIN(starts_at) AT TIME ZONE ${tz}, 'YYYY-MM-DD') FROM rentals, b WHERE status = 'BOOKED' AND starts_at < ${now}
        AND (${createdBy}::text IS NULL OR created_by = ${createdBy}))                                                                                      AS pickup_overdue_from`;

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
    attention: {
      overdue: row.overdue,
      dueToday: row.due_today,
      pickupOverdue: row.pickup_overdue,
      overdueFrom: row.overdue_from,
      pickupOverdueFrom: row.pickup_overdue_from,
    },
  };
}

/**
 * Doanh thu và mức khai thác của TỪNG chiếc xe.
 *
 * ⚠️ Định nghĩa doanh thu ở đây KHÁC `getStatsSummary` ngay phía trên, và khác có
 * chủ ý. Hai hàm đặt cạnh nhau để chênh lệch này nhìn thấy được thay vì phải phát
 * hiện lại:
 *
 *   | | `getStatsSummary` | `getVehicleRevenue` |
 *   |---|---|---|
 *   | lọc | `handed_over_at IS NOT NULL` | `status = 'COMPLETED'` |
 *   | gồm đơn đang chạy | **có** (`ONGOING` đã giao xe) | **không** |
 *   | mốc thời gian | `handed_over_at` | `returned_at` |
 *
 * Hệ quả số học: cộng `revenue` của mọi xe LUÔN nhỏ hơn hoặc bằng con số tháng ở
 * màn Thống kê, đúng bằng phần các đơn chưa trả xe. Chủ shop cộng tay một lần là
 * thấy. Vì vậy màn Đội xe BẮT BUỘC gọi tên phạm vi trên nhãn ("Doanh thu — đơn đã
 * hoàn tất") và hiện `ongoing*` bên cạnh, thay vì để người dùng tự kết luận rằng
 * một trong hai màn bị sai. Xem `docs/plans/2026-09-07-staff-fleet-surface-design.md` §3.
 *
 * `days` tính theo khoảng ĐÃ ĐẶT (`ends_at - starts_at`), không theo
 * `returned_at - handed_over_at`: đơn vị thuê là NGÀY và tiền tính theo ngày đã
 * đặt, nên trả xe muộn hai tiếng không được biến thành một ngày khai thác nữa.
 */
export interface VehicleRevenue {
  readonly vehicleId: string;
  /** Tổng `total_amount` của đơn đã hoàn tất. */
  readonly revenue: Vnd;
  readonly orders: number;
  /** Tổng số ngày đã đặt của các đơn đã hoàn tất, làm tròn về số nguyên. */
  readonly days: number;
  readonly ongoingRevenue: Vnd;
  readonly ongoingOrders: number;
}

interface VehicleRevenueRow {
  vehicle_id: string;
  revenue: number;
  orders: number;
  days: number;
  ongoing_revenue: number;
  ongoing_orders: number;
}

export async function getVehicleRevenue(): Promise<VehicleRevenue[]> {
  const rows: VehicleRevenueRow[] = await client`
    SELECT
      v.id AS vehicle_id,
      COALESCE(SUM(r.total_amount) FILTER (WHERE r.status = 'COMPLETED'), 0)::int AS revenue,
      COUNT(*) FILTER (WHERE r.status = 'COMPLETED')::int                        AS orders,
      COALESCE(ROUND(SUM(
        EXTRACT(EPOCH FROM (r.ends_at - r.starts_at)) / 86400
      ) FILTER (WHERE r.status = 'COMPLETED')), 0)::int                          AS days,
      COALESCE(SUM(r.total_amount) FILTER (WHERE r.status = 'ONGOING'), 0)::int  AS ongoing_revenue,
      COUNT(*) FILTER (WHERE r.status = 'ONGOING')::int                          AS ongoing_orders
    FROM vehicles v
    LEFT JOIN rentals r ON r.vehicle_id = v.id
    GROUP BY v.id`;

  return rows.map((r) => ({
    vehicleId: r.vehicle_id,
    revenue: r.revenue,
    orders: r.orders,
    days: r.days,
    ongoingRevenue: r.ongoing_revenue,
    ongoingOrders: r.ongoing_orders,
  }));
}
