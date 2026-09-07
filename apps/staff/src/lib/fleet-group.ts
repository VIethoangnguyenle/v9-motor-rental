/**
 * Chia đội xe thành nhóm cho màn hẹp.
 *
 * Hàm THUẦN, tách khỏi component có chủ ý: `apps/staff` test được hàm thuần mà
 * không cần dựng React, cùng lý lẽ `decideEntry` ở `guard-decision.ts` và
 * `shouldResyncSearchText` ở `customers-search.ts`.
 *
 * ⚠️ Đây là cách TRÌNH BÀY, không phải một cột trong database. `vehicles.status`
 * chỉ có `draft`/`published`/`archived`, và `CHECK vehicles_status_valid` chặn ai
 * đó thêm `'available'` — rảnh/bận là thứ SUY RA từ `rentals`, đi vào đây qua
 * `onRentUntil` (xem `apps/api/src/services/fleet.ts`).
 */

export const FLEET_GROUPS = ["ON_RENT", "FREE", "DRAFT", "ARCHIVED"] as const;

export type FleetGroup = (typeof FLEET_GROUPS)[number];

export const GROUP_LABEL: Record<FleetGroup, string> = {
  ON_RENT: "Đang ở ngoài",
  FREE: "Trống",
  DRAFT: "Chưa lên web",
  ARCHIVED: "Lưu kho",
};

/** Câu phụ dưới tiêu đề nhóm — nói NGHĨA, không lặp lại nhãn. */
export const GROUP_HINT: Record<FleetGroup, string> = {
  ON_RENT: "khách đang giữ xe",
  FREE: "nhận đơn được ngay",
  DRAFT: "chưa hiện trên trang khách, vẫn cho thuê được",
  ARCHIVED: "đã cất khỏi vận hành",
};

/** Chỉ cần đúng ba trường này — nhận hình dạng rộng để test không phải dựng cả xe. */
interface Groupable {
  readonly status: string;
  readonly onRentUntil: Date | null;
  readonly nextFrom: Date | null;
}

/**
 * Thứ tự nhánh LÀ luật ưu tiên, không phải chuyện tuỳ ý.
 *
 * `archived` thắng tất cả: xe đã cất khỏi vận hành thì không còn là việc hằng
 * ngày. Sau đó tình trạng VẬN HÀNH thắng trạng thái DANH MỤC — một chiếc `draft`
 * đang nằm ngoài đường thuộc nhóm "Đang ở ngoài", vì màn hẹp hỏi "xe nào đang ở
 * đâu" và nhân viên cần đi nhận nó về.
 */
export function fleetGroupOf(vehicle: Groupable): FleetGroup {
  if (vehicle.status === "archived") return "ARCHIVED";
  if (vehicle.onRentUntil !== null) return "ON_RENT";
  if (vehicle.status === "draft") return "DRAFT";
  return "FREE";
}

const DAY_FMT = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });

/**
 * Câu một dòng cho mốc "xe về lúc nào".
 *
 * Hai ca, không một: một đơn `ONGOING` đã qua `ends_at` nghĩa là khách đang giữ
 * xe QUÁ HẠN — in "về ngày 03/09" ở đó là nói về quá khứ, và người đọc phải tự
 * so với hôm nay mới hiểu. Ca này cần ai đó đi đòi xe, nên nó phải tự gọi tên.
 *
 * Đúng mốc hiện tại KHÔNG tính là quá hạn: `ends_at` là biên nửa mở, cùng quy
 * ước với `tstzrange` của ràng buộc chống đặt trùng.
 */
export function onRentLabel(until: Date, now: Date): string {
  const day = DAY_FMT.format(until);
  return until.getTime() < now.getTime() ? `quá hạn từ ${day}` : `về ngày ${day}`;
}
