import { lastMomentOf } from "./rental-status";

/**
 * Vai của một đơn thuê trong MỘT ngày cụ thể.
 *
 * - `start` — hôm đó giao xe.
 * - `end` — hôm đó nhận lại xe.
 * - `start-end` — giao rồi nhận lại trong cùng ngày.
 * - `span` — xe đã ra khỏi shop từ trước và chưa tới ngày trả: hôm đó KHÔNG ai
 *   phải làm gì.
 * - `none` — đơn không chạm ngày này.
 */
export type DayRole = "start" | "end" | "start-end" | "span" | "none";

/**
 * Phân loại thuần, dùng chung giữa `calendar-day.tsx` (bảng một ngày) và
 * `calendar-month.tsx` (lịch tháng).
 *
 * Tách ra `lib/` vì hai màn lịch phải ĐỒNG Ý với nhau về "hôm nay đơn này là
 * việc gì". Trước đó phép này nằm trong `calendar-day.tsx` và màn Tháng không
 * có nó — nên màn Tháng vẽ mọi đơn PHỦ ngày thành một chip, tức lặp lại cùng
 * một đơn ở mọi ô nó đi qua. Hai định nghĩa khác nhau cho cùng một câu hỏi là
 * đúng lớp lỗi mà `calendar-layout.ts` đã phải dựng test để chặn.
 *
 * ⚠️ `endsAt` là biên MỞ — hợp đồng của DB (`tstzrange '[)'`), của domain
 * (`interval.ts`) và của form lên đơn. Đơn trả ngày 20/09 lưu
 * `endsAt = 21/09 00:00`. So thẳng `endsAt` với biên ngày là gán việc trả xe
 * sang hôm sau, sai đúng một ngày. `lastMomentOf` lùi một mili-giây — không trừ
 * 24 giờ, vì `endsAt` không phải lúc nào cũng rơi vào nửa đêm.
 *
 * Nhận hình dạng CẤU TRÚC `{ startsAt; endsAt }` chứ không phải `CalendarRental`:
 * cùng lý lẽ `rentalChipClass` — hàm này không cần biết gì thêm về đơn, và một
 * tham số hẹp hơn thì dùng được ở nhiều chỗ hơn mà không kéo theo kiểu của API.
 */
export function dayRole(
  rental: { readonly startsAt: Date; readonly endsAt: Date },
  dayStart: Date,
  dayEnd: Date,
): DayRole {
  const startsAt = rental.startsAt.getTime();
  const lastMoment = lastMomentOf(rental.endsAt).getTime();
  const from = dayStart.getTime();
  const to = dayEnd.getTime();

  const startsToday = startsAt >= from && startsAt < to;
  const endsToday = lastMoment >= from && lastMoment < to;

  if (startsToday && endsToday) return "start-end";
  if (startsToday) return "start";
  if (endsToday) return "end";
  // Phủ trọn ngày: bắt đầu trước và kết thúc sau. Kiểm CẢ HAI phía — chỉ hỏi
  // một phía thì một đơn nằm hoàn toàn ở tháng khác cũng lọt vào đây.
  return startsAt < from && lastMoment >= to ? "span" : "none";
}
