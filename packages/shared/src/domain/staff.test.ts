import { describe, expect, it } from "bun:test";
import { canApprove, canChangeRole, canDisable, type StaffActor } from "./staff";

const owner: StaffActor = { id: "u-owner", role: "OWNER", status: "ACTIVE" };
const owner2: StaffActor = { id: "u-owner-2", role: "OWNER", status: "ACTIVE" };
const staff: StaffActor = { id: "u-staff", role: "STAFF", status: "ACTIVE" };
const pending: StaffActor = { id: "u-pending", role: "STAFF", status: "PENDING" };
const ownerBiKhoa: StaffActor = { id: "u-owner-khoa", role: "OWNER", status: "DISABLED" };

describe("canApprove", () => {
  it("OWNER duyệt được người đang chờ", () => {
    expect(canApprove(owner, pending)).toEqual({ ok: true });
  });

  it("STAFF không duyệt được ai", () => {
    expect(canApprove(staff, pending)).toEqual({ ok: false, reason: "NOT_OWNER" });
  });

  it("không tự duyệt chính mình", () => {
    const selfPending: StaffActor = { id: owner.id, role: "OWNER", status: "PENDING" };
    expect(canApprove(owner, selfPending)).toEqual({ ok: false, reason: "CANNOT_APPROVE_SELF" });
  });

  it("người đã ACTIVE thì không duyệt lại", () => {
    expect(canApprove(owner, staff)).toEqual({ ok: false, reason: "NOT_PENDING" });
  });

  // Vế status của requireOwner: OWNER nhưng bị khoá cũng phải bị chặn như không
  // phải OWNER. Trước khi có test này, xoá vế `actor.status !== "ACTIVE"` khỏi
  // requireOwner không làm test nào đỏ.
  it("OWNER nhưng đang DISABLED thì không duyệt được ai", () => {
    expect(canApprove(ownerBiKhoa, pending)).toEqual({ ok: false, reason: "NOT_OWNER" });
  });
});

describe("canChangeRole", () => {
  it("OWNER đổi role của nhân viên khác", () => {
    expect(canChangeRole(owner, staff, "SALES", 1)).toEqual({ ok: true });
  });

  it("không hạ role của OWNER cuối cùng — kể cả chính mình", () => {
    expect(canChangeRole(owner, owner, "STAFF", 1)).toEqual({
      ok: false,
      reason: "LAST_OWNER",
    });
  });

  it("còn OWNER khác thì hạ role được", () => {
    expect(canChangeRole(owner, owner2, "STAFF", 2)).toEqual({ ok: true });
  });

  it("STAFF không đổi role của ai", () => {
    expect(canChangeRole(staff, pending, "OWNER", 1)).toEqual({
      ok: false,
      reason: "NOT_OWNER",
    });
  });

  // Vế status của requireOwner — xem ghi chú ở "canApprove".
  it("OWNER nhưng đang DISABLED thì không đổi role của ai", () => {
    expect(canChangeRole(ownerBiKhoa, staff, "SALES", 2)).toEqual({
      ok: false,
      reason: "NOT_OWNER",
    });
  });
});

describe("canDisable", () => {
  it("OWNER khoá được nhân viên", () => {
    expect(canDisable(owner, staff, 1)).toEqual({ ok: true });
  });

  it("không tự khoá mình", () => {
    expect(canDisable(owner, owner, 2)).toEqual({ ok: false, reason: "CANNOT_DISABLE_SELF" });
  });

  it("không khoá OWNER cuối cùng", () => {
    expect(canDisable(owner, owner2, 1)).toEqual({ ok: false, reason: "LAST_OWNER" });
  });

  // Khi "tự khoá mình" trùng với "OWNER cuối cùng", CANNOT_DISABLE_SELF phải thắng:
  // test "không tự khoá mình" ở trên đã chứng minh tự khoá bị từ chối kể cả khi
  // còn OWNER khác (activeOwnerCount 2), nên CANNOT_DISABLE_SELF là lý do luôn đúng bất
  // kể còn bao nhiêu OWNER. Trả LAST_OWNER ở đây sẽ ngụ ý sai rằng thêm một
  // OWNER nữa thì tự khoá được.
  it("tự khoá mình khi đang là OWNER cuối cùng vẫn báo CANNOT_DISABLE_SELF", () => {
    expect(canDisable(owner, owner, 1)).toEqual({ ok: false, reason: "CANNOT_DISABLE_SELF" });
  });

  it("STAFF không khoá được ai", () => {
    expect(canDisable(staff, pending, 1)).toEqual({ ok: false, reason: "NOT_OWNER" });
  });

  // Vế status của requireOwner — xem ghi chú ở "canApprove".
  it("OWNER nhưng đang DISABLED thì không khoá được ai", () => {
    expect(canDisable(ownerBiKhoa, staff, 2)).toEqual({ ok: false, reason: "NOT_OWNER" });
  });
});
