import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import type { CustomerListRow } from "./customers";
import { lastMomentOf } from "./rental-status";

/**
 * Kiểu SUY RA từ chính dòng dữ liệu, không gõ lại: `activeRental` là hợp đồng
 * của `GET /customers/list`, và một bản sao thứ hai sẽ biên dịch được cho tới
 * ngày route đổi một field.
 */
export type ActiveRental = NonNullable<CustomerListRow["activeRental"]>;

/**
 * Hai trạng thái ở đây hỏi HAI câu khác nhau, nên đọc hai cột mốc khác nhau:
 * `ONGOING` hỏi "bao giờ phải trả xe", `BOOKED` hỏi "bao giờ tới lấy".
 *
 * `Record` đủ hai nhánh: thêm một trạng thái vào `activeRental` phía API mà quên
 * nhãn ở đây là LỖI BIÊN DỊCH, không phải một ô trống lặng lẽ.
 *
 * Ba hằng trong file này sinh ra ở `components/customers/customer-table.tsx` và
 * ở đó tới khi màn hẹp cần hình dạng THẺ cho cùng dữ liệu. Chuyển ra `lib/` thay
 * vì chép: hai hình dạng của một màn phải gọi cùng một mốc bằng cùng một nhãn,
 * nếu không chúng lệch nhau đúng ở chỗ không ai kiểm — cùng lý lẽ `STATUS_LABEL`
 * (`lib/rental-status.ts`) và `KIND_LABEL` (`lib/photo-labels.ts`).
 */
export const WHEN_LABEL: Record<ActiveRental["status"], string> = {
  ONGOING: "Trả",
  BOOKED: "Lấy",
};

/**
 * `ONGOING` đi qua `lastMomentOf`: `endsAt` là biên MỞ, nên đơn phải trả ngày
 * 28/08 lưu `endsAt = 29/08 00:00`, và in trần ra là sai đúng một ngày.
 *
 * `BOOKED` KHÔNG lùi: `startsAt` là biên đóng, tức đúng mốc hẹn lấy xe.
 */
export function whenOf(rental: ActiveRental): Date {
  return rental.status === "ONGOING" ? lastMomentOf(rental.endsAt) : rental.startsAt;
}

/**
 * Có GIỜ, không chỉ ngày: `endsAt` không phải lúc nào cũng nửa đêm, nên
 * "Trả 23:59 28-08" và "Trả 01:59 29-08" là hai đơn khác nhau, không phải cùng
 * một đơn hiển thị hai kiểu. `dd-MM` khớp khuôn tiêu đề cột của
 * `calendar-timeline.tsx`. Đừng "sửa" thành `15/08` bằng cách tự ghép chuỗi —
 * làm vậy là bỏ luôn `SHOP_TIMEZONE`.
 */
export const WHEN_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});
