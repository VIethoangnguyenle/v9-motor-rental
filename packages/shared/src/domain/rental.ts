import type { Interval } from "./interval";

/**
 * Vòng đời một đơn thuê. Xem §4 của
 * docs/plans/2026-08-15-staff-home-stats-calendar-design.md.
 *
 * File này KHÔNG import gì ngoài `packages/shared/src/domain/` — đó là điều kiện
 * để nó test được không cần DB, và là lý do TDD nghiêm khả thi ở đây.
 *
 * `RENTAL_STATUSES` là TUPLE runtime, không chỉ type — `RentalStatus` DẪN XUẤT
 * từ nó bên dưới. Một union type TypeScript thuần bị xoá lúc biên dịch, không
 * để lại giá trị nào ở runtime; và bốn literal này còn phải khớp CHECK
 * `rentals_status_valid` ở Postgres (`packages/db`, migration `0009`) — thứ
 * KHÔNG có gì ép ở tầng kiểu vì nó nằm ngoài TypeScript hoàn toàn. Mảng này là
 * điều kiện để viết được một test đọc `pg_get_constraintdef(...)` và so trực
 * tiếp với nó lúc chạy — xem hàng rào ở
 * `apps/api/src/services/rentals.test.ts`. Trước đợt này, ba bản sao (DB,
 * domain, TypeBox schema ở `routes/rentals.ts`) chỉ có hai bản sau được ép ở
 * tầng kiểu (`StatusSetsMatch` trong file đó); giờ bản DB được ép ở tầng test.
 */
export const RENTAL_STATUSES = ["BOOKED", "ONGOING", "COMPLETED", "CANCELLED"] as const;

export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export type TransitionResult = { ok: true } | { ok: false; reason: "INVALID_TRANSITION" };

/**
 * Đúng ba đường. Mọi đường khác bị từ chối, kể cả tự chuyển về chính nó.
 *
 * `ONGOING → CANCELLED` bị cấm CÓ CHỦ Ý, và đó không phải khắt khe vô cớ: xe đã
 * ra khỏi cửa hàng thì không có chuyện "chưa từng xảy ra" (khách trả sớm vẫn là
 * COMPLETED). Hệ quả ở tầng dữ liệu là thứ ta thực sự mua: đơn CANCELLED không
 * bao giờ có `handed_over_at`, nên truy vấn doanh thu lọc đúng một điều kiện
 * `handed_over_at IS NOT NULL` mà không thể vô tình đếm hay bỏ sót tiền đã thu.
 */
const ALLOWED: ReadonlyArray<readonly [RentalStatus, RentalStatus]> = [
  ["BOOKED", "ONGOING"],
  ["BOOKED", "CANCELLED"],
  ["ONGOING", "COMPLETED"],
];

/** Trả discriminated union, KHÔNG throw — pattern 3 của repo. Route dịch sang HTTP. */
export function transition(from: RentalStatus, to: RentalStatus): TransitionResult {
  const allowed = ALLOWED.some(([f, t]) => f === from && t === to);
  return allowed ? { ok: true } : { ok: false, reason: "INVALID_TRANSITION" };
}

/**
 * "Quá hạn" KHÔNG phải một trạng thái trong DB — nó suy ra lúc đọc. Nếu là trạng
 * thái thì phải có một job đi đổi nó, và trong khoảng job chưa chạy thì database
 * đang nói dối.
 *
 * `now` là THAM SỐ, không gọi `Date.now()` bên trong: đó là điều kiện để test
 * không phải đóng băng đồng hồ, và để frontend tô màu lịch bằng đúng hàm này.
 */
export function isOverdue(r: { status: RentalStatus; endsAt: Date }, now: Date): boolean {
  return r.status === "ONGOING" && r.endsAt.getTime() < now.getTime();
}

/**
 * Đơn đã QUA giờ hẹn lấy xe mà vẫn còn `BOOKED`. Hàm RIÊNG, cố ý không nới
 * `isOverdue` ra để nhận thêm nhánh này: hai bên trả lời hai câu khác nhau, và
 * `isOverdue` đang là định nghĩa "xe nằm ngoài đường quá hạn" mà lịch dựa vào.
 * Gộp lại thì một đơn chưa giao sẽ đếm vào cùng con số với xe thật sự trễ hẹn
 * trả — xem test "BOOKED quá ngày hẹn KHÔNG phải quá hạn" ở `rental.test.ts`,
 * nó khoá đúng chỗ đó.
 *
 * Vì sao đáng có một vị từ riêng thay vì để `startsAt` là một ngày trung tính:
 * một `BOOKED` đã qua `starts_at` gần như luôn nghĩa là MỘT trong hai chuyện —
 * khách bỏ hẹn mà không ai huỷ đơn, hoặc nhân viên đã giao xe rồi quên bấm "đã
 * giao". Ca thứ hai đắt và im lặng: `revenueAt` đòi `handedOverAt` nên không
 * tính tiền, trong khi ràng buộc `rentals_no_overlap` vẫn khoá xe — shop mất
 * doanh thu ngay trên sổ của mình và không màn hình nào nói ra. Đó cũng là lý
 * do `activeRental` (`apps/api/src/services/customers.ts`) cố ý KHÔNG lọc
 * `BOOKED` theo `now()`: lọc đi là giấu ca này, không phải dọn nó.
 *
 * `now` là THAM SỐ, cùng lý do với `isOverdue` ngay trên: test không phải đóng
 * băng đồng hồ, và frontend tô màu bằng đúng hàm này.
 *
 * Biên: đúng thời điểm `startsAt` thì CHƯA quá hẹn — cùng quy ước `<` với
 * `isOverdue`, để hai hàm không lệch nhau một tick.
 */
export function isPickupOverdue(r: { status: RentalStatus; startsAt: Date }, now: Date): boolean {
  return r.status === "BOOKED" && r.startsAt.getTime() < now.getTime();
}

/** Đưa về `Interval` để dùng lại `overlaps()` — biên [start, end), khớp tstzrange '[)'. */
export function toInterval(r: { startsAt: Date; endsAt: Date }): Interval {
  return { start: r.startsAt, end: r.endsAt };
}

/**
 * Đơn này tính vào doanh thu của thời điểm nào. `null` = chưa tính.
 *
 * ĐỊNH NGHĨA DUY NHẤT — API dùng nó, frontend dùng nó. Hai định nghĩa là hai con
 * số khác nhau cho cùng một tháng, và không ai biết cái nào đúng.
 *
 * Nhánh CANCELLED hôm nay là bất khả thi (`transition` cấm ONGOING → CANCELLED,
 * nên đơn huỷ không thể có `handedOverAt`). Giữ lại vì đây là chỗ DUY NHẤT còn
 * đúng nếu một ngày nào đó luật chuyển trạng thái được nới, hoặc một hàng được
 * sửa tay trong DB.
 */
export function revenueAt(r: { status: RentalStatus; handedOverAt: Date | null }): Date | null {
  if (r.status === "CANCELLED") return null;
  return r.handedOverAt;
}

/**
 * Múi giờ vận hành của shop. "Hôm nay" của một shop ở TP.HCM là ngày theo giờ
 * Việt Nam, không phải UTC — xem §5.5 design doc để biết vì sao nhầm chỗ này làm
 * doanh thu sai mỗi sáng rồi TỰ ĐÚNG LẠI lúc 7h.
 *
 * Export từ đây để SQL của `apps/api` và phần định dạng của frontend không mỗi
 * bên giữ một bản.
 */
export const SHOP_TIMEZONE = "Asia/Ho_Chi_Minh";
