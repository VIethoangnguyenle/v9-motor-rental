/**
 * Yêu cầu thuê xe do khách gửi từ `apps/web`.
 *
 * ⚠️ Đây KHÔNG phải một đơn thuê, và khoảng cách giữa hai thứ là ràng buộc sản
 * phẩm quan trọng nhất của `apps/web` (xem `docs/workspaces/web.md`): web không
 * đọc availability thời gian thực và không được hứa xe còn trống. Một yêu cầu
 * chỉ nói "người này muốn thuê chiếc này, quanh những ngày này". Nhân viên gọi
 * lại, xác nhận, rồi mới tạo `rentals` thật trong `apps/staff` — và chỉ ở bước
 * đó ràng buộc chống đặt trùng mới có tiếng nói.
 *
 * Hệ quả then chốt: bảng yêu cầu **không** đi qua `rentals_no_overlap`. Hai
 * khách hoàn toàn có thể gửi yêu cầu cho cùng một xe cùng một khoảng ngày, và
 * đó là ĐÚNG — chặn ở đây là giả vờ web biết xe còn trống hay không.
 */
export const REQUEST_STATUSES = ["NEW", "CONTACTED", "CLOSED"] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type RequestTransitionResult = { ok: true } | { ok: false; reason: "INVALID_TRANSITION" };

/**
 * Ba đường, tất cả đi một chiều về phía "đã xong".
 *
 * Không có đường lùi, và đó không phải khắt khe vô cớ: một yêu cầu là bản ghi
 * MỘT LẦN về việc khách đã liên hệ. Cho phép `CONTACTED → NEW` là cho phép ghi
 * một câu sai về quá khứ ("chưa ai gọi") đè lên một việc đã xảy ra — cùng lý lẽ
 * khiến `ONGOING → CANCELLED` bị cấm ở `rental.ts`.
 */
const ALLOWED: ReadonlyArray<readonly [RequestStatus, RequestStatus]> = [
  ["NEW", "CONTACTED"],
  ["NEW", "CLOSED"],
  ["CONTACTED", "CLOSED"],
];

/** Trả discriminated union, KHÔNG throw — pattern 3 của repo. Route dịch sang HTTP. */
export function requestTransition(from: RequestStatus, to: RequestStatus): RequestTransitionResult {
  const allowed = ALLOWED.some(([f, t]) => f === from && t === to);
  return allowed ? { ok: true } : { ok: false, reason: "INVALID_TRANSITION" };
}

/**
 * "Từ trạng thái này đi được những đâu" — UI dựng nút bằng hàm này, không chép
 * tay một mảng thứ hai. Cùng khuôn `availableTransitions` ở `rental.ts`; đọc lý
 * do đầy đủ ở đó.
 */
export function availableRequestTransitions(from: RequestStatus): RequestStatus[] {
  return REQUEST_STATUSES.filter((to) => requestTransition(from, to).ok);
}

/**
 * Trần số ngày một yêu cầu được phép xin.
 *
 * Bằng `MAX_RANGE_DAYS` của `GET /rentals` (`apps/api/src/services/rentals.ts`)
 * CÓ CHỦ Ý: nhân viên chốt đơn bằng cách nhìn lịch, và cửa sổ lịch tối đa họ
 * kéo được trong một lần truy vấn là 92 ngày. Một yêu cầu dài hơn thế là một
 * yêu cầu không kiểm chồng lịch bằng mắt được trước khi chốt.
 */
export const MAX_REQUEST_DAYS = 92;

/**
 * Số ngày thuê có dùng được không. Đơn vị thuê cơ bản là NGÀY (PRODUCT.md), nên
 * số lẻ bị từ chối chứ không làm tròn.
 *
 * `Number.isInteger` làm cả ba việc trong một bước: loại `NaN`, loại `Infinity`,
 * loại số lẻ. Viết `days <= MAX && days >= 1` không thôi thì `NaN` trả `false`
 * đúng may mắn, còn `Infinity` thì KHÔNG — nó lọt qua `>= 1` và chỉ bị chặn nhờ
 * `<= MAX`. Dựa vào thứ tự so sánh để bắt giá trị bẩn là dựa vào may mắn.
 */
export function isRequestDaysValid(days: number): boolean {
  return Number.isInteger(days) && days >= 1 && days <= MAX_REQUEST_DAYS;
}
