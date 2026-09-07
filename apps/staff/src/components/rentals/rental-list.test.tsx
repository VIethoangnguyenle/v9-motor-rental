import { afterEach, describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { RentalList, type RentalListItem } from "./rental-list";
import { restoreViewport, stubViewport, VIEWPORT } from "../../hooks/use-layout-variant.testing";

const NOW = new Date("2026-09-04T15:00:00+07:00");

const booked: RentalListItem = {
  id: "r1",
  status: "BOOKED",
  startsAt: new Date("2026-09-06T09:00:00+07:00"),
  endsAt: new Date("2026-09-09T00:00:00+07:00"),
  totalAmount: 1_500_000,
  customerName: "Trần Quốc Bảo",
  vehicleMake: "Yamaha",
  vehicleModel: "MT-07",
  vehiclePlate: "59X1-12345",
};

describe("RentalList", () => {
  it("BOOKED hiện mốc LẤY xe, không phải mốc trả", () => {
    render(<RentalList rows={[booked]} now={NOW} onOpen={() => undefined} />);
    expect(screen.getByText(/Lấy 09:00 06-09/)).toBeTruthy();
    expect(screen.queryByText(/Trả/)).toBeNull();
  });

  /**
   * `endsAt` là biên MỞ: đơn kết thúc ngày 08/09 lưu `endsAt = 09/09 00:00`.
   * In trần ra là "Trả 00:00 09-09" — sai đúng một ngày, ở đúng cột mà cột này
   * tồn tại để trả lời.
   */
  it("ONGOING lùi endsAt một mili-giây, không in biên mở ra màn hình", () => {
    render(
      <RentalList
        rows={[{ ...booked, status: "ONGOING", id: "r2" }]}
        now={NOW}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText(/Trả 23:59 08-09/)).toBeTruthy();
  });

  it("chip mang CẢ nhãn chữ, không chỉ màu", () => {
    render(<RentalList rows={[booked]} now={NOW} onOpen={() => undefined} />);
    expect(screen.getByText("Đã đặt")).toBeTruthy();
  });

  it("mọi dòng bấm được bằng bàn phím", () => {
    render(<RentalList rows={[booked]} now={NOW} onOpen={() => undefined} />);
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("ô tên khách là vùng bấm mở sheet, chip trạng thái là trình bày thuần", () => {
    render(<RentalList rows={[booked]} now={NOW} onOpen={() => undefined} />);
    // Nút duy nhất ở hình dạng bảng phải mang chính tên khách — không phải chip.
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Trần Quốc Bảo");
  });

  describe("hình dạng thẻ (màn hẹp)", () => {
    // `useLayoutVariant` đọc `window.matchMedia` trực tiếp (không qua React
    // context), nên stub là cách duy nhất ép hook trả "mobile" trong test — không
    // có seam ở tầng React để tiêm qua. Stub dùng chung ở
    // `hooks/use-layout-variant.testing.ts`: nó đọc ngưỡng thẳng từ hook (không
    // chép tay) và trả lời CẢ HAI ngưỡng — stub một query thì query kia rơi
    // xuống happy-dom, vốn mặc định rộng 1024 và sẽ khớp.
    afterEach(restoreViewport);

    it("render thẻ chứ không phải bảng khi viewport hẹp", () => {
      stubViewport(VIEWPORT.mobile);

      render(<RentalList rows={[booked]} now={NOW} onOpen={() => undefined} />);

      // Chứng minh hình dạng THẬT SỰ đổi, không phải chỉ đo lại nội dung chung:
      // vắng mặt `<table>` là bằng chứng nhánh thẻ đã chạy, chứ không phải nhánh
      // bảng chạy và tình cờ có cùng chữ.
      expect(document.querySelector("table")).toBeNull();
      expect(screen.getByText("Trần Quốc Bảo")).toBeTruthy();
    });
  });
});
