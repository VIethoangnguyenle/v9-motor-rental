import { Elysia, t, type Static } from "elysia";
import type { RentalStatus } from "@v9/shared/domain/rental";
import { staffGuard, type GuardErrorCode } from "../plugins/staff-guard";
import { createCustomer, searchCustomers, type CreateCustomerResult } from "../services/customers";
import {
  changeRentalStatus,
  createRental,
  listRentalsInRange,
  type ChangeStatusResult,
  type CreateRentalResult,
  type ListRentalsResult,
} from "../services/rentals";

const errorSchema = t.Object({ message: t.String(), code: t.String() });

const customerSchema = t.Object({
  id: t.String({ format: "uuid" }),
  fullName: t.String(),
  phone: t.String(),
  note: t.Nullable(t.String()),
});

/**
 * Bốn literal này là bản sao thứ BA của cùng một tập hợp — sau CHECK constraint
 * ở DB (`packages/db`, migration của bảng `rentals`) và union type `RentalStatus`
 * ở `@v9/shared/domain/rental`. Không có cách "suy" TypeBox schema THẲNG từ một
 * union type của TypeScript: type bị xoá lúc biên dịch, TypeBox cần một GIÁ TRỊ
 * runtime để dựng validator, và `domain/rental.ts` (cố ý không import gì, xem
 * comment ở đó) không xuất một mảng runtime nào để mượn — nó chỉ có `export type
 * RentalStatus = "BOOKED" | ... `. Thêm một mảng như vậy là việc của
 * `packages/shared`, ngoài phạm vi ba file task này được sửa.
 *
 * Vì không suy được, khoá bằng một ràng buộc HAI CHIỀU ở biên dịch thay vì để
 * trôi im lặng: `Static<typeof statusSchema>` và `RentalStatus` phải là ĐÚNG cùng
 * một tập hợp. Ai thêm/bớt một trạng thái ở MỘT bên (domain hoặc schema này) mà
 * quên bên kia thì `_statusSchemaMatchesDomain` bên dưới không gán được `true`
 * nữa — lỗi biên dịch tại chỗ, không phải một trạng thái mới lặng lẽ không đi
 * qua được API (hoặc một status cũ vẫn được API chấp nhận dù domain đã bỏ).
 */
const statusSchema = t.Union([
  t.Literal("BOOKED"),
  t.Literal("ONGOING"),
  t.Literal("COMPLETED"),
  t.Literal("CANCELLED"),
]);
type StatusSchemaValue = Static<typeof statusSchema>;
type StatusSetsMatch = [RentalStatus] extends [StatusSchemaValue]
  ? [StatusSchemaValue] extends [RentalStatus]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tồn tại CHỈ để ép kiểm tra hai chiều ở trên; không đọc lúc chạy.
const _statusSchemaMatchesDomain: StatusSetsMatch = true;

const rentalSchema = t.Object({
  id: t.String({ format: "uuid" }),
  vehicleId: t.String({ format: "uuid" }),
  customerId: t.String({ format: "uuid" }),
  startsAt: t.Date(),
  endsAt: t.Date(),
  status: statusSchema,
  handedOverAt: t.Nullable(t.Date()),
  returnedAt: t.Nullable(t.Date()),
  totalAmount: t.Integer(),
  depositAmount: t.Integer(),
  note: t.Nullable(t.String()),
  // Chỉ `GET /rentals` (join với `customers`) điền hai trường này; `POST
  // /rentals` và `POST /rentals/:id/status` trả về `Rental` trần từ service,
  // không JOIN. `t.Optional` chứ không phải trường riêng — đã kiểm bằng
  // Elysia thật (xem báo cáo task): trường vắng mặt bị lược khỏi JSON, không
  // phải `null`, và không bị elysia từ chối response.
  customerName: t.Optional(t.String()),
  customerPhone: t.Optional(t.String()),
});

/**
 * Suy từ kiểu trả về của BỐN service — không liệt kê tay lần thứ hai, cùng lý lẽ
 * `Reason` ở `routes/staff.ts`. Import type THUẦN (xoá lúc biên dịch, không kéo
 * theo phụ thuộc runtime nào), chỉ để mượn hình dạng `reason` của chúng, thay vì
 * gõ tay bốn chuỗi và hy vọng không lệch.
 *
 * Vì sao đáng làm: bản nháp ban đầu của task này suy `RentalErrorCode` NGƯỢC —
 * `keyof typeof MESSAGES`, tức từ MESSAGES suy ra type. Chiều đó không bắt được
 * gì cả, vì `keyof typeof X` luôn khớp với chính `X`. Suy theo chiều dưới đây thì
 * thêm một `reason` mới ở BẤT KỲ service nào trong bốn cái trên mà quên dịch ở
 * `MESSAGES` là LỖI BIÊN DỊCH ngay tại `satisfies` bên dưới, không phải một
 * response tiếng Việt chung chung nuốt mất lý do thật lúc chạy.
 */
type CustomerErrorReason = Extract<CreateCustomerResult, { ok: false }>["reason"];
type RentalServiceErrorReason =
  | Extract<CreateRentalResult, { ok: false }>["reason"]
  | Extract<ListRentalsResult, { ok: false }>["reason"]
  | Extract<ChangeStatusResult, { ok: false }>["reason"];

export type RentalErrorCode = CustomerErrorReason | RentalServiceErrorReason;

const MESSAGES = {
  INVALID_PHONE: "Số điện thoại không hợp lệ",
  CUSTOMER_EXISTS: "Khách hàng này đã có trong hệ thống",
  RENTAL_OVERLAP: "Xe này đã có đơn trong khoảng thời gian đó",
  INVALID_RANGE: "Khoảng thời gian không hợp lệ",
  INVALID_TRANSITION: "Không chuyển được đơn sang trạng thái đó",
  NOT_FOUND: "Không tìm thấy đơn thuê",
} as const satisfies Record<RentalErrorCode, string>;

const toError = (code: RentalErrorCode) => ({ code, message: MESSAGES[code] });

/**
 * `staff === null` sau khi qua `staffGuard` nghĩa là bất biến của guard đã vỡ
 * (bug ở guard, hoặc guard bị gỡ khỏi chuỗi `.use()` ở `index.ts`) — KHÔNG phải
 * chuyện của người gọi. Dùng lại đúng mã `NOT_AUTHENTICATED` mà guard tự phát
 * khi không có session (`plugins/staff-guard.ts`): cùng ý nghĩa ("không biết
 * đây là ai"), cùng http status 401 để `supertokens-web-js` ở `apps/staff` đi
 * refresh/redirect đúng đường — SAI hoàn toàn nếu trả `INVALID_RANGE`, vì lỗi
 * đó nói với người dùng "sửa lại ngày đi", trong khi vấn đề thật (nếu nhánh này
 * từng chạy) là auth, không phải dữ liệu họ nhập.
 */
const staffMissing = () =>
  ({ message: "Chưa đăng nhập", code: "NOT_AUTHENTICATED" as const }) satisfies {
    code: GuardErrorCode;
    message: string;
  };

export const rentals = new Elysia({ name: "rentals" })
  // Chỉ để suy kiểu `staff` trong context — `staff-guard` đã dedupe theo `name`
  // (xem comment ở đầu `plugins/staff-guard.ts`), nên `.use()` lại ở đây KHÔNG
  // chạy lại hook lần hai; bảo vệ thật đã có sẵn từ `index.ts` (mặc định chặn,
  // route này không có trong `PUBLIC_ROUTES`). Cùng lý do `routes/staff.ts` làm
  // vậy.
  .use(staffGuard)

  .get("/customers", async ({ query }) => searchCustomers(query.q ?? ""), {
    query: t.Object({ q: t.Optional(t.String()) }),
    response: { 200: t.Array(customerSchema) },
  })

  .post(
    "/customers",
    async ({ body, status }) => {
      const r = await createCustomer(body);
      if (r.ok) return status(201, r.customer);
      if (r.reason === "CUSTOMER_EXISTS") {
        // 409 kèm hồ sơ đã có, để form dùng lại thay vì bắt người nhập lại.
        return status(409, { ...toError("CUSTOMER_EXISTS"), existing: r.existing });
      }
      return status(400, toError("INVALID_PHONE"));
    },
    {
      body: t.Object({
        fullName: t.String({ minLength: 1 }),
        phone: t.String({ minLength: 1 }),
        note: t.Optional(t.Nullable(t.String())),
      }),
      response: {
        201: customerSchema,
        400: errorSchema,
        409: t.Composite([errorSchema, t.Object({ existing: customerSchema })]),
      },
    },
  )

  .get(
    "/rentals",
    async ({ query, status }) => {
      const r = await listRentalsInRange(new Date(query.from), new Date(query.to));
      if (!r.ok) return status(400, toError("INVALID_RANGE"));
      return status(200, r.rentals);
    },
    {
      query: t.Object({
        from: t.String({ format: "date-time" }),
        to: t.String({ format: "date-time" }),
      }),
      response: { 200: t.Array(rentalSchema), 400: errorSchema },
    },
  )

  .post(
    "/rentals",
    async ({ body, staff, status }) => {
      // `staff` do `staffGuard.resolve({ as: "global" })` bơm vào. Guard đã chặn
      // mọi request không có hồ sơ ACTIVE trước khi tới đây, nên nhánh null này
      // là phòng thủ cho KIỂU, không phải cho luồng — xem `staffMissing` ở trên
      // cho lý do vì sao trả `NOT_AUTHENTICATED`/401 chứ không phải `INVALID_RANGE`.
      if (!staff) return status(401, staffMissing());

      const r = await createRental({
        vehicleId: body.vehicleId,
        customerId: body.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        totalAmount: body.totalAmount,
        depositAmount: body.depositAmount,
        createdBy: staff.id,
        note: body.note ?? null,
      });

      if (!r.ok) return status(409, toError("RENTAL_OVERLAP"));
      return status(201, r.rental);
    },
    {
      body: t.Object({
        vehicleId: t.String({ format: "uuid" }),
        customerId: t.String({ format: "uuid" }),
        startsAt: t.String({ format: "date-time" }),
        endsAt: t.String({ format: "date-time" }),
        totalAmount: t.Integer({ minimum: 0 }),
        depositAmount: t.Integer({ minimum: 0 }),
        note: t.Optional(t.Nullable(t.String())),
      }),
      response: { 201: rentalSchema, 401: errorSchema, 409: errorSchema },
    },
  )

  .post(
    "/rentals/:id/status",
    async ({ params, body, status }) => {
      const r = await changeRentalStatus(params.id, body.to, new Date());
      if (r.ok) return status(200, r.rental);
      if (r.reason === "NOT_FOUND") return status(404, toError("NOT_FOUND"));
      return status(409, toError("INVALID_TRANSITION"));
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ to: statusSchema }),
      response: { 200: rentalSchema, 404: errorSchema, 409: errorSchema },
    },
  );
