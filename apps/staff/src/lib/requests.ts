import type { ApiErrorCode } from "@v9/api";
import type { RequestStatus } from "@v9/shared/domain/rental-request";
import { api } from "./api";
import { errorCode } from "./errors";

/**
 * Suy từ chính `response` schema của API, cùng khuôn `lib/rentals.ts` — không gõ
 * tay một `interface` thứ hai. Đọc lý do đầy đủ ở đầu file đó.
 */
export type RentalRequestRow = NonNullable<
  Awaited<ReturnType<typeof api.requests.get>>["data"]
>[number];

export type RequestsResult =
  | { ok: true; requests: RentalRequestRow[] }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

/**
 * `status` nằm TRONG `queryKey`: mỗi bộ lọc là một entry cache riêng. Bỏ nó ra
 * thì đổi tab lọc mà vẫn thấy danh sách của tab trước cho tới khi refetch xong —
 * cùng lớp lỗi "lịch hiện dữ liệu tuần trước" đã ghi ở `rentalsQuery`.
 */
export const requestsQuery = (status: RequestStatus | null) => ({
  queryKey: ["requests", status] as const,
  queryFn: async (): Promise<RequestsResult> => {
    const res = await api.requests.get({ query: status === null ? {} : { status } });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, requests: res.data };
  },
});

/**
 * Số yêu cầu chưa xử lý — badge trên nav.
 *
 * Query RIÊNG chứ không đếm từ `requestsQuery("NEW")`: badge phải đúng ở MỌI
 * trang, kể cả khi người dùng chưa từng mở màn tiếp nhận, và một `length` đọc
 * ké từ cache của trang khác thì bằng 0 cho tới lúc trang đó được mở.
 */
export const newRequestCountQuery = {
  queryKey: ["requests-count-new"] as const,
  queryFn: async (): Promise<number | null> => {
    const res = await api.requests["count-new"].get();
    // Badge hỏng KHÔNG được làm hỏng trang. `null` = chưa biết, và nav không vẽ gì.
    if (res.error) return null;
    return res.data.count;
  },
  // 60s: con số này không cần chính xác từng giây, và nó chạy ở MỌI trang.
  staleTime: 60_000,
};

export type ChangeRequestResult =
  | { ok: true }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

export async function changeRequestStatus(
  id: string,
  to: RequestStatus,
): Promise<ChangeRequestResult> {
  const res = await api.requests({ id }).status.post({ to });
  if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
  return { ok: true };
}
