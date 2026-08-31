import { schema } from "@v9/db";
import { normalizePhone } from "@v9/shared/domain/phone";
import { asc, eq, inArray, or, sql } from "drizzle-orm";
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

export type UpdateCustomerResult =
  | { ok: true; customer: Customer }
  | { ok: false; reason: "INVALID_PHONE" }
  | { ok: false; reason: "CUSTOMER_EXISTS"; existing: Customer }
  | { ok: false; reason: "CUSTOMER_NOT_FOUND" };

const COLUMNS = {
  id: schema.customers.id,
  fullName: schema.customers.fullName,
  phone: schema.customers.phone,
  note: schema.customers.note,
};

/**
 * Khớp tên KHÔNG phân biệt hoa/thường, KHÔNG phân biệt dấu.
 *
 * MỘT hàm dùng cho CẢ `searchCustomers` (ô tìm tự động của form lên đơn) lẫn
 * `listCustomers` (màn danh sách). Hai bản riêng là hai kết quả khác nhau cho
 * cùng một từ khoá, và không ai biết bản nào đúng — đúng lớp lỗi mà comment ở
 * đầu `searchCustomers` đã cảnh báo về đường đọc/đường ghi.
 *
 * Biểu thức phải khớp CHÍNH XÁC index `customers_full_name_search_idx`
 * (migration 0012), nếu không planner bỏ qua index và câu này thành seq scan
 * im lặng. Test EXPLAIN ở customers.test.ts là thứ giữ hai bên khớp nhau.
 *
 * `f_unaccent` là STRICT: đầu vào NULL cho ra NULL, không phải khớp. Ở đây
 * `term` luôn là chuỗi nên không chạm phải, nhưng đừng đưa giá trị có thể NULL
 * vào nó.
 *
 * Từ khoá 1–2 ký tự KHÔNG dùng được index: `gin_trgm_ops` cần ít nhất một
 * trigram đầy đủ, nên câu rơi về seq scan. Đây là QUYẾT ĐỊNH chứ không phải
 * bỏ sót — kết quả vẫn đúng, chỉ tốn một lần quét rẻ ở quy mô một shop. Chặn
 * tìm kiếm ngắn sẽ làm ô tìm im lặng không trả gì khi nhân viên vừa gõ chữ
 * đầu, tệ hơn hẳn.
 *
 * Export CHỈ để test EXPLAIN dựng câu từ chính hàm này thay vì chép lại biểu
 * thức bằng tay — một bản chép tay sẽ vẫn xanh sau khi ai đó sửa hàm này, tức
 * là canh đúng cái hướng KHÔNG cần canh.
 */
export function fullNameMatches(term: string) {
  return sql`f_unaccent(lower(${schema.customers.fullName})) LIKE f_unaccent(lower(${`%${term}%`}))`;
}

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
        ? or(eq(schema.customers.phone, asPhone), fullNameMatches(term))
        : fullNameMatches(term),
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

/** Dùng cho màn chi tiết khách hàng — mở bằng URL `/customers/:id`, không đi qua tìm kiếm. */
export async function findCustomerById(id: string): Promise<Customer | null> {
  const [row] = await db
    .select(COLUMNS)
    .from(schema.customers)
    .where(eq(schema.customers.id, id))
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

/**
 * Sửa hồ sơ khách hàng (tên, số điện thoại, ghi chú) — dùng ở màn chi tiết
 * `/customers/:id`. Số điện thoại đi qua CÙNG `normalizePhone` với
 * `createCustomer`, không viết lại regex lần thứ tư (bản ghi ở @v9/shared,
 * bản CHECK ở @v9/db, bản test song song ở customers.test.ts — thêm một bản
 * nữa ở đây là đúng lỗi CLAUDE.md cảnh báo).
 *
 * Trùng số với NGƯỜI KHÁC vẫn là 409 CUSTOMER_EXISTS, y hệt lúc tạo mới; giữ
 * nguyên số cũ (không đổi số) thì KHÔNG được coi là trùng với CHÍNH MÌNH —
 * đó là lý do có `existing.id !== id` thay vì chặn mọi lần tìm thấy hàng.
 *
 * Check-rồi-ghi, không bọc transaction hay `SELECT ... FOR UPDATE`: cùng mức
 * rủi ro race với `createCustomer` (hai người sửa hai khách khác nhau VỀ CÙNG
 * một số điện thoại mới, cùng một khoảnh khắc) — hiếm ở một shop vài nhân
 * viên, và `createCustomer` cạnh nó cũng không phòng race này. Thêm phòng thủ
 * bất đối xứng ở một trong hai hàm song sinh là tạo ra hai cách xử lý khác
 * nhau cho cùng một loại rủi ro.
 */
export async function updateCustomer(
  id: string,
  input: { fullName: string; phone: string; note?: string | null },
): Promise<UpdateCustomerResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, reason: "INVALID_PHONE" };

  const existing = await findCustomerByPhone(phone);
  if (existing && existing.id !== id) return { ok: false, reason: "CUSTOMER_EXISTS", existing };

  const [row] = await db
    .update(schema.customers)
    .set({
      fullName: input.fullName.trim(),
      phone,
      note: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.customers.id, id))
    .returning(COLUMNS);

  if (!row) return { ok: false, reason: "CUSTOMER_NOT_FOUND" };
  return { ok: true, customer: row };
}

// ── Danh sách phân trang cho màn "Khách hàng" ───────────────────────────────
//
// `searchCustomers` ở trên phục vụ Ô TÌM TỰ ĐỘNG của form lên đơn: `q` rỗng →
// `[]`, để không đổ cả bảng vào một dropdown gõ-tới-đâu-tìm-tới-đó — hành vi
// đó PHẢI giữ nguyên, `rental-form.tsx` đang dựa vào nó.
//
// Màn danh sách khách hàng cần điều NGƯỢC LẠI: "q rỗng = xem hết", có phân
// trang, và mỗi dòng cần thêm `rentalCount` — một HÌNH DẠNG response khác hẳn
// (mảng trần vs. `{ customers, total }`). Vì hình dạng khác nhau, tách thành
// HÀM và ROUTE riêng (`GET /customers/list`, xem routes/rentals.ts) thay vì
// nhồi hai chế độ vào một endpoint bằng cờ ẩn trong query string — cách đó
// vẫn phải khai hai response schema cho cùng một route, phức tạp hơn mà không
// được gì.
//
// Bị CHẶN TRẦN ở `pageSize`: không có trần, một shop 12.000 khách có ngày ai
// đó (hoặc một client hỏng) gọi `pageSize=100000` và kéo cùng một câu SELECT
// từng chạy êm với 12 khách xuống.
export const CUSTOMERS_PAGE_SIZE_MAX = 50;
const CUSTOMERS_PAGE_SIZE_DEFAULT = 20;

export interface CustomerListRow extends Customer {
  readonly rentalCount: number;
}

export interface CustomerListResult {
  readonly customers: CustomerListRow[];
  readonly total: number;
}

export async function listCustomers(input: {
  q?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}): Promise<CustomerListResult> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    CUSTOMERS_PAGE_SIZE_MAX,
    Math.max(1, Math.trunc(input.pageSize ?? CUSTOMERS_PAGE_SIZE_DEFAULT)),
  );

  // Cùng chuẩn hoá đường ĐỌC với `searchCustomers` — gõ "+84912..." vào ô tìm
  // của màn danh sách cũng phải ra đúng người đó.
  const term = (input.q ?? "").trim();
  const asPhone = term ? normalizePhone(term) : null;
  const where = term
    ? asPhone
      ? or(eq(schema.customers.phone, asPhone), fullNameMatches(term))
      : fullNameMatches(term)
    : undefined; // KHÔNG lọc — đúng điểm khác biệt cố ý với searchCustomers.

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.customers)
    .where(where);
  const total = totalRow?.n ?? 0;

  const rows = await db
    .select(COLUMNS)
    .from(schema.customers)
    .where(where)
    .orderBy(asc(schema.customers.fullName))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  if (rows.length === 0) return { customers: [], total };

  // Đếm rental CHỈ cho đúng trang đang xem — không đếm cả bảng `rentals` cho
  // 12.000 khách để rồi vứt đi 11.980 kết quả không hiện ra màn hình.
  const counts = await db
    .select({ customerId: schema.rentals.customerId, n: sql<number>`count(*)::int` })
    .from(schema.rentals)
    .where(
      inArray(
        schema.rentals.customerId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(schema.rentals.customerId);
  const countByCustomer = new Map(counts.map((c) => [c.customerId, c.n]));

  return {
    customers: rows.map((r) => ({ ...r, rentalCount: countByCustomer.get(r.id) ?? 0 })),
    total,
  };
}
