import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { and, eq, isNull, like } from "drizzle-orm";
import { db } from "../db";
import {
  doiMatKhauBangMa,
  kiemTraMa,
  type PasswordResetDeps,
  taoMaDatLaiMatKhau,
  timStaffTheoEmail,
} from "./password-reset";

// Tiền tố riêng cho file này (`ztest-prc-`), không dùng chung `ztest-` với
// staff.test.ts: `bun test` chạy nhiều file trong CÙNG một tiến trình và không
// hứa hẹn gì về thứ tự, nên hai file cùng xoá theo `ztest-%` sẽ dọn mất dữ liệu
// của nhau giữa chừng.
const P = "ztest-prc-";
const ID = `${P}user`;
const EMAIL = `${P}u@v9.vn`;
const ID_KHOA = `${P}disabled`;
const EMAIL_KHOA = `${P}disabled@v9.vn`;

// Dọn ở CẢ beforeAll lẫn afterAll: afterAll không chạy khi lần trước bị Ctrl-C,
// và hàng sót lại làm assertion "đúng một hàng chưa dùng" sai lệch.
// Xoá mã trước, staff sau — dù FK đã là ON DELETE CASCADE, thứ tự này không phụ
// thuộc vào cấu hình cascade nên nó không im lặng hỏng nếu cascade bị đổi.
const clean = async () => {
  await db
    .delete(schema.passwordResetCodes)
    .where(like(schema.passwordResetCodes.staffUserId, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
};
// `db.delete(...)` trả về query builder của Drizzle — thenable nhưng KHÔNG phải
// `instanceof Promise`, và `afterAll(<thenable>)` của Bun không đợi nó: tiến trình
// thoát trước khi DELETE chạm Postgres, hàng `ztest-` ở lại DB dev. Bọc trong một
// `async` function ép nó thành Promise thật.
const cleanAwaited = async () => {
  await clean();
};

/** Đếm số mã còn sống (chưa dùng) của một người. */
async function maConSong(staffUserId: string) {
  return db
    .select()
    .from(schema.passwordResetCodes)
    .where(
      and(
        eq(schema.passwordResetCodes.staffUserId, staffUserId),
        isNull(schema.passwordResetCodes.usedAt),
      ),
    );
}

interface GhiNhan {
  readonly ten: string;
  readonly args: readonly unknown[];
}

/**
 * Deps giả: ghi lại TÊN và THAM SỐ theo đúng thứ tự gọi. So sánh cả mảng `nhatKy`
 * trong một assertion khoá được ba thứ cùng lúc — gọi hàm nào, theo thứ tự nào,
 * với tham số gì — mà ba spy rời rạc không khoá được.
 *
 * Không cần SuperTokens sống: đó chính là lý do service nhận deps làm tham số
 * (pattern 2 của repo). `supertokens.init()` nằm ở `plugins/auth.ts`, mà
 * `services/` bị ESLint cấm import `plugins/`.
 */
function spyDeps(opts?: { tokenStatus?: string; resetStatus?: string; token?: string }) {
  const nhatKy: GhiNhan[] = [];
  const token = opts?.token ?? "token-supertokens-gia";
  const deps: PasswordResetDeps = {
    taoTokenDatLai: (userId, email) => {
      nhatKy.push({ ten: "taoTokenDatLai", args: [userId, email] });
      return Promise.resolve({ status: opts?.tokenStatus ?? "OK", token });
    },
    doiMatKhauBangToken: (t, matKhauMoi) => {
      nhatKy.push({ ten: "doiMatKhauBangToken", args: [t, matKhauMoi] });
      return Promise.resolve({ status: opts?.resetStatus ?? "OK" });
    },
    revokeSessions: (userId) => {
      nhatKy.push({ ten: "revokeSessions", args: [userId] });
      return Promise.resolve();
    },
  };
  return { deps, nhatKy, token };
}

beforeAll(async () => {
  await clean();
  await db.insert(schema.staffUsers).values([
    { id: ID, email: EMAIL, fullName: "Người quên mật khẩu", status: "ACTIVE" },
    { id: ID_KHOA, email: EMAIL_KHOA, fullName: "Người bị khoá", status: "DISABLED" },
  ]);
});

afterAll(cleanAwaited);

describe("taoMaDatLaiMatKhau", () => {
  it("ngoài production luôn sinh đúng 999999", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    expect(ma).toBe("999999");
  });

  it("xin mã mới thì mã cũ chết — chỉ còn đúng một mã sống", async () => {
    await taoMaDatLaiMatKhau(ID);
    await taoMaDatLaiMatKhau(ID);
    expect(await maConSong(ID)).toHaveLength(1);
  });

  it("mã thô KHÔNG chạm đĩa — cột lưu là bản băm", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    const [row] = await maConSong(ID);
    // Lưu mã thô nghĩa là một lần rò database là một lần rò mọi mã đang sống.
    expect(row?.codeHash).not.toBe(ma);
    expect(await Bun.password.verify(ma, row?.codeHash ?? "")).toBe(true);
  });
});

describe("kiemTraMa", () => {
  it("mã đúng thì hợp lệ, và dùng được ĐÚNG MỘT lần", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    expect(await kiemTraMa(ID, ma)).toEqual({ ok: true });
    // Không đánh dấu đã dùng thì cùng một mã mở được tài khoản nhiều lần —
    // kể cả sau khi nhân viên đã đổi xong mật khẩu.
    expect(await kiemTraMa(ID, ma)).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
  });

  it("mã sai thì báo MA_SAI và tăng số lần thử đúng 1", async () => {
    await taoMaDatLaiMatKhau(ID);
    expect(await kiemTraMa(ID, "000000")).toEqual({ ok: false, reason: "MA_SAI" });
    const [row] = await maConSong(ID);
    // Khoá đúng con số, không chỉ "hàng có tồn tại": bộ đếm không tăng thì giới
    // hạn 5 lần là trang trí, và test "sai 5 lần thì mã chết" bên dưới sẽ xanh
    // vì lý do sai.
    expect(row?.attempts).toBe(1);
  });

  it("sai 5 lần thì mã chết kể cả sau đó nhập đúng", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    for (let i = 0; i < 5; i++) {
      expect(await kiemTraMa(ID, "000000")).toEqual({ ok: false, reason: "MA_SAI" });
    }
    expect(await kiemTraMa(ID, ma)).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
  });

  it("mã hết hạn thì không dùng được", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    await db
      .update(schema.passwordResetCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(schema.passwordResetCodes.staffUserId, ID),
          isNull(schema.passwordResetCodes.usedAt),
        ),
      );
    expect(await kiemTraMa(ID, ma)).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
  });

  it("không có mã nào thì báo hết hiệu lực, không phải crash", async () => {
    await db
      .delete(schema.passwordResetCodes)
      .where(eq(schema.passwordResetCodes.staffUserId, ID));
    expect(await kiemTraMa(ID, "999999")).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
  });
});

describe("timStaffTheoEmail", () => {
  it("email không tồn tại thì null", async () => {
    expect(await timStaffTheoEmail(`${P}khong-co@v9.vn`)).toBeNull();
  });

  it("người DISABLED coi như không tồn tại", async () => {
    expect(await timStaffTheoEmail(EMAIL_KHOA)).toBeNull();
  });
});

describe("doiMatKhauBangMa", () => {
  it("mã đúng: sinh token → đổi mật khẩu → thu hồi session, đúng thứ tự và đúng tham số", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    const { deps, nhatKy, token } = spyDeps();

    expect(await doiMatKhauBangMa(deps, EMAIL, ma, "matkhaumoi-rat-dai")).toEqual({ ok: true });

    expect(nhatKy).toEqual([
      { ten: "taoTokenDatLai", args: [ID, EMAIL] },
      { ten: "doiMatKhauBangToken", args: [token, "matkhaumoi-rat-dai"] },
      // Đổi mật khẩu mà không thu hồi session thì phiên trên máy kẻ đã chiếm
      // vẫn sống — nạn nhân đổi mật khẩu xong vẫn bị đọc trộm.
      { ten: "revokeSessions", args: [ID] },
    ]);
  });

  it("mã sai: trả MA_SAI và KHÔNG gọi deps nào cả", async () => {
    await taoMaDatLaiMatKhau(ID);
    const { deps, nhatKy } = spyDeps();

    expect(await doiMatKhauBangMa(deps, EMAIL, "000000", "matkhaumoi-rat-dai")).toEqual({
      ok: false,
      reason: "MA_SAI",
    });
    // Điểm quan trọng nhất của test này: gọi `taoTokenDatLai` TRƯỚC khi kiểm mã
    // là phát token đặt lại mật khẩu cho kẻ đang đoán mò sáu con số.
    expect(nhatKy).toEqual([]);
  });

  it("email không tồn tại: KHONG_TIM_THAY, không gọi deps nào", async () => {
    const { deps, nhatKy } = spyDeps();
    expect(
      await doiMatKhauBangMa(deps, `${P}khong-co@v9.vn`, "999999", "matkhaumoi-rat-dai"),
    ).toEqual({ ok: false, reason: "KHONG_TIM_THAY" });
    expect(nhatKy).toEqual([]);
  });

  it("người DISABLED: KHONG_TIM_THAY, không gọi deps nào", async () => {
    // Mã sinh ra trước khi bị khoá vẫn nằm trong DB — luồng quên mật khẩu không
    // được là đường để người bị khoá tự mở lại tài khoản.
    await taoMaDatLaiMatKhau(ID_KHOA);
    const { deps, nhatKy } = spyDeps();

    expect(await doiMatKhauBangMa(deps, EMAIL_KHOA, "999999", "matkhaumoi-rat-dai")).toEqual({
      ok: false,
      reason: "KHONG_TIM_THAY",
    });
    expect(nhatKy).toEqual([]);
  });
});
