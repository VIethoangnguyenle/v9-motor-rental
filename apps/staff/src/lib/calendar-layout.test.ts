import { describe, expect, it } from "bun:test";
import { dayColumns, gridEdgeClip, placeBar, type GridWindow } from "./calendar-layout";

const D = (iso: string) => new Date(`${iso}T00:00:00+07:00`);
/** Cửa sổ 14 ngày: 15/08 → 29/08, nửa mở [from, to). */
const W: GridWindow = { from: D("2026-08-15"), to: D("2026-08-29") };

describe("dayColumns", () => {
  it("sinh đúng một cột cho mỗi ngày của cửa sổ", () => {
    const cols = dayColumns(W);
    expect(cols).toHaveLength(14);
    expect(cols[0]?.date.getTime()).toBe(D("2026-08-15").getTime());
    expect(cols[13]?.date.getTime()).toBe(D("2026-08-28").getTime());
  });

  it("đánh dấu cuối tuần", () => {
    const cols = dayColumns(W);
    // 15/08/2026 là Thứ Bảy, 16/08 Chủ Nhật, 17/08 Thứ Hai.
    expect(cols[0]?.isWeekend).toBe(true);
    expect(cols[1]?.isWeekend).toBe(true);
    expect(cols[2]?.isWeekend).toBe(false);
  });
});

describe("placeBar", () => {
  it("đơn nằm trọn trong cửa sổ", () => {
    expect(placeBar({ startsAt: D("2026-08-17"), endsAt: D("2026-08-20") }, W)).toEqual({
      startCol: 3,
      span: 3,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("đơn bắt đầu TRƯỚC cửa sổ thì bị cắt trái", () => {
    expect(placeBar({ startsAt: D("2026-08-12"), endsAt: D("2026-08-18") }, W)).toEqual({
      startCol: 1,
      span: 3,
      clippedStart: true,
      clippedEnd: false,
    });
  });

  it("đơn kết thúc SAU cửa sổ thì bị cắt phải", () => {
    expect(placeBar({ startsAt: D("2026-08-27"), endsAt: D("2026-09-05") }, W)).toEqual({
      startCol: 13,
      span: 2,
      clippedStart: false,
      clippedEnd: true,
    });
  });

  it("đơn phủ trọn cửa sổ thì cắt cả hai đầu", () => {
    expect(placeBar({ startsAt: D("2026-08-01"), endsAt: D("2026-09-30") }, W)).toEqual({
      startCol: 1,
      span: 14,
      clippedStart: true,
      clippedEnd: true,
    });
  });

  it("đơn dài đúng một ngày", () => {
    expect(placeBar({ startsAt: D("2026-08-20"), endsAt: D("2026-08-21") }, W)).toEqual({
      startCol: 6,
      span: 1,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("đơn nằm hoàn toàn TRƯỚC cửa sổ → null", () => {
    expect(placeBar({ startsAt: D("2026-08-01"), endsAt: D("2026-08-10") }, W)).toBeNull();
  });

  it("đơn nằm hoàn toàn SAU cửa sổ → null", () => {
    expect(placeBar({ startsAt: D("2026-09-01"), endsAt: D("2026-09-05") }, W)).toBeNull();
  });

  // Hai ca dưới đây là ngữ nghĩa [from, to) — cùng một giả định mà `tstzrange '[)'`
  // ở migration 0010, `overlaps()` ở @v9/shared, và truy vấn `listRentalsInRange`
  // đều dựa vào. Bốn chỗ lệch nhau thì lịch hiện xe bận trong khi nó rảnh.
  it("đơn KẾT THÚC đúng lúc cửa sổ bắt đầu → null (không chạm)", () => {
    expect(placeBar({ startsAt: D("2026-08-10"), endsAt: D("2026-08-15") }, W)).toBeNull();
  });

  it("đơn BẮT ĐẦU đúng lúc cửa sổ kết thúc → null (không chạm)", () => {
    expect(placeBar({ startsAt: D("2026-08-29"), endsAt: D("2026-09-02") }, W)).toBeNull();
  });
});

/**
 * Chế độ Tháng gọi `placeBar` với cửa sổ MỘT NGÀY cho từng ô, nên một đơn dài
 * render một chip ở MỖI ô nó phủ — và `clippedStart`/`clippedEnd` của cửa sổ
 * một-ngày đó bật ở mọi ô giữa. Kết quả: chip ở giữa mang cả `‹` lẫn `›`, mỗi
 * ngày, dù thông tin "đơn còn kéo dài" đã hiển nhiên vì chính chip đó nằm ở ô
 * bên cạnh.
 *
 * Tin THẬT chỉ còn ở mép LƯỚI: đơn kéo dài ra ngoài khoảng đang hiển thị, thứ
 * không ô nào cho thấy. Hàm này trả lời đúng câu đó.
 *
 * Nó KHÔNG tự so ngày: `placeBar` đã là chỗ duy nhất trong repo định nghĩa
 * "bị cắt", kèm hai ca biên nửa mở ngay trên. Viết lại phép so ở đây là dựng
 * bản sao thứ hai của một quy ước mà bốn chỗ khác đang phải tự đồng ý với nhau.
 */
describe("gridEdgeClip — chevron chỉ ở mép lưới", () => {
  const CELLS = 14; // W trải 15/08 → 28/08

  it("đơn nằm trọn trong lưới: không ô nào có chevron", () => {
    const r = { startsAt: D("2026-08-17"), endsAt: D("2026-08-22") };
    for (let i = 0; i < CELLS; i++) {
      expect(gridEdgeClip(r, W, i, CELLS)).toEqual({ start: false, end: false });
    }
  });

  it("đơn bắt đầu trước lưới: chevron trái CHỈ ở ô đầu", () => {
    const r = { startsAt: D("2026-08-12"), endsAt: D("2026-08-18") };
    expect(gridEdgeClip(r, W, 0, CELLS)).toEqual({ start: true, end: false });
    // Ô 1 và 2 cũng nằm trong đơn — trước đợt này chúng cũng hiện `‹`.
    expect(gridEdgeClip(r, W, 1, CELLS)).toEqual({ start: false, end: false });
    expect(gridEdgeClip(r, W, 2, CELLS)).toEqual({ start: false, end: false });
  });

  it("đơn kết thúc sau lưới: chevron phải CHỈ ở ô cuối", () => {
    const r = { startsAt: D("2026-08-26"), endsAt: D("2026-09-02") };
    expect(gridEdgeClip(r, W, CELLS - 1, CELLS)).toEqual({ start: false, end: true });
    expect(gridEdgeClip(r, W, CELLS - 2, CELLS)).toEqual({ start: false, end: false });
  });

  it("đơn phủ trọn lưới: trái ở ô đầu, phải ở ô cuối, giữa không gì", () => {
    const r = { startsAt: D("2026-08-01"), endsAt: D("2026-09-15") };
    expect(gridEdgeClip(r, W, 0, CELLS)).toEqual({ start: true, end: false });
    expect(gridEdgeClip(r, W, CELLS - 1, CELLS)).toEqual({ start: false, end: true });
    expect(gridEdgeClip(r, W, 7, CELLS)).toEqual({ start: false, end: false });
  });

  it("đơn kết thúc ĐÚNG lúc lưới kết thúc: không cắt phải (nửa mở)", () => {
    // Mốc cuối còn nằm trong đơn là `to - 1ms`, tức vẫn trong lưới. Đây là ca
    // mà một phép so `endsAt >= to` viết tay sẽ trả sai.
    const r = { startsAt: D("2026-08-26"), endsAt: W.to };
    expect(gridEdgeClip(r, W, CELLS - 1, CELLS)).toEqual({ start: false, end: false });
  });

  it("đơn không chạm lưới: không gì cả", () => {
    const r = { startsAt: D("2026-09-10"), endsAt: D("2026-09-12") };
    expect(gridEdgeClip(r, W, 0, CELLS)).toEqual({ start: false, end: false });
    expect(gridEdgeClip(r, W, CELLS - 1, CELLS)).toEqual({ start: false, end: false });
  });
});
