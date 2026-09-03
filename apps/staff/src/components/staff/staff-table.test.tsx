import { describe, expect, it, beforeEach } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StaffTable } from "./staff-table";

const ROWS = [
  {
    id: "a",
    email: "a@v9.vn",
    fullName: "Nguyễn Văn A",
    phone: null,
    role: "STAFF",
    status: "PENDING",
    avatarVersion: null,
  },
] as const;

function stub(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

const props = {
  rows: ROWS,
  me: null,
  busy: false,
  onApprove: () => {},
  onDisable: () => {},
  onIssueCode: () => {},
};

describe("StaffTable", () => {
  beforeEach(() => stub(true));

  it("desktop: vẫn là <table> đủ sáu cột", () => {
    stub(true);
    render(<StaffTable {...props} />);
    expect(document.querySelector("table")).not.toBeNull();
    expect(document.querySelectorAll("thead th").length).toBe(6);
  });

  it("mobile: KHÔNG có <table>, và không sinh vùng cuộn ngang", () => {
    stub(false);
    render(<StaffTable {...props} />);
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("mobile: đủ vai trò, trạng thái và hai nút hành động", () => {
    stub(false);
    render(<StaffTable {...props} />);
    expect(screen.getByText("Nhân viên")).toBeDefined(); // ROLE_LABEL.STAFF
    expect(screen.getByText("Chờ duyệt")).toBeDefined(); // STATUS_LABEL.PENDING
    expect(screen.getByRole("button", { name: "Duyệt" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Phát mã" })).toBeDefined();
  });
});
