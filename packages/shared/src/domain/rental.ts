/**
 * Vòng đời một đơn thuê. Xem §4 của
 * docs/plans/2026-08-15-staff-home-stats-calendar-design.md.
 *
 * File này KHÔNG import gì ngoài `packages/shared/src/domain/` — đó là điều kiện
 * để nó test được không cần DB, và là lý do TDD nghiêm khả thi ở đây.
 */
export type RentalStatus = "BOOKED" | "ONGOING" | "COMPLETED" | "CANCELLED";

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
