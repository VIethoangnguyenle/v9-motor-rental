import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { schema } from "@v9/db";
import {
  QUEUE_GROUPS,
  QUEUE_HORIZON_DAYS,
  SHOP_TIMEZONE,
  type QueueBoundaries,
  type QueueGroup,
  type RentalStatus,
} from "@v9/shared/domain/rental";
import type { Vnd } from "@v9/shared/domain/money";
import { normalizePhone } from "@v9/shared/domain/phone";
import { client, db } from "../db";
import { fullNameMatches } from "./customers";

export const RENTALS_PAGE_SIZE_DEFAULT = 20;
export const RENTALS_PAGE_SIZE_MAX = 100;

/**
 * Một dòng của hai màn danh sách — đơn + khách + xe, tất cả trong MỘT lượt đọc.
 *
 * Ba trường xe có mặt vì danh sách phải in được tên xe mà không cần đợi
 * `GET /fleet`; ba trường bàn giao (`documentType`…) có mặt vì `RentalDetailSheet`
 * mở thẳng từ hàng này, không có vòng mạng thứ hai. Hình dạng này khớp
 * `rentalWithVehicleSchema` đã có ở `routes/rentals.ts` — dùng lại schema đó,
 * đừng khai schema thứ hai.
 */
export interface RentalListRow {
  readonly id: string;
  readonly vehicleId: string;
  readonly customerId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: RentalStatus;
  readonly handedOverAt: Date | null;
  readonly returnedAt: Date | null;
  readonly totalAmount: Vnd;
  readonly depositAmount: Vnd;
  readonly note: string | null;
  readonly documentType: string | null;
  readonly documentReturnedAt: Date | null;
  readonly deliveryAddress: string | null;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly vehicleMake: string;
  readonly vehicleModel: string;
  readonly vehiclePlate: string | null;
}

export interface RentalQueueRow extends RentalListRow {
  readonly group: QueueGroup;
}

const LIST_COLUMNS = {
  id: schema.rentals.id,
  vehicleId: schema.rentals.vehicleId,
  customerId: schema.rentals.customerId,
  startsAt: schema.rentals.startsAt,
  endsAt: schema.rentals.endsAt,
  status: schema.rentals.status,
  handedOverAt: schema.rentals.handedOverAt,
  returnedAt: schema.rentals.returnedAt,
  totalAmount: schema.rentals.totalAmount,
  depositAmount: schema.rentals.depositAmount,
  note: schema.rentals.note,
  documentType: schema.rentals.documentType,
  documentReturnedAt: schema.rentals.documentReturnedAt,
  deliveryAddress: schema.rentals.deliveryAddress,
  customerName: schema.customers.fullName,
  customerPhone: schema.customers.phone,
  vehicleMake: schema.vehicles.make,
  vehicleModel: schema.vehicles.model,
  vehiclePlate: schema.vehicles.plate,
};

/**
 * Thứ hạng SQL ↔ nhóm domain. Suy TỪ `QUEUE_GROUPS` chứ không gõ tay bảng tra
 * ngược: thứ tự tuple đã LÀ thứ tự độ gấp, nên `index + 1` là hạng, và thêm một
 * nhóm ở domain mà quên ở đây là không thể — không có "ở đây" nào để quên.
 *
 * Hạng bắt đầu từ 1 vì `CASE` không khớp nhánh nào trả `NULL`, và 0 là một giá
 * trị hợp lệ dễ lẫn với `NULL` khi đi qua driver.
 */
const GROUP_OF_RANK: Record<number, QueueGroup> = Object.fromEntries(
  QUEUE_GROUPS.map((g, i) => [i + 1, g]),
);

function emptyGroupCounts(): Record<QueueGroup, number> {
  return Object.fromEntries(QUEUE_GROUPS.map((g) => [g, 0])) as Record<QueueGroup, number>;
}

/**
 * Ba mốc cắt kỳ, tính TRONG POSTGRES.
 *
 * `getStatsSummary` đã quyết định và ghi lý do: Postgres là chỗ duy nhất trong
 * stack biết chắc múi giờ shop. Đợt này không đảo quyết định đó — nếu tính
 * `dayEnd` bằng JS thì hai màn hình cắt ngày theo hai cách, và lỗi loại đó TỰ
 * BIẾN MẤT lúc 7h sáng nên một test chạy lúc 10h sẽ xanh mãi mãi.
 *
 * `make_interval(days => ...)` chứ không phải ghép chuỗi `'N days'::interval`:
 * tham số đi vào đúng chỗ tham số, không đi qua phép nối chuỗi nào.
 */
/**
 * ⚠️ Hàng rào SQL ↔ TS (`rentals-list.test.ts`) truyền `b` do CHÍNH hàm này
 * tính cho cả hai vế so sánh — nó không có cách nào tự kiểm tra `queueBoundaries`
 * đúng, vì cả `groupRankSql` (SQL) lẫn `queueGroupOf` (TS) đều NHẬN `b` làm
 * đầu vào thay vì tự suy. Một lỗi nằm TRONG hàm này (sai `AT TIME ZONE`, sai
 * `make_interval`) lọt qua hàng rào đó — nó chỉ canh hai bên CÙNG dùng một `b`
 * có ĐỒNG Ý với nhau không, không canh `b` có đúng không. Đây là đánh đổi cố
 * ý của quyết định "mốc tính trong Postgres" (xem JSDoc ngay dưới), không phải
 * lỗ hổng cần vá — chỉ ghi lại để không ai tưởng hàng rào phủ luôn phần này.
 */
export async function queueBoundaries(now: Date): Promise<QueueBoundaries> {
  const rows: { day_end: Date; horizon: Date }[] = await client`
    WITH d AS (
      SELECT (date_trunc('day', ${now}::timestamptz AT TIME ZONE ${SHOP_TIMEZONE})
              + interval '1 day') AS local_day_end
    )
    SELECT
      (local_day_end) AT TIME ZONE ${SHOP_TIMEZONE}                                        AS day_end,
      (local_day_end + make_interval(days => ${QUEUE_HORIZON_DAYS})) AT TIME ZONE ${SHOP_TIMEZONE} AS horizon
    FROM d`;

  const row = rows[0];
  if (!row) throw new Error("truy vấn mốc hàng đợi không trả về hàng nào");
  return { now, dayEnd: row.day_end, horizon: row.horizon };
}

/**
 * ⚠️ `CASE` dưới đây là bản SQL của `queueGroupOf` (`@v9/shared/domain/rental`).
 * Sửa một bên mà quên bên kia là lỗi mà `rentals-list.test.ts` bắt được — nó
 * chạy CẢ HAI trên cùng bộ hàng và so từng dòng. Đừng sửa một mình chỗ này.
 *
 * Thứ tự nhánh LÀ thứ ép năm nhóm loại trừ nhau; `CASE` đánh giá theo thứ tự
 * viết, đúng như chuỗi `if` bên domain.
 */
function groupRankSql(b: QueueBoundaries): SQL<number | null> {
  return sql<number | null>`CASE
    WHEN ${schema.rentals.status} = 'ONGOING' AND ${schema.rentals.endsAt}   < ${b.now}     THEN 1
    WHEN ${schema.rentals.status} = 'BOOKED'  AND ${schema.rentals.startsAt} < ${b.now}     THEN 2
    WHEN ${schema.rentals.status} = 'ONGOING' AND ${schema.rentals.endsAt}   < ${b.dayEnd}  THEN 3
    WHEN ${schema.rentals.status} = 'BOOKED'  AND ${schema.rentals.startsAt} < ${b.dayEnd}  THEN 4
    WHEN ${schema.rentals.status} = 'BOOKED'  AND ${schema.rentals.startsAt} < ${b.horizon} THEN 5
  END`;
}

/**
 * Vị từ lọc, viết TÁCH khỏi `CASE` chứ không phải `WHERE <case> IS NOT NULL`.
 *
 * Hai dạng cho ra ĐÚNG cùng một tập hàng — `now < dayEnd` luôn đúng (dayEnd là
 * nửa đêm ngày mai) nên nhánh 1 nằm gọn trong nhánh 3, và nhánh 2 nằm gọn trong
 * nhánh 5 — nhưng chỉ dạng này dùng được hai partial index
 * `rentals_queue_ongoing_idx` / `rentals_queue_booked_idx`: planner không đẩy
 * được điều kiện qua một biểu thức `CASE`.
 *
 * `createdBy` ghép vào bằng CÙNG khuôn `(${x}::text IS NULL OR col = ${x})` mà
 * `getStatsSummary` (`services/stats.ts`) đã dùng — không phải phát minh riêng
 * ở đây. Lý lẽ y hệt `StatsFilter`: "doanh thu/việc theo nhân viên" là trục
 * nghiệp vụ thật (`rentals.created_by` đã ghi sẵn cho mọi đơn), không phải tham
 * số bịa ra để test né dữ liệu. `undefined` (mặc định) → nhánh `IS NULL` →
 * KHÔNG lọc gì, tức "toàn shop" — đúng đường gọi thật từ route.
 */
function queueWhere(b: QueueBoundaries, createdBy: string | null): SQL {
  return sql`(
    (
      (${schema.rentals.status} = 'ONGOING' AND ${schema.rentals.endsAt}   < ${b.dayEnd})
      OR
      (${schema.rentals.status} = 'BOOKED'  AND ${schema.rentals.startsAt} < ${b.horizon})
    )
    AND (${createdBy}::text IS NULL OR ${schema.rentals.createdBy} = ${createdBy})
  )`;
}

/**
 * Mốc dùng để sắp trong nhóm — CÙNG luật `whenOf` ở `customer-table.tsx`:
 * `ONGOING` hỏi "bao giờ phải trả xe" (`endsAt`), `BOOKED` hỏi "bao giờ tới lấy"
 * (`startsAt`). Cùng câu hỏi thì cùng cột; không có luật sắp xếp thứ hai.
 */
const SORT_AT = sql`CASE WHEN ${schema.rentals.status} = 'ONGOING'
  THEN ${schema.rentals.endsAt} ELSE ${schema.rentals.startsAt} END`;

export async function listRentalsQueue(
  now: Date,
  input: {
    page?: number | undefined;
    pageSize?: number | undefined;
    createdBy?: string | undefined;
  },
): Promise<{
  rentals: RentalQueueRow[];
  total: number;
  groupCounts: Record<QueueGroup, number>;
}> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    RENTALS_PAGE_SIZE_MAX,
    Math.max(1, Math.trunc(input.pageSize ?? RENTALS_PAGE_SIZE_DEFAULT)),
  );
  const createdBy = input.createdBy ?? null;

  const b = await queueBoundaries(now);
  const rank = groupRankSql(b);
  const where = queueWhere(b, createdBy);

  // Đếm theo nhóm chạy trên TOÀN BỘ hàng đợi, không chỉ trang đang xem: tiêu đề
  // nhóm phải nói đúng "Quá hạn trả (7)" kể cả khi trang này chỉ chứa 3 trong 7.
  // `GROUP BY rank` đọc lại ALIAS của cột select, KHÔNG lặp lại biểu thức
  // `CASE` một lần nữa. Bun.SQL cấp một tham số ($n) MỚI cho mỗi lần một `SQL`
  // object được nội suy vào câu lệnh — kể cả khi nội suy CÙNG một biến `rank`
  // hai lần — nên hai bản `CASE` sinh ra khác NHAU về mặt văn bản (khác số
  // tham số), và Postgres đòi biểu thức GROUP BY khớp NGUYÊN VĂN biểu thức ở
  // SELECT. Lặp `sql`(${rank})`` ở đây từng nổ `42803 column "rentals.status"
  // must appear in the GROUP BY clause` — đã đo, không suy luận.
  const counts = await db
    // `.as("rank")` PHÁT SINH bí danh `AS "rank"` thật trong câu SQL — thiếu nó
    // thì `GROUP BY rank` / `ORDER BY rank` bên dưới trỏ vào một cột không tồn
    // tại (`42703 column "rank" does not exist`), vì cột chỉ mang tên "rank" ở
    // PHÍA JS (khoá object), không tự động thành alias SQL.
    .select({ rank: sql<number>`(${rank})`.as("rank"), n: sql<number>`count(*)::int` })
    .from(schema.rentals)
    .where(where)
    .groupBy(sql`rank`);

  const groupCounts = emptyGroupCounts();
  let total = 0;
  for (const c of counts) {
    const group = GROUP_OF_RANK[c.rank];
    // KHÔNG `continue`: hạng lạ nghĩa là `CASE` và `GROUP_OF_RANK` đã lệch
    // nhau (drift đúng thứ hàng rào ở trên canh) — im lặng bỏ qua hàng này
    // còn ÂM THẦM LÀM SAI `total` (trang Đơn thuê tính `lastPage = ceil(total /
    // pageSize)` từ nó), tức trang cuối vĩnh viễn không tới được. Nổ to hơn
    // là đúng: `where` hiện là tập cha của `CASE` NÊN nhánh này hôm nay không
    // tới được — nhưng "không tới được hôm nay" không phải lý do để im lặng
    // nếu mai nó tới được.
    if (!group) throw new Error(`hạng hàng đợi không xác định: ${c.rank}`);
    groupCounts[group] = c.n;
    total += c.n;
  }

  const rows = await db
    .select({ ...LIST_COLUMNS, rank: sql<number>`(${rank})`.as("rank") })
    .from(schema.rentals)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.rentals.customerId))
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentals.vehicleId))
    .where(where)
    // `id` là khoá phụ BẮT BUỘC, không phải thừa: hai đơn cùng mốc thời gian mà
    // không có thứ tự xác định thì chúng có thể đổi chỗ giữa hai request, và một
    // hàng lọt qua khe giữa trang 1 và trang 2 — mất dữ liệu, im lặng.
    // Cùng lý do `GROUP BY rank` ở trên: đọc lại alias thay vì lặp `CASE`.
    .orderBy(sql`rank`, SORT_AT, asc(schema.rentals.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const rentals: RentalQueueRow[] = [];
  for (const r of rows) {
    const { rank, ...rest } = r;
    const group = GROUP_OF_RANK[rank];
    // Cùng lý do với vòng lặp đếm ở trên — nổ to thay vì bỏ sót lặng lẽ.
    if (!group) throw new Error(`hạng hàng đợi không xác định: ${rank}`);
    rentals.push({ ...rest, status: rest.status as RentalStatus, group });
  }

  return { rentals, total, groupCounts };
}

/**
 * Sổ cái — **có** đơn `CANCELLED`, khác hẳn `listRentalsInRange` (lịch, lọc bỏ
 * chúng). Đó không phải thiếu nhất quán: trên lịch một đơn đã huỷ không chiếm
 * chỗ nên vẽ nó ra là nói dối về chỗ trống; trong sổ cái nó là một dòng có thật
 * của tháng đó.
 *
 * `from`/`to` rỗng KHÔNG bị chặn: `tstzrange(NULL, NULL, '[)')` là khoảng vô
 * hạn hai đầu và khớp mọi hàng, nên ô tìm chạy được mà không cần người dùng
 * chọn ngày trước. Đó là toàn bộ lý do vị từ này viết bằng range chứ không bằng
 * hai phép so `>=`/`<`: một hình dạng câu duy nhất cho cả bốn tổ hợp có/không
 * của hai biên. Ép `::timestamptz` là bắt buộc — không có nó, tham số `null`
 * không có kiểu và Postgres lỗi `could not determine data type of parameter`.
 *
 * `period` viết bằng SQL trần (không qua `schema.rentals.period`): cột đó cùng
 * exclusion constraint `rentals_no_overlap` sống ở migration viết tay, không
 * khai trong schema Drizzle — đúng cách `listRentalsInRange` (`services/rentals.ts`)
 * đã làm.
 */
export async function listRentalsLedger(input: {
  q?: string | undefined;
  statuses?: readonly RentalStatus[] | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}): Promise<{ rentals: RentalListRow[]; total: number; collectedAmount: Vnd }> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    RENTALS_PAGE_SIZE_MAX,
    Math.max(1, Math.trunc(input.pageSize ?? RENTALS_PAGE_SIZE_DEFAULT)),
  );

  const conditions: SQL[] = [
    sql`period && tstzrange(${input.from ?? null}::timestamptz, ${input.to ?? null}::timestamptz, '[)')`,
  ];

  if (input.statuses && input.statuses.length > 0) {
    conditions.push(inArray(schema.rentals.status, [...input.statuses]));
  }

  const term = (input.q ?? "").trim();
  if (term.length > 0) {
    // Chuẩn hoá ĐƯỜNG ĐỌC cho số điện thoại, cùng lý lẽ `searchCustomers`: gõ
    // "+84912…" phải ra đúng khách đó. Thêm biển số vì trên điện thoại nhân
    // viên thường có biển số trong tay chứ không có tên khách.
    const asPhone = normalizePhone(term);
    const byText = or(
      fullNameMatches(term),
      sql`${schema.vehicles.plate} ILIKE ${`%${term}%`}`,
    );
    conditions.push(asPhone ? or(eq(schema.customers.phone, asPhone), byText)! : byText!);
  }

  const where = and(...conditions)!;

  const base = db
    .select({
      n: sql<number>`count(*)::int`,
      // ⚠️ `::int` phải bọc CẢ cụm `COALESCE(SUM(...) FILTER (...), 0)`. Viết
      // `SUM(...)::int FILTER (...)` là lỗi cú pháp; quên hẳn thì Bun trả CHUỖI
      // và `collectedAmount` lặng lẽ thành `string` sau khi đi qua Eden Treaty.
      //
      // Vị từ `handed_over_at IS NOT NULL` là ĐÚNG vị từ doanh thu của
      // `getStatsSummary`, cố ý dùng lại. Nhưng CỬA SỔ lọc thì khác (giao với
      // khoảng thuê, không phải mốc giao xe), nên con số này KHÔNG bằng
      // "Doanh thu tháng" ở Thống kê và không được đặt tên như thế.
      collected: sql<number>`(COALESCE(SUM(${schema.rentals.totalAmount}) FILTER (WHERE ${schema.rentals.handedOverAt} IS NOT NULL), 0))::int`,
    })
    .from(schema.rentals)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.rentals.customerId))
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentals.vehicleId))
    .where(where);

  const [totals] = await base;

  const rows = await db
    .select(LIST_COLUMNS)
    .from(schema.rentals)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.rentals.customerId))
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentals.vehicleId))
    .where(where)
    // Gần nhất lên trước — sổ cái đọc ngược thời gian. `id` là khoá phụ bắt
    // buộc, cùng lý do đã ghi ở `listRentalsQueue`.
    .orderBy(desc(schema.rentals.startsAt), desc(schema.rentals.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rentals: rows.map((r) => ({ ...r, status: r.status as RentalStatus })),
    total: totals?.n ?? 0,
    collectedAmount: totals?.collected ?? 0,
  };
}
