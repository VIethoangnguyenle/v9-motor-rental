/**
 * `validateSearch` cho `/field`, tách khỏi page cùng lý do `rentals-search.ts` và
 * `customers-search.ts`: `router.tsx` import file này, page cũng import nó, để
 * hàm trong page thì thành chu trình module.
 */
export interface FieldSearch {
  /**
   * Đơn đang mở trên trục. Chuỗi rỗng = chưa chọn, và màn hình tự mở việc gấp
   * nhất — trừ ngay sau khi vừa ghi nhận xong một việc, lúc đó nó cố ý không mở
   * gì cả. Logic ở biến `open` trong `pages/field-page.tsx`.
   *
   * Ở URL chứ không ở `useState` vì đây là **chỗ đứng** của người dùng, không
   * phải trạng thái tạm: nhân viên đang chụp dở ảnh lúc giao, mạng 4G rớt, họ
   * tải lại trang — mất chỗ nghĩa là phải dò lại trong danh sách để tìm đúng
   * đơn đang làm, giữa lúc khách đứng chờ. Critique màn Khách hàng
   * (`.impeccable/critique/`, heuristic #3) chấm 1/4 đúng vì thiếu điều này.
   */
  readonly rental: string;
}

/**
 * Giá trị lạ bị LỌC chứ không throw, cùng khuôn hai validator kia: `?rental=xyz`
 * cho ra màn hình bình thường mở việc gấp nhất, không cho ra màn lỗi.
 *
 * KHÔNG kiểm dạng UUID ở đây. Trông thì chặt hơn, nhưng chỗ duy nhất biết id có
 * thật hay không là danh sách hàng đợi vừa tải về — một chuỗi đúng dạng UUID mà
 * không có trong hàng đợi vẫn phải rơi về cùng một nhánh với chuỗi rác. Kiểm
 * dạng ở đây chỉ sinh ra nhánh thứ hai làm cùng một việc.
 */
export function validateFieldSearch(search: Record<string, unknown>): FieldSearch {
  const raw = search["rental"];
  return { rental: typeof raw === "string" ? raw : "" };
}
