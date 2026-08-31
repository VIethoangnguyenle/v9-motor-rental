/**
 * `validateSearch` cho `/customers`, tách khỏi `customers-list-page.tsx` có chủ
 * ý: `router.tsx` import file này, mà page cũng import nó — để hàm trong page
 * thì `router.tsx` → page → router.tsx thành chu trình module. Cùng lý do
 * `validateCalendarSearch` nằm ở `rental-calendar.tsx` chứ không ở `router.tsx`.
 *
 * Giá trị lạ bị LỌC, không throw: `?page=abc` cho trang 1, không cho màn lỗi.
 */
export interface CustomersSearch {
  readonly q: string;
  readonly page: number;
}

export function validateCustomersSearch(search: Record<string, unknown>): CustomersSearch {
  const rawQ = search["q"];
  const rawPage = search["page"];
  const page =
    typeof rawPage === "number" && Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  return { q: typeof rawQ === "string" ? rawQ : "", page };
}
