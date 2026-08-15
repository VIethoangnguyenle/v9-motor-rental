import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { normalizePhone } from "@v9/shared/domain/phone";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { createCustomer, findCustomerByPhone, searchCustomers } from "./customers";

// Tiền tố riêng để dọn sạch mà không đụng dữ liệu thật. Dọn ở CẢ hai đầu: afterAll
// không chạy khi lần trước bị Ctrl-C, và hàng sót lại làm assertion sai lệch.
const P = "ztest-kh-";
const PHONE = "0912000001";

async function clean() {
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
}

beforeAll(clean);
afterAll(clean);

describe("createCustomer", () => {
  it("chuẩn hoá số điện thoại trước khi ghi", async () => {
    const r = await createCustomer({ fullName: `${P}Minh Anh`, phone: "+84 912 000 001" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.customer.phone).toBe(PHONE);
  });

  it("trả CUSTOMER_EXISTS kèm hồ sơ cũ khi trùng số, dù gõ khác dạng", async () => {
    const r = await createCustomer({ fullName: `${P}Minh Anh lần hai`, phone: "0912.000.001" });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "CUSTOMER_EXISTS") {
      expect(r.existing.phone).toBe(PHONE);
      expect(r.existing.fullName).toBe(`${P}Minh Anh`);
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
    const rows = await searchCustomers(`${P}Minh`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("chuỗi rỗng trả về rỗng, không trả cả bảng", async () => {
    expect(await searchCustomers("   ")).toEqual([]);
  });
});

describe("findCustomerByPhone", () => {
  it("trả null cho số không tồn tại", async () => {
    expect(await findCustomerByPhone("0999999999")).toBeNull();
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
