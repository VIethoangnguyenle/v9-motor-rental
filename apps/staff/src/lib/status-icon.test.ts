import { describe, expect, it } from "bun:test";
import { RENTAL_STATUSES } from "@v9/shared/domain/rental";
import { STATUS_ICON } from "./rental-status";

/**
 * Hàng rào cho phần GIẢM THIỂU của design doc §2.5.
 *
 * `theme-tokens.test.ts` ghi nhận một ngoại lệ mù màu đã biết (`quá hạn` ↔
 * `cảnh báo`, không sửa được bằng màu). Ngoại lệ đó chỉ chấp nhận được CHỪNG NÀO
 * kênh hình dạng còn nguyên. Test này canh đúng điều kiện đó — bỏ nó đi thì
 * ngoại lệ kia thành một lỗ tiếp cận không ai canh.
 */
describe("kênh hình dạng của trạng thái", () => {
  it("mọi trạng thái đơn thuê đều có icon", () => {
    const missing = RENTAL_STATUSES.filter((s) => !(s in STATUS_ICON));
    expect(missing).toEqual([]);
  });

  it("không hai trạng thái nào dùng chung một icon", () => {
    const names = Object.values(STATUS_ICON);
    expect(new Set(names).size).toBe(names.length);
  });

  it("hai trạng thái phái sinh cũng có icon riêng", () => {
    // `isOverdue` và `isPickupOverdue` là hai TÌNH HUỐNG khác nhau (xe đang
    // ngoài đường quá hạn vs chưa ai lấy xe) đòi hai phản ứng ngược nhau. Chúng
    // không nằm trong `RENTAL_STATUSES` nhưng vẫn phải phân biệt được bằng hình.
    expect(STATUS_ICON.OVERDUE).toBeDefined();
    expect(STATUS_ICON.PICKUP_OVERDUE).toBeDefined();
    expect(STATUS_ICON.OVERDUE).not.toBe(STATUS_ICON.PICKUP_OVERDUE);
  });
});
