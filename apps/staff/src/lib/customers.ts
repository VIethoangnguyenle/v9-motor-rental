import { keepPreviousData } from "@tanstack/react-query";
import type { ApiErrorCode } from "@v9/api";
import { api } from "./api";
import { errorCode } from "./errors";
import type { Customer } from "./rentals";

export type { Customer };

/**
 * Kiểu SUY RA từ `GET /customers/list` — KHÁC `Customer`/`customersQuery` ở
 * `lib/rentals.ts` (ô tìm tự động của form lên đơn). Route đó cố ý trả `[]`
 * khi `q` rỗng; route này cố ý làm NGƯỢC LẠI — `q` rỗng nghĩa là "xem hết",
 * có phân trang, và mỗi dòng thêm ba trường suy ra từ `rentals` (`rentalCount`,
 * `lateReturnCount`, `activeRental`) — một hình dạng response
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
  // Đổi trang / gõ từ khoá tạo queryKey MỚI ⇒ `data` về undefined ⇒ bảng trắng
  // hoàn toàn rồi mới hiện lại. Giữ dữ liệu cũ trong lúc tải bản mới; chỉ báo
  // "đang tải" chuyển sang `isFetching` (khuôn `rental-form.tsx:348`).
  //
  // Hệ quả phải biết khi đọc trang: `placeholderData` chỉ được áp khi
  // `status === "pending"` (`queryObserver.js:265`), nên từ lần tải THỨ HAI trở
  // đi `status` là "success" ngay lập tức và `isPending` LUÔN false —
  // `isFetching` là chỉ báo tải duy nhất còn ý nghĩa. Và khi query mới lỗi thì
  // `status` thành "error", placeholder KHÔNG còn được áp: `data` về undefined,
  // bảng rỗng — đúng lý do nhánh lỗi bên dưới phải render được gì đó.
  placeholderData: keepPreviousData,
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

/**
 * Hình dạng TỐI THIỂU mà `connectionFailed` cần đọc. Cả ba kết quả ở trên đều
 * khớp, nên một hàm phục vụ được cả ba mà không cần generic.
 */
type LoadResult = { readonly ok: true } | { readonly ok: false; readonly value: unknown };

/**
 * "Request chưa từng tới được máy chủ" — phân biệt với "máy chủ có trả lời, và
 * câu trả lời là một lỗi".
 *
 * ⚠️ ĐO ĐƯỢC, KHÔNG PHẢI SUY: Eden Treaty **không** để `queryFn` reject khi mạng
 * chết. `treaty2` bọc lời gọi `fetch` trong try/catch và, vì ta không bật
 * `throwHttpError`, nó NUỐT exception rồi trả về
 * `{ data: null, error: EdenFetchError(503, <exception>), response: undefined }`.
 * Nghĩa là `res.error` truthy ⇒ `queryFn` resolve bình thường với `ok: false`,
 * và `isError` của TanStack **không bao giờ bật** cho ca mất mạng. (Probe: gọi
 * client thật khi cổng 3001 không ai nghe ⇒ `status: 503`, promise RESOLVE.)
 *
 * Vì vậy nhánh `isError` một mình là chưa đủ — nó chỉ còn phủ phần dư (thân
 * response không parse được thành JSON, vì `JSON.parse` của Eden nằm NGOÀI khối
 * try đó). Cái phân biệt được ca mất mạng là `value`: nhánh catch của Eden nhét
 * nguyên `Error` bắt được vào `error.value`, còn lỗi thật của API luôn là object
 * đã đi qua `JSON.parse` — một thân JSON không thể hoá thành `instanceof Error`.
 * Nên phép thử này là CHÍNH XÁC, không phải heuristic.
 *
 * Không dùng `status === 503` (API của ta có 503 thật: `/health` degraded,
 * `EMAIL_NOT_CONFIGURED`), cũng không dùng `response === undefined` (đúng lúc
 * chạy nhưng Eden khai kiểu là `Response`, nên `tsc` báo TS2367 "no overlap").
 *
 * Còn một lý do nữa phải chặn ca này TRƯỚC `errorMessage`: dưới Bun, exception
 * mất kết nối mang sẵn `.code = "ConnectionRefused"` và `.message` tiếng Anh,
 * nên `parseApiError` "đọc được" nó và `errorMessage` sẽ ném nguyên câu
 * "Unable to connect. Is the computer able to access the url?" vào mặt nhân
 * viên. Trình duyệt thì ném `TypeError` không có `.code` nên chỉ ra câu fallback
 * chung chung. Cả hai đều sai — ca này có thông điệp riêng và có nút thử lại.
 */
export function connectionFailed(query: {
  readonly isError: boolean;
  readonly data: LoadResult | undefined;
}): boolean {
  if (query.isError) return true;
  return query.data?.ok === false && query.data.value instanceof Error;
}
