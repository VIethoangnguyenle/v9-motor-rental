import { describe, expect, it } from "bun:test";
import { dayRole } from "./rental-day";

/** 00:00 và 24:00 giờ VN của 20/09/2026. */
const DAY = new Date("2026-09-20T00:00:00+07:00");
const NEXT = new Date("2026-09-21T00:00:00+07:00");

const r = (startsAt: string, endsAt: string) => ({
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
});

describe("dayRole", () => {
  it("bắt đầu trong ngày → 'start'", () => {
    expect(dayRole(r("2026-09-20T09:00:00+07:00", "2026-09-25T00:00:00+07:00"), DAY, NEXT)).toBe(
      "start",
    );
  });

  /**
   * `endsAt` là biên MỞ: đơn trả ngày 20/09 lưu `endsAt = 21/09 00:00`. So thẳng
   * `endsAt` với biên ngày sẽ gán việc trả xe sang ngày HÔM SAU — sai đúng một
   * ngày, ở đúng chỗ mà cả hai màn lịch tồn tại để trả lời.
   */
  it("kết thúc trong ngày → 'end', và biên MỞ không đẩy sang hôm sau", () => {
    expect(dayRole(r("2026-09-15T09:00:00+07:00", "2026-09-21T00:00:00+07:00"), DAY, NEXT)).toBe(
      "end",
    );
  });

  it("đơn trong ngày, giao rồi nhận lại → 'start-end'", () => {
    expect(dayRole(r("2026-09-20T08:00:00+07:00", "2026-09-21T00:00:00+07:00"), DAY, NEXT)).toBe(
      "start-end",
    );
  });

  it("phủ trọn ngày mà không có mốc nào rơi vào → 'span'", () => {
    expect(dayRole(r("2026-09-18T09:00:00+07:00", "2026-09-25T00:00:00+07:00"), DAY, NEXT)).toBe(
      "span",
    );
  });

  it("không chạm ngày → 'none', cả hai phía", () => {
    expect(dayRole(r("2026-09-01T09:00:00+07:00", "2026-09-20T00:00:00+07:00"), DAY, NEXT)).toBe(
      "none",
    );
    expect(dayRole(r("2026-09-21T09:00:00+07:00", "2026-09-25T00:00:00+07:00"), DAY, NEXT)).toBe(
      "none",
    );
  });

  /**
   * Ca biên đắt nhất: đơn kết thúc ĐÚNG 00:00 của ngày đang xem. Biên mở nghĩa
   * là nó thuộc về ngày HÔM TRƯỚC, không phải ngày này — đọc sai chỗ này là một
   * việc trả xe hiện ra ở sai ô lịch.
   */
  it("đơn kết thúc đúng 00:00 của ngày này thuộc về hôm trước", () => {
    expect(dayRole(r("2026-09-15T09:00:00+07:00", "2026-09-20T00:00:00+07:00"), DAY, NEXT)).toBe(
      "none",
    );
  });
});
