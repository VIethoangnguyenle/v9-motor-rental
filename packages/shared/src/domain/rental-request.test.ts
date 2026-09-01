import { describe, expect, it } from "bun:test";
import {
  MAX_REQUEST_DAYS,
  REQUEST_STATUSES,
  requestTransition,
  availableRequestTransitions,
  isRequestDaysValid,
  type RequestStatus,
} from "./rental-request";

describe("requestTransition", () => {
  it("NEW → CONTACTED: nhân viên đã gọi cho khách", () => {
    expect(requestTransition("NEW", "CONTACTED")).toEqual({ ok: true });
  });

  it("NEW → CLOSED: yêu cầu rác hoặc khách tự huỷ, không cần gọi", () => {
    expect(requestTransition("NEW", "CLOSED")).toEqual({ ok: true });
  });

  it("CONTACTED → CLOSED: đã xử lý xong", () => {
    expect(requestTransition("CONTACTED", "CLOSED")).toEqual({ ok: true });
  });

  /**
   * Không có đường lùi. Yêu cầu là BẢN GHI MỘT LẦN về việc khách đã liên hệ —
   * "chưa gọi lại" sau khi đã gọi là một câu sai về quá khứ. Cùng lý lẽ với
   * `ONGOING → CANCELLED` bị cấm ở `rental.ts`.
   */
  it("CẤM đi lùi — CONTACTED không quay về NEW được", () => {
    expect(requestTransition("CONTACTED", "NEW")).toEqual({
      ok: false,
      reason: "INVALID_TRANSITION",
    });
  });

  it("CLOSED là trạng thái kết thúc, không đi đâu được nữa", () => {
    for (const to of REQUEST_STATUSES) {
      expect(requestTransition("CLOSED", to)).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    }
  });

  it("tự chuyển về chính nó cũng bị từ chối", () => {
    for (const s of REQUEST_STATUSES) {
      expect(requestTransition(s, s)).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    }
  });
});

describe("availableRequestTransitions", () => {
  it("NEW đi được hai đường", () => {
    expect(availableRequestTransitions("NEW")).toEqual(["CONTACTED", "CLOSED"]);
  });

  it("CONTACTED chỉ còn đóng lại", () => {
    expect(availableRequestTransitions("CONTACTED")).toEqual(["CLOSED"]);
  });

  it("CLOSED không còn đường nào", () => {
    expect(availableRequestTransitions("CLOSED")).toEqual([]);
  });

  // Hàng rào chống hai nguồn sự thật — cùng khuôn `availableTransitions` ở `rental.ts`.
  it("khớp `requestTransition` ở cả hai chiều, cho mọi cặp", () => {
    for (const from of REQUEST_STATUSES) {
      const available = availableRequestTransitions(from);
      for (const to of REQUEST_STATUSES) {
        expect(available.includes(to)).toBe(requestTransition(from, to).ok);
      }
    }
  });
});

describe("isRequestDaysValid", () => {
  it("một ngày là hợp lệ — đơn vị thuê cơ bản là NGÀY (PRODUCT.md)", () => {
    expect(isRequestDaysValid(1)).toBe(true);
  });

  it("đúng trần thì vẫn hợp lệ", () => {
    expect(isRequestDaysValid(MAX_REQUEST_DAYS)).toBe(true);
  });

  it("quá trần thì không", () => {
    expect(isRequestDaysValid(MAX_REQUEST_DAYS + 1)).toBe(false);
  });

  it("không, âm, và số lẻ đều bị từ chối", () => {
    expect(isRequestDaysValid(0)).toBe(false);
    expect(isRequestDaysValid(-1)).toBe(false);
    expect(isRequestDaysValid(1.5)).toBe(false);
  });

  it("NaN và Infinity bị từ chối — chúng lọt qua mọi phép so sánh `<=` ngây thơ", () => {
    expect(isRequestDaysValid(Number.NaN)).toBe(false);
    expect(isRequestDaysValid(Number.POSITIVE_INFINITY)).toBe(false);
  });

  /**
   * Trần này KHÔNG được vượt `MAX_RANGE_DAYS = 92` của `GET /rentals`: một yêu
   * cầu dài hơn cửa sổ lịch mà nhân viên xem được là một yêu cầu không kiểm tra
   * chồng lịch được bằng mắt trước khi chốt.
   */
  it("trần nằm trong cửa sổ lịch nhân viên xem được", () => {
    expect(MAX_REQUEST_DAYS).toBeLessThanOrEqual(92);
  });
});

describe("REQUEST_STATUSES", () => {
  it("đúng ba trạng thái, và kiểu suy ra từ chính mảng", () => {
    expect(REQUEST_STATUSES).toEqual(["NEW", "CONTACTED", "CLOSED"]);
    const s: RequestStatus = "NEW";
    expect(REQUEST_STATUSES.includes(s)).toBe(true);
  });
});
