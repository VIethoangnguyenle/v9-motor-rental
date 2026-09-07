import { FLEET_GROUPS, type FleetGroup } from "./fleet-group";

/**
 * `validateSearch` cho `/fleet`, tách khỏi `fleet-page.tsx` có chủ ý: `router.tsx`
 * import file này, mà page cũng import nó — để hàm trong page thì
 * `router.tsx` → page → router.tsx thành chu trình module. Cùng lý do
 * `validateCustomersSearch` nằm riêng.
 *
 * Giá trị lạ bị LỌC, không throw: `?group=xyz` cho ra "tất cả", không cho ra màn
 * lỗi. Cùng khuôn ba validator kia.
 */
export interface FleetSearch {
  readonly q: string;
  /** `null` = xem tất cả (trừ xe lưu kho, do server đã lọc ở `GET /fleet`). */
  readonly group: FleetGroup | null;
  /** Xe đang mở chi tiết. Ở URL để F5 và gửi link giữ đúng chỗ đang xem. */
  readonly id: string | null;
}

export function validateFleetSearch(search: Record<string, unknown>): FleetSearch {
  const rawQ = search["q"];
  const rawGroup = search["group"];
  const rawId = search["id"];

  // Lấy từ `FLEET_GROUPS`, KHÔNG chép tay từng chuỗi: thêm một nhóm mới mà quên
  // sửa chỗ này (rất dễ quên — `tsc` không báo gì) sẽ lặng lẽ lọc mất nhóm đó và
  // người dùng thấy bộ lọc không có tác dụng. Cùng cái bẫy `LOGIN_REASONS` ở
  // `router.tsx` đã ghi.
  const group = FLEET_GROUPS.find((g) => g === rawGroup) ?? null;

  return {
    q: typeof rawQ === "string" ? rawQ : "",
    group,
    id: typeof rawId === "string" && rawId !== "" ? rawId : null,
  };
}
