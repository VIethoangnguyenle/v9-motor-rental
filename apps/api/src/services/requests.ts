import { and, eq, sql } from "drizzle-orm";
import { schema } from "@v9/db";
import { normalizePhone } from "@v9/shared/domain/phone";
import {
  isRequestDaysValid,
  requestTransition,
  type RequestStatus,
} from "@v9/shared/domain/rental-request";
import { db } from "../db";

export interface RentalRequest {
  readonly id: string;
  readonly vehicleId: string;
  readonly fullName: string;
  readonly phone: string;
  readonly startDate: string;
  readonly days: number;
  readonly deliveryAddress: string | null;
  readonly note: string | null;
  readonly status: RequestStatus;
  readonly handledBy: string | null;
  readonly handledAt: Date | null;
  readonly createdAt: Date;
}

/** Yêu cầu kèm tên xe — màn tiếp nhận không dùng được một `vehicle_id` trần. */
export interface RentalRequestWithVehicle extends RentalRequest {
  readonly vehicleSlug: string;
  readonly vehicleMake: string;
  readonly vehicleModel: string;
}

const COLUMNS = {
  id: schema.rentalRequests.id,
  vehicleId: schema.rentalRequests.vehicleId,
  fullName: schema.rentalRequests.fullName,
  phone: schema.rentalRequests.phone,
  startDate: schema.rentalRequests.startDate,
  days: schema.rentalRequests.days,
  deliveryAddress: schema.rentalRequests.deliveryAddress,
  note: schema.rentalRequests.note,
  status: schema.rentalRequests.status,
  handledBy: schema.rentalRequests.handledBy,
  handledAt: schema.rentalRequests.handledAt,
  createdAt: schema.rentalRequests.createdAt,
};

export type CreateRequestResult =
  | { ok: true; request: RentalRequest }
  | { ok: false; reason: "VEHICLE_NOT_AVAILABLE" | "INVALID_PHONE" | "INVALID_DAYS" };

/**
 * Nhận một yêu cầu từ khách. Đường ghi CÔNG KHAI duy nhất của toàn bộ API —
 * không session, không tài khoản (PRODUCT.md: bắt khách đăng nhập chỉ làm giảm
 * số yêu cầu nhận được, mà yêu cầu chính là thứ web sinh ra để tạo).
 *
 * Vì công khai, ba thứ được kiểm ở đây chứ không tin phía gọi:
 *
 *  1. **Xe phải `published`.** Khách chỉ thấy xe published trên web, nên một
 *     `vehicleId` trỏ vào xe `draft`/`archived` là dấu hiệu request được dựng
 *     tay. Trả cùng một `reason` với "xe không tồn tại" — không nói cho người lạ
 *     biết trong database có xe đó nhưng chưa đăng.
 *  2. **Số điện thoại chuẩn hoá.** Cùng `normalizePhone` với `customers`, nên
 *     nhân viên tìm được khách này về sau bằng cùng một chuỗi.
 *  3. **Số ngày trong trần.** `isRequestDaysValid` là nguồn sự thật; CHECK ở DB
 *     là lưới thứ hai.
 */
export async function createRentalRequest(input: {
  vehicleSlug: string;
  fullName: string;
  phone: string;
  startDate: string;
  days: number;
  deliveryAddress?: string | null;
  note?: string | null;
}): Promise<CreateRequestResult> {
  const phone = normalizePhone(input.phone);
  if (phone === null) return { ok: false, reason: "INVALID_PHONE" };
  if (!isRequestDaysValid(input.days)) return { ok: false, reason: "INVALID_DAYS" };

  const [vehicle] = await db
    .select({ id: schema.vehicles.id })
    .from(schema.vehicles)
    .where(
      and(eq(schema.vehicles.slug, input.vehicleSlug), eq(schema.vehicles.status, "published")),
    )
    .limit(1);

  if (!vehicle) return { ok: false, reason: "VEHICLE_NOT_AVAILABLE" };

  const [row] = await db
    .insert(schema.rentalRequests)
    .values({
      vehicleId: vehicle.id,
      fullName: input.fullName.trim(),
      phone,
      startDate: input.startDate,
      days: input.days,
      deliveryAddress: input.deliveryAddress?.trim() || null,
      note: input.note?.trim() || null,
    })
    .returning(COLUMNS);

  if (!row) throw new Error("INSERT rental_requests không trả về hàng nào");
  return { ok: true, request: { ...row, status: row.status as RequestStatus } };
}

/**
 * Danh sách cho màn tiếp nhận.
 *
 * ⚠️ `ORDER BY created_at DESC NULLS LAST` viết NGUYÊN VĂN, không rút gọn —
 * `rental_requests_new_idx` sinh ra với `NULLS LAST`, và mặc định của Postgres
 * cho `DESC` là `NULLS FIRST`. Thiếu hai chữ đó là mất index trong im lặng,
 * cùng cái bẫy đã ghi ở `vehicles_published_idx`.
 */
export async function listRentalRequests(
  status: RequestStatus | null,
): Promise<RentalRequestWithVehicle[]> {
  const rows = await db
    .select({
      ...COLUMNS,
      vehicleSlug: schema.vehicles.slug,
      vehicleMake: schema.vehicles.make,
      vehicleModel: schema.vehicles.model,
    })
    .from(schema.rentalRequests)
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentalRequests.vehicleId))
    .where(status === null ? undefined : eq(schema.rentalRequests.status, status))
    .orderBy(sql`${schema.rentalRequests.createdAt} DESC NULLS LAST`)
    .limit(200);

  return rows.map((r) => ({ ...r, status: r.status as RequestStatus }));
}

export type ChangeRequestStatusResult =
  | { ok: true; request: RentalRequest }
  | { ok: false; reason: "REQUEST_NOT_FOUND" | "INVALID_REQUEST_TRANSITION" };

/**
 * Đổi trạng thái một yêu cầu. Đọc-rồi-ghi nên PHẢI trong transaction có
 * `FOR UPDATE` — cùng lý lẽ `changeRentalStatus`: hai nhân viên cùng mở màn tiếp
 * nhận và cùng bấm "đã liên hệ" thì không có khoá, cả hai cùng đọc `NEW`, cả hai
 * cùng ghi, và `handled_by` cuối cùng là của người bấm sau.
 *
 * `handledAt` đóng ở đây chứ không để route truyền vào, cùng lý do
 * `handed_over_at` của `rentals`.
 */
export async function changeRequestStatus(
  id: string,
  to: RequestStatus,
  staffId: string,
  now: Date,
): Promise<ChangeRequestStatusResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: schema.rentalRequests.id, status: schema.rentalRequests.status })
      .from(schema.rentalRequests)
      .where(eq(schema.rentalRequests.id, id))
      .for("update")
      .limit(1);

    if (!current) return { ok: false as const, reason: "REQUEST_NOT_FOUND" as const };

    const check = requestTransition(current.status as RequestStatus, to);
    if (!check.ok) return { ok: false as const, reason: "INVALID_REQUEST_TRANSITION" as const };

    const [row] = await tx
      .update(schema.rentalRequests)
      .set({ status: to, handledBy: staffId, handledAt: now, updatedAt: now })
      .where(eq(schema.rentalRequests.id, id))
      .returning(COLUMNS);

    if (!row) throw new Error("UPDATE rental_requests không trả về hàng nào");
    return { ok: true as const, request: { ...row, status: row.status as RequestStatus } };
  });
}

/** Đếm yêu cầu chưa xử lý — badge trên nav của `apps/staff`. */
export async function countNewRequests(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.rentalRequests)
    .where(eq(schema.rentalRequests.status, "NEW"));
  return row?.n ?? 0;
}
