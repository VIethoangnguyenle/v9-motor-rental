import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { MAX_AVATAR_BYTES } from "@v9/shared/domain/avatar";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { checkins } from "../storage";
import { deleteStaffAvatar, readStaffAvatar, setStaffAvatar } from "./avatar";

const P = "ztest-avatar-";
const staffId = `${P}owner`;

/** 1×1 PNG thật, không phải byte ngẫu nhiên — để `Content-Type` khớp nội dung. */
const PNG_1PX = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
const png = () => PNG_1PX.slice().buffer;

/** Khoá đang nằm trong hàng — chỗ DUY NHẤT test này được phép biết về `object_key`. */
async function currentKey(id: string): Promise<string | null> {
  const [row] = await db
    .select({ objectKey: schema.staffUsers.avatarObjectKey })
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.id, id))
    .limit(1);
  return row?.objectKey ?? null;
}

async function clean() {
  // Object TRƯỚC, hàng sau — ngược lại thì không còn khoá nào để biết phải dọn
  // gì trong MinIO, và mỗi lần chạy test lại bỏ thêm rác ở đó.
  const rows = await db
    .select({ objectKey: schema.staffUsers.avatarObjectKey })
    .from(schema.staffUsers)
    .where(like(schema.staffUsers.id, `${P}%`));
  const keys = rows.map((r) => r.objectKey).filter((k) => k !== null);
  await Promise.all(keys.map((k) => checkins.delete(k).catch(() => undefined)));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

beforeAll(async () => {
  await clean();
  await db.insert(schema.staffUsers).values({
    id: staffId,
    email: `${P}owner@example.com`,
    fullName: "Chủ shop test",
    role: "OWNER",
    status: "ACTIVE",
  });
});

afterAll(clean);

const base = () => ({ staffId, contentType: "image/png", bytes: png() });

describe("setStaffAvatar", () => {
  it("ghi object rồi trỏ hàng vào nó, và byte đọc lại ra đúng nội dung", async () => {
    expect(await setStaffAvatar(base())).toEqual({ ok: true });

    const key = await currentKey(staffId);
    expect(key).not.toBeNull();
    // Byte phải THẬT SỰ nằm trong MinIO. Một service ghi hàng mà quên ghi object
    // vẫn qua được mọi test chỉ đọc Postgres.
    expect(await checkins.exists(key ?? "")).toBe(true);

    const read = await readStaffAvatar(staffId);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const back = new Uint8Array(await new Response(read.stream).arrayBuffer());
    expect(back.byteLength).toBe(PNG_1PX.byteLength);
    expect(back[0]).toBe(0x89);
    expect(read.contentType).toBe("image/png");
  });

  /**
   * ⛔ Ca đắt nhất của cả file, và là lý do `avatarObjectKey` nhận `avatarId`
   * thay vì dùng một khoá cố định. Ba điều phải đúng CÙNG LÚC sau khi thay ảnh:
   * hàng trỏ khoá MỚI, object mới có thật, object CŨ đã biến mất. Bỏ vế cuối thì
   * mỗi lần đổi ảnh để lại một object không ai còn tham chiếu tới.
   */
  it("THAY ảnh: hàng trỏ khoá mới, object cũ bị dọn", async () => {
    await setStaffAvatar(base());
    const oldKey = (await currentKey(staffId)) ?? "";
    expect(await checkins.exists(oldKey)).toBe(true);

    expect(await setStaffAvatar({ ...base(), contentType: "image/webp" })).toEqual({ ok: true });

    const newKey = (await currentKey(staffId)) ?? "";
    expect(newKey).not.toBe(oldKey);
    expect(newKey.endsWith(".webp")).toBe(true);
    expect(await checkins.exists(newKey)).toBe(true);
    expect(await checkins.exists(oldKey)).toBe(false);
  });

  it("từ chối định dạng không nhận, KHÔNG đụng vào hàng", async () => {
    await setStaffAvatar(base());
    const before = await currentKey(staffId);
    expect(await setStaffAvatar({ ...base(), contentType: "application/pdf" })).toEqual({
      ok: false,
      reason: "AVATAR_TYPE_INVALID",
    });
    expect(await currentKey(staffId)).toBe(before);
  });

  it("từ chối svg — là ảnh, nhưng chạy được script trên MỌI màn hình của app", async () => {
    expect(await setStaffAvatar({ ...base(), contentType: "image/svg+xml" })).toEqual({
      ok: false,
      reason: "AVATAR_TYPE_INVALID",
    });
  });

  it("từ chối file rỗng và file quá trần 1 MB — server không tin client hạ ảnh", async () => {
    expect(await setStaffAvatar({ ...base(), bytes: new ArrayBuffer(0) })).toEqual({
      ok: false,
      reason: "AVATAR_SIZE_INVALID",
    });
    expect(
      await setStaffAvatar({ ...base(), bytes: new ArrayBuffer(MAX_AVATAR_BYTES + 1) }),
    ).toEqual({ ok: false, reason: "AVATAR_SIZE_INVALID" });
  });

  /**
   * Tài khoản biến mất giữa chừng. Kiểm cả hai vế: trả `NOT_FOUND`, VÀ không để
   * lại object mồ côi — object đã ghi trước khi câu UPDATE chạy, nên nhánh dọn
   * dẹp là thứ duy nhất đứng giữa ca này và một file rác vĩnh viễn.
   */
  it("người không có thật: NOT_FOUND, và không để lại object mồ côi", async () => {
    const ghost = `${P}khong-co-that`;
    expect(await setStaffAvatar({ ...base(), staffId: ghost })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    const left = await checkins.list({ prefix: `staff/${ghost}/` });
    expect(left.contents ?? []).toEqual([]);
  });
});

describe("deleteStaffAvatar", () => {
  it("xoá cả hàng lẫn object", async () => {
    await setStaffAvatar(base());
    const key = (await currentKey(staffId)) ?? "";
    expect(await checkins.exists(key)).toBe(true);

    expect(await deleteStaffAvatar(staffId)).toEqual({ ok: true });

    expect(await currentKey(staffId)).toBeNull();
    expect(await checkins.exists(key)).toBe(false);
  });

  it("đang không có ảnh thì trả AVATAR_NOT_FOUND, không báo thành công suông", async () => {
    await setStaffAvatar(base());
    expect(await deleteStaffAvatar(staffId)).toEqual({ ok: true });
    expect(await deleteStaffAvatar(staffId)).toEqual({ ok: false, reason: "AVATAR_NOT_FOUND" });
  });
});

describe("readStaffAvatar", () => {
  it("người chưa có ảnh trả AVATAR_NOT_FOUND", async () => {
    await deleteStaffAvatar(staffId).catch(() => undefined);
    expect(await readStaffAvatar(staffId)).toEqual({ ok: false, reason: "AVATAR_NOT_FOUND" });
  });

  it("người không có thật trả AVATAR_NOT_FOUND chứ không ném lỗi", async () => {
    expect(await readStaffAvatar(`${P}khong-co-that`)).toEqual({
      ok: false,
      reason: "AVATAR_NOT_FOUND",
    });
  });
});
