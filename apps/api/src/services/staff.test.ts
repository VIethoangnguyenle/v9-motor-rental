import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import {
  activeOwnersLockedQuery,
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

/**
 * "Không hạ được OWNER cuối cùng" và bài test race ngay dưới đều cần biết
 * CHÍNH XÁC tổng số OWNER đang ACTIVE trong TOÀN BẢNG — `countActiveOwnersLocked`
 * (staff.ts) cố ý đếm toàn bảng, đúng theo nghiệp vụ, không biết và không nên
 * biết tiền tố `ztest-`. DB dev CÓ THỂ đã có sẵn OWNER thật khác ngoài luồng
 * test này (một tài khoản bootstrap/signup thật), và nếu có, hai bài test dưới
 * không chạm được đúng cái biên chúng cần chạm — không phải vì code sai, mà vì
 * "chỉ có 1 OWNER trong bảng" không còn đúng.
 *
 * Vô hiệu hoá tạm — CHỈ trong lúc chạy `fn` — mọi OWNER ACTIVE ngoài tiền tố
 * test, rồi khôi phục ngay trong `finally` (kể cả khi `fn` throw). Cố ý scope
 * hẹp nhất có thể (quanh đúng một `it`, không phải cả file) thay vì làm ở
 * beforeAll/afterAll: nếu hàng đó thuộc một tài khoản thật đang được nơi khác
 * dùng, cửa sổ bị ảnh hưởng chỉ còn đúng thời gian chạy một assertion.
 */
async function withOnlyTestOwnersActive<T>(fn: () => Promise<T>): Promise<T> {
  const ambient = await db
    .select({ id: schema.staffUsers.id })
    .from(schema.staffUsers)
    .where(and(eq(schema.staffUsers.role, "OWNER"), eq(schema.staffUsers.status, "ACTIVE")));
  const ids = ambient.map((r) => r.id).filter((id) => !id.startsWith(P));

  if (ids.length > 0) {
    await db
      .update(schema.staffUsers)
      .set({ status: "DISABLED" })
      .where(inArray(schema.staffUsers.id, ids));
  }
  try {
    return await fn();
  } finally {
    if (ids.length > 0) {
      await db
        .update(schema.staffUsers)
        .set({ status: "ACTIVE" })
        .where(inArray(schema.staffUsers.id, ids));
    }
  }
}

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

describe("activeOwnersLockedQuery — SQL", () => {
  // Cùng lý do publishedVehiclesQuery (vehicles.test.ts) khoá mệnh đề ORDER BY
  // bằng .toSQL(): đây là bất biến mong manh nhất của đợt fix này, và trước đó
  // CHỈ có comment canh giữ. `db` (không phải `tx`) là đủ — .toSQL() không chạm
  // DB, chỉ đọc phần build câu lệnh.
  const { sql: generated } = activeOwnersLockedQuery(db).toSQL();

  it("phát ra FOR UPDATE — thiếu nó thì đếm không khoá gì cả", () => {
    expect(generated.toLowerCase()).toContain("for update");
  });

  it("có ORDER BY id — thiếu nó hai transaction có thể khoá chéo và deadlock", () => {
    expect(generated).toMatch(/order by\s+"staff_users"\."id"/i);
  });
});

describe("changeStaffRole", () => {
  it("không hạ được OWNER cuối cùng", async () => {
    await withOnlyTestOwnersActive(async () => {
      const res = await changeStaffRole(`${P}owner`, `${P}owner`, "STAFF");
      expect(res).toEqual({ ok: false, reason: "OWNER_CUOI_CUNG" });
    });
  });

  it("hai OWNER cùng tự hạ role một lúc: chỉ một cái đi qua", async () => {
    await withOnlyTestOwnersActive(async () => {
      // Cần ĐÚNG 2 ACTIVE OWNER lúc chạy đua để chạm đúng biên "còn 2 thì hạ 1
      // được, còn 1 thì không" — mà `${P}owner` (seed ở beforeAll) đã là một
      // OWNER ACTIVE sẵn có. Tạm khoá nó ra khỏi vòng đua bằng DISABLED, rồi trả
      // lại ACTIVE ở `finally`: describe `disableStaff` bên dưới cần nó vẫn là
      // OWNER ACTIVE, bất kể race test này pass hay fail.
      await db
        .update(schema.staffUsers)
        .set({ status: "DISABLED" })
        .where(eq(schema.staffUsers.id, `${P}owner`));

      await db.insert(schema.staffUsers).values([
        {
          id: `${P}o1`,
          email: `${P}o1@v9.vn`,
          fullName: "Owner 1",
          role: "OWNER",
          status: "ACTIVE",
        },
        {
          id: `${P}o2`,
          email: `${P}o2@v9.vn`,
          fullName: "Owner 2",
          role: "OWNER",
          status: "ACTIVE",
        },
      ]);

      try {
        // Không khoá hàng thì cả hai cùng đọc được count = 2 và cùng đi qua —
        // hệ thống mất OWNER cuối cùng mà từng lời gọi riêng lẻ đều "hợp lệ".
        const [a, b] = await Promise.all([
          changeStaffRole(`${P}o1`, `${P}o1`, "STAFF"),
          changeStaffRole(`${P}o2`, `${P}o2`, "STAFF"),
        ]);
        const soThanhCong = [a, b].filter((r) => r.ok).length;
        expect(soThanhCong).toBe(1);

        const conOwner = await db
          .select({ id: schema.staffUsers.id })
          .from(schema.staffUsers)
          .where(and(eq(schema.staffUsers.role, "OWNER"), eq(schema.staffUsers.status, "ACTIVE")));
        expect(conOwner.length).toBe(1);
      } finally {
        await db
          .update(schema.staffUsers)
          .set({ status: "ACTIVE" })
          .where(eq(schema.staffUsers.id, `${P}owner`));
      }
    });
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
    // Và phải ĐÓNG DẤU nữa — `revokeSessions` chỉ giết refresh token, access
    // token đang cầm là JWT tự xác thực nên nó sống tới khi hết hạn (đo
    // 2026-08-11). Bất biến của repo: hễ thu hồi thì đóng dấu.
    expect((await loadStaff(`${P}new`))?.sessionsInvalidBefore).toBeInstanceOf(Date);
  });

  it("không tự khoá mình, và KHÔNG thu hồi session của ai cả", async () => {
    const { deps, daThuHoi } = spyDeps();
    const res = await disableStaff(deps, `${P}owner`, `${P}owner`);
    expect(res).toEqual({ ok: false, reason: "TU_KHOA_MINH" });
    // Bị từ chối mà vẫn thu hồi là đá văng chính người đang thao tác.
    expect(daThuHoi).toEqual([]);
    // Cùng lý lẽ cho cái dấu: đóng dấu ở nhánh bị từ chối là tự đá mình ra khỏi
    // hệ thống bằng một thao tác đã KHÔNG xảy ra.
    expect((await loadStaff(`${P}owner`))?.sessionsInvalidBefore).toBeNull();
  });
});

describe("listStaff", () => {
  it("lọc theo trạng thái", async () => {
    const disabled = await listStaff("DISABLED");
    expect(disabled.some((s) => s.id === `${P}new`)).toBe(true);
    expect(disabled.some((s) => s.id === `${P}owner`)).toBe(false);
  });
});
