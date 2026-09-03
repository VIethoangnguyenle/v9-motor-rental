import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { ScrollHint } from "./calendar-timeline";

/** happy-dom không làm layout, nên `scrollWidth`/`clientWidth` phải đặt tay. */
function fakeScroller(clientWidth: number, scrollWidth: number, scrollLeft = 0) {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  el.scrollLeft = scrollLeft;
  return el;
}

describe("ScrollHint", () => {
  it("còn nội dung chưa xem → bật", () => {
    const el = fakeScroller(356, 942, 0);
    render(<ScrollHint scrollerRef={{ current: el }} />);
    expect(document.querySelector("[data-scroll-hint]")?.getAttribute("data-more")).toBe("true");
  });

  it("đã cuộn hết → TẮT", () => {
    // 942 - 356 = 586 là scrollLeft tối đa.
    const el = fakeScroller(356, 942, 586);
    render(<ScrollHint scrollerRef={{ current: el }} />);
    expect(document.querySelector("[data-scroll-hint]")?.getAttribute("data-more")).toBe("false");
  });

  it("không có gì để cuộn → TẮT", () => {
    const el = fakeScroller(1024, 1024, 0);
    render(<ScrollHint scrollerRef={{ current: el }} />);
    expect(document.querySelector("[data-scroll-hint]")?.getAttribute("data-more")).toBe("false");
  });
});
