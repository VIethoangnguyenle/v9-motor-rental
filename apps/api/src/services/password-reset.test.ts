import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { and, eq, isNull, like } from "drizzle-orm";
import { db } from "../db";
import {
  changePassword,
  createResetCode,
  findStaffByEmail,
  generateRandomCode,
  requestPasswordReset,
  resetPasswordWithCode,
  verifyCode,
  type PasswordResetDeps,
} from "./password-reset";
import { loadStaff } from "./staff";

// Tiền tố riêng cho file này (`ztest-prc-`), không dùng chung `ztest-` với
// staff.test.ts: `bun test` chạy nhiều file trong CÙNG một tiến trình và không
// hứa hẹn gì về thứ tự, nên hai file cùng xoá theo `ztest-%` sẽ dọn mất dữ liệu
// của nhau giữa chừng.
const P = "ztest-prc-";
const ID = `${P}user`;
const EMAIL = `${P}u@v9.vn`;
const ID_DISABLED = `${P}disabled`;
const EMAIL_DISABLED = `${P}disabled@v9.vn`;

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
async function activeCodes(staffUserId: string) {
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

interface CallRecord {
  readonly name: string;
  readonly args: readonly unknown[];
}

/**
 * Deps giả: ghi lại TÊN và THAM SỐ theo đúng thứ tự gọi. So sánh cả mảng `log`
 * trong một assertion khoá được ba thứ cùng lúc — gọi hàm nào, theo thứ tự nào,
 * với tham số gì — mà ba spy rời rạc không khoá được.
 *
 * Không cần SuperTokens sống: đó chính là lý do service nhận deps làm tham số
 * (pattern 2 của repo). `supertokens.init()` nằm ở `plugins/auth.ts`, mà
 * `services/` bị ESLint cấm import `plugins/`.
 */
function spyDeps(opts?: {
  tokenStatus?: string;
  resetStatus?: string;
  token?: string;
  verifyStatus?: string;
}) {
  const log: CallRecord[] = [];
  const token = opts?.token ?? "token-supertokens-gia";
  const deps: PasswordResetDeps = {
    createResetToken: (userId, email) => {
      log.push({ name: "createResetToken", args: [userId, email] });
      return Promise.resolve({ status: opts?.tokenStatus ?? "OK", token });
    },
    resetPasswordWithToken: (t, newPassword) => {
      log.push({ name: "resetPasswordWithToken", args: [t, newPassword] });
      return Promise.resolve({ status: opts?.resetStatus ?? "OK" });
    },
    revokeSessions: (userId) => {
      log.push({ name: "revokeSessions", args: [userId] });
      return Promise.resolve();
    },
    verifyPassword: (email, password) => {
      log.push({ name: "verifyPassword", args: [email, password] });
      return Promise.resolve({ status: opts?.verifyStatus ?? "OK" });
    },
  };
  return { deps, log, token };
}

beforeAll(async () => {
  await clean();
  await db.insert(schema.staffUsers).values([
    { id: ID, email: EMAIL, fullName: "Người quên mật khẩu", status: "ACTIVE" },
    { id: ID_DISABLED, email: EMAIL_DISABLED, fullName: "Người bị khoá", status: "DISABLED" },
  ]);
});

afterAll(cleanAwaited);

/**
 * Đây là nhánh CHỈ chạy ở production, và trước khi được tách ra khỏi `generateCode()` nó
 * có coverage đúng 0%: `generateCode()` trả `env.devOtp` ngay dòng đầu ở mọi môi trường
 * không phải production, nên đoạn code duy nhất trong repo sinh ra bí mật thật chưa
 * từng chạy trong một test nào. Test dưới đây gọi thẳng hàm thuần, không dựng lại
 * `NODE_ENV` — đó là lý do hàm cố ý không đọc `env`.
 */
describe("generateRandomCode", () => {
  it("luôn đúng 6 ký tự và chỉ gồm chữ số", () => {
    for (let i = 0; i < 5_000; i++) {
      expect(generateRandomCode()).toMatch(/^\d{6}$/);
    }
  });

  it("GIỮ số 0 ở đầu — mã là chuỗi, không phải số", () => {
    // `"000123"` là mã hợp lệ; parse thành số rồi in lại cho ra `"123"`, và nhân
    // viên gõ đúng thứ nhận được trong email vẫn bị báo sai. Ép sinh tới khi gặp
    // một mã bắt đầu bằng 0 (xác suất ~10% mỗi lần, nên vòng này gần như chắc chắn
    // dừng sớm) rồi khoá đúng tính chất đó.
    let hasLeadingZero = "";
    for (let i = 0; i < 1_000 && !hasLeadingZero; i++) {
      const code = generateRandomCode();
      if (code.startsWith("0")) hasLeadingZero = code;
    }
    expect(hasLeadingZero).toMatch(/^0\d{5}$/);
    expect(hasLeadingZero).toHaveLength(6);
    // Đối chứng: đây chính là thứ một lần parse-rồi-in-lại sẽ làm hỏng.
    expect(String(Number(hasLeadingZero))).not.toBe(hasLeadingZero);
  });

  it("không lệch thô: mọi chữ số 0–9 đều xuất hiện ở MỌI vị trí", () => {
    // 60.000 mẫu, kỳ vọng 6.000 lần cho mỗi cặp (vị trí, chữ số). Test này không
    // chứng minh phân phối đều — nó bắt các kiểu hỏng thô: `% 1_000_000` mất một
    // dải giá trị, `padStart` sai, hay một vị trí bị ghim cứng.
    const N = 60_000;
    const counts = Array.from({ length: 6 }, () => new Map<string, number>());
    for (let i = 0; i < N; i++) {
      const code = generateRandomCode();
      for (let pos = 0; pos < 6; pos++) {
        const c = code[pos] ?? "";
        counts[pos]?.set(c, (counts[pos]?.get(c) ?? 0) + 1);
      }
    }
    for (let pos = 0; pos < 6; pos++) {
      for (let d = 0; d <= 9; d++) {
        const count = counts[pos]?.get(String(d)) ?? 0;
        // Ngưỡng = một nửa kỳ vọng (6.000), tức cách kỳ vọng ~41 độ lệch chuẩn:
        // test flaky vì ngẫu nhiên là test bị người ta tắt đi, và cái cần bắt ở đây
        // là hỏng thô chứ không phải lệch vài phần nghìn.
        expect(count).toBeGreaterThan(N / 10 / 2);
      }
    }
  });
});

describe("createResetCode", () => {
  it("ngoài production luôn sinh đúng 999999", async () => {
    const code = await createResetCode(ID);
    expect(code).toBe("999999");
  });

  it("xin mã mới thì mã cũ chết — chỉ còn đúng một mã sống", async () => {
    await createResetCode(ID);
    await createResetCode(ID);
    expect(await activeCodes(ID)).toHaveLength(1);
  });

  // Bản trước gói UPDATE + INSERT trong một transaction và coi thế là đủ. Không đủ:
  // ở READ COMMITTED, `UPDATE ... SET used_at` của T2 không nhìn thấy hàng T1 vừa
  // INSERT (chưa commit) nên không đánh dấu nó. Đo thật: 8 lời gọi song song để lại
  // 5 mã cùng sống. Test tuần tự ở ngay trên KHÔNG bắt được — nó chỉ chứng minh hai
  // lời gọi nối đuôi nhau thì ổn.
  it("8 lời gọi SONG SONG cho cùng một người: vẫn chỉ còn đúng MỘT mã sống", async () => {
    await Promise.all(Array.from({ length: 8 }, () => createResetCode(ID)));
    expect(await activeCodes(ID)).toHaveLength(1);
  });

  it("mã thô KHÔNG chạm đĩa — cột lưu là bản băm", async () => {
    const code = await createResetCode(ID);
    const [row] = await activeCodes(ID);
    // Lưu mã thô nghĩa là một lần rò database là một lần rò mọi mã đang sống.
    expect(row?.codeHash).not.toBe(code);
    expect(await Bun.password.verify(code, row?.codeHash ?? "")).toBe(true);
  });

  // Nợ đã trả (docs/DEBT.md, "Không ai dọn mã hết hạn"): hàng `used_at IS NULL`
  // quá `expires_at` phải biến mất KHỎI BẢNG, không chỉ khỏi
  // `password_reset_codes_active_idx`. Điểm mấu chốt của test này là AI xin mã
  // mới: người xin là ID, hàng hết hạn là của MỘT NGƯỜI KHÁC (`abandonedId`) —
  // nếu bản sửa chỉ dọn "của riêng người đang xin" (khoanh theo staffUserId),
  // test này đỏ. Dọn phải là một lượt quét TOÀN CỤC do BẤT KỲ lời gọi
  // createResetCode nào kích hoạt, vì người xin mã đúng MỘT LẦN rồi không bao
  // giờ quay lại sẽ không bao giờ tự kích hoạt được lượt dọn cho chính họ.
  it("ai đó xin mã mới thì dọn luôn mã HẾT HẠN chưa dùng của NGƯỜI KHÁC", async () => {
    const abandonedId = `${P}abandoned`;
    await db.insert(schema.staffUsers).values({
      id: abandonedId,
      email: `${P}abandoned@v9.vn`,
      fullName: "Xin mã một lần rồi không quay lại",
      status: "ACTIVE",
    });
    // Chèn thẳng một hàng đã hết hạn, chưa dùng — đúng hình dạng debt mô tả,
    // không đi qua createResetCode() vì hàm đó luôn sinh hạn dùng ở tương lai.
    await db.insert(schema.passwordResetCodes).values({
      staffUserId: abandonedId,
      codeHash: "khong-quan-trong-vi-khong-verify",
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await activeCodes(abandonedId)).toHaveLength(1);

    await createResetCode(ID); // ID, KHÔNG PHẢI abandonedId, xin mã mới.

    // Biến mất khỏi BẢNG, không chỉ khỏi tập used_at IS NULL — select trần,
    // không lọc usedAt, để phân biệt "đã XOÁ" với "chỉ bị đánh dấu đã dùng".
    const rowsLeft = await db
      .select()
      .from(schema.passwordResetCodes)
      .where(eq(schema.passwordResetCodes.staffUserId, abandonedId));
    expect(rowsLeft).toHaveLength(0);
  });
});

describe("verifyCode", () => {
  it("mã đúng thì hợp lệ, và dùng được ĐÚNG MỘT lần", async () => {
    const code = await createResetCode(ID);
    expect(await verifyCode(ID, code)).toEqual({ ok: true });
    // Không đánh dấu đã dùng thì cùng một mã mở được tài khoản nhiều lần —
    // kể cả sau khi nhân viên đã đổi xong mật khẩu.
    expect(await verifyCode(ID, code)).toEqual({ ok: false, reason: "CODE_EXPIRED" });
  });

  it("mã sai thì báo WRONG_CODE và tăng số lần thử đúng 1", async () => {
    await createResetCode(ID);
    expect(await verifyCode(ID, "000000")).toEqual({ ok: false, reason: "WRONG_CODE" });
    const [row] = await activeCodes(ID);
    // Khoá đúng con số, không chỉ "hàng có tồn tại": bộ đếm không tăng thì giới
    // hạn 5 lần là trang trí, và test "sai 5 lần thì mã chết" bên dưới sẽ xanh
    // vì lý do sai.
    expect(row?.attempts).toBe(1);
  });

  it("sai 5 lần thì mã chết kể cả sau đó nhập đúng", async () => {
    const code = await createResetCode(ID);
    for (let i = 0; i < 5; i++) {
      expect(await verifyCode(ID, "000000")).toEqual({ ok: false, reason: "WRONG_CODE" });
    }
    expect(await verifyCode(ID, code)).toEqual({ ok: false, reason: "CODE_EXPIRED" });
  });

  it("mã hết hạn thì không dùng được", async () => {
    const code = await createResetCode(ID);
    await db
      .update(schema.passwordResetCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(schema.passwordResetCodes.staffUserId, ID),
          isNull(schema.passwordResetCodes.usedAt),
        ),
      );
    expect(await verifyCode(ID, code)).toEqual({ ok: false, reason: "CODE_EXPIRED" });
  });

  it("không có mã nào thì báo hết hiệu lực, không phải crash", async () => {
    await db.delete(schema.passwordResetCodes).where(eq(schema.passwordResetCodes.staffUserId, ID));
    expect(await verifyCode(ID, "999999")).toEqual({ ok: false, reason: "CODE_EXPIRED" });
  });

  // ⚠️ TEST NÀY PHẢI SONG SONG. Test "sai 5 lần" ở trên đoán trong vòng `for`, tức
  // là tuần tự, và nó XANH kể cả trên bản code không chặn được gì: đo trên bản cũ,
  // tuần tự N=20 cho WRONG_CODE=5 (đúng) trong khi song song N=20 cho WRONG_CODE=20 và
  // attempts_cuoi=20 (giới hạn không tồn tại). Kẻ tấn công không có lý do gì phải
  // xếp hàng, nên hình dạng của test phải khớp hình dạng của cuộc tấn công.
  //
  // Cửa sổ bị khai thác là ~115ms của `Bun.password.verify` (argon2id) nằm GIỮA lúc
  // đọc `attempts` và lúc ghi nó. Mọi request vào trong cửa sổ đó đều đọc cùng một
  // giá trị cũ và đều đi qua cổng.
  it("bắn SONG SONG 20 lần đoán sai: nhiều nhất 5 lần được chấp nhận", async () => {
    const code = await createResetCode(ID);

    const results = await Promise.all(Array.from({ length: 20 }, () => verifyCode(ID, "000000")));
    const acceptedCount = results.filter((r) => !r.ok && r.reason === "WRONG_CODE").length;

    expect(acceptedCount).toBeLessThanOrEqual(5);
    // Chặn kiểu "trả CODE_EXPIRED cho tất cả" cũng thoả `<= 5` nhưng là hỏng
    // theo hướng khác: mã còn hạn, chưa dùng, phải cho đoán ít nhất một lần.
    expect(acceptedCount).toBeGreaterThan(0);
    // Và cơn bão phải THỰC SỰ giết mã, không chỉ đếm đẹp: sau đó mã ĐÚNG cũng chết.
    expect(await verifyCode(ID, code)).toEqual({ ok: false, reason: "CODE_EXPIRED" });
  });
});

describe("findStaffByEmail", () => {
  it("email không tồn tại thì null", async () => {
    expect(await findStaffByEmail(`${P}khong-co@v9.vn`)).toBeNull();
  });

  it("người DISABLED coi như không tồn tại", async () => {
    expect(await findStaffByEmail(EMAIL_DISABLED)).toBeNull();
  });

  // Nợ đã trả (docs/DEBT.md, "Email so sánh phân biệt hoa thường"):
  // `supertokens-node` chỉ `.trim()` form field, không hạ hoa thường, nên nhân
  // viên gõ khác hoa/thường lúc quên mật khẩu phải vẫn tìm ra được hồ sơ của
  // chính họ — không thì họ nhận một 200 chung chung và không bao giờ có mã.
  it("tìm ra được dù gõ khác hoa/thường so với lúc lưu", async () => {
    expect(await findStaffByEmail(EMAIL.toUpperCase())).toEqual({ id: ID });
  });

  // Vế còn lại của cùng nợ: tầng DB phải là hàng rào THẬT, không chỉ service so
  // `lower(...)` cho đẹp. `staff_users_email_lower_idx` (migration 0011) là
  // UNIQUE INDEX trên `lower(email)` — hai hồ sơ chỉ khác hoa/thường phải bị
  // Postgres từ chối ngay lúc INSERT, không phải thứ ứng dụng tự giác tránh.
  it("DB từ chối email trùng chỉ khác hoa/thường", async () => {
    let threw = false;
    try {
      await db.insert(schema.staffUsers).values({
        id: `${P}dup`,
        email: EMAIL.toUpperCase(),
        fullName: "Hồ sơ trùng email khác hoa thường",
        status: "ACTIVE",
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

/**
 * Nợ đã đóng (docs/DEBT.md, "Timing oracle ~190×"). Test này chạm tầng SERVICE
 * trực tiếp — KHÔNG qua HTTP — vì SMTP không cấu hình ở môi trường dev/CI:
 * `POST /staff/password-reset/request` trả `EMAIL_NOT_CONFIGURED` (503)
 * TRƯỚC khi làm bất cứ việc gì ở tầng service, nên đo qua route ở đây đo được
 * đúng hai số gần bằng nhau vì lý do sai — cả hai nhánh đều rẻ như nhau, chứ
 * không phải vì đã sửa đúng chỗ tốn kém. `requestPasswordReset` là hàm DUY
 * NHẤT chứa cả hai nhánh của oracle (xem comment đầy đủ ở `password-reset.ts`),
 * nên đo trực tiếp ở đây mới chứng minh được cái cần chứng minh.
 *
 * Số đo TRƯỚC khi sửa (script riêng, gọi service layer y hệt hình dạng cũ của
 * `routes/staff.ts` — `findStaffByEmail` rồi CÓ ĐIỀU KIỆN mới `createResetCode`
 * — 8 mẫu mỗi nhánh, cùng máy dev):
 *
 *   found (ms):    120.76 116.98 118.74 113.29 118.69 116.79 117.80 109.91
 *   notFound (ms):   2.38   2.44   2.41   2.44   2.32   2.42   2.26   2.39
 *   median found=117.4ms  notFound=2.4ms  tỉ lệ ≈ 48,9×
 *
 * (docs/DEBT.md ghi ~190× từ một lần đo khác, qua route thật trước khi route
 * đó có nhánh 503 sớm — chênh lệch tuyệt đối là do điểm đo/tải máy khác nhau,
 * không đổi bản chất: cả hai đo được đều lớn hơn ngưỡng chấp nhận được nhiều
 * bậc, và cả hai đều bắt nguồn từ đúng MỘT nguyên nhân — băm có điều kiện.)
 */
describe("requestPasswordReset — xoá timing oracle", () => {
  it("email có thật và email không tồn tại tốn thời gian XẤP XỈ NHAU", async () => {
    // 7 mẫu mỗi nhánh, XEN KẼ (found, notFound, found, notFound, ...) để một
    // đợt tải máy tăng/giảm giữa chừng ảnh hưởng ĐỀU lên cả hai nhánh thay vì
    // thiên vị nhánh chạy sau. Dùng MEDIAN, không phải mean — một mẫu ngoại lệ
    // (GC pause, context switch) không được kéo lệch cả kết luận.
    const N = 7;
    const foundMs: number[] = [];
    const notFoundMs: number[] = [];

    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      await requestPasswordReset(EMAIL);
      foundMs.push(performance.now() - t0);

      const t1 = performance.now();
      await requestPasswordReset(`${P}khong-ton-tai-timing-${String(i)}@v9.vn`);
      notFoundMs.push(performance.now() - t1);
    }

    const median = (xs: number[]): number => {
      const sorted = [...xs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const a = sorted[mid - 1];
      const b = sorted[mid];
      return sorted.length % 2 === 1 || a === undefined ? (b ?? 0) : (a + (b ?? a)) / 2;
    };

    const foundMedian = median(foundMs);
    const notFoundMedian = median(notFoundMs);
    const ratio = Math.max(foundMedian, notFoundMedian) / Math.min(foundMedian, notFoundMedian);

    // In ra để đọc được CON SỐ THẬT trong log CI, không chỉ pass/fail — cùng
    // tinh thần với các test đo lường khác trong file này.
    console.warn(
      `[timing] found median=${foundMedian.toFixed(2)}ms ` +
        `notFound median=${notFoundMedian.toFixed(2)}ms ratio=${ratio.toFixed(2)}x`,
    );

    // Ngưỡng 3× có biên độ rộng: sau khi sửa, argon2id (~115ms) chiếm áp đảo
    // CẢ HAI nhánh, dao động do tải máy chỉ còn vài phần trăm — không phải một
    // biên mong manh. 48,9× (đo trước khi sửa, xem comment ở describe) đứng
    // cách ngưỡng này hơn một bậc độ lớn.
    expect(ratio).toBeLessThan(3);
  }, 20_000);
});

describe("resetPasswordWithCode", () => {
  it("mã đúng: sinh token → đổi mật khẩu → thu hồi session, đúng thứ tự và đúng tham số", async () => {
    const code = await createResetCode(ID);
    const { deps, log, token } = spyDeps();

    expect(await resetPasswordWithCode(deps, EMAIL, code, "matkhaumoi-rat-dai")).toEqual({
      ok: true,
    });

    expect(log).toEqual([
      { name: "createResetToken", args: [ID, EMAIL] },
      { name: "resetPasswordWithToken", args: [token, "matkhaumoi-rat-dai"] },
      // Đổi mật khẩu mà không thu hồi session thì phiên trên máy kẻ đã chiếm
      // vẫn sống — nạn nhân đổi mật khẩu xong vẫn bị đọc trộm.
      { name: "revokeSessions", args: [ID] },
    ]);

    // ...nhưng `revokeSessions` MỘT MÌNH không đủ: nó giết refresh token, còn
    // access token đang cầm là JWT tự xác thực cục bộ nên sống tới khi hết hạn
    // (đo 2026-08-11: `/staff/me` với cookie cũ vẫn ra 200). Cái dấu dưới đây
    // mới là thứ `staff-guard` đọc để ngắt tức thì.
    expect((await loadStaff(ID))?.sessionsInvalidBefore).toBeInstanceOf(Date);
  });

  it("mã sai: trả WRONG_CODE và KHÔNG gọi deps nào cả", async () => {
    await createResetCode(ID);
    const { deps, log } = spyDeps();

    expect(await resetPasswordWithCode(deps, EMAIL, "000000", "matkhaumoi-rat-dai")).toEqual({
      ok: false,
      reason: "WRONG_CODE",
    });
    // Điểm quan trọng nhất của test này: gọi `createResetToken` TRƯỚC khi kiểm mã
    // là phát token đặt lại mật khẩu cho kẻ đang đoán mò sáu con số.
    expect(log).toEqual([]);
  });

  it("email không tồn tại: NOT_FOUND, không gọi deps nào", async () => {
    const { deps, log } = spyDeps();
    expect(
      await resetPasswordWithCode(deps, `${P}khong-co@v9.vn`, "999999", "matkhaumoi-rat-dai"),
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(log).toEqual([]);
  });

  it("người DISABLED: NOT_FOUND, không gọi deps nào", async () => {
    // Mã sinh ra trước khi bị khoá vẫn nằm trong DB — luồng quên mật khẩu không
    // được là đường để người bị khoá tự mở lại tài khoản.
    await createResetCode(ID_DISABLED);
    const { deps, log } = spyDeps();

    expect(
      await resetPasswordWithCode(deps, EMAIL_DISABLED, "999999", "matkhaumoi-rat-dai"),
    ).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect(log).toEqual([]);
  });
});

describe("changePassword", () => {
  const staff = { id: ID, email: EMAIL };

  it("mật khẩu mới trùng mật khẩu cũ: SAME_PASSWORD, KHÔNG gọi deps nào cả", async () => {
    const { deps, log } = spyDeps();

    // Điểm quan trọng nhất của test này: check này phải chạy TRƯỚC cả
    // `verifyPassword` (argon2id, ~115ms) lẫn bất cứ thứ gì có thể thu hồi
    // session. Đổi mật khẩu thành chính nó rồi đá người dùng ra ngoài là một
    // sự kiện gây hoang mang không cần thiết.
    expect(await changePassword(deps, staff, "matkhau-hien-tai", "matkhau-hien-tai")).toEqual({
      ok: false,
      reason: "SAME_PASSWORD",
    });
    expect(log).toEqual([]);
  });

  it("mật khẩu hiện tại sai: WRONG_CURRENT_PASSWORD, KHÔNG sinh reset token", async () => {
    const { deps, log } = spyDeps({ verifyStatus: "WRONG_CREDENTIALS_ERROR" });

    // Cùng lớp lỗi với test "mã sai: KHÔNG gọi deps nào cả" ở resetPasswordWithCode:
    // phát một credential đặt lại mật khẩu cho người vừa xác thực THẤT BẠI là sai
    // y hệt việc phát nó cho người đang đoán mò mã 6 số.
    expect(await changePassword(deps, staff, "mat-khau-sai", "matkhau-moi-rat-dai")).toEqual({
      ok: false,
      reason: "WRONG_CURRENT_PASSWORD",
    });
    expect(log).toEqual([{ name: "verifyPassword", args: [EMAIL, "mat-khau-sai"] }]);
  });

  it("mật khẩu hiện tại đúng: verify → sinh token → đổi mật khẩu → thu hồi session, đúng thứ tự", async () => {
    const { deps, log, token } = spyDeps();

    expect(await changePassword(deps, staff, "matkhau-hien-tai", "matkhau-moi-rat-dai")).toEqual({
      ok: true,
    });

    expect(log).toEqual([
      { name: "verifyPassword", args: [EMAIL, "matkhau-hien-tai"] },
      { name: "createResetToken", args: [ID, EMAIL] },
      { name: "resetPasswordWithToken", args: [token, "matkhau-moi-rat-dai"] },
      // Cùng lý do với resetPasswordWithCode: revokeSessions một mình chỉ giết
      // refresh token, access token đang cầm vẫn sống tới khi hết hạn.
      { name: "revokeSessions", args: [ID] },
    ]);

    // ...và cái dấu này mới là thứ ngắt access token đang cầm ngay lập tức —
    // xem comment ở test tương ứng của resetPasswordWithCode.
    expect((await loadStaff(ID))?.sessionsInvalidBefore).toBeInstanceOf(Date);
  });
});
