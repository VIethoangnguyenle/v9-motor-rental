import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { normalizePhone } from "@v9/shared/domain/phone";
import { eq, like, sql } from "drizzle-orm";
import { db } from "../db";
import {
  createCustomer,
  fullNameMatches,
  findCustomerByPhone,
  findCustomerById,
  listCustomers,
  searchCustomers,
  updateCustomer,
  CUSTOMERS_PAGE_SIZE_MAX,
} from "./customers";

// Tiền tố riêng để dọn sạch mà không đụng dữ liệu thật. Dọn ở CẢ hai đầu: afterAll
// không chạy khi lần trước bị Ctrl-C, và hàng sót lại làm assertion sai lệch.
const P = "ztest-kh-";
const PHONE = "0912000001";

async function clean() {
  // rentals đi TRƯỚC: nó có FK RESTRICT tới cả customers lẫn vehicles/staff_users
  // (dùng ở bộ test `listCustomers` — cần một đơn thật để đếm `rentalCount`).
  // Cùng thứ tự dọn với `services/rentals.test.ts`.
  await db.delete(schema.rentals).where(like(schema.rentals.createdBy, `${P}%`));
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

beforeAll(clean);
afterAll(clean);

describe("createCustomer", () => {
  it("chuẩn hoá số điện thoại trước khi ghi", async () => {
    const r = await createCustomer({ fullName: `${P}Mĩnh Anh`, phone: "+84 912 000 001" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.customer.phone).toBe(PHONE);
  });

  it("trả CUSTOMER_EXISTS kèm hồ sơ cũ khi trùng số, dù gõ khác dạng", async () => {
    const r = await createCustomer({ fullName: `${P}Mĩnh Anh lần hai`, phone: "0912.000.001" });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "CUSTOMER_EXISTS") {
      expect(r.existing.phone).toBe(PHONE);
      expect(r.existing.fullName).toBe(`${P}Mĩnh Anh`);
    } else {
      throw new Error(`mong đợi CUSTOMER_EXISTS, nhận được ${JSON.stringify(r)}`);
    }
  });

  it("từ chối số không dùng được", async () => {
    const r = await createCustomer({ fullName: `${P}Sai`, phone: "abc" });
    expect(r).toEqual({ ok: false, reason: "INVALID_PHONE" });
  });
});

describe("searchCustomers", () => {
  it("tìm được bằng số điện thoại gõ ở dạng khác", async () => {
    const rows = await searchCustomers("+84912000001");
    expect(rows.map((c) => c.phone)).toContain(PHONE);
  });

  it("tìm được bằng một phần tên", async () => {
    const rows = await searchCustomers(`${P}Mĩnh`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("gõ thường KHÔNG DẤU vẫn ra đúng hồ sơ", async () => {
    // Hồ sơ seed tên `${P}Mĩnh Anh`. Gõ `${P}minh` sai CẢ hoa/thường LẪN dấu,
    // nên test này đỏ với `LIKE` thô và đỏ cả với `ILIKE` — chỉ xanh khi tên
    // được bỏ dấu ở đường đọc. Đó là điều kiện để nó đo đúng thứ cần đo.
    const rows = await searchCustomers(`${P}minh`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("chuỗi rỗng trả về rỗng, không trả cả bảng", async () => {
    expect(await searchCustomers("   ")).toEqual([]);
  });
});

/**
 * Ô tìm của form lên đơn và ô tìm của màn danh sách là HAI hàm khác nhau. Hai
 * bản implement riêng cho cùng một phép khớp tên là hai câu trả lời khác nhau
 * cho cùng một từ khoá, và không ai biết bản nào đúng. Test này là hàng rào
 * duy nhất ép chúng đi chung một đường.
 */
describe("searchCustomers và listCustomers không được lệch nhau", () => {
  it("cùng từ khoá không dấu, cả hai đều tìm ra", async () => {
    const term = `${P}minh`;
    const fromSearch = await searchCustomers(term);
    const fromList = await listCustomers({ q: term });
    expect(fromSearch.length).toBeGreaterThan(0);
    expect(fromList.customers.length).toBeGreaterThan(0);
  });
});

describe("findCustomerByPhone", () => {
  it("trả null cho số không tồn tại", async () => {
    expect(await findCustomerByPhone("0999999999")).toBeNull();
  });
});

describe("findCustomerById", () => {
  it("trả đúng khách hàng theo id", async () => {
    const created = await createCustomer({ fullName: `${P}Tìm theo id`, phone: "0913000001" });
    if (!created.ok) throw new Error("seed hỏng");
    expect(await findCustomerById(created.customer.id)).toEqual(created.customer);
  });

  it("trả null cho id không tồn tại", async () => {
    expect(await findCustomerById(crypto.randomUUID())).toBeNull();
  });
});

describe("updateCustomer", () => {
  it("sửa tên/ghi chú, và CHUẨN HOÁ lại số dù gõ khác dạng của CHÍNH số cũ", async () => {
    const created = await createCustomer({ fullName: `${P}Sửa A`, phone: "0913000010" });
    if (!created.ok) throw new Error("seed hỏng");

    // Gõ lại CÙNG một số ở dạng khác — không được bị coi là trùng với CHÍNH MÌNH.
    const r = await updateCustomer(created.customer.id, {
      fullName: `${P}Sửa A đã đổi tên`,
      phone: "+84 913 000 010",
      note: "khách quen",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.customer.fullName).toBe(`${P}Sửa A đã đổi tên`);
      expect(r.customer.phone).toBe("0913000010");
      expect(r.customer.note).toBe("khách quen");
    }
  });

  it("đổi sang số của NGƯỜI KHÁC → 409 CUSTOMER_EXISTS kèm đúng hồ sơ kia", async () => {
    const a = await createCustomer({ fullName: `${P}Sửa B1`, phone: "0913000011" });
    const b = await createCustomer({ fullName: `${P}Sửa B2`, phone: "0913000012" });
    if (!a.ok || !b.ok) throw new Error("seed hỏng");

    const r = await updateCustomer(a.customer.id, {
      fullName: a.customer.fullName,
      phone: "0913000012",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "CUSTOMER_EXISTS") {
      expect(r.existing.id).toBe(b.customer.id);
      expect(r.existing.fullName).toBe(`${P}Sửa B2`);
    } else {
      throw new Error(`mong đợi CUSTOMER_EXISTS, nhận được ${JSON.stringify(r)}`);
    }
  });

  it("số không dùng được → INVALID_PHONE", async () => {
    const created = await createCustomer({ fullName: `${P}Sửa C`, phone: "0913000013" });
    if (!created.ok) throw new Error("seed hỏng");
    const r = await updateCustomer(created.customer.id, {
      fullName: created.customer.fullName,
      phone: "abc",
    });
    expect(r).toEqual({ ok: false, reason: "INVALID_PHONE" });
  });

  it("id không tồn tại → CUSTOMER_NOT_FOUND", async () => {
    const r = await updateCustomer(crypto.randomUUID(), {
      fullName: `${P}Không tồn tại`,
      phone: "0913000099",
    });
    expect(r).toEqual({ ok: false, reason: "CUSTOMER_NOT_FOUND" });
  });
});

describe("listCustomers", () => {
  it("q rỗng trả về MỘT TRANG khách hàng, KHÔNG rỗng — đảo ngược có chủ ý với searchCustomers", async () => {
    const created = await createCustomer({ fullName: `${P}Duyệt A`, phone: "0913000020" });
    if (!created.ok) throw new Error("seed hỏng");

    const r = await listCustomers({ q: "" });
    expect(r.customers.length).toBeGreaterThan(0);
    expect(r.customers.some((c) => c.id === created.customer.id)).toBe(true);
  });

  it("q lọc theo tên hoặc số, giống searchCustomers", async () => {
    const created = await createCustomer({ fullName: `${P}Lọc riêng`, phone: "0913000021" });
    if (!created.ok) throw new Error("seed hỏng");

    const r = await listCustomers({ q: `${P}Lọc riêng` });
    expect(r.customers.map((c) => c.id)).toEqual([created.customer.id]);
  });

  it("chặn trần pageSize thay vì cho gọi vượt — KHÔNG phải kéo hết một bảng lớn", async () => {
    const r = await listCustomers({ pageSize: 999 });
    expect(r.customers.length).toBeLessThanOrEqual(CUSTOMERS_PAGE_SIZE_MAX);
  });

  it("kèm đúng rentalCount cho từng khách — 0 khi chưa có đơn, đúng số khi có", async () => {
    const [vehicle] = await db
      .insert(schema.vehicles)
      .values({
        slug: `${P}xe-dem-don`,
        make: "Honda",
        model: "CB500X",
        engineCc: 471,
        pricePerDay: 500_000,
        deposit: 5_000_000,
      })
      .returning();
    const [staffRow] = await db
      .insert(schema.staffUsers)
      .values({
        id: `${P}nv-dem-don`,
        email: `${P}nv-dem-don@example.com`,
        fullName: "NV test đếm đơn",
        role: "OWNER",
        status: "ACTIVE",
      })
      .returning();
    const withRental = await createCustomer({ fullName: `${P}Đếm đơn`, phone: "0913000022" });
    const withoutRental = await createCustomer({
      fullName: `${P}Chưa có đơn`,
      phone: "0913000023",
    });
    if (!vehicle || !staffRow || !withRental.ok || !withoutRental.ok) throw new Error("seed hỏng");

    await db.insert(schema.rentals).values({
      vehicleId: vehicle.id,
      customerId: withRental.customer.id,
      createdBy: staffRow.id,
      startsAt: new Date("2026-08-01T00:00:00Z"),
      endsAt: new Date("2026-08-03T00:00:00Z"),
      totalAmount: 1_000_000,
      depositAmount: 0,
    });

    const r = await listCustomers({ q: P });
    const rowWith = r.customers.find((c) => c.id === withRental.customer.id);
    const rowWithout = r.customers.find((c) => c.id === withoutRental.customer.id);
    expect(rowWith?.rentalCount).toBe(1);
    expect(rowWithout?.rentalCount).toBe(0);
  });
});

/**
 * HÀNG RÀO THẬT cho hợp đồng ngầm giữa `normalizePhone` (@v9/shared) và
 * `CHECK customers_phone_normalized` (@v9/db). Hai regex ở hai package, và
 * KHÔNG có gì trong máy ép chúng khớp nhau.
 *
 * `phone.test.ts` không thay được test này: nó chỉ so `normalizePhone` với một
 * bản sao regex thứ ba nằm trong chính nó. `rentals-schema.test.ts` cũng không:
 * `eslint.config.js` cho element type `db` chỉ được import `db`.
 *
 * Chỗ này là chỗ DUY NHẤT hợp lệ — `api-services` được phép chạm cả hai — và
 * cũng là tầng thật sự ghi khách hàng.
 */
describe("parity: normalizePhone khớp CHECK của Postgres", () => {
  const SAMPLES = [
    "0912 345 678",
    "+84912345678",
    "84987654321",
    "0281234567",
    "0912345678",
    "abc",
    "",
    "12345",
    "1912345678",
    "091234567890123",
  ];

  it("thứ gì hàm chấp nhận thì DB chấp nhận, thứ gì hàm từ chối thì DB từ chối", async () => {
    for (const raw of SAMPLES) {
      const normalized = normalizePhone(raw);
      // Khi hàm từ chối, vẫn thử ghi chuỗi THÔ: đó đúng là thứ lọt xuống DB nếu
      // một ngày nào đó ai đó quên gọi normalizePhone ở tầng service.
      const candidate = normalized ?? raw;

      let dbAccepted: boolean;
      try {
        await db.insert(schema.customers).values({ fullName: `${P}parity`, phone: candidate });
        dbAccepted = true;
      } catch {
        dbAccepted = false;
      } finally {
        // Dọn ngay: nhiều mẫu chuẩn hoá về cùng một số, và UNIQUE(phone) sẽ làm
        // ca sau trượt vì lý do KHÔNG liên quan gì tới regex.
        await db.delete(schema.customers).where(eq(schema.customers.phone, candidate));
      }

      // So cả `raw` để thông báo lỗi chỉ thẳng chuỗi nào lệch.
      expect({ raw, dbAccepted }).toEqual({ raw, dbAccepted: normalized !== null });
    }
  });
});

/**
 * Index không được dùng còn TỆ HƠN không có index: tốn ghi, tốn dung lượng, và
 * tạo ảo giác đã tối ưu. Đây là bài học của migration 0011, và 0012 ghi thẳng
 * yêu cầu "biểu thức WHERE phải khớp CHÍNH XÁC biểu thức index".
 */
describe("customers_full_name_search_idx", () => {
  it("planner dùng được index cho biểu thức của fullNameMatches", async () => {
    // Dựng câu từ CHÍNH `fullNameMatches`, không chép lại biểu thức bằng tay:
    // một bản chép tay chỉ canh migration, và vẫn xanh sau khi ai đó sửa hàm
    // kia — tức là canh sai hướng. Hướng cần canh là hàm trôi khỏi index.
    const query = db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(fullNameMatches("nguyen"));

    const plan = await db.transaction(async (tx) => {
      // `enable_seqscan = off` vì bảng test nhỏ — planner luôn chọn seq scan ở
      // vài chục hàng dù index có tồn tại. Tắt seq scan biến câu hỏi thành
      // đúng thứ cần chứng minh: biểu thức trong WHERE có KHỚP biểu thức của
      // index không. Nếu lệch, planner không còn đường nào và vẫn phải seq
      // scan — đã kiểm bằng một biểu thức lệch cố ý, nó ra Seq Scan.
      //
      // PHẢI trong transaction: `SET LOCAL` ngoài transaction là lệnh RỖNG
      // (Postgres chỉ cảnh báo), nên gọi nó ở một `db.execute` riêng thì câu
      // EXPLAIN sau đó không hề bị ảnh hưởng và test đỏ vì lý do vớ vẩn.
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      return tx.execute(sql`EXPLAIN ${query.getSQL()}`);
    });

    expect(JSON.stringify(plan)).toContain("customers_full_name_search_idx");
  });
});
