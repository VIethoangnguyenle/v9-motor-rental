import { REQUEST_STATUSES, type RequestStatus } from "@v9/shared/domain/rental-request";

/**
 * `validateSearch` cho `/requests`, tách khỏi page cùng lý do ba validator kia
 * (`rentals-search.ts`, `customers-search.ts`, `field-search.ts`): `router.tsx`
 * import file này, page cũng import nó, để hàm trong page thì thành chu trình
 * module.
 */

/**
 * "Xem tất cả trạng thái" là một LỰA CHỌN, nên nó phải có tên trong URL.
 *
 * ⚠️ Đừng biểu diễn nó bằng `null` hay bằng việc THIẾU `?status=`. Bản đầu của
 * đợt này làm vậy và nó hỏng ngay: `validateSearch` của TanStack Router luôn
 * chạy và luôn trả về đủ khoá, nên page không cách nào phân biệt "URL chưa nói
 * gì" với "người dùng chọn Tất cả" — mặc định lặng lẽ tụt từ "Chưa xử lý" xuống
 * "Tất cả", tức đúng màn hình sinh ra để yêu cầu mới không trôi lại mở ra kèm cả
 * yêu cầu đã đóng. Đo bằng ảnh chụp 390px, không phải suy.
 */
export const ALL_REQUESTS = "ALL";

export type RequestsFilter = RequestStatus | typeof ALL_REQUESTS;

export interface RequestsSearch {
  /**
   * Trạng thái đang lọc, hoặc `"ALL"`.
   *
   * Ở URL chứ không ở `useState` như bản trước: đó là đúng lỗi mà critique màn
   * Khách hàng chấm 1/4 ở heuristic "User Control and Freedom" — F5 mất bộ lọc,
   * Back không quay về bộ lọc vừa xem, và không gửi được link "xem giúp mấy yêu
   * cầu chưa xử lý" cho đồng nghiệp. Ba màn danh sách kia đã ở URL; đây là màn
   * cuối còn sót.
   */
  readonly status: RequestsFilter;
}

/**
 * Giá trị lạ rơi về `"NEW"`, không throw và cũng không rơi về `"ALL"`.
 *
 * `"NEW"` là mặc định vì màn này tồn tại để yêu cầu MỚI không trôi (xem JSDoc
 * của `RequestsPage`); rơi về "tất cả" là trộn việc chưa làm lẫn với việc đã
 * đóng, đúng thứ màn hình này sinh ra để tách.
 *
 * So với `REQUEST_STATUSES` (tuple runtime của domain) chứ không liệt kê tay ba
 * chuỗi: thêm một trạng thái ở domain thì validator nhận nó ngay.
 */
export function validateRequestsSearch(search: Record<string, unknown>): RequestsSearch {
  const raw = search["status"];
  if (raw === ALL_REQUESTS) return { status: ALL_REQUESTS };
  return { status: REQUEST_STATUSES.find((s) => s === raw) ?? "NEW" };
}
