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

/**
 * Quyết định "`searchText` trong `customers-list-page.tsx` có cần đồng bộ lại
 * theo `q` mới từ URL không" — hàm THUẦN, tách ra để test được không cần dựng
 * component: `apps/staff` không có React Testing Library/jsdom, cùng lý do
 * `decideEntry` ở `guard-decision.ts` được rút khỏi router.
 *
 * `q` đổi TỪ BÊN NGOÀI (Back/Forward của trình duyệt, hay nút "← Khách hàng"
 * của trang chi tiết) trong khi `CustomersListPage` KHÔNG unmount — `useState(q)`
 * chỉ chạy lúc mount nên `searchText` sẽ cũ nếu không đồng bộ lại, và effect
 * debounce sẽ thấy `searchText` cũ khác `q` mới rồi ghi giá trị CŨ ngược lại
 * URL, đá hỏng chính nút Back mà việc thêm `q`/`page` vào URL sinh ra để sửa.
 */
export function shouldResyncSearchText(q: string, lastQ: string): boolean {
  return q !== lastQ;
}
