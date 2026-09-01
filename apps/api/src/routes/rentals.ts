import { Elysia, t, type Static } from "elysia";
import type { RentalStatus } from "@v9/shared/domain/rental";
import { staffGuard, type GuardErrorCode } from "../plugins/staff-guard";
import {
  createCustomer,
  findCustomerById,
  listCustomers,
  searchCustomers,
  updateCustomer,
  CUSTOMERS_PAGE_SIZE_MAX,
  type CreateCustomerResult,
  type UpdateCustomerResult,
} from "../services/customers";
import {
  changeRentalStatus,
  createRental,
  listRentalsForCustomer,
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
 * Một dòng của `GET /customers/list` — `customerSchema` cộng tín hiệu vận hành
 * suy ra từ `rentals`.
 *
 * `activeRental` khai `status` + hai mốc thời gian chứ không phải một cờ
 * `isOverdue` đã tính sẵn: "quá hạn" phụ thuộc vào ĐỒNG HỒ lúc xem, nên tính ở
 * server rồi serialize là đóng băng một câu trả lời sẽ sai sau vài phút.
 * Frontend gọi `isOverdue()` của `@v9/shared` trên `status` + `endsAt`.
 *
 * `startsAt` có mặt vì `isOverdue` trả `false` cho BOOKED theo thiết kế: thiếu
 * nó thì màn hình không phân biệt được "lẽ ra lấy xe hôm qua" với "tuần sau mới
 * lấy". Lý lẽ đầy đủ ở `ActiveRental` (`services/customers.ts`).
 */
const customerListRowSchema = t.Composite([
  customerSchema,
  t.Object({
    rentalCount: t.Integer(),
    lateReturnCount: t.Integer(),
    activeRental: t.Nullable(
      t.Object({
        id: t.String({ format: "uuid" }),
        status: t.Union([t.Literal("ONGOING"), t.Literal("BOOKED")]),
        startsAt: t.Date(),
        endsAt: t.Date(),
      }),
    ),
  }),
]);

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
 * `rentalSchema` cộng xe — dùng cho `GET /customers/:id/rentals` (lịch sử một
 * khách hàng, xem `listRentalsForCustomer` ở `services/rentals.ts`). Trường
 * `customerName`/`customerPhone` của `rentalSchema` gốc vẫn khai `t.Optional`
 * nên KHÔNG có mặt ở response này (route không JOIN `customers` — người gọi
 * đã biết khách hàng nào, chính là `:id` trên URL) không phải lỗi schema.
 */
const rentalWithVehicleSchema = t.Composite([
  rentalSchema,
  t.Object({
    vehicleMake: t.String(),
    vehicleModel: t.String(),
    vehiclePlate: t.Nullable(t.String()),
  }),
]);

/**
 * Suy từ kiểu trả về của NĂM service — không liệt kê tay lần thứ hai, cùng lý lẽ
 * `Reason` ở `routes/staff.ts`. Import type THUẦN (xoá lúc biên dịch, không kéo
 * theo phụ thuộc runtime nào), chỉ để mượn hình dạng `reason` của chúng, thay vì
 * gõ tay bốn chuỗi và hy vọng không lệch.
 *
 * Vì sao đáng làm: bản nháp ban đầu của task này suy `RentalErrorCode` NGƯỢC —
 * `keyof typeof MESSAGES`, tức từ MESSAGES suy ra type. Chiều đó không bắt được
 * gì cả, vì `keyof typeof X` luôn khớp với chính `X`. Suy theo chiều dưới đây thì
 * thêm một `reason` mới ở BẤT KỲ service nào trong năm cái trên mà quên dịch ở
 * `MESSAGES` là LỖI BIÊN DỊCH ngay tại `satisfies` bên dưới, không phải một
 * response tiếng Việt chung chung nuốt mất lý do thật lúc chạy.
 */
type CustomerErrorReason =
  | Extract<CreateCustomerResult, { ok: false }>["reason"]
  | Extract<UpdateCustomerResult, { ok: false }>["reason"];
type RentalServiceErrorReason =
  | Extract<CreateRentalResult, { ok: false }>["reason"]
  | Extract<ListRentalsResult, { ok: false }>["reason"]
  | Extract<ChangeStatusResult, { ok: false }>["reason"];

export type RentalErrorCode = CustomerErrorReason | RentalServiceErrorReason;

const MESSAGES = {
  INVALID_PHONE: "Số điện thoại không hợp lệ",
  CUSTOMER_EXISTS: "Khách hàng này đã có trong hệ thống",
  CUSTOMER_NOT_FOUND: "Không tìm thấy khách hàng",
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

  /**
   * Màn danh sách khách hàng (`apps/staff`, `/customers`). Route RIÊNG với
   * `GET /customers` ở trên — không phải cùng endpoint rẽ nhánh bằng query
   * param — vì hai bên cần hai HÌNH DẠNG response khác nhau (mảng trần cho
   * dropdown tự động vs. `{ customers, total, page, pageSize }` có phân
   * trang), và Elysia khai response theo TỪNG route.
   *
   * `q` rỗng ở ĐÂY nghĩa là "xem hết" — ĐẢO NGƯỢC với `GET /customers` phía
   * trên, nơi `q` rỗng nghĩa là "chưa gõ gì, đừng trả gì". Hai hành vi tồn
   * tại song song có chủ ý, phục vụ hai người gọi khác nhau; đổi một trong
   * hai theo hướng còn lại là phá đúng cái đang bảo vệ.
   *
   * `pageSize` bị chặn ở CẢ hai tầng — schema (`maximum` dưới đây) VÀ service
   * (`CUSTOMERS_PAGE_SIZE_MAX`) — cùng lý do `MAX_RANGE_DAYS` được kiểm ở
   * `listRentalsInRange` thay vì chỉ ở route: một lời gọi thẳng vào service
   * (từ test, hay từ một route khác sau này) vẫn phải đi qua trần đó.
   */
  .get(
    "/customers/list",
    async ({ query }) => {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const result = await listCustomers({ q: query.q, page, pageSize });
      return { customers: result.customers, total: result.total, page, pageSize };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: CUSTOMERS_PAGE_SIZE_MAX })),
      }),
      response: {
        200: t.Object({
          customers: t.Array(customerListRowSchema),
          total: t.Integer(),
          page: t.Integer(),
          pageSize: t.Integer(),
        }),
      },
    },
  )

  .get(
    "/customers/:id",
    async ({ params, status }) => {
      const customer = await findCustomerById(params.id);
      if (!customer) return status(404, toError("CUSTOMER_NOT_FOUND"));
      return status(200, customer);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      response: { 200: customerSchema, 404: errorSchema },
    },
  )

  /**
   * Sửa hồ sơ (tên/số điện thoại/ghi chú) — `POST`, không `PATCH`. Không route
   * nào trong repo dùng `PATCH`; `POST /staff/users/:id/*` là khuôn mẫu sửa
   * tài nguyên đã có (`routes/staff.ts`), nên nối tiếp đúng khuôn đó thay vì
   * mở một tiền lệ verb mới cho một route duy nhất.
   *
   * KHÔNG có `DELETE /customers/:id` — cố ý, không phải thiếu sót. `customer_id`
   * ở bảng `rentals` là `ON DELETE RESTRICT`, nên một khách đã có đơn không xoá
   * được; việc còn lại (ẩn/gộp/archive một khách chưa từng có đơn) là quyết định
   * nghiệp vụ chưa ai chốt. Thêm một nút Xoá rồi để nó thỉnh thoảng vỡ bằng lỗi
   * DB thô là tệ hơn không có nút đó.
   */
  .post(
    "/customers/:id",
    async ({ params, body, status }) => {
      const r = await updateCustomer(params.id, body);
      if (r.ok) return status(200, r.customer);
      if (r.reason === "CUSTOMER_EXISTS") {
        return status(409, { ...toError("CUSTOMER_EXISTS"), existing: r.existing });
      }
      if (r.reason === "CUSTOMER_NOT_FOUND") return status(404, toError("CUSTOMER_NOT_FOUND"));
      return status(400, toError("INVALID_PHONE"));
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        fullName: t.String({ minLength: 1 }),
        phone: t.String({ minLength: 1 }),
        note: t.Optional(t.Nullable(t.String())),
      }),
      response: {
        200: customerSchema,
        400: errorSchema,
        404: errorSchema,
        409: t.Composite([errorSchema, t.Object({ existing: customerSchema })]),
      },
    },
  )

  /**
   * Lịch sử đơn thuê của MỘT khách hàng — màn chi tiết `/customers/:id` ở
   * `apps/staff`. Không kiểm khách hàng có tồn tại hay không trước khi truy
   * vấn: id lạ chỉ đơn giản khớp 0 hàng và trả `[]`, đúng nghĩa "chưa có đơn
   * nào" — trang chi tiết đã tự xác nhận sự tồn tại của khách qua
   * `GET /customers/:id` trước khi gọi route này, nên không cần xác nhận lại.
   */
  .get("/customers/:id/rentals", async ({ params }) => listRentalsForCustomer(params.id), {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
    response: { 200: t.Array(rentalWithVehicleSchema) },
  })

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
