import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("render được vào DOM thật và giữ ngưỡng chạm 44px", () => {
    render(<Button type="button">Duyệt</Button>);
    const btn = screen.getByRole("button", { name: "Duyệt" });
    expect(btn).toBeDefined();
    // `min-h-11` = 44px — ngưỡng app tự tuyên bố ở ui/button.tsx
    expect(btn.className).toContain("min-h-11");
  });
});
