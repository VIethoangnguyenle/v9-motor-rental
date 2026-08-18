import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { RENTAL_STATUSES } from "@v9/shared/domain/rental";
import { eq, like } from "drizzle-orm";
import { client, db } from "../db";
import { changeRentalStatus, createRental, listRentalsInRange, MAX_RANGE_DAYS } from "./rentals";

const P = "ztest-thue-";
const AUG = (d: number) => new Date(`2026-08-${String(d).padStart(2, "0")}T00:00:00+07:00`);

let vehicleId: string;
let customerId: string;
let staffId: string;

async function clean() {
  // rentals đi TRƯỚC: nó có FK RESTRICT tới cả ba bảng kia.
  //
  // Lọc theo `created_by` chứ KHÔNG `delete(schema.rentals)` trần: `bun test`
  // chạy mọi file trong cùng một tiến trình và cùng một database dev, nên một câu
  // DELETE không điều kiện ở đây sẽ xoá luôn dữ liệu của file test khác — và triệu
  // chứng là "test kia thỉnh thoảng đỏ", tuỳ thứ tự chạy do Bun chọn.
  await db.delete(schema.rentals).where(like(schema.rentals.createdBy, `${P}%`));
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

beforeAll(async () => {
  await clean();
  const [v] = await db
    .insert(schema.vehicles)
    .values({
      slug: `${P}cb500x`,
      make: "Honda",
      model: "CB500X",
      engineCc: 471,
      pricePerDay: 500_000,
      deposit: 5_000_000,
    })
    .returning();
  const [c] = await db
    .insert(schema.customers)
    .values({ fullName: `${P}Minh Anh`, phone: "0912000101" })
    .returning();
  const [s] = await db
    .insert(schema.staffUsers)
    .values({
      id: `${P}owner`,
      email: `${P}owner@example.com`,
      fullName: "Chủ shop test",
      role: "OWNER",
      status: "ACTIVE",
    })
    .returning();
  if (!v || !c || !s) throw new Error("seed hỏng");
  vehicleId = v.id;
  customerId = c.id;
  staffId = s.id;
});

afterAll(clean);

describe("createRental", () => {
  it("tạo được đơn đầu tiên, mặc định BOOKED", async () => {
    const r = await createRental({
      vehicleId,
      customerId,
      startsAt: AUG(12),
      endsAt: AUG(17),
      totalAmount: 2_500_000,
      depositAmount: 5_000_000,
      createdBy: staffId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rental.status).toBe("BOOKED");
      expect(r.rental.handedOverAt).toBeNull();
    }
  });

  // Test này là lý do cả file tồn tại. Nếu `isOverlapViolation` đọc `.code` thay
  // vì `.errno`, exception bay ra ngoài và test đỏ ở đây — chứ không phải rơi ra
  // 500 trên production vào một ngày đông khách.
  it("trả RENTAL_OVERLAP (không throw) khi chồng lịch cùng xe", async () => {
    const r = await createRental({
      vehicleId,
      customerId,
      startsAt: AUG(15),
      endsAt: AUG(20),
      totalAmount: 2_500_000,
      depositAmount: 5_000_000,
      createdBy: staffId,
    });
    expect(r).toEqual({ ok: false, reason: "RENTAL_OVERLAP" });
  });

  it("cho phép đơn chạm biên", async () => {
    const r = await createRental({
      vehicleId,
      customerId,
      startsAt: AUG(17),
      endsAt: AUG(20),
      totalAmount: 1_500_000,
      depositAmount: 5_000_000,
      createdBy: staffId,
    });
    expect(r.ok).toBe(true);
  });

  // Lỗi KHÔNG phải chồng lịch phải được ném ra nguyên vẹn, không bị nuốt thành
  // RENTAL_OVERLAP: một FK sai mà bị báo là "xe đã có đơn" gửi người dùng đi
  // sửa nhầm chỗ.
  //
  // Viết bằng try/catch trần thay vì `expect(...).rejects.toThrow()`: type của
  // `.rejects` trong bun-types@1.3.10 khai là `Matchers<unknown>` đồng bộ, không
  // phải Promise, nên `await expect(...).rejects...` bị `@typescript-eslint/
  // await-thenable` báo lỗi (đúng lớp linter mà repo chọn ESLint để có) dù chạy
  // đúng lúc runtime. try/catch né được hoàn toàn kiểu sai đó.
  it("ném nguyên lỗi cho vi phạm khác — không nuốt thành RENTAL_OVERLAP", async () => {
    let threw = false;
    try {
      await createRental({
        vehicleId: crypto.randomUUID(), // xe không tồn tại → vi phạm khoá ngoại
        customerId,
        startsAt: AUG(25),
        endsAt: AUG(27),
        totalAmount: 1_000_000,
        depositAmount: 0,
        createdBy: staffId,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("listRentalsInRange", () => {
  /**
   * `listRentalsInRange` CỐ Ý không lọc — nó là truy vấn lịch, phải thấy MỌI đơn.
   * Đây là ảnh gương của nợ vừa sửa ở `stats.test.ts`: ở đó test xoá sạch dữ liệu
   * thật; ở đây dữ liệu thật (một đơn ai đó tạo qua UI trong đúng tháng 8/2026 mà
   * các test này chạy) làm assertion đếm-tuyệt-đối của TEST sai, không phải code sai.
   *
   * Khoanh kết quả về đúng xe `ztest-thue-` của file này trước khi đếm: "đúng một
   * đơn CỦA TÔI rơi vào cửa sổ này" vẫn là assertion có ý nghĩa; "đúng một đơn tồn
   * tại trên đời" thì chưa từng đúng — vehicleId là con dao khoanh vùng rẻ nhất vì
   * fixture của file này luôn dùng chung một xe, còn đơn thật của người khác gần
   * như chắc chắn nằm trên xe khác.
   */
  const mine = <T extends { vehicleId: string }>(rentals: T[]): T[] =>
    rentals.filter((r) => r.vehicleId === vehicleId);

  it("trả đơn giao với khoảng, kèm tên khách", async () => {
    const r = await listRentalsInRange(AUG(14), AUG(16));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const mineRentals = mine(r.rentals);
      expect(mineRentals.length).toBeGreaterThan(0);
      expect(mineRentals[0]?.customerName).toBe(`${P}Minh Anh`);
    }
  });

  it("KHÔNG trả đơn của TÔI nằm ngoài khoảng", async () => {
    const r = await listRentalsInRange(AUG(1), AUG(5));
    expect(r.ok).toBe(true);
    if (r.ok) expect(mine(r.rentals)).toEqual([]);
  });

  // Đơn 12→17 và cửa sổ [17, 20) chạm nhau tại 17 — biên [) nên KHÔNG giao.
  // Đơn 17→20 (tạo ở test trên) thì có. Vậy cửa sổ này phải trả đúng một đơn CỦA TÔI.
  it("đơn chạm biên trái của cửa sổ thì không tính là giao nhau", async () => {
    const r = await listRentalsInRange(AUG(17), AUG(20));
    expect(r.ok).toBe(true);
    if (r.ok) expect(mine(r.rentals)).toHaveLength(1);
  });

  /**
   * Biên PHẢI của cửa sổ, ca mà bộ test cũ bỏ sót.
   *
   * Ca "chạm biên trái" ở trên KHÔNG canh được điều này: `period` của đơn do cột
   * sinh cố định ở `'[)'`, nên không hoán vị ngoặc nào của cửa sổ làm nó đổi kết
   * quả. Chỗ dấu ngoặc thật sự có tác dụng là đây — đơn bắt đầu ĐÚNG LÚC cửa sổ
   * kết thúc:
   *
   *   tstzrange(20,22,'[)') && tstzrange(17,20,'[)')  ->  f   (đúng)
   *   tstzrange(20,22,'[)') && tstzrange(17,20,'[]')  ->  t   (sai)
   *
   * Đổi `'[)'` thành `'[]'` trong truy vấn làm test này đỏ, và nó là test DUY
   * NHẤT làm được thế.
   */
  it("đơn bắt đầu đúng lúc cửa sổ kết thúc thì KHÔNG lọt vào", async () => {
    const [outside] = await db
      .insert(schema.rentals)
      .values({
        vehicleId,
        customerId,
        createdBy: staffId,
        startsAt: AUG(20),
        endsAt: AUG(22),
        totalAmount: 1,
        depositAmount: 0,
      })
      .returning();
    expect(outside).toBeDefined();

    const r = await listRentalsInRange(AUG(17), AUG(20));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rentals.some((x) => x.id === outside?.id)).toBe(false);
  });

  it("từ chối khoảng vượt trần thay vì cắt bớt trong im lặng", async () => {
    const from = AUG(1);
    const to = new Date(from.getTime() + (MAX_RANGE_DAYS + 1) * 86_400_000);
    expect(await listRentalsInRange(from, to)).toEqual({ ok: false, reason: "INVALID_RANGE" });
  });

  it("từ chối khoảng ngược và khoảng rỗng", async () => {
    expect(await listRentalsInRange(AUG(20), AUG(10))).toEqual({
      ok: false,
      reason: "INVALID_RANGE",
    });
    expect(await listRentalsInRange(AUG(10), AUG(10))).toEqual({
      ok: false,
      reason: "INVALID_RANGE",
    });
  });

  // Đơn đã huỷ không chặn chỗ ở tầng DB, nên nó cũng không được hiện trên lịch.
  it("KHÔNG trả đơn đã huỷ", async () => {
    const [cancelled] = await db
      .insert(schema.rentals)
      .values({
        vehicleId,
        customerId,
        createdBy: staffId,
        startsAt: AUG(12),
        endsAt: AUG(17),
        totalAmount: 1,
        depositAmount: 0,
        status: "CANCELLED",
      })
      .returning();
    expect(cancelled).toBeDefined();

    const r = await listRentalsInRange(AUG(13), AUG(14));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rentals.some((x) => x.id === cancelled?.id)).toBe(false);
  });
});

describe("changeRentalStatus", () => {
  const NOW = new Date("2026-08-15T03:00:00Z");

  /** Tạo một đơn mới ở khoảng chưa ai dùng, trả về id. */
  async function freshRental(startDay: number, endDay: number): Promise<string> {
    const r = await createRental({
      vehicleId,
      customerId,
      startsAt: AUG(startDay),
      endsAt: AUG(endDay),
      totalAmount: 1_000_000,
      depositAmount: 0,
      createdBy: staffId,
    });
    if (!r.ok) throw new Error(`seed hỏng: ${r.reason}`);
    return r.rental.id;
  }

  it("BOOKED → ONGOING đóng dấu handed_over_at", async () => {
    const id = await freshRental(25, 27);
    const r = await changeRentalStatus(id, "ONGOING", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rental.status).toBe("ONGOING");
      expect(r.rental.handedOverAt?.toISOString()).toBe(NOW.toISOString());
      expect(r.rental.returnedAt).toBeNull();
    }
  });

  it("ONGOING → COMPLETED đóng dấu returned_at, giữ nguyên handed_over_at", async () => {
    const id = await freshRental(28, 30);
    const started = await changeRentalStatus(id, "ONGOING", NOW);
    expect(started.ok).toBe(true);

    const later = new Date(NOW.getTime() + 3_600_000);
    const r = await changeRentalStatus(id, "COMPLETED", later);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rental.status).toBe("COMPLETED");
      expect(r.rental.handedOverAt?.toISOString()).toBe(NOW.toISOString());
      expect(r.rental.returnedAt?.toISOString()).toBe(later.toISOString());
    }
  });

  it("từ chối đường chuyển không hợp lệ, KHÔNG đụng vào DB", async () => {
    const id = await freshRental(1, 3);
    const r = await changeRentalStatus(id, "COMPLETED", NOW);
    expect(r).toEqual({ ok: false, reason: "INVALID_TRANSITION" });

    const [after] = await db
      .select({ status: schema.rentals.status, handedOverAt: schema.rentals.handedOverAt })
      .from(schema.rentals)
      .where(eq(schema.rentals.id, id))
      .limit(1);
    expect(after?.status).toBe("BOOKED");
    expect(after?.handedOverAt).toBeNull();
  });

  it("trả NOT_FOUND cho id không tồn tại", async () => {
    const r = await changeRentalStatus(crypto.randomUUID(), "ONGOING", NOW);
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

/**
 * HÀNG RÀO THẬT cho hợp đồng ngầm giữa `RENTAL_STATUSES` (@v9/shared) và
 * `CHECK rentals_status_valid` (@v9/db, migration 0009). Bốn literal này sống ở
 * BA nơi — DB, domain, TypeBox schema ở `routes/rentals.ts` — và chỉ hai bản
 * sau được ép ở tầng kiểu (`StatusSetsMatch` trong file đó, so trực tiếp
 * `RentalStatus` với `Static<typeof statusSchema>`). Bản trong DB thì không có
 * gì ép: thêm một trạng thái vào domain mà quên migration làm `INSERT` chết lúc
 * CHẠY, không phải lúc biên dịch.
 *
 * Chỗ này là chỗ HỢP LỆ duy nhất để viết bài test này, cùng lý do
 * `customers.test.ts` đang giữ parity test cho regex số điện thoại: bảng
 * `packages/db` (`element type "db"`) chỉ được import `db` theo
 * `eslint.config.js` — không import được `@v9/shared`. `apps/api/src/services`
 * (`element type "api-services"`) là element type DUY NHẤT được phép chạm cả
 * `db` lẫn `shared-domain`.
 *
 * Đọc CHECK constraint TRỰC TIẾP từ Postgres đang chạy, không đọc lại file
 * migration: đọc file chỉ chứng minh migration NÓI gì, không chứng minh DB thật
 * sự ĐANG ép gì — hai thứ có thể lệch nếu migration `0009` từng bị sửa tay sau
 * khi đã áp, hoặc constraint bị `ALTER`/`DROP` ngoài luồng migration.
 */
describe("parity: CHECK rentals_status_valid khớp RENTAL_STATUSES", () => {
  it("tập giá trị Postgres cho phép đúng bằng RENTAL_STATUSES", async () => {
    const rows: { def: string }[] = await client`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'rentals_status_valid'`;

    const row = rows[0];
    if (!row) {
      throw new Error("không tìm thấy CHECK rentals_status_valid — constraint bị đổi tên hay xoá?");
    }

    // `pg_get_constraintdef` trả về dạng Postgres CHUẨN HOÁ lại, KHÔNG PHẢI
    // nguyên văn SQL trong migration: `status IN ('BOOKED', ...)` viết tay trở
    // thành `status = ANY (ARRAY['BOOKED'::text, ...])` khi đọc lại từ
    // `pg_constraint`. Đã xác nhận bằng psql trước khi viết test này — xem báo
    // cáo task. Regex bên dưới bắt đúng dạng `'X'::text` bất kể thứ tự.
    const allowedInDb = [...row.def.matchAll(/'([^']*)'::text/g)].map((m) => m[1]).sort();
    const allowedInDomain = [...RENTAL_STATUSES].sort();

    expect(allowedInDb).toEqual(allowedInDomain);
  });
});
