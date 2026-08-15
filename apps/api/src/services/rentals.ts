import { schema } from "@v9/db";
import type { Vnd } from "@v9/shared/domain/money";
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
}

export type CreateRentalResult =
  | { ok: true; rental: Rental }
  | { ok: false; reason: "RENTAL_OVERLAP" };

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
  const pgError = e instanceof SQL.PostgresError ? e : cause instanceof SQL.PostgresError ? cause : null;
  return pgError !== null && pgError.errno === "23P01" && pgError.constraint === "rentals_no_overlap";
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
