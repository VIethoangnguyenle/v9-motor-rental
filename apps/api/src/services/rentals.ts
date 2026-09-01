import { desc, eq, sql } from "drizzle-orm";
import { schema } from "@v9/db";
import type { Vnd } from "@v9/shared/domain/money";
import { transition } from "@v9/shared/domain/rental";
import type { RentalStatus } from "@v9/shared/domain/rental";
import { SQL } from "bun";
import { db } from "../db";

export interface Rental {
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
  /** Giấy tờ shop giữ cho ĐƠN này. `null` = chưa giữ gì. Migration `0012`. */
  readonly documentType: string | null;
  /** `null` = còn đang giữ. */
  readonly documentReturnedAt: Date | null;
  readonly deliveryAddress: string | null;
}

export type CreateRentalResult =
  { ok: true; rental: Rental } | { ok: false; reason: "RENTAL_OVERLAP" };

const COLUMNS = {
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
  // Ba cột bàn giao. Đi kèm mọi lượt đọc đơn chứ không có endpoint riêng: sheet
  // chi tiết mở từ lịch cần chúng ngay, và một round-trip nữa cho ba giá trị
  // nhỏ là đắt hơn việc mang chúng theo.
  documentType: schema.rentals.documentType,
  documentReturnedAt: schema.rentals.documentReturnedAt,
  deliveryAddress: schema.rentals.deliveryAddress,
};

/**
 * ⚠️ SQLSTATE của Bun.SQL nằm ở `.errno`, KHÔNG phải `.code`.
 *
 * `.code` LUÔN là "ERR_POSTGRES_SERVER_ERROR", nên `e.code === "23P01"` là điều
 * kiện không bao giờ đúng — va chạm booking sẽ rơi ra 500 thay vì 409, và không
 * unit test mock database nào bắt được (nó sẽ xác nhận đoạn code sai là đúng).
 *
 * Kiểm thêm `.constraint`: chỉ SQLSTATE thì một exclusion constraint khác (nếu
 * sau này có) cũng bị dịch thành RENTAL_OVERLAP, tức trả sai lý do cho người dùng.
 *
 * ⚠️ Bẫy THỨ HAI, không nằm trong tài liệu gốc: `db.insert(...)` đi qua query
 * builder của Drizzle, và `queryWithCache` ở đó BỌC lỗi driver gốc vào
 * `DrizzleQueryError` rồi ném cái bọc — `SQL.PostgresError` gốc chỉ còn nằm ở
 * `.cause`, KHÔNG phải chính `e` nữa. Đã xác nhận bằng thực nghiệm trực tiếp
 * (không suy luận): `e instanceof SQL.PostgresError` là `false`,
 * `e.cause instanceof SQL.PostgresError` là `true`. Đây là chỗ khác với
 * `packages/db/src/schema/rentals-schema.test.ts` — file đó insert bằng tagged
 * template `tx\`...\`` thẳng qua Bun.SQL, KHÔNG qua Drizzle, nên không thấy lớp
 * bọc này. Bỏ qua `.cause` thì y hệt bẫy `.code` ở trên: exception bay ra ngoài,
 * và test "trả RENTAL_OVERLAP (không throw)" đỏ chứ không lộ ra như 500 im lặng.
 */
function isOverlapViolation(e: unknown): boolean {
  const cause = e instanceof Error ? e.cause : undefined;
  const pgError =
    e instanceof SQL.PostgresError ? e : cause instanceof SQL.PostgresError ? cause : null;
  return (
    pgError !== null && pgError.errno === "23P01" && pgError.constraint === "rentals_no_overlap"
  );
}

/**
 * Tạo đơn. MỘT câu INSERT, không transaction và không savepoint — cả hai chỉ cần
 * khi transaction còn phải chạy tiếp SAU một lỗi có thể phục hồi, mà ở đây không
 * có gì chạy tiếp. (Luật savepoint của CLAUDE.md áp cho `changeRentalStatus` ở
 * task sau, nơi có đọc-rồi-ghi trong cùng một transaction.)
 *
 * KHÔNG kiểm chồng lịch bằng SELECT trước khi INSERT: câu đó luôn thua race
 * condition. Hàng rào là exclusion constraint; ở đây ta chỉ DỊCH lỗi của nó.
 */
export async function createRental(input: {
  vehicleId: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date;
  totalAmount: Vnd;
  depositAmount: Vnd;
  createdBy: string;
  note?: string | null;
}): Promise<CreateRentalResult> {
  try {
    const [row] = await db
      .insert(schema.rentals)
      .values({
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        totalAmount: input.totalAmount,
        depositAmount: input.depositAmount,
        createdBy: input.createdBy,
        note: input.note ?? null,
      })
      .returning(COLUMNS);

    if (!row) throw new Error("INSERT rentals không trả về hàng nào");
    return { ok: true, rental: { ...row, status: row.status as RentalStatus } };
  } catch (e) {
    if (isOverlapViolation(e)) return { ok: false, reason: "RENTAL_OVERLAP" };
    throw e;
  }
}

/** Trần khoảng thời gian, hằng CÓ TÊN — không rải số 92 trong route. */
export const MAX_RANGE_DAYS = 92;

export interface RentalWithCustomer extends Rental {
  readonly customerName: string;
  readonly customerPhone: string;
}

export type ListRentalsResult =
  { ok: true; rentals: RentalWithCustomer[] } | { ok: false; reason: "INVALID_RANGE" };

/**
 * Mọi đơn GIAO với [from, to). Dùng toán tử `&&` trên cột sinh `period`, nên nó
 * đi qua đúng GiST index mà exclusion constraint đã tạo ra — không index nào
 * được thêm cho truy vấn này.
 *
 * `period` KHÔNG có trong schema Drizzle (nó sống ở migration 0010 viết tay), nên
 * mệnh đề dưới đây phải viết bằng `sql` thô. Đó là chủ ý, không phải thiếu sót.
 *
 * Vượt trần hoặc khoảng không hợp lệ thì trả về lỗi, KHÔNG tự cắt bớt: cắt là trả
 * dữ liệu thiếu dưới vỏ một response thành công, và client không có cách nào biết.
 */
export async function listRentalsInRange(from: Date, to: Date): Promise<ListRentalsResult> {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (!(days > 0) || days > MAX_RANGE_DAYS) return { ok: false, reason: "INVALID_RANGE" };

  const rows = await db
    .select({
      ...COLUMNS,
      customerName: schema.customers.fullName,
      customerPhone: schema.customers.phone,
    })
    .from(schema.rentals)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.rentals.customerId))
    .where(
      sql`${schema.rentals.status} <> 'CANCELLED' AND period && tstzrange(${from}, ${to}, '[)')`,
    )
    .orderBy(schema.rentals.vehicleId, schema.rentals.startsAt);

  return { ok: true, rentals: rows.map((r) => ({ ...r, status: r.status as RentalStatus })) };
}

export type ChangeStatusResult =
  { ok: true; rental: Rental } | { ok: false; reason: "NOT_FOUND" | "INVALID_TRANSITION" };

/**
 * Đổi trạng thái đơn. Đọc-rồi-ghi, nên PHẢI nằm trong transaction có
 * `SELECT ... FOR UPDATE`: không có nó, hai nhân viên bấm "giao xe" cùng lúc đều
 * đọc thấy BOOKED và cả hai đều ghi được.
 *
 * Transaction boundary thuộc SERVICE, không thuộc route — pattern 4 của repo.
 *
 * Dấu thời gian đóng ở đây chứ không để route truyền vào: `handed_over_at` là mốc
 * ghi nhận doanh thu, và một route truyền sai giờ là một tháng doanh thu sai.
 */
export async function changeRentalStatus(
  id: string,
  to: RentalStatus,
  now: Date,
): Promise<ChangeStatusResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: schema.rentals.id, status: schema.rentals.status })
      .from(schema.rentals)
      .where(eq(schema.rentals.id, id))
      .for("update")
      .limit(1);

    if (!current) return { ok: false as const, reason: "NOT_FOUND" as const };

    const check = transition(current.status as RentalStatus, to);
    if (!check.ok) return { ok: false as const, reason: check.reason };

    const [row] = await tx
      .update(schema.rentals)
      .set({
        status: to,
        updatedAt: now,
        ...(to === "ONGOING" ? { handedOverAt: now } : {}),
        ...(to === "COMPLETED" ? { returnedAt: now } : {}),
      })
      .where(eq(schema.rentals.id, id))
      .returning(COLUMNS);

    if (!row) throw new Error("UPDATE rentals không trả về hàng nào");
    return { ok: true as const, rental: { ...row, status: row.status as RentalStatus } };
  });
}

/** Trần lịch sử một khách hàng — bảo hiểm rẻ, cùng lý lẽ `CUSTOMERS_PAGE_SIZE_MAX`
 *  ở `services/customers.ts`: một khách rất lâu năm không nên kéo cả nghìn hàng
 *  vào một màn chi tiết. */
export const MAX_CUSTOMER_HISTORY_ROWS = 200;

export interface RentalWithVehicle extends Rental {
  readonly vehicleMake: string;
  readonly vehicleModel: string;
  readonly vehiclePlate: string | null;
}

/**
 * Toàn bộ đơn của MỘT khách hàng, MỚI NHẤT trước — khác hẳn `listRentalsInRange`
 * ở trên cả về TRỤC lọc lẫn phạm vi TRẠNG THÁI, nên tách hàm thay vì cơi nới
 * hàm đó:
 *
 *   • Trục lọc: `listRentalsInRange` lọc theo MỘT KHOẢNG THỜI GIAN, không quan
 *     tâm khách nào — đúng cho lịch. Hàm này lọc theo MỘT KHÁCH HÀNG, không có
 *     khoảng thời gian nào cả — đúng cho "xem lại toàn bộ giao dịch của người
 *     này", nơi một đơn từ sáu tháng trước vẫn phải hiện ra.
 *   • Trạng thái: `listRentalsInRange` ẩn `CANCELLED` (đơn huỷ không chiếm chỗ
 *     trên lịch — đúng việc nó phục vụ). Lịch sử khách hàng thì NGƯỢC LẠI: đơn
 *     huỷ vẫn là một phần thật của quan hệ giao dịch với khách này (biết ai
 *     hay đặt-rồi-huỷ là dữ liệu có ích), nên không lọc gì theo `status` —
 *     UI tự hiện nhãn/màu theo từng trạng thái (`STATUS_LABEL`, `apps/staff`).
 *
 * JOIN với `vehicles` thay vì `customers` (khác `RentalWithCustomer` ở trên):
 * người gọi ĐÃ biết khách hàng nào (chính là tham số `customerId`), cái còn
 * thiếu để hiện một dòng lịch sử đọc được là XE nào, không phải tên khách lặp
 * lại ở mọi dòng.
 */
export async function listRentalsForCustomer(customerId: string): Promise<RentalWithVehicle[]> {
  const rows = await db
    .select({
      ...COLUMNS,
      vehicleMake: schema.vehicles.make,
      vehicleModel: schema.vehicles.model,
      vehiclePlate: schema.vehicles.plate,
    })
    .from(schema.rentals)
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentals.vehicleId))
    .where(eq(schema.rentals.customerId, customerId))
    .orderBy(desc(schema.rentals.startsAt))
    .limit(MAX_CUSTOMER_HISTORY_ROWS);

  return rows.map((r) => ({ ...r, status: r.status as RentalStatus }));
}

export type UpdateHandoverResult =
  | { ok: true; rental: Rental }
  | { ok: false; reason: "RENTAL_NOT_FOUND" | "DOCUMENT_RETURN_NEEDS_TYPE" };

/**
 * Ghi chi tiết bàn giao: giấy tờ shop đang giữ và địa chỉ giao xe.
 *
 * Ba cột này do migration `0012` mở sẵn và **chưa có ai ghi vào** cho tới đợt
 * này — comment ở migration gọi đó là "hợp đồng dữ liệu cho đợt sau, không phải
 * cột bị quên". Đây là đợt sau.
 *
 * `documentReturned` là CỜ chứ không phải dấu thời gian do phía gọi truyền:
 * cùng lý lẽ `handedOverAt` ở `changeRentalStatus` — một route truyền sai giờ là
 * một dòng lịch sử sai, và không có gì bắt được.
 *
 * Nhánh `DOCUMENT_RETURN_NEEDS_TYPE` dịch trước CHECK `rentals_document_return_needs_type`
 * ở DB: bắt ở đây thì người dùng nhận 409 kèm câu tiếng Việt, để rơi xuống DB
 * thì họ nhận 500 kèm một lỗi Postgres thô.
 */
export async function updateRentalHandover(
  id: string,
  input: {
    documentType?: "CCCD" | "PASSPORT" | null;
    deliveryAddress?: string | null;
    documentReturned?: boolean;
  },
  now: Date,
): Promise<UpdateHandoverResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: schema.rentals.id, documentType: schema.rentals.documentType })
      .from(schema.rentals)
      .where(eq(schema.rentals.id, id))
      .for("update")
      .limit(1);

    if (!current) return { ok: false as const, reason: "RENTAL_NOT_FOUND" as const };

    // Loại giấy tờ SAU khi áp thay đổi của request — người dùng có thể vừa chọn
    // loại vừa bấm đã-trả trong cùng một lần lưu.
    const nextType = input.documentType === undefined ? current.documentType : input.documentType;

    if (input.documentReturned === true && (nextType === null || nextType === undefined)) {
      return { ok: false as const, reason: "DOCUMENT_RETURN_NEEDS_TYPE" as const };
    }

    const [row] = await tx
      .update(schema.rentals)
      .set({
        ...(input.documentType === undefined ? {} : { documentType: input.documentType }),
        ...(input.deliveryAddress === undefined ? {} : { deliveryAddress: input.deliveryAddress }),
        ...(input.documentReturned === undefined
          ? {}
          : { documentReturnedAt: input.documentReturned ? now : null }),
        updatedAt: now,
      })
      .where(eq(schema.rentals.id, id))
      .returning(COLUMNS);

    if (!row) throw new Error("UPDATE rentals không trả về hàng nào");
    return { ok: true as const, rental: { ...row, status: row.status as RentalStatus } };
  });
}
