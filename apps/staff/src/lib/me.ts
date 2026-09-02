import type { QueryClient } from "@tanstack/react-query";
import type { ApiErrorCode } from "@v9/api";
import type { StaffRole } from "@v9/shared/domain/staff";
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
 * Vai trò hiển thị cho NGƯỜI ĐỌC. App này chỉ có tiếng Việt, nên in thẳng
 * `OWNER`/`STAFF` ra màn hình là để lọt một hằng của hệ thống vào chỗ của một
 * câu chữ — cùng loại lỗi với `row.status` trần, và người dùng không có cách nào
 * biết `SALES` nghĩa là gì.
 *
 * Khoá theo `StaffRole` (`@v9/shared/domain/staff`) chứ không theo `Me["role"]`:
 * đó là nơi bộ từ vựng vai trò được khai một lần cho cả API, DB check constraint
 * và frontend. `Record` bắt ĐỦ nhánh — thêm một vai trò ở `shared` mà quên dịch
 * ở đây là lỗi biên dịch, không phải một ô trống trên màn hình. Cả `Me["role"]`
 * lẫn `StaffRow["role"]` đều tra được bảng này, nên nó không phải là `Me` cho
 * mượn sang mô tả người khác (xem chú thích `StaffRow` ngay trên).
 *
 * ⚠️ `SALES` vẫn CHƯA được định nghĩa làm gì (docs/ROADMAP.md, và chú thích ở
 * `pages/staff-list-page.tsx`): chưa tài khoản nào mang vai trò này, nên "Kinh
 * doanh" là bản dịch chữ, không phải một quyết định về phạm vi công việc. Ngày
 * vai trò đó có nghĩa thì đọc lại dòng này trước khi tin nó.
 */
export const ROLE_LABEL: Record<StaffRole, string> = {
  OWNER: "Chủ shop",
  STAFF: "Nhân viên",
  SALES: "Kinh doanh",
};

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
