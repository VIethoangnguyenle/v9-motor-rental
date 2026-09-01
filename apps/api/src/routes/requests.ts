import { Elysia, t, type Static } from "elysia";
import { MAX_REQUEST_DAYS, type RequestStatus } from "@v9/shared/domain/rental-request";
import { staffGuard } from "../plugins/staff-guard";
import {
  changeRequestStatus,
  countNewRequests,
  createRentalRequest,
  listRentalRequests,
  type ChangeRequestStatusResult,
  type CreateRequestResult,
} from "../services/requests";

/**
 * Suy TỪ `reason` của service, không phải từ `MESSAGES` — thêm một `reason` mới
 * mà quên dịch là lỗi biên dịch ở `satisfies` bên dưới. Đọc lý lẽ đầy đủ ở
 * `routes/rentals.ts`, chỗ khai `RentalErrorCode`.
 */
export type RequestErrorCode =
  | Extract<CreateRequestResult, { ok: false }>["reason"]
  | Extract<ChangeRequestStatusResult, { ok: false }>["reason"];

const MESSAGES = {
  VEHICLE_NOT_AVAILABLE: "Xe này hiện không nhận yêu cầu",
  INVALID_PHONE: "Số điện thoại không hợp lệ",
  INVALID_DAYS: `Số ngày thuê phải từ 1 đến ${String(MAX_REQUEST_DAYS)}`,
  REQUEST_NOT_FOUND: "Không tìm thấy yêu cầu",
  INVALID_REQUEST_TRANSITION: "Không đổi được trạng thái yêu cầu",
} as const satisfies Record<RequestErrorCode, string>;

const toError = (code: RequestErrorCode) => ({ code, message: MESSAGES[code] });

const errorSchema = t.Object({ message: t.String(), code: t.String() });

/**
 * Khai tường minh, KHÔNG `REQUEST_STATUSES.map(t.Literal)`: TypeBox không suy
 * được literal union từ một `.map` (kết quả rộng ra `TLiteral[]`, và `Static`
 * của nó là `never`). Khoá bằng ràng buộc HAI CHIỀU ở biên dịch thay vì để trôi
 * — cùng khuôn `statusSchema` của `routes/rentals.ts`, đọc lý lẽ đầy đủ ở đó.
 */
const statusSchema = t.Union([t.Literal("NEW"), t.Literal("CONTACTED"), t.Literal("CLOSED")]);
type StatusSchemaValue = Static<typeof statusSchema>;
type StatusSetsMatch = [RequestStatus] extends [StatusSchemaValue]
  ? [StatusSchemaValue] extends [RequestStatus]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tồn tại CHỈ để ép kiểm hai chiều ở trên.
const _statusSchemaMatchesDomain: StatusSetsMatch = true;

const requestSchema = t.Object({
  id: t.String({ format: "uuid" }),
  vehicleId: t.String({ format: "uuid" }),
  fullName: t.String(),
  phone: t.String(),
  startDate: t.String(),
  days: t.Integer(),
  deliveryAddress: t.Nullable(t.String()),
  note: t.Nullable(t.String()),
  status: statusSchema,
  handledBy: t.Nullable(t.String()),
  handledAt: t.Nullable(t.Date()),
  createdAt: t.Date(),
});

const requestWithVehicleSchema = t.Composite([
  requestSchema,
  t.Object({
    vehicleSlug: t.String(),
    vehicleMake: t.String(),
    vehicleModel: t.String(),
  }),
]);

/**
 * ⚠️ `POST /requests` là đường ghi CÔNG KHAI duy nhất của API, và nó phải được
 * khai trong `PUBLIC_ROUTES` của `plugins/staff-guard.ts` — guard mặc định CHẶN,
 * nên quên khai thì khách gửi yêu cầu nhận 401 và web im lặng hỏng.
 *
 * `apps/web` gọi route này từ SERVER (Server Action), không từ trình duyệt. Đó
 * là lý do CORS ở `index.ts` vẫn chỉ mở cho `staffAppUrl` mà form vẫn chạy —
 * và là lý do phải giữ nguyên như thế: mở CORS cho origin công khai là biến một
 * endpoint ghi không cần auth thành thứ mọi trang web trên đời gọi được bằng
 * trình duyệt của khách.
 */
export const requests = new Elysia({ name: "requests" })
  .use(staffGuard)
  .post(
    "/requests",
    async ({ body, status }) => {
      const r = await createRentalRequest(body);
      if (r.ok) return status(201, r.request);
      if (r.reason === "VEHICLE_NOT_AVAILABLE") return status(404, toError(r.reason));
      return status(400, toError(r.reason));
    },
    {
      body: t.Object({
        vehicleSlug: t.String({ minLength: 1, maxLength: 200 }),
        // Trần độ dài ở mọi trường tự do: đây là endpoint không cần auth, nên
        // không có gì ngoài schema này đứng giữa một script và một hàng 10MB.
        fullName: t.String({ minLength: 1, maxLength: 200 }),
        phone: t.String({ minLength: 1, maxLength: 40 }),
        startDate: t.String({ format: "date" }),
        days: t.Integer({ minimum: 1, maximum: MAX_REQUEST_DAYS }),
        deliveryAddress: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
        note: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
      }),
      response: { 201: requestSchema, 400: errorSchema, 404: errorSchema },
    },
  )

  .get(
    "/requests",
    async ({ query }) => listRentalRequests(query.status ?? null),
    {
      query: t.Object({ status: t.Optional(statusSchema) }),
      response: { 200: t.Array(requestWithVehicleSchema) },
    },
  )

  .get("/requests/count-new", async () => ({ count: await countNewRequests() }), {
    response: { 200: t.Object({ count: t.Integer() }) },
  })

  .post(
    "/requests/:id/status",
    async ({ params, body, staff, status }) => {
      // `staff` do `staffGuard.resolve({ as: "global" })` bơm vào; guard đã chặn
      // mọi request không có hồ sơ ACTIVE trước khi tới đây. Nhánh null là phòng
      // thủ cho KIỂU — cùng khuôn `POST /rentals`.
      if (!staff) return status(401, { message: "Chưa đăng nhập", code: "NOT_AUTHENTICATED" });

      const r = await changeRequestStatus(params.id, body.to, staff.id, new Date());
      if (r.ok) return status(200, r.request);
      if (r.reason === "REQUEST_NOT_FOUND") return status(404, toError(r.reason));
      return status(409, toError(r.reason));
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ to: statusSchema }),
      response: { 200: requestSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema },
    },
  );
