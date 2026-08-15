import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import { createRental } from "./rentals";

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
