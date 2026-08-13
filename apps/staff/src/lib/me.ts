import type { QueryClient } from "@tanstack/react-query";
import type { ApiErrorCode } from "@v9/api";
import { api } from "./api";
import { errorCode } from "./errors";

/**
 * Kiểu SUY RA từ chính `response` schema của `GET /staff/me`, không gõ tay lại.
 * Gõ tay một `interface Me` nữa là dựng bản sao thứ hai của hợp đồng API: nó
 * biên dịch được cho tới ngày `routes/staff.ts` thêm/bớt một field, và ngày đó
 * chỗ sai không phải chỗ nổ. Ở đây, lệch một field là **lỗi biên dịch** ngay tại
 * mọi chỗ đọc `Me`.
 *
 * Kèm theo: KHÔNG cần `as Me` ở bất kỳ đâu trong app — mọi ép kiểu ở frontend
 * đều là dấu hiệu đã đoán sai hình dạng API (xem CLAUDE.md của apps/api: route
 * thiếu `response` schema thì Eden suy ra `unknown`).
 */
export type Me = NonNullable<Awaited<ReturnType<typeof api.staff.me.get>>["data"]>;

/**
 * Một dòng trong danh sách nhân viên. Suy ra từ chính `GET /staff/users`, không
 * gõ tay và không mượn `Me` — hai endpoint hôm nay dùng chung `staffSchema` nên
 * hình dạng trùng nhau, nhưng `Me` nghĩa là "tôi là ai"; mượn nó cho một dòng mô
 * tả NGƯỜI KHÁC là chỗ người đọc sau vấp, và là chỗ hai endpoint tách nhau ra sẽ
 * hỏng mà không ai thấy.
 */
export type StaffRow = NonNullable<Awaited<ReturnType<typeof api.staff.users.get>>["data"]>[number];

/**
 * Kết quả đọc hồ sơ. Trước đây hàm này trả `Me | null` và **nuốt mã lỗi** — đó
 * đúng là lỗi làm nhánh DISABLED của router thành code chết: API trả
 * `403 ACCOUNT_DISABLED` có chủ ý, frontend vứt đi, guard chỉ còn thấy `null`.
 * §1.1 docs/plans/2026-08-13-staff-auth-fix-design.md.
 */
export type MeResult = { ok: true; me: Me } | { ok: false; code: ApiErrorCode | null };

/**
 * Một nguồn duy nhất cho "tôi là ai": guard của router và UI đọc CÙNG cache của
 * TanStack Query. Hai chỗ gọi riêng là hai chỗ lệch nhau kể từ lần đầu tiên ai
 * đó thêm một điều kiện vào một trong hai.
 */
export const meQuery = {
  queryKey: ["me"] as const,
  queryFn: async (): Promise<MeResult> => {
    const res = await api.staff.me.get();
    if (res.error) return { ok: false, code: errorCode(res.error.value) };
    return { ok: true, me: res.data };
  },
};

export const ensureMe = (qc: QueryClient) => qc.ensureQueryData(meQuery);
