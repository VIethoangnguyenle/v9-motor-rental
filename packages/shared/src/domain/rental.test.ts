import { describe, expect, it } from "bun:test";
import { transition, type RentalStatus } from "./rental";

describe("transition", () => {
  it("cho phép BOOKED → ONGOING (giao xe)", () => {
    expect(transition("BOOKED", "ONGOING")).toEqual({ ok: true });
  });

  it("cho phép BOOKED → CANCELLED (huỷ trước khi giao)", () => {
    expect(transition("BOOKED", "CANCELLED")).toEqual({ ok: true });
  });

  it("cho phép ONGOING → COMPLETED (trả xe)", () => {
    expect(transition("ONGOING", "COMPLETED")).toEqual({ ok: true });
  });

  // Đây KHÔNG phải một ca biên ngẫu nhiên. Cấm đường này là thứ bảo đảm đơn
  // CANCELLED không bao giờ có `handed_over_at`, và nhờ đó truy vấn doanh thu
  // chỉ cần lọc `handed_over_at IS NOT NULL` mà không phải kiểm trạng thái.
  it("CẤM ONGOING → CANCELLED — xe đã ra khỏi cửa hàng thì không 'chưa từng xảy ra'", () => {
    expect(transition("ONGOING", "CANCELLED")).toEqual({
      ok: false,
      reason: "INVALID_TRANSITION",
    });
  });

  it("trạng thái kết thúc không đi đâu được nữa", () => {
    const terminal: RentalStatus[] = ["COMPLETED", "CANCELLED"];
    const all: RentalStatus[] = ["BOOKED", "ONGOING", "COMPLETED", "CANCELLED"];
    for (const from of terminal) {
      for (const to of all) {
        expect(transition(from, to)).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
      }
    }
  });

  it("không cho phép tự chuyển về chính nó", () => {
    expect(transition("BOOKED", "BOOKED")).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    expect(transition("ONGOING", "ONGOING")).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
  });
});
