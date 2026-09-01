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
  it("cùng từ khoá không dấu, hai hàm trả về ĐÚNG CÙNG một tập hồ sơ", async () => {
    // So TẬP `id`, không so `length > 0` cho từng bên: bản cũ vẫn xanh khi hai
    // hàm lệch thành hai tập KHÁC NHAU mà đều không rỗng — đúng cái nó sinh ra
    // để chặn.
    //
    // Hồ sơ MỒI dưới đây là thứ làm phép so đó có răng. Không có nó, ở thời
    // điểm này bảng `customers` chỉ có đúng một hàng (`${P}Mĩnh Anh`), nên một
    // `listCustomers` bỏ quên hẳn mệnh đề lọc vẫn trả về đúng một hàng đó và
    // hai tập vẫn bằng nhau — đã đo bằng cách xoá `where` khỏi `listCustomers`:
    // test vẫn xanh. Hồ sơ mồi KHÔNG khớp `${P}minh`, nên hễ đường lọc của hai
    // hàm lệch nhau là nó lọt vào đúng một bên và hai tập khác nhau ngay.
    //
    // ⚠️ Từ khoá phải đủ HẸP để dưới 20 hồ sơ khớp: `searchCustomers` có
    // `.limit(20)` còn `listCustomers` phân trang, nên vượt ngưỡng đó thì hai
    // tập lệch nhau một cách HỢP LỆ và test đỏ vì lý do sai. `${P}minh` hôm nay
    // chỉ khớp `${P}Mĩnh Anh`; đừng nới nó thành `P` trần.
    const decoy = await createCustomer({ fullName: `${P}Hồ sơ mồi`, phone: "0913000040" });
    if (!decoy.ok) throw new Error("seed hỏng");

    const term = `${P}minh`;
    const fromSearch = await searchCustomers(term);
    const fromList = await listCustomers({ q: term });
    const idsFromSearch = fromSearch.map((c) => c.id).sort();
    const idsFromList = fromList.customers.map((c) => c.id).sort();
    expect(idsFromSearch.length).toBeGreaterThan(0);
    expect(idsFromSearch).not.toContain(decoy.customer.id);
    expect(idsFromSearch).toEqual(idsFromList);
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
 * Hai câu hỏi duy nhất khiến nhân viên mở màn Khách hàng giữa ca làm: khách này
 * đang giữ xe nào, và có hay trả trễ không. Cả hai SUY RA từ `rentals` lúc đọc —
 * không cột lưu sẵn, không trigger — nên bộ test này là chỗ duy nhất chứng minh
 * luật chọn `activeRental` đúng như đã khai trong `CustomerListRow`.
 */
describe("listCustomers — tín hiệu vận hành", () => {
  // Ba xe RIÊNG, không phải một: `rentals_no_overlap` là EXCLUDE trên
  // (`vehicle_id`, `period`), nên một khách giữ nhiều xe CÙNG LÚC — đúng ca mà
  // luật "ONGOING có ends_at sớm nhất" sinh ra để xử lý — chỉ dựng được khi các
  // đơn nằm trên các xe khác nhau.
  let holding: { id: string; ongoingSoonId: string; bookedId: string };
  let bookedOnly: { id: string; nearestId: string };
  let lateReturner: { id: string };

  async function seedVehicle(slug: string) {
    const [v] = await db
      .insert(schema.vehicles)
      .values({
        slug,
        make: "Honda",
        model: "CB500X",
        engineCc: 471,
        pricePerDay: 500_000,
        deposit: 5_000_000,
      })
      .returning();
    if (!v) throw new Error("seed xe hỏng");
    return v.id;
  }

  beforeAll(async () => {
    const [a, b, c] = await Promise.all([
      seedVehicle(`${P}xe-tin-hieu-1`),
      seedVehicle(`${P}xe-tin-hieu-2`),
      seedVehicle(`${P}xe-tin-hieu-3`),
    ]);
    const [staffRow] = await db
      .insert(schema.staffUsers)
      .values({
        id: `${P}nv-tin-hieu`,
        email: `${P}nv-tin-hieu@example.com`,
        fullName: "NV test tín hiệu",
        role: "OWNER",
        status: "ACTIVE",
      })
      .returning();
    const x = await createCustomer({ fullName: `${P}Đang giữ xe`, phone: "0913000030" });
    const y = await createCustomer({ fullName: `${P}Chỉ đặt trước`, phone: "0913000031" });
    const z = await createCustomer({ fullName: `${P}Trả trễ`, phone: "0913000032" });
    if (!a || !b || !c || !staffRow || !x.ok || !y.ok || !z.ok) throw new Error("seed hỏng");

    const base = { createdBy: staffRow.id, totalAmount: 1_000_000, depositAmount: 0 };

    // Khách X: HAI đơn ONGOING (hai xe khác nhau) cộng một đơn BOOKED bắt đầu
    // SỚM HƠN cả hai. Nếu luật ưu tiên sai thì đơn BOOKED này thắng — đó là lý
    // do nó có mặt.
    //
    // Hai đơn ONGOING được xếp để `starts_at` và `ends_at` cho hai câu trả lời
    // NGƯỢC NHAU: đơn bắt đầu sớm hơn lại kết thúc muộn hơn. Nhờ vậy test đỏ cả
    // khi ai đó đổi cột sắp thứ tự của nhánh ONGOING sang `starts_at` — nếu hai
    // đơn cùng `starts_at` thì phép so đó hoà và test xanh oan.
    const xRows = await db
      .insert(schema.rentals)
      .values([
        {
          ...base,
          vehicleId: a,
          customerId: x.customer.id,
          status: "ONGOING",
          startsAt: new Date("2026-09-01T00:00:00Z"), // bắt đầu SỚM hơn…
          endsAt: new Date("2026-09-20T00:00:00Z"), // …nhưng kết thúc MUỘN hơn
          handedOverAt: new Date("2026-09-01T00:00:00Z"),
        },
        {
          ...base,
          vehicleId: b,
          customerId: x.customer.id,
          status: "ONGOING",
          startsAt: new Date("2026-09-05T00:00:00Z"),
          endsAt: new Date("2026-09-10T00:00:00Z"), // ← sớm nhất, phải là đơn được chọn
          handedOverAt: new Date("2026-09-05T00:00:00Z"),
        },
        {
          ...base,
          vehicleId: c,
          customerId: x.customer.id,
          status: "BOOKED",
          startsAt: new Date("2026-09-02T00:00:00Z"),
          endsAt: new Date("2026-09-03T00:00:00Z"),
        },
      ])
      .returning({ id: schema.rentals.id, endsAt: schema.rentals.endsAt });

    // Khách Y: chỉ BOOKED. Cùng thủ thuật ngược chiều như hai đơn ONGOING ở
    // trên, đảo vai: đơn bắt đầu GẦN hơn lại kết thúc MUỘN hơn, nên sắp nhầm
    // theo `ends_at` là ra đơn kia. Hai đơn chồng thời gian nên phải nằm trên
    // HAI xe — `rentals_no_overlap` không cho chúng dùng chung một xe.
    //
    // Đơn nhập TRƯỚC lại bắt đầu MUỘN hơn, để test không thể xanh nhờ tình cờ
    // trùng thứ tự chèn.
    const yRows = await db
      .insert(schema.rentals)
      .values([
        {
          ...base,
          vehicleId: b,
          customerId: y.customer.id,
          status: "BOOKED",
          startsAt: new Date("2026-10-10T00:00:00Z"),
          endsAt: new Date("2026-10-12T00:00:00Z"),
        },
        {
          ...base,
          vehicleId: a,
          customerId: y.customer.id,
          status: "BOOKED",
          startsAt: new Date("2026-10-01T00:00:00Z"), // ← gần nhất, phải là đơn được chọn
          endsAt: new Date("2026-10-30T00:00:00Z"),
        },
      ])
      .returning({ id: schema.rentals.id, startsAt: schema.rentals.startsAt });

    // Khách Z: hai đơn trả TRỄ, một đơn trả ĐÚNG HẠN (`returned_at = ends_at`,
    // không phải `>` — biên chặt là chỗ dễ đếm dôi một), và một đơn CANCELLED.
    // CANCELLED nằm chồng thời gian với đơn ONGOING của khách X trên cùng xe A
    // một cách CỐ Ý: `rentals_no_overlap` có `WHERE status <> 'CANCELLED'`, nên
    // hàng này còn kiểm luôn rằng giả định đó vẫn đúng.
    await db.insert(schema.rentals).values([
      {
        ...base,
        vehicleId: a,
        customerId: z.customer.id,
        status: "COMPLETED",
        startsAt: new Date("2026-07-01T00:00:00Z"),
        endsAt: new Date("2026-07-03T00:00:00Z"),
        handedOverAt: new Date("2026-07-01T00:00:00Z"),
        returnedAt: new Date("2026-07-05T00:00:00Z"), // trễ
      },
      {
        ...base,
        vehicleId: a,
        customerId: z.customer.id,
        status: "COMPLETED",
        startsAt: new Date("2026-07-10T00:00:00Z"),
        endsAt: new Date("2026-07-12T00:00:00Z"),
        handedOverAt: new Date("2026-07-10T00:00:00Z"),
        returnedAt: new Date("2026-07-12T00:00:00Z"), // ĐÚNG hạn, không tính
      },
      {
        ...base,
        vehicleId: a,
        customerId: z.customer.id,
        status: "COMPLETED",
        startsAt: new Date("2026-07-20T00:00:00Z"),
        endsAt: new Date("2026-07-22T00:00:00Z"),
        handedOverAt: new Date("2026-07-20T00:00:00Z"),
        returnedAt: new Date("2026-07-25T00:00:00Z"), // trễ
      },
      {
        ...base,
        vehicleId: a,
        customerId: z.customer.id,
        status: "CANCELLED",
        startsAt: new Date("2026-09-05T00:00:00Z"),
        endsAt: new Date("2026-09-06T00:00:00Z"),
      },
    ]);

    const ongoingSoon = xRows.find((r) => r.endsAt.toISOString().startsWith("2026-09-10"));
    const booked = xRows.find((r) => r.endsAt.toISOString().startsWith("2026-09-03"));
    const nearest = yRows.find((r) => r.startsAt.toISOString().startsWith("2026-10-01"));
    if (!ongoingSoon || !booked || !nearest) throw new Error("seed hỏng");
    holding = { id: x.customer.id, ongoingSoonId: ongoingSoon.id, bookedId: booked.id };
    bookedOnly = { id: y.customer.id, nearestId: nearest.id };
    lateReturner = { id: z.customer.id };
  });

  it("khách chưa có đơn thì activeRental null và lateReturnCount 0", async () => {
    const res = await listCustomers({ q: `${P}Minh` });
    const row = res.customers[0];
    expect(row).toBeDefined();
    expect(row?.activeRental).toBeNull();
    expect(row?.lateReturnCount).toBe(0);
  });

  it("có ONGOING thì chọn đơn ONGOING có ends_at SỚM NHẤT, không phải đơn BOOKED sắp bắt đầu", async () => {
    const res = await listCustomers({ q: `${P}Đang giữ xe` });
    const row = res.customers.find((c) => c.id === holding.id);
    expect(row?.activeRental?.id).toBe(holding.ongoingSoonId);
    expect(row?.activeRental?.id).not.toBe(holding.bookedId);
    expect(row?.activeRental?.status).toBe("ONGOING");
    expect(row?.activeRental?.endsAt).toEqual(new Date("2026-09-10T00:00:00Z"));
    expect(row?.rentalCount).toBe(3);
  });

  it("không có ONGOING thì chọn đơn BOOKED có starts_at GẦN NHẤT", async () => {
    const res = await listCustomers({ q: `${P}Chỉ đặt trước` });
    const row = res.customers.find((c) => c.id === bookedOnly.id);
    expect(row?.activeRental?.id).toBe(bookedOnly.nearestId);
    expect(row?.activeRental?.status).toBe("BOOKED");
    // `endsAt` của CHÍNH đơn được chọn — không phải `startsAt` đã dùng để xếp thứ tự.
    expect(row?.activeRental?.endsAt).toEqual(new Date("2026-10-30T00:00:00Z"));
  });

  it("COMPLETED và CANCELLED không bao giờ được chọn; lateReturnCount đếm returned_at > ends_at", async () => {
    const res = await listCustomers({ q: `${P}Trả trễ` });
    const row = res.customers.find((c) => c.id === lateReturner.id);
    expect(row?.activeRental).toBeNull();
    expect(row?.rentalCount).toBe(4);
    // 2 trễ, KHÔNG tính đơn trả đúng hạn (`returned_at = ends_at`) và đơn CANCELLED.
    expect(row?.lateReturnCount).toBe(2);
  });

  it("lateReturnCount là SỐ, không phải chuỗi bigint lọt qua biên Eden Treaty", async () => {
    // `count(*) FILTER (...)` trả `bigint`; quên `::int` thì driver đưa về chuỗi
    // và `toBe(2)` ở test trên vẫn đỏ — nhưng đỏ mơ hồ. Kiểm thẳng kiểu ở đây để
    // thông báo lỗi chỉ đúng chỗ.
    const res = await listCustomers({ q: `${P}Trả trễ` });
    const row = res.customers.find((c) => c.id === lateReturner.id);
    expect(typeof row?.lateReturnCount).toBe("number");
    expect(typeof row?.rentalCount).toBe("number");
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
