import { describe, expect, it } from "bun:test";
import { RENTAL_STATUSES } from "@v9/shared/domain/rental";
import { ICONS } from "../components/ui/icon";
import { STATUS_ICON, rentalChipClass, statusIconOf } from "./rental-status";

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

  // ⚠️ Bốn ca dưới so với LITERAL, không với `STATUS_ICON.X`. Bản đầu viết
  // `toBe(STATUS_ICON.OVERDUE)` và như vậy là lấy kỳ vọng từ chính bảng đang
  // được kiểm: hoán vị hai giá trị trong bảng
  //
  //     OVERDUE: "clock",  PICKUP_OVERDUE: "alert-triangle",
  //
  // vẫn xanh cả bộ, vì mỗi assert chỉ còn khoá NHÁNH nào được chọn chứ không
  // khoá bảng trả ra hình gì. Test tính duy nhất bên trên cũng không bắt —
  // hoán vị giữ nguyên tính duy nhất. Hậu quả thật thì đảo ngược đúng thứ tự
  // khẩn: thanh đỏ ĐẶC (xe đang ngoài đường, quá hạn trả) mang đồng hồ, còn
  // thanh đỏ NHẠT (chưa ai lấy xe) mang tam giác cảnh báo.

  it("ONGOING quá hạn trả → OVERDUE, không phải ONGOING", () => {
    const r = { status: "ONGOING" as const, startsAt: at("2026-09-01"), endsAt: at("2026-09-05") };
    expect(statusIconOf(r, NOW)).toBe("alert-triangle");
  });

  it("BOOKED quá giờ lấy → PICKUP_OVERDUE, không phải BOOKED", () => {
    const r = { status: "BOOKED" as const, startsAt: at("2026-09-05"), endsAt: at("2026-09-20") };
    expect(statusIconOf(r, NOW)).toBe("clock");
  });

  it("ONGOING chưa tới hạn → ONGOING", () => {
    const r = { status: "ONGOING" as const, startsAt: at("2026-09-05"), endsAt: at("2026-09-20") };
    expect(statusIconOf(r, NOW)).toBe("nav-handover");
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
    expect(statusIconOf(r, NOW)).toBe("check");
  });
});

/**
 * Hai hàm quyết định MÀU và HÌNH cho cùng một thanh đơn. `rental-status.ts` gọi
 * quan hệ đó là "ràng buộc", nhưng cho tới file này nó mới chỉ là văn xuôi:
 * thêm một nhánh màu phái sinh THỨ BA vào `rentalChipClass` mà quên nhánh hình
 * tương ứng thì bộ test hình vẫn xanh. Thứ đỏ lên khi đó là `rental-status.test.ts`
 * — nhưng file đó là bản chụp của chính bảng màu, thứ người thêm nhánh sẽ cập
 * nhật ngay trong cùng lần sửa, và sau đó không còn gì giữ kênh hình khỏi tụt lại.
 *
 * Song ánh là phát biểu đúng của ràng buộc đó, và nó bắt được cả HAI chiều tụt:
 * thêm màu quên hình → hai màu chung một hình; thêm hình quên màu → hai hình
 * chung một màu.
 *
 * Phạm vi có thật: ma trận 4 status × 4 quan hệ thời gian dưới đây, cùng ma trận
 * mà `rental-status.test.ts` dùng làm đặc tả cho hàm màu. Một nhánh phái sinh
 * khoá trên thứ ma trận này không chạm tới (ví dụ `handedOverAt`) thì nằm ngoài
 * tầm của cả hai file — đây là hàng rào cho cùng một đặc tả, không phải cho mọi
 * nhánh tưởng tượng được.
 */
describe("màu và hình phải là song ánh", () => {
  const NOW = new Date("2026-09-01T12:00:00Z");
  const PAST = new Date("2026-08-01T00:00:00Z");
  const FUTURE = new Date("2026-10-01T00:00:00Z");

  /** Bốn quan hệ thời gian, gồm cả biên `startsAt` ĐÚNG bằng `now`. */
  const RELATIONS = [
    { startsAt: PAST, endsAt: PAST },
    { startsAt: PAST, endsAt: FUTURE },
    { startsAt: FUTURE, endsAt: FUTURE },
    { startsAt: NOW, endsAt: FUTURE },
  ] as const;

  const cells = RENTAL_STATUSES.flatMap((status) =>
    RELATIONS.map((rel) => ({ status, startsAt: rel.startsAt, endsAt: rel.endsAt })),
  );

  it("mỗi màu ứng đúng một hình, và mỗi hình ứng đúng một màu", () => {
    const iconOfColor = new Map<string, string>();
    const colorOfIcon = new Map<string, string>();

    for (const cell of cells) {
      const color = rentalChipClass(cell, NOW);
      const icon: string = statusIconOf(cell, NOW);
      const seenIcon = iconOfColor.get(color);
      const seenColor = colorOfIcon.get(icon);

      // So bằng CHUỖI GHÉP chứ không `toBe(seenIcon)` trần: khi đỏ, thông điệp
      // phải nói ra màu nào đang mang hai hình, nếu không người đọc chỉ thấy
      // hai tên icon và phải tự đi tìm nhánh nào sinh ra chúng.
      if (seenIcon === undefined) iconOfColor.set(color, icon);
      else expect(`${color} → ${seenIcon}`).toBe(`${color} → ${icon}`);

      if (seenColor === undefined) colorOfIcon.set(icon, color);
      else expect(`${icon} ← ${seenColor}`).toBe(`${icon} ← ${color}`);
    }

    // Ghim SỐ NHÁNH bằng literal, không bằng `iconOfColor.size`: sáu nhánh
    // ma trận này với tới là bốn `RentalStatus` cộng hai trạng thái phái sinh.
    // Không có dòng này thì một nhánh thứ bảy được thêm ĐỦ ĐÔI (cả màu lẫn
    // hình) vẫn lọt, mà nó cần một quyết định thiết kế chứ không phải một lần
    // sửa lặng lẽ.
    expect(iconOfColor.size).toBe(6);
    expect(colorOfIcon.size).toBe(6);
  });
});

/**
 * Hàng rào tính duy nhất ở đầu file so TÊN icon, và tên là thứ sai được mà vẫn
 * xanh: hai khoá khác nhau trong `ICONS` trỏ chung một component lucide thì
 * `STATUS_ICON` vẫn có sáu giá trị khác nhau, còn màn hình vẽ ra hai trạng thái
 * y hệt một hình. Phân giải tên → component là câu hỏi đúng.
 *
 * File này là `lib/` nhưng import `components/ui/` — hợp lệ, `eslint.config.js`
 * mở sẵn `frontend → frontend-ui`. Chiều ngược lại mới bị cấm.
 */
describe("sáu trạng thái vẽ ra sáu HÌNH, không chỉ sáu TÊN", () => {
  it("không hai trạng thái nào dùng chung một component icon", () => {
    const glyphs = Object.values(STATUS_ICON).map((name) => ICONS[name]);
    expect(new Set(glyphs).size).toBe(6);
  });
});
