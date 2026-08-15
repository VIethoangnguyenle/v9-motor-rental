import { schema } from "@v9/db";
import { normalizePhone } from "@v9/shared/domain/phone";
import { asc, eq, like, or } from "drizzle-orm";
import { db } from "../db";

export interface Customer {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly note: string | null;
}

export type CreateCustomerResult =
  | { ok: true; customer: Customer }
  | { ok: false; reason: "INVALID_PHONE" }
  /** Trả kèm `existing` để form dùng lại hồ sơ có sẵn thay vì bắt người nhập lại. */
  | { ok: false; reason: "CUSTOMER_EXISTS"; existing: Customer };

const COLUMNS = {
  id: schema.customers.id,
  fullName: schema.customers.fullName,
  phone: schema.customers.phone,
  note: schema.customers.note,
};

/** Tìm theo tên hoặc số điện thoại. `q` rỗng trả về danh sách rỗng, KHÔNG phải cả bảng. */
export async function searchCustomers(q: string): Promise<Customer[]> {
  const term = q.trim();
  if (term.length === 0) return [];

  // Chuẩn hoá ĐƯỜNG ĐỌC nữa, không chỉ đường ghi: người dùng gõ "+84912..." vào ô
  // tìm kiếm cũng phải ra đúng khách đó. Chỉ chuẩn hoá một đường là tạo ra hàng
  // không bao giờ tìm thấy — xem docs/DEBT.md, mục email phân biệt hoa thường.
  const asPhone = normalizePhone(term);

  return db
    .select(COLUMNS)
    .from(schema.customers)
    .where(
      asPhone
        ? or(eq(schema.customers.phone, asPhone), like(schema.customers.fullName, `%${term}%`))
        : like(schema.customers.fullName, `%${term}%`),
    )
    .orderBy(asc(schema.customers.fullName))
    .limit(20);
}

export async function findCustomerByPhone(rawPhone: string): Promise<Customer | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const [row] = await db
    .select(COLUMNS)
    .from(schema.customers)
    .where(eq(schema.customers.phone, phone))
    .limit(1);
  return row ?? null;
}

export async function createCustomer(input: {
  fullName: string;
  phone: string;
  note?: string | null;
}): Promise<CreateCustomerResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, reason: "INVALID_PHONE" };

  const existing = await findCustomerByPhone(phone);
  if (existing) return { ok: false, reason: "CUSTOMER_EXISTS", existing };

  const [row] = await db
    .insert(schema.customers)
    .values({ fullName: input.fullName.trim(), phone, note: input.note ?? null })
    .returning(COLUMNS);

  if (!row) throw new Error("INSERT customers không trả về hàng nào");
  return { ok: true, customer: row };
}
