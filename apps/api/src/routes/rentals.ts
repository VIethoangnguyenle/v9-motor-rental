import { Elysia, t } from "elysia";
import { createCustomer, searchCustomers, type CreateCustomerResult } from "../services/customers";
import type {
  ChangeStatusResult,
  CreateRentalResult,
  ListRentalsResult,
} from "../services/rentals";

const errorSchema = t.Object({ message: t.String(), code: t.String() });

const customerSchema = t.Object({
  id: t.String({ format: "uuid" }),
  fullName: t.String(),
  phone: t.String(),
  note: t.Nullable(t.String()),
});

/**
 * Suy từ kiểu trả về của BỐN service — không liệt kê tay lần thứ hai, cùng lý lẽ
 * `Reason` ở `routes/staff.ts`. `createCustomer` là service DUY NHẤT route ở file
 * này gọi hôm nay; ba hàm còn lại của `services/rentals.ts` (`createRental`,
 * `listRentalsInRange`, `changeRentalStatus`) chưa có route nào gọi — đó là việc
 * của task sau. Import chúng ở đây là import type THUẦN (xoá lúc biên dịch, không
 * kéo theo phụ thuộc runtime nào), chỉ để mượn hình dạng `reason` của chúng ngay
 * bây giờ, thay vì gõ tay bốn chuỗi và hy vọng không lệch.
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

export const rentals = new Elysia({ name: "rentals" })
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
  );
