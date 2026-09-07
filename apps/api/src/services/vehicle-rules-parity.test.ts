import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { checkVehicle, type VehicleDraft } from "@v9/shared/domain/vehicle";
import { eq, like } from "drizzle-orm";
import { db } from "../db";

/**
 * Neo `domain/vehicle.ts` vào hành vi THẬT của Postgres.
 *
 * Vì sao phải có file này: luật hợp lệ của một chiếc xe giờ sống ở HAI bản —
 * CHECK trong migration, và hàm thuần trong `packages/shared`. Hai bản của một
 * luật là hai thứ trôi được khỏi nhau, và không có gì bắt chúng khớp. Bản domain
 * sinh ra để `apps/staff` và Directus nói cùng một câu; nếu nó lệch khỏi thứ DB
 * thật sự làm thì ta chỉ đổi một chỗ-lệch-được thành ba chỗ-lệch-được.
 *
 * File nằm ở `apps/api` chứ không ở `packages/db` vì hàng rào kiến trúc:
 * `boundaries/dependencies` cho `db` import đúng `db`, nên một test ở đó không
 * với tới `@v9/shared` được. `apps/api` là tầng duy nhất ngồi trên CẢ HAI.
 *
 * ⚠️ Cần Postgres đang chạy, cùng điều kiện với `fleet.test.ts` và `stats.test.ts`.
 */

const P = "ztest-parity-";

const base: VehicleDraft = {
  slug: `${P}ok`,
  make: "Honda",
  model: "CB500X",
  engineCc: 471,
  pricePerDay: 500_000,
  deposit: 5_000_000,
  status: "draft",
};

interface Case {
  readonly label: string;
  readonly draft: VehicleDraft;
  /**
   * Postgres có nhận hàng này không — khai TAY, không suy từ domain.
   *
   * Đây là điểm của cả file: chỗ nào `checkVehicle` từ chối mà cột này vẫn
   * `true` là chỗ DB KHÔNG phải bức tường, và luật ở domain là thứ duy nhất
   * đứng giữa. Những chỗ đó đều có `why` giải thích.
   */
  readonly pgAccepts: boolean;
  readonly why?: string;
}

const cases: readonly Case[] = [
  { label: "hợp lệ", draft: { ...base }, pgAccepts: true },
  {
    label: "hợp lệ — giá và cọc bằng 0",
    draft: { ...base, slug: `${P}zero`, pricePerDay: 0, deposit: 0 },
    pgAccepts: true,
  },
  {
    label: "hợp lệ — status published",
    draft: { ...base, slug: `${P}pub`, status: "published" },
    pgAccepts: true,
  },

  // ── Chỗ DB CÓ chặn: CHECK làm việc của nó ────────────────────────────────
  { label: "slug hoa", draft: { ...base, slug: `${P}BAD` }, pgAccepts: false },
  {
    label: "slug có khoảng trắng",
    draft: { ...base, slug: `${P}co khoang trang` },
    pgAccepts: false,
  },
  { label: "slug gạch đôi", draft: { ...base, slug: `${P}a--b` }, pgAccepts: false },
  { label: "engineCc = 0", draft: { ...base, slug: `${P}cc0`, engineCc: 0 }, pgAccepts: false },
  { label: "giá âm", draft: { ...base, slug: `${P}neg`, pricePerDay: -1 }, pgAccepts: false },
  { label: "cọc âm", draft: { ...base, slug: `${P}negdep`, deposit: -1 }, pgAccepts: false },
  {
    label: "status ngoài danh sách",
    draft: { ...base, slug: `${P}st`, status: "available" as never },
    pgAccepts: false,
  },

  // ── Chỗ DB KHÔNG chặn: domain là hàng rào duy nhất ───────────────────────
  {
    label: "make toàn khoảng trắng",
    draft: { ...base, slug: `${P}blank`, make: "   " },
    pgAccepts: true,
    why: "`make` ở DB chỉ NOT NULL, không có CHECK non-blank. Một chiếc xe tên '   ' hợp lệ về kiểu và vô nghĩa với người đọc.",
  },
  {
    label: "giá lẻ đồng — Postgres LÀM TRÒN, không từ chối",
    draft: { ...base, slug: `${P}frac`, pricePerDay: 500_000.5 },
    pgAccepts: true,
    why: "Cột là `integer` và số lẻ KHÔNG gây lỗi — nó bị làm tròn im lặng. Xem ca cuối file để biết tròn theo kiểu nào; câu trả lời không phải cái ai cũng đoán. Không CHECK nào bắt được, không cảnh báo nào phát ra. `Number.isInteger` ở domain là thứ DUY NHẤT đứng giữa.",
  },
];

/** `true` = Postgres nhận hàng này. */
async function postgresAccepts(draft: VehicleDraft): Promise<boolean> {
  try {
    await db.insert(schema.vehicles).values({
      slug: draft.slug,
      make: draft.make,
      model: draft.model,
      engineCc: draft.engineCc,
      pricePerDay: draft.pricePerDay,
      deposit: draft.deposit,
      status: draft.status,
    });
    return true;
  } catch {
    // Cố ý nuốt: câu hỏi ở đây là NHẬN hay TỪ CHỐI, không phải từ chối bằng mã
    // nào. `vehicles-schema.test.ts` mới là chỗ khẳng định TÊN constraint.
    return false;
  }
}

async function clean() {
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
}

beforeAll(clean);
afterAll(clean);

describe("domain/vehicle so với hành vi thật của Postgres", () => {
  for (const { label, draft, pgAccepts, why } of cases) {
    it(label, async () => {
      const accepted = await postgresAccepts(draft);

      // Bảng trên khai đúng thứ DB làm — nếu ca này đỏ thì hoặc migration đổi,
      // hoặc giả định về Postgres sai. Cả hai đều cần người đọc lại, không phải
      // sửa con số cho xanh.
      expect(accepted, why ?? "").toBe(pgAccepts);

      const rules = checkVehicle(draft);

      // Chiều BẮT BUỘC, không ngoại lệ: domain nói được thì DB phải nhận. Vỡ
      // chiều này nghĩa là form staff cho người dùng bấm Lưu rồi ném vào mặt họ
      // một lỗi Postgres thô — đúng cái cơ chế này sinh ra để dẹp.
      if (rules.length === 0) expect(accepted).toBe(true);

      // Chiều ngược lại KHÔNG bắt buộc, và `why` là chỗ ghi vì sao. Nhưng nếu
      // DB từ chối thì domain BẮT BUỘC phải từ chối trước — bằng không người
      // dùng đi qua form sạch rồi đâm vào tường.
      if (!accepted) expect(rules.length).toBeGreaterThan(0);
    });
  }

  /**
   * Ca này ghi lại một SỐ ĐO, không phải một suy luận — và số đo đó khác cả hai
   * phỏng đoán tự nhiên. Đo trên Postgres 17 + driver `Bun.SQL` (2026-09-07):
   *
   *   | đường đi                              | 500000.5 | 500001.5 | -1.5 |
   *   |---------------------------------------|----------|----------|------|
   *   | literal trong câu SQL: `500000.5::int`| 500001   | —        | —    |
   *   | THAM SỐ qua driver → cột `integer`    | 500000   | 500002   | -2   |
   *
   * Literal làm tròn NỬA LÊN (xa số 0). Tham số làm tròn NỬA VỀ SỐ CHẴN
   * (banker's) — 500000.5 xuống 500000, 500001.5 lên 500002, -1.5 xuống -2.
   * Cùng một giá trị, hai kết quả, tuỳ nó đi vào câu lệnh bằng đường nào. Mà
   * `roundVnd` ở `domain/money.ts` dùng `Math.round`, tức nửa-lên — chế độ THỨ BA.
   *
   * Kết luận thực dụng: đừng để số lẻ tới được tầng DB. Chặn ở domain, vì ba
   * tầng đang làm tròn theo ba kiểu và không tầng nào báo gì.
   */
  it("tiền lẻ bị đổi giá trị im lặng, và tròn về SỐ CHẴN chứ không phải nửa lên", async () => {
    const slug = `${P}round`;
    await db.delete(schema.vehicles).where(eq(schema.vehicles.slug, slug));
    await db
      .insert(schema.vehicles)
      .values({ ...base, slug, pricePerDay: 500_000.5, deposit: 5_000_001.5 });

    const [row] = await db
      .select({ pricePerDay: schema.vehicles.pricePerDay, deposit: schema.vehicles.deposit })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.slug, slug));

    // Không phải 500000.5, và cũng không phải một lỗi. Hai con số dưới đây khác
    // hướng nhau — đó chính là bằng chứng "nửa về số chẵn", chứ một mình
    // 500000→500000 thì không phân biệt được với phép cắt phần thập phân.
    expect(row?.pricePerDay).toBe(500_000);
    expect(row?.deposit).toBe(5_000_002);

    expect(checkVehicle({ ...base, slug, pricePerDay: 500_000.5 })).toContain("PRICE_NON_NEGATIVE");
  });
});
