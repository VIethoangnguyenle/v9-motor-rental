import { describe, expect, it } from "bun:test";
import { canApprove, canChangeRole, canDisable, type StaffActor } from "./staff";

const owner: StaffActor = { id: "u-owner", role: "OWNER", status: "ACTIVE" };
const owner2: StaffActor = { id: "u-owner-2", role: "OWNER", status: "ACTIVE" };
const staff: StaffActor = { id: "u-staff", role: "STAFF", status: "ACTIVE" };
const pending: StaffActor = { id: "u-pending", role: "STAFF", status: "PENDING" };

describe("canApprove", () => {
  it("OWNER duyệt được người đang chờ", () => {
    expect(canApprove(owner, pending)).toEqual({ ok: true });
  });

  it("STAFF không duyệt được ai", () => {
    expect(canApprove(staff, pending)).toEqual({ ok: false, reason: "KHONG_PHAI_OWNER" });
  });

  it("không tự duyệt chính mình", () => {
    const selfPending: StaffActor = { id: owner.id, role: "OWNER", status: "PENDING" };
    expect(canApprove(owner, selfPending)).toEqual({ ok: false, reason: "TU_DUYET_MINH" });
  });

  it("người đã ACTIVE thì không duyệt lại", () => {
    expect(canApprove(owner, staff)).toEqual({ ok: false, reason: "KHONG_CHO_DUYET" });
  });
});

describe("canChangeRole", () => {
  it("OWNER đổi role của nhân viên khác", () => {
    expect(canChangeRole(owner, staff, "SALES", 1)).toEqual({ ok: true });
  });

  it("không hạ role của OWNER cuối cùng — kể cả chính mình", () => {
    expect(canChangeRole(owner, owner, "STAFF", 1)).toEqual({ ok: false, reason: "OWNER_CUOI_CUNG" });
  });

  it("còn OWNER khác thì hạ role được", () => {
    expect(canChangeRole(owner, owner2, "STAFF", 2)).toEqual({ ok: true });
  });

  it("STAFF không đổi role của ai", () => {
    expect(canChangeRole(staff, pending, "OWNER", 1)).toEqual({ ok: false, reason: "KHONG_PHAI_OWNER" });
  });
});

describe("canDisable", () => {
  it("OWNER khoá được nhân viên", () => {
    expect(canDisable(owner, staff, 1)).toEqual({ ok: true });
  });

  it("không tự khoá mình", () => {
    expect(canDisable(owner, owner, 2)).toEqual({ ok: false, reason: "TU_KHOA_MINH" });
  });

  it("không khoá OWNER cuối cùng", () => {
    expect(canDisable(owner, owner2, 1)).toEqual({ ok: false, reason: "OWNER_CUOI_CUNG" });
  });

  it("STAFF không khoá được ai", () => {
    expect(canDisable(staff, pending, 1)).toEqual({ ok: false, reason: "KHONG_PHAI_OWNER" });
  });
});
