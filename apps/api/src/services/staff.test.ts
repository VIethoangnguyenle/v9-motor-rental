import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import {
  approveStaff,
  changeStaffRole,
  createPendingStaff,
  disableStaff,
  listStaff,
  loadStaff,
  type StaffDeps,
} from "./staff";

// Cùng quy ước với vehicles.test.ts: tiền tố riêng, dọn ở CẢ beforeAll lẫn afterAll.
// afterAll không chạy khi lần trước bị Ctrl-C, và hàng sót lại làm assertion sai lệch.
const P = "ztest-";
const clean = () => db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
// `clean()` trả về query builder của Drizzle — có `.then` (thenable) nhưng KHÔNG phải
// `instanceof Promise`. Bun's `afterAll(clean)` chỉ đợi khi nhận đúng một Promise thật;
// truyền thẳng thenable vào thì hook "xong" ngay lập tức trong khi DELETE còn đang bay,
// và tiến trình thoát trước khi nó chạm tới Postgres — hàng `ztest-%` sống sót qua lần
// chạy tưởng chừng sạch. Đã đo bằng test tối giản: `afterAll(clean)` để sót hàng,
// `afterAll(async () => { await clean(); })` thì không. Bọc trong async function ép nó
// thành Promise thật.
const cleanAwaited = async () => {
  await clean();
};

/** Ghi lại lời gọi thay vì gọi SuperTokens thật — service không cần biết ai thu hồi. */
function spyDeps() {
  const daThuHoi: string[] = [];
  const deps: StaffDeps = {
    revokeSessions: (userId) => {
      daThuHoi.push(userId);
      return Promise.resolve();
    },
  };
  return { deps, daThuHoi };
}

beforeAll(async () => {
  await clean();
  await db.insert(schema.staffUsers).values({
    id: `${P}owner`,
    email: `${P}owner@v9.vn`,
    fullName: "Chủ shop",
    role: "OWNER",
    status: "ACTIVE",
  });
});

afterAll(cleanAwaited);

describe("createPendingStaff", () => {
  it("người mới luôn ra PENDING và role STAFF, không nhận role từ input", async () => {
    await createPendingStaff({
      id: `${P}new`,
      email: `${P}new@v9.vn`,
      fullName: "Nhân viên mới",
      phone: "0900000000",
    });
    const row = await loadStaff(`${P}new`);
    expect(row).toMatchObject({ status: "PENDING", role: "STAFF", fullName: "Nhân viên mới" });
  });
});

describe("approveStaff", () => {
  it("OWNER duyệt thì thành ACTIVE và ghi lại ai duyệt", async () => {
    const res = await approveStaff(`${P}owner`, `${P}new`, "STAFF");
    expect(res.ok).toBe(true);
    const row = await loadStaff(`${P}new`);
    expect(row).toMatchObject({ status: "ACTIVE", approvedBy: `${P}owner` });
  });

  it("người không phải OWNER bị từ chối", async () => {
    const res = await approveStaff(`${P}new`, `${P}owner`, "STAFF");
    expect(res).toEqual({ ok: false, reason: "KHONG_PHAI_OWNER" });
  });
});

describe("changeStaffRole", () => {
  it("không hạ được OWNER cuối cùng", async () => {
    const res = await changeStaffRole(`${P}owner`, `${P}owner`, "STAFF");
    expect(res).toEqual({ ok: false, reason: "OWNER_CUOI_CUNG" });
  });
});

describe("disableStaff", () => {
  it("OWNER khoá được nhân viên, và session của người đó bị thu hồi", async () => {
    const { deps, daThuHoi } = spyDeps();
    const res = await disableStaff(deps, `${P}owner`, `${P}new`);
    expect(res.ok).toBe(true);
    expect(await loadStaff(`${P}new`)).toMatchObject({ status: "DISABLED" });
    // Khoá mà không thu hồi thì session cũ vẫn sống trong SuperTokens.
    expect(daThuHoi).toEqual([`${P}new`]);
  });

  it("không tự khoá mình, và KHÔNG thu hồi session của ai cả", async () => {
    const { deps, daThuHoi } = spyDeps();
    const res = await disableStaff(deps, `${P}owner`, `${P}owner`);
    expect(res).toEqual({ ok: false, reason: "TU_KHOA_MINH" });
    // Bị từ chối mà vẫn thu hồi là đá văng chính người đang thao tác.
    expect(daThuHoi).toEqual([]);
  });
});

describe("listStaff", () => {
  it("lọc theo trạng thái", async () => {
    const disabled = await listStaff("DISABLED");
    expect(disabled.some((s) => s.id === `${P}new`)).toBe(true);
    expect(disabled.some((s) => s.id === `${P}owner`)).toBe(false);
  });
});
