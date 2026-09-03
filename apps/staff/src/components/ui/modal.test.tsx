import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Modal } from "./modal";

describe("Modal", () => {
  it("không truyền footer thì panel vẫn là vùng cuộn (hành vi cũ)", () => {
    render(
      <Modal label="Thử" placement="bottom" onClose={() => {}}>
        {() => <p>nội dung</p>}
      </Modal>,
    );
    const panel = document.querySelector("[data-panel]");
    expect(panel?.className).toContain("overflow-y-auto");
  });

  it("truyền footer thì footer nằm NGOÀI vùng cuộn", () => {
    render(
      <Modal
        label="Thử"
        placement="bottom"
        onClose={() => {}}
        footer={() => <button type="button">Tạo đơn</button>}
      >
        {() => <p>nội dung</p>}
      </Modal>,
    );
    const panel = document.querySelector("[data-panel]");
    const submit = screen.getByRole("button", { name: "Tạo đơn" });
    const scroller = document.querySelector("[data-modal-scroll]");

    // Vùng cuộn là con của panel, KHÔNG phải panel — panel thôi tự cuộn.
    expect(panel?.className).not.toContain("overflow-y-auto");
    expect(scroller?.className).toContain("overflow-y-auto");
    // Nút nằm ngoài vùng cuộn: cuộn hết nội dung cũng không đẩy nó đi đâu.
    expect(scroller?.contains(submit)).toBe(false);
    expect(panel?.contains(submit)).toBe(true);
  });
});
