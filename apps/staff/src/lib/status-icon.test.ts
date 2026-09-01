import { describe, expect, it } from "bun:test";
import { RENTAL_STATUSES } from "@v9/shared/domain/rental";
import { STATUS_ICON, statusIconOf } from "./rental-status";

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

/**
 * `statusIconOf` và `rentalChipClass` quyết định HÌNH và MÀU cho cùng một thanh
 * đơn trên lịch. Nếu hai hàm bất đồng về "quá hạn là gì" thì kết quả là một
 * thanh ĐỎ mang hình xanh — tệ hơn không có icon, vì hai kênh lúc đó mâu thuẫn
 * chứ không chỉ thiếu.
 *
 * Đây là lý do `statusIconOf` gọi lại đúng `isOverdue`/`isPickupOverdue` của
 * `@v9/shared/domain/rental` thay vì tự so `endsAt < now`, và là thứ bốn ca
 * dưới đây khoá.
 */
describe("statusIconOf — hình phải khớp CÙNG luật với màu", () => {
  const NOW = new Date("2026-09-10T00:00:00+07:00");
  const at = (d: string) => new Date(`${d}T00:00:00+07:00`);

  it("ONGOING quá hạn trả → OVERDUE, không phải ONGOING", () => {
    const r = { status: "ONGOING" as const, startsAt: at("2026-09-01"), endsAt: at("2026-09-05") };
    expect(statusIconOf(r, NOW)).toBe(STATUS_ICON.OVERDUE);
  });

  it("BOOKED quá giờ lấy → PICKUP_OVERDUE, không phải BOOKED", () => {
    const r = { status: "BOOKED" as const, startsAt: at("2026-09-05"), endsAt: at("2026-09-20") };
    expect(statusIconOf(r, NOW)).toBe(STATUS_ICON.PICKUP_OVERDUE);
  });

  it("ONGOING chưa tới hạn → ONGOING", () => {
    const r = { status: "ONGOING" as const, startsAt: at("2026-09-05"), endsAt: at("2026-09-20") };
    expect(statusIconOf(r, NOW)).toBe(STATUS_ICON.ONGOING);
  });

  it("COMPLETED → COMPLETED, không bị luật quá hạn cướp", () => {
    // Ca dễ sai nhất: `endsAt` nằm trong quá khứ, nên một luật quá hạn viết tay
    // (`endsAt < now`) sẽ gán nó thành OVERDUE. `isOverdue` lọc sẵn theo
    // `status === "ONGOING"` nên nhánh này không tới được — miễn là ta dùng lại
    // nó thay vì viết luật thứ hai.
    const r = {
      status: "COMPLETED" as const,
      startsAt: at("2026-09-01"),
      endsAt: at("2026-09-05"),
    };
    expect(statusIconOf(r, NOW)).toBe(STATUS_ICON.COMPLETED);
  });
});
