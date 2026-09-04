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
 * `transition` đọc theo chiều ngược lại: "từ trạng thái này đi được những đâu".
 *
 * UI dựng nút bằng hàm này thay vì một mảng chép tay, và đó là toàn bộ lý do nó
 * tồn tại: `ALLOWED` ở trên là nguồn sự thật DUY NHẤT về luật chuyển trạng thái,
 * nên một danh sách nút chép tay ở frontend là bản sao thứ hai — nó biên dịch
 * được cho tới ngày luật đổi ở đây, và ngày đó nút bấm vẫn mời người dùng đi một
 * đường server đã cấm, hỏng bằng 409 chứ không bằng một nút mờ đi.
 *
 * Lọc theo `RENTAL_STATUSES` (không đọc `ALLOWED` trực tiếp) để thứ tự trả ra
 * ổn định và không phụ thuộc thứ tự khai của bảng.
 */
export function availableTransitions(from: RentalStatus): RentalStatus[] {
  return RENTAL_STATUSES.filter((to) => transition(from, to).ok);
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

/**
 * Số ngày mà nhóm "sắp tới" nhìn về phía trước, tính từ hết ngày hôm nay.
 *
 * Khai một chỗ vì nó là **giả định về quy mô shop**, không phải hằng số kỹ
 * thuật: với đội xe rất nhỏ (dưới 10 chiếc) thì 7 ngày cho ra một nhóm gần như
 * luôn rỗng và con số đúng là 30. Đổi ở đây là đổi cả SQL lẫn bản TS cùng lúc.
 */
export const QUEUE_HORIZON_DAYS = 7;

/**
 * Năm nhóm của màn Đơn thuê, **theo đúng thứ tự độ gấp** — thứ tự của tuple này
 * LÀ thứ tự hiển thị, không phải một chi tiết trình bày ở tầng trên.
 *
 * Cùng khuôn `RENTAL_STATUSES`: tuple RUNTIME, `QueueGroup` dẫn xuất từ nó. Một
 * union type thuần bị xoá lúc biên dịch, không để lại giá trị nào để TypeBox
 * dựng validator hay để test lặp qua.
 *
 * Thứ tự khớp `attention-list.tsx` (xe ngoài đường quá hạn → xe bị giữ chỗ vô
 * ích → việc trong ngày), nên không có định nghĩa "gấp" thứ hai trong app.
 */
export const QUEUE_GROUPS = [
  "OVERDUE",
  "PICKUP_OVERDUE",
  "DUE_TODAY",
  "PICKUP_TODAY",
  "UPCOMING",
] as const;

export type QueueGroup = (typeof QUEUE_GROUPS)[number];

/**
 * Ba mốc cắt kỳ, **tính sẵn ở nơi biết múi giờ** rồi truyền vào — không tự suy
 * trong hàm này.
 *
 * `dayEnd` là 00:00 của NGÀY MAI theo giờ shop, `horizon` là `dayEnd` cộng
 * `QUEUE_HORIZON_DAYS`. Cả hai do Postgres tính (`queueBoundaries` ở
 * `apps/api`), cùng lý lẽ `getStatsSummary` đã ghi: đó là chỗ duy nhất trong
 * stack biết chắc múi giờ. File này cố ý không import gì ngoài `domain/`, nên
 * nó KHÔNG được phép biết `SHOP_TIMEZONE` nghĩa là gì về mặt lịch.
 */
export interface QueueBoundaries {
  readonly now: Date;
  readonly dayEnd: Date;
  readonly horizon: Date;
}

/**
 * Đơn này thuộc nhóm nào của hàng đợi — `null` nghĩa là **không phải việc**.
 *
 * Đây là bản TS của `CASE` trong `listRentalsQueue` (`apps/api/src/services/
 * rentals-list.ts`). Hai bản tồn tại có chủ ý: SQL là thứ chạy thật và phải
 * lọc/sắp ở server, còn bản này test được không cần database và là thứ hàng rào
 * so sánh từng dòng để bắt lúc hai bên trôi khỏi nhau. Cùng cơ chế đã dùng cho
 * `isOverdue`/`isPickupOverdue`.
 *
 * Thứ tự năm nhánh **là** thứ ép năm nhóm loại trừ nhau, và nó có nghĩa: một đơn
 * đáo hạn 09:00 sáng nay, xem lúc 15:00, vừa "tới hạn hôm nay" vừa "đã quá hạn"
 * — ở màn Thống kê hai con số đó chồng nhau vô hại, còn ở một DANH SÁCH thì một
 * đơn chỉ được đứng đúng một chỗ. `OVERDUE` thắng, vì đó là câu trả lời gấp hơn.
 *
 * Gọi lại `isOverdue`/`isPickupOverdue` thay vì tự so mốc: chúng đã lọc theo
 * `status`, nên nhánh "đơn COMPLETED có endsAt trong quá khứ" không tới được.
 */
export function queueGroupOf(
  r: { status: RentalStatus; startsAt: Date; endsAt: Date },
  b: QueueBoundaries,
): QueueGroup | null {
  if (isOverdue(r, b.now)) return "OVERDUE";
  if (isPickupOverdue(r, b.now)) return "PICKUP_OVERDUE";
  if (r.status === "ONGOING") {
    return r.endsAt.getTime() < b.dayEnd.getTime() ? "DUE_TODAY" : null;
  }
  if (r.status !== "BOOKED") return null;
  const startsAt = r.startsAt.getTime();
  if (startsAt < b.dayEnd.getTime()) return "PICKUP_TODAY";
  return startsAt < b.horizon.getTime() ? "UPCOMING" : null;
}
