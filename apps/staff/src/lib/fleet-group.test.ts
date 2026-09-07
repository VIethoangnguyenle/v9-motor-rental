import { describe, expect, it } from "bun:test";
import { FLEET_GROUPS, GROUP_LABEL, fleetGroupOf, onRentLabel } from "./fleet-group";

const v = (patch: { status?: string; onRentUntil?: Date | null; nextFrom?: Date | null }) => ({
  status: patch.status ?? "published",
  onRentUntil: patch.onRentUntil ?? null,
  nextFrom: patch.nextFrom ?? null,
});

const SOON = new Date("2026-09-09T08:00:00+07:00");

describe("fleetGroupOf", () => {
  it("xe đang có đơn phủ lên hiện tại → đang ở ngoài", () => {
    expect(fleetGroupOf(v({ onRentUntil: SOON }))).toBe("ON_RENT");
  });

  it("xe published, không đơn nào đang chạy → trống", () => {
    expect(fleetGroupOf(v({}))).toBe("FREE");
  });

  it("xe draft → chưa lên web", () => {
    expect(fleetGroupOf(v({ status: "draft" }))).toBe("DRAFT");
  });

  it("xe archived → lưu kho", () => {
    expect(fleetGroupOf(v({ status: "archived" }))).toBe("ARCHIVED");
  });

  /**
   * Thứ tự ưu tiên là phần dễ làm sai nhất, nên khoá cả bốn giao điểm.
   *
   * Màn hẹp hỏi "xe nào đang ở đâu", nên tình trạng VẬN HÀNH thắng trạng thái
   * DANH MỤC: một chiếc `draft` đang nằm ngoài đường phải hiện ở nhóm "Đang ở
   * ngoài", vì nhân viên cần đi nhận nó về. Ngược lại `archived` thắng tất cả —
   * xe đã lưu kho thì không còn là việc hằng ngày nữa.
   */
  it("draft mà đang có đơn → vẫn là đang ở ngoài", () => {
    expect(fleetGroupOf(v({ status: "draft", onRentUntil: SOON }))).toBe("ON_RENT");
  });

  it("archived thắng cả đơn đang chạy", () => {
    expect(fleetGroupOf(v({ status: "archived", onRentUntil: SOON }))).toBe("ARCHIVED");
  });

  it("có đơn TƯƠNG LAI nhưng chưa tới → vẫn là trống", () => {
    expect(fleetGroupOf(v({ nextFrom: SOON }))).toBe("FREE");
  });

  it("trạng thái lạ không làm vỡ, rơi về nhóm theo tình trạng vận hành", () => {
    expect(fleetGroupOf(v({ status: "khong-biet" }))).toBe("FREE");
  });
});

describe("onRentLabel", () => {
  const NOW = new Date("2026-09-07T12:00:00+07:00");

  // Dấu phân cách là `-`, không phải `/`: đó là thứ `Intl.DateTimeFormat("vi-VN")`
  // trả về trên runtime này, và cả app đang hiển thị như vậy. Khoá giá trị THẬT
  // ở đây thay vì giá trị mong muốn — một test viết theo kỳ vọng sẽ đỏ trên máy
  // khác mà không ai biết vì sao.
  it("mốc còn ở tương lai → nói ngày về", () => {
    expect(onRentLabel(new Date("2026-09-09T08:00:00+07:00"), NOW)).toBe("về ngày 09-09");
  });

  /**
   * `ONGOING` mà `ends_at` đã trôi qua nghĩa là khách giữ xe quá hạn. Vẫn in
   * "về ngày 03/09" thì câu đó nói về quá khứ và không ai hiểu; phải gọi đúng
   * tên, vì đây là ca cần ai đó đi đòi xe.
   */
  it("mốc đã qua → nói QUÁ HẠN", () => {
    expect(onRentLabel(new Date("2026-09-03T08:00:00+07:00"), NOW)).toBe("quá hạn từ 03-09");
  });

  it("đúng mốc hiện tại KHÔNG tính là quá hạn", () => {
    expect(onRentLabel(NOW, NOW)).toBe("về ngày 07-09");
  });
});

describe("FLEET_GROUPS", () => {
  /**
   * Thứ tự mảng LÀ thứ tự hiển thị trên màn hẹp, không phải chuyện tuỳ ý: nhóm
   * cần hành động ("Đang ở ngoài") phải nằm trên nhóm chỉ để tra cứu.
   */
  it("đúng bốn nhóm, đúng thứ tự ưu tiên đọc", () => {
    expect([...FLEET_GROUPS]).toEqual(["ON_RENT", "FREE", "DRAFT", "ARCHIVED"]);
  });

  it("mọi nhóm đều có nhãn tiếng Việt, không nhóm nào câm", () => {
    for (const g of FLEET_GROUPS) {
      expect(GROUP_LABEL[g].trim().length).toBeGreaterThan(0);
      expect(GROUP_LABEL[g]).not.toBe(g);
    }
  });

  it("mọi giá trị fleetGroupOf trả về đều nằm trong FLEET_GROUPS", () => {
    const seen = [
      fleetGroupOf(v({ onRentUntil: SOON })),
      fleetGroupOf(v({})),
      fleetGroupOf(v({ status: "draft" })),
      fleetGroupOf(v({ status: "archived" })),
    ];
    for (const g of seen) expect(FLEET_GROUPS).toContain(g);
  });
});
