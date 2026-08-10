import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";

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
 * Một nguồn duy nhất cho "tôi là ai": guard của router và UI đọc CÙNG cache của
 * TanStack Query. Hai chỗ gọi riêng là hai chỗ lệch nhau kể từ lần đầu tiên ai
 * đó thêm một điều kiện vào một trong hai.
 *
 * `null` gộp mọi lý do không đọc được hồ sơ (401 chưa đăng nhập · 403 đã khoá /
 * chưa có hồ sơ · mạng chết). Guard đối xử với tất cả như nhau: về `/dang-nhap`.
 * Phân biệt chúng ở đây chỉ có ích nếu có màn hình nào hành động khác nhau —
 * chưa có.
 */
export const meQuery = {
  queryKey: ["me"] as const,
  queryFn: async (): Promise<Me | null> => {
    const res = await api.staff.me.get();
    if (res.error) return null;
    return res.data;
  },
};

export const layMe = (qc: QueryClient) => qc.ensureQueryData(meQuery);
