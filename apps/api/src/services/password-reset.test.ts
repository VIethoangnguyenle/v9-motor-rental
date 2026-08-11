import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { and, eq, isNull, like } from "drizzle-orm";
import { db } from "../db";
import {
  doiMatKhauBangMa,
  kiemTraMa,
  type PasswordResetDeps,
  sinhMaNgauNhien,
  taoMaDatLaiMatKhau,
  timStaffTheoEmail,
} from "./password-reset";
import { loadStaff } from "./staff";

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

/**
 * Đây là nhánh CHỈ chạy ở production, và trước khi được tách ra khỏi `sinhMa()` nó
 * có coverage đúng 0%: `sinhMa()` trả `env.devOtp` ngay dòng đầu ở mọi môi trường
 * không phải production, nên đoạn code duy nhất trong repo sinh ra bí mật thật chưa
 * từng chạy trong một test nào. Test dưới đây gọi thẳng hàm thuần, không dựng lại
 * `NODE_ENV` — đó là lý do hàm cố ý không đọc `env`.
 */
describe("sinhMaNgauNhien", () => {
  it("luôn đúng 6 ký tự và chỉ gồm chữ số", () => {
    for (let i = 0; i < 5_000; i++) {
      expect(sinhMaNgauNhien()).toMatch(/^\d{6}$/);
    }
  });

  it("GIỮ số 0 ở đầu — mã là chuỗi, không phải số", () => {
    // `"000123"` là mã hợp lệ; parse thành số rồi in lại cho ra `"123"`, và nhân
    // viên gõ đúng thứ nhận được trong email vẫn bị báo sai. Ép sinh tới khi gặp
    // một mã bắt đầu bằng 0 (xác suất ~10% mỗi lần, nên vòng này gần như chắc chắn
    // dừng sớm) rồi khoá đúng tính chất đó.
    let coSoKhongODau = "";
    for (let i = 0; i < 1_000 && !coSoKhongODau; i++) {
      const ma = sinhMaNgauNhien();
      if (ma.startsWith("0")) coSoKhongODau = ma;
    }
    expect(coSoKhongODau).toMatch(/^0\d{5}$/);
    expect(coSoKhongODau).toHaveLength(6);
    // Đối chứng: đây chính là thứ một lần parse-rồi-in-lại sẽ làm hỏng.
    expect(String(Number(coSoKhongODau))).not.toBe(coSoKhongODau);
  });

  it("không lệch thô: mọi chữ số 0–9 đều xuất hiện ở MỌI vị trí", () => {
    // 60.000 mẫu, kỳ vọng 6.000 lần cho mỗi cặp (vị trí, chữ số). Test này không
    // chứng minh phân phối đều — nó bắt các kiểu hỏng thô: `% 1_000_000` mất một
    // dải giá trị, `padStart` sai, hay một vị trí bị ghim cứng.
    const N = 60_000;
    const dem = Array.from({ length: 6 }, () => new Map<string, number>());
    for (let i = 0; i < N; i++) {
      const ma = sinhMaNgauNhien();
      for (let vt = 0; vt < 6; vt++) {
        const c = ma[vt] ?? "";
        dem[vt]?.set(c, (dem[vt]?.get(c) ?? 0) + 1);
      }
    }
    for (let vt = 0; vt < 6; vt++) {
      for (let d = 0; d <= 9; d++) {
        const soLan = dem[vt]?.get(String(d)) ?? 0;
        // Ngưỡng = một nửa kỳ vọng (6.000), tức cách kỳ vọng ~41 độ lệch chuẩn:
        // test flaky vì ngẫu nhiên là test bị người ta tắt đi, và cái cần bắt ở đây
        // là hỏng thô chứ không phải lệch vài phần nghìn.
        expect(soLan).toBeGreaterThan(N / 10 / 2);
      }
    }
  });
});

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

  // Bản trước gói UPDATE + INSERT trong một transaction và coi thế là đủ. Không đủ:
  // ở READ COMMITTED, `UPDATE ... SET used_at` của T2 không nhìn thấy hàng T1 vừa
  // INSERT (chưa commit) nên không đánh dấu nó. Đo thật: 8 lời gọi song song để lại
  // 5 mã cùng sống. Test tuần tự ở ngay trên KHÔNG bắt được — nó chỉ chứng minh hai
  // lời gọi nối đuôi nhau thì ổn.
  it("8 lời gọi SONG SONG cho cùng một người: vẫn chỉ còn đúng MỘT mã sống", async () => {
    await Promise.all(Array.from({ length: 8 }, () => taoMaDatLaiMatKhau(ID)));
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
    await db.delete(schema.passwordResetCodes).where(eq(schema.passwordResetCodes.staffUserId, ID));
    expect(await kiemTraMa(ID, "999999")).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
  });

  // ⚠️ TEST NÀY PHẢI SONG SONG. Test "sai 5 lần" ở trên đoán trong vòng `for`, tức
  // là tuần tự, và nó XANH kể cả trên bản code không chặn được gì: đo trên bản cũ,
  // tuần tự N=20 cho MA_SAI=5 (đúng) trong khi song song N=20 cho MA_SAI=20 và
  // attempts_cuoi=20 (giới hạn không tồn tại). Kẻ tấn công không có lý do gì phải
  // xếp hàng, nên hình dạng của test phải khớp hình dạng của cuộc tấn công.
  //
  // Cửa sổ bị khai thác là ~115ms của `Bun.password.verify` (argon2id) nằm GIỮA lúc
  // đọc `attempts` và lúc ghi nó. Mọi request vào trong cửa sổ đó đều đọc cùng một
  // giá trị cũ và đều đi qua cổng.
  it("bắn SONG SONG 20 lần đoán sai: nhiều nhất 5 lần được chấp nhận", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);

    const ketQua = await Promise.all(Array.from({ length: 20 }, () => kiemTraMa(ID, "000000")));
    const soLanDuocChapNhan = ketQua.filter((r) => !r.ok && r.reason === "MA_SAI").length;

    expect(soLanDuocChapNhan).toBeLessThanOrEqual(5);
    // Chặn kiểu "trả MA_HET_HIEU_LUC cho tất cả" cũng thoả `<= 5` nhưng là hỏng
    // theo hướng khác: mã còn hạn, chưa dùng, phải cho đoán ít nhất một lần.
    expect(soLanDuocChapNhan).toBeGreaterThan(0);
    // Và cơn bão phải THỰC SỰ giết mã, không chỉ đếm đẹp: sau đó mã ĐÚNG cũng chết.
    expect(await kiemTraMa(ID, ma)).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
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

    // ...nhưng `revokeSessions` MỘT MÌNH không đủ: nó giết refresh token, còn
    // access token đang cầm là JWT tự xác thực cục bộ nên sống tới khi hết hạn
    // (đo 2026-08-11: `/staff/me` với cookie cũ vẫn ra 200). Cái dấu dưới đây
    // mới là thứ `staff-guard` đọc để ngắt tức thì.
    expect((await loadStaff(ID))?.sessionsInvalidBefore).toBeInstanceOf(Date);
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
