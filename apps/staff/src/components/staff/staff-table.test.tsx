import { describe, expect, it, beforeEach } from "bun:test";
import { render, screen, within } from "@testing-library/react";
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

  it("mobile: đủ vai trò, trạng thái và hai nút hành động — TRONG khối thẻ", () => {
    stub(false);
    render(<StaffTable {...props} />);
    // `within(getByRole("list"))`, không truy vấn toàn cục: một nút "Duyệt"
    // trôi nổi đâu đó trong DOM (kể cả sót lại từ một hình dạng bảng ẩn) vẫn
    // làm `getByRole` toàn cục pass — test phải ép nút nằm TRONG khối thẻ mới
    // thật sự gác được hình dạng thẻ, không chỉ gác "nút có tồn tại".
    const list = within(screen.getByRole("list"));
    expect(list.getByText("Nhân viên")).toBeDefined(); // ROLE_LABEL.STAFF
    expect(list.getByText("Chờ duyệt")).toBeDefined(); // STATUS_LABEL.PENDING
    expect(list.getByRole("button", { name: "Duyệt" })).toBeDefined();
    expect(list.getByRole("button", { name: "Phát mã" })).toBeDefined();
  });
});
