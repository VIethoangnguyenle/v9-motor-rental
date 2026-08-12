import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { type Me, meQuery, type MeResult } from "../lib/me";

/**
 * Component đọc `Me | null`, KHÔNG đọc `MeResult`. Mã lỗi chỉ có ích cho guard —
 * bắt mọi màn hình phân nhánh trên nó là bắt chúng nhân bản một luật đã có ở
 * `decideEntry`.
 *
 * Nhận `options` để trang chờ duyệt truyền được `refetchInterval` — nó poll 15s
 * cho ca OWNER bấm duyệt ở máy khác. Hook không nhận option sẽ giết tính năng đó.
 *
 * Loại `queryKey`/`queryFn` khỏi `options`: `meQuery` là "một nguồn duy nhất cho
 * 'tôi là ai'" (xem comment ở `lib/me.ts`) — cho phép caller ghi đè hai khoá này
 * là cho phép họ trỏ hook sang một cache entry khác, lặng lẽ, không compiler nào
 * báo và không lỗi runtime nào bắt được.
 */
export function useMe(options?: Omit<Partial<UseQueryOptions<MeResult>>, "queryKey" | "queryFn">) {
  const query = useQuery({ ...meQuery, ...options });
  const me: Me | null = query.data?.ok ? query.data.me : null;
  return { ...query, me };
}
