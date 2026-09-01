import type { ApiErrorCode } from "@v9/api";
import { api } from "./api";
import { errorCode } from "./errors";
import type { Customer } from "./rentals";

export type { Customer };

/**
 * Kiểu SUY RA từ `GET /customers/list` — KHÁC `Customer`/`customersQuery` ở
 * `lib/rentals.ts` (ô tìm tự động của form lên đơn). Route đó cố ý trả `[]`
 * khi `q` rỗng; route này cố ý làm NGƯỢC LẠI — `q` rỗng nghĩa là "xem hết",
 * có phân trang, và mỗi dòng thêm `rentalCount` — một hình dạng response
 * khác hẳn (`{ customers, total, page, pageSize }` thay vì mảng trần), nên
 * đây là type + query RIÊNG, không phải mở rộng cái đã có. Lý lẽ đầy đủ ở
 * comment trên route `GET /customers/list` (`apps/api/src/routes/rentals.ts`).
 */
export type CustomerListRow = NonNullable<
  Awaited<ReturnType<typeof api.customers.list.get>>["data"]
>["customers"][number];

/**
 * `api.customers` VỪA có property tĩnh (`.get`, `.post`, `.list`) VỪA gọi
 * được để lấy nhánh `/customers/:id` — đúng khuôn Eden Treaty repo đã dùng ở
 * `api.staff.users` (`pages/staff-list-page.tsx`: `.get()` cho danh sách,
 * `({ id }).approve.post()` cho một dòng). `ReturnType<typeof api.customers>`
 * lấy hình dạng của nhánh `:id` mà KHÔNG cần gọi thật (không có `id` lúc biên
 * dịch) — `typeof` chỉ nhận định danh/qualified name, không nhận lời gọi hàm.
 */
type CustomerByIdRoutes = ReturnType<typeof api.customers>;

export type CustomerRental = NonNullable<
  Awaited<ReturnType<CustomerByIdRoutes["rentals"]["get"]>>["data"]
>[number];

export type CustomersListResult =
  | { ok: true; customers: CustomerListRow[]; total: number; page: number; pageSize: number }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

/** Cùng số với mặc định phía server (`services/customers.ts`) — khai lại tường
 *  minh ở đây để `queryKey` ổn định không phụ thuộc một hằng số ẩn phía server. */
export const CUSTOMERS_PAGE_SIZE = 20;

export const customersListQuery = (q: string, page: number) => ({
  queryKey: ["customers-list", q, page] as const,
  queryFn: async (): Promise<CustomersListResult> => {
    const res = await api.customers.list.get({
      query: { q, page, pageSize: CUSTOMERS_PAGE_SIZE },
    });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, ...res.data };
  },
});

export type CustomerDetailResult =
  { ok: true; customer: Customer } | { ok: false; code: ApiErrorCode | null; value: unknown };

export const customerDetailQuery = (id: string) => ({
  queryKey: ["customer", id] as const,
  queryFn: async (): Promise<CustomerDetailResult> => {
    const res = await api.customers({ id }).get();
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, customer: res.data };
  },
});

export type CustomerRentalsResult =
  | { ok: true; rentals: CustomerRental[] }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

export const customerRentalsQuery = (id: string) => ({
  queryKey: ["customer-rentals", id] as const,
  queryFn: async (): Promise<CustomerRentalsResult> => {
    const res = await api.customers({ id }).rentals.get();
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, rentals: res.data };
  },
});
