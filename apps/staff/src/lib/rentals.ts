import type { RentalStatus } from "@v9/shared/domain/rental";
import type { ApiErrorCode } from "@v9/api";
import { api } from "./api";
import { errorCode } from "./errors";

/**
 * Ba kiểu SUY RA từ chính `response` schema của API, khuôn theo `Me` ở `lib/me.ts`
 * (đọc comment ở đó trước). Gõ tay `interface FleetVehicle`/`Rental`/`StatsSummary`
 * là dựng bản sao thứ hai của hợp đồng API: nó biên dịch được cho tới ngày route
 * đổi một field, và ngày đó chỗ sai không phải chỗ nổ.
 *
 * KHÔNG dùng `as` ở bất kỳ đâu bên dưới — mọi ép kiểu ở frontend là dấu hiệu đã
 * đoán sai hình dạng API.
 */
export type FleetVehicle = NonNullable<Awaited<ReturnType<typeof api.fleet.get>>["data"]>[number];
export type CalendarRental = NonNullable<
  Awaited<ReturnType<typeof api.rentals.get>>["data"]
>[number];
export type StatsSummary = NonNullable<Awaited<ReturnType<typeof api.stats.summary.get>>["data"]>;

/**
 * Nhánh lỗi giữ CẢ `code` lẫn `value` gốc — không chỉ `code`.
 *
 * `apps/api` viết `message` bằng tiếng Việt, cho người đọc, đúng để hiện nguyên
 * văn (xem đầu `lib/errors.ts`). Trước đây ba query dưới đây chỉ giữ `code` rồi
 * bỏ `value`, nên `errorMessage()` ở phía gọi không còn gì để đọc và luôn rơi về
 * câu chung chung — mất đúng thứ backend cố tình viết ra. `value: unknown` giữ
 * nguyên thân lỗi để `errorMessage(value, fallback)` đọc được `{ message, code }`
 * thật; `code` vẫn giữ riêng vì đó là thứ `errorCode()` dùng để rẽ nhánh.
 */
export type FleetResult =
  { ok: true; vehicles: FleetVehicle[] } | { ok: false; code: ApiErrorCode | null; value: unknown };
export type RentalsResult =
  | { ok: true; rentals: CalendarRental[] }
  | { ok: false; code: ApiErrorCode | null; value: unknown };
export type StatsResult =
  { ok: true; stats: StatsSummary } | { ok: false; code: ApiErrorCode | null; value: unknown };

/**
 * `/fleet` không khai response lỗi riêng trong `routes/fleet.ts` — mọi lỗi nó có
 * thể trả đều tới từ `staffGuard` (401/403 toàn cục). `errorCode()` đọc đúng hình
 * dạng `{ message, code }` chung đó, không quan tâm route nào phát ra nó.
 */
export const fleetQuery = {
  queryKey: ["fleet"] as const,
  queryFn: async (): Promise<FleetResult> => {
    const res = await api.fleet.get();
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, vehicles: res.data };
  },
};

/**
 * `from`/`to` nhận `Date` ở CHỮ KÝ HÀM (khớp cách gọi tự nhiên từ `rental-calendar.tsx`),
 * nhưng `queryKey` PHẢI chứa chuỗi ISO, không phải chính đối tượng `Date`.
 *
 * TanStack so khớp `queryKey` bằng deep-equal theo cấu trúc — hai `Date` cùng
 * thời điểm vẫn so bằng nhau hôm nay — nhưng đó không phải lý do để nhét `Date`
 * thẳng vào key: khoá phải là dữ liệu ỔN ĐỊNH LÚC TUẦN TỰ HOÁ, không phụ thuộc
 * việc hai instance `Date` có "bằng nhau" theo nghĩa nào. Hai khoảng NGÀY khác
 * nhau dùng chung một entry cache là lỗi "lịch hiện dữ liệu tuần trước" — rất khó
 * thấy vì UI vẫn render, chỉ sai dữ liệu.
 */
export const rentalsQuery = (from: Date, to: Date) => ({
  queryKey: ["rentals", from.toISOString(), to.toISOString()] as const,
  queryFn: async (): Promise<RentalsResult> => {
    const res = await api.rentals.get({
      query: { from: from.toISOString(), to: to.toISOString() },
    });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, rentals: res.data };
  },
});

export const statsQuery = {
  queryKey: ["stats-summary"] as const,
  queryFn: async (): Promise<StatsResult> => {
    const res = await api.stats.summary.get();
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, stats: res.data };
  },
};

// ── Khách hàng — dùng ở `components/rentals/rental-form.tsx` ───────────────

export type Customer = NonNullable<Awaited<ReturnType<typeof api.customers.get>>["data"]>[number];

export type CustomersResult =
  { ok: true; customers: Customer[] } | { ok: false; code: ApiErrorCode | null; value: unknown };

/**
 * `q` rỗng trả `[]` ngay ở SERVER (`searchCustomers`, `apps/api/src/services/customers.ts`)
 * — component gọi hàm này chịu trách nhiệm không fetch khi ô tìm còn trống (`enabled`
 * ở `useQuery`), nhưng vẫn đưa `q` vào `queryKey` để mỗi từ khoá là một cache entry
 * riêng, cùng lý lẽ `rentalsQuery` ở trên.
 */
export const customersQuery = (q: string) => ({
  queryKey: ["customers", q] as const,
  queryFn: async (): Promise<CustomersResult> => {
    const res = await api.customers.get({ query: { q } });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, customers: res.data };
  },
});

/**
 * `api.rentals` vừa có property tĩnh (`.get`, `.post`) vừa gọi được như hàm để
 * lấy nhánh `:id` — cùng hình dạng `api.customers` ở `lib/customers.ts`, đọc
 * comment ở đó trước. Kiểu suy ra từ chính `response` schema, không gõ tay.
 */
type RentalByIdRoutes = ReturnType<typeof api.rentals>;
export type RentalDetail = NonNullable<
  Awaited<ReturnType<RentalByIdRoutes["status"]["post"]>>["data"]
>;

export type ChangeStatusResult =
  | { ok: true; rental: RentalDetail }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

/**
 * Đổi trạng thái một đơn — `POST /rentals/:id/status`.
 *
 * KHÔNG phải một query: đây là hành động người dùng chủ động bấm, nên nó sống
 * trong `useMutation` ở phía gọi (khuôn đã có ở bảng nhân viên — xem
 * `docs/workspaces/staff.md`, mục "Form dùng `useMutation`").
 *
 * Giữ CẢ `code` lẫn `value` gốc, cùng lý lẽ ba query ở trên: `apps/api` viết
 * `message` tiếng Việt cho người đọc, và `409 INVALID_TRANSITION` cần phân biệt
 * được với `404 NOT_FOUND` ở phía gọi để nói đúng câu.
 */
export async function changeRentalStatus(
  id: string,
  to: RentalStatus,
): Promise<ChangeStatusResult> {
  const res = await api.rentals({ id }).status.post({ to });
  if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
  return { ok: true, rental: res.data };
}
