import type { RentalStatus } from "./rental";
import type { PhotoKind } from "./rental-photo";

/**
 * Bằng chứng một đơn còn **nợ trước bước chuyển trạng thái kế tiếp** của nó.
 *
 * `PRODUCT.md` §Operating Context ghi ảnh lúc giao và lúc nhận là bằng chứng khi
 * có tranh chấp xước xát, và nguyên tắc #3 nói rõ nó bảo vệ CẢ HAI phía. Nhưng
 * "đơn này còn thiếu ảnh gì" trước file này chưa từng được viết ra ở đâu — mỗi
 * màn tự nhìn danh sách ảnh rồi tự kết luận, tức là chưa có định nghĩa nào để
 * lệch khỏi.
 *
 * ⚠️ **Đây là HƯỚNG DẪN, không phải hàng rào.** Không chỗ nào trong sản phẩm nói
 * thiếu ảnh thì cấm giao xe, và file này không được phép tự phát minh ra luật
 * đó: `availableTransitions` (`./rental`) vẫn là nơi duy nhất quyết định chuyển
 * trạng thái nào hợp lệ. Tầng trình bày dùng kết quả ở đây để NHẮC, và phải để
 * nút bấm được — nhân viên đứng ngoài đường với cái điện thoại hết pin vẫn cần
 * ghi được là xe đã giao.
 *
 * Ghép theo BƯỚC CHUYỂN chứ không theo "đơn này đáng lẽ có những ảnh nào": xe đã
 * giao rồi mà thiếu ảnh lúc giao là một lỗ hổng có thật, nhưng nó thuộc về quá
 * khứ và không chặn việc nhận lại xe. Trộn hai câu chuyện vào một danh sách là
 * bắt người đứng ở lề đường đi sửa một việc đã trôi qua.
 */
const REQUIRED: Record<RentalStatus, readonly PhotoKind[]> = {
  /** Sắp bấm "Đã giao xe": giấy tờ shop giữ, và tình trạng xe trước khi khách đi. */
  BOOKED: ["DOCUMENT", "HANDOVER"],
  /** Sắp bấm "Đã nhận lại xe": tình trạng lúc nhận, để đối chiếu với ảnh lúc giao. */
  ONGOING: ["RETURN"],
  /** Đơn đã đóng — không còn bước chuyển nào, nên không còn gì để nợ. */
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * `Record` đủ bốn nhánh nên thêm một trạng thái mới mà quên khai bằng chứng của
 * nó là lỗi BIÊN DỊCH, cùng khuôn `STATUS_LABEL` ở `apps/staff/src/lib/rental-status.ts`.
 */
export function requiredEvidenceFor(status: RentalStatus): readonly PhotoKind[] {
  return REQUIRED[status];
}

/**
 * Món nợ còn lại, **giữ nguyên thứ tự của `REQUIRED`** — thứ tự đó là thứ tự
 * nhân viên làm ngoài đường (xem giấy tờ trước, rồi mới đi vòng quanh xe), nên
 * nó là thông tin chứ không phải chi tiết cài đặt.
 *
 * `have` nhận cả danh sách có TRÙNG: một đơn thường có nhiều ảnh cùng loại (bốn
 * góc xe), và câu hỏi ở đây là "loại này đã có tấm nào chưa", không phải "có
 * mấy tấm".
 */
export function missingEvidence(
  status: RentalStatus,
  have: readonly PhotoKind[],
): readonly PhotoKind[] {
  return REQUIRED[status].filter((kind) => !have.includes(kind));
}

/**
 * Đúng MỘT việc để hỏi tiếp, hoặc `null` khi không còn nợ.
 *
 * Màn hiện trường dựng quanh giá trị này: nó là thứ nằm ở ô lớn nhất trên đầu
 * màn hình. Trả `null` nghĩa là không có "bước kế tiếp" nào để vẽ, và ô đó phải
 * đổi sang nói điều khác — không phải vẽ một ô rỗng.
 */
export function nextEvidence(
  status: RentalStatus,
  have: readonly PhotoKind[],
): PhotoKind | null {
  return missingEvidence(status, have)[0] ?? null;
}
