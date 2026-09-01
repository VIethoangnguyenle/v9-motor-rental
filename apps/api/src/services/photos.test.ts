import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { MAX_PHOTO_BYTES } from "@v9/shared/domain/rental-photo";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { checkins } from "../storage";
import {
  addRentalPhoto,
  deleteRentalPhoto,
  listRentalPhotos,
  readRentalPhoto,
} from "./photos";
import { updateRentalHandover } from "./rentals";

const P = "ztest-anh-";

let rentalId: string;
let staffId: string;

/** 1×1 PNG thật, không phải byte ngẫu nhiên — để `Content-Type` khớp nội dung. */
const PNG_1PX = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
const png = () => PNG_1PX.slice().buffer;

async function clean() {
  // Xoá object trong MinIO TRƯỚC khi xoá hàng — sau khi xoá hàng thì không còn
  // `object_key` nào để biết phải dọn gì, và fixture sẽ để lại rác tích tụ qua
  // mỗi lần chạy test.
  const rows = await db
    .select({ objectKey: schema.rentalPhotos.objectKey })
    .from(schema.rentalPhotos)
    .innerJoin(schema.rentals, eq(schema.rentals.id, schema.rentalPhotos.rentalId))
    .where(like(schema.rentals.createdBy, `${P}%`));
  await Promise.all(rows.map((r) => checkins.delete(r.objectKey).catch(() => undefined)));

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
      pricePerDay: 450_000,
      deposit: 5_000_000,
    })
    .returning();
  const [c] = await db
    .insert(schema.customers)
    .values({ fullName: `${P}Khách`, phone: "0912777001" })
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
  staffId = s?.id ?? "";

  const [r] = await db
    .insert(schema.rentals)
    .values({
      vehicleId: v?.id ?? "",
      customerId: c?.id ?? "",
      startsAt: new Date("2026-11-01T00:00:00+07:00"),
      endsAt: new Date("2026-11-04T00:00:00+07:00"),
      totalAmount: 1_350_000,
      depositAmount: 5_000_000,
      createdBy: staffId,
    })
    .returning();
  rentalId = r?.id ?? "";
});

afterAll(clean);

const base = () => ({
  rentalId,
  kind: "HANDOVER" as const,
  contentType: "image/png",
  bytes: png(),
  uploadedBy: staffId,
});

describe("addRentalPhoto", () => {
  it("ghi được ảnh và trả metadata", async () => {
    const r = await addRentalPhoto(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.photo.kind).toBe("HANDOVER");
    expect(r.photo.sizeBytes).toBe(PNG_1PX.byteLength);
    expect(r.photo.uploadedBy).toBe(staffId);
  });

  /**
   * Đây là ca đắt nhất của cả file: byte phải THẬT SỰ nằm trong MinIO, không
   * chỉ có một hàng trong Postgres nói rằng nó nằm đó. Một service ghi hàng mà
   * quên ghi object vẫn qua được mọi test chỉ đọc Postgres.
   */
  it("byte thật sự nằm trong MinIO, đọc lại ra đúng nội dung", async () => {
    const r = await addRentalPhoto({ ...base(), kind: "RETURN" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const read = await readRentalPhoto(rentalId, r.photo.id);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const back = new Uint8Array(await new Response(read.stream).arrayBuffer());
    expect(back.byteLength).toBe(PNG_1PX.byteLength);
    expect(back[0]).toBe(0x89);
    expect(back[1]).toBe(0x50);
    expect(read.contentType).toBe("image/png");
  });

  it("từ chối định dạng không nhận, KHÔNG ghi gì", async () => {
    const before = (await listRentalPhotos(rentalId)).length;
    const r = await addRentalPhoto({ ...base(), contentType: "application/pdf" });
    expect(r).toEqual({ ok: false, reason: "PHOTO_TYPE_INVALID" });
    expect((await listRentalPhotos(rentalId)).length).toBe(before);
  });

  it("từ chối svg — là ảnh, nhưng chạy được script", async () => {
    const r = await addRentalPhoto({ ...base(), contentType: "image/svg+xml" });
    expect(r).toEqual({ ok: false, reason: "PHOTO_TYPE_INVALID" });
  });

  it("từ chối file rỗng và file quá trần", async () => {
    expect(await addRentalPhoto({ ...base(), bytes: new ArrayBuffer(0) })).toEqual({
      ok: false,
      reason: "PHOTO_SIZE_INVALID",
    });
    expect(
      await addRentalPhoto({ ...base(), bytes: new ArrayBuffer(MAX_PHOTO_BYTES + 1) }),
    ).toEqual({ ok: false, reason: "PHOTO_SIZE_INVALID" });
  });

  it("đơn không có thật trả RENTAL_NOT_FOUND chứ không ném lỗi FK", async () => {
    const r = await addRentalPhoto({
      ...base(),
      rentalId: "00000000-0000-4000-8000-000000000000",
    });
    expect(r).toEqual({ ok: false, reason: "RENTAL_NOT_FOUND" });
  });
});

describe("readRentalPhoto", () => {
  /**
   * `rentalId` trong chữ ký không phải trang trí: nó biến một tham chiếu trực
   * tiếp thành tham chiếu có ngữ cảnh. Id ảnh đúng nhưng gắn sai đơn thì không
   * đọc được.
   */
  it("id ảnh đúng nhưng SAI đơn thì không đọc được", async () => {
    const r = await addRentalPhoto(base());
    if (!r.ok) return;
    const read = await readRentalPhoto("00000000-0000-4000-8000-000000000000", r.photo.id);
    expect(read).toEqual({ ok: false, reason: "PHOTO_NOT_FOUND" });
  });
});

describe("deleteRentalPhoto", () => {
  it("xoá cả hàng lẫn object", async () => {
    const r = await addRentalPhoto({ ...base(), kind: "DOCUMENT" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db
      .select({ objectKey: schema.rentalPhotos.objectKey })
      .from(schema.rentalPhotos)
      .where(eq(schema.rentalPhotos.id, r.photo.id))
      .limit(1);
    const key = row?.objectKey ?? "";
    expect(await checkins.exists(key)).toBe(true);

    expect(await deleteRentalPhoto(rentalId, r.photo.id)).toEqual({ ok: true });

    // Cả hai kho, không chỉ một. Xoá hàng mà quên object là để lại ảnh CCCD của
    // một người thật nằm trong storage mà không truy vấn nào còn thấy.
    expect(await checkins.exists(key)).toBe(false);
    const after = await listRentalPhotos(rentalId);
    expect(after.some((p) => p.id === r.photo.id)).toBe(false);
  });

  it("xoá ảnh không có thật trả PHOTO_NOT_FOUND", async () => {
    expect(
      await deleteRentalPhoto(rentalId, "00000000-0000-4000-8000-000000000000"),
    ).toEqual({ ok: false, reason: "PHOTO_NOT_FOUND" });
  });

  it("id ảnh đúng nhưng SAI đơn thì không xoá được", async () => {
    const r = await addRentalPhoto(base());
    if (!r.ok) return;
    const del = await deleteRentalPhoto("00000000-0000-4000-8000-000000000000", r.photo.id);
    expect(del).toEqual({ ok: false, reason: "PHOTO_NOT_FOUND" });
    // và ảnh vẫn còn
    expect((await listRentalPhotos(rentalId)).some((p) => p.id === r.photo.id)).toBe(true);
  });
});

describe("listRentalPhotos", () => {
  it("nhóm theo loại, trong mỗi loại thì cũ trước", async () => {
    const rows = await listRentalPhotos(rentalId);
    const kinds = rows.map((r) => r.kind);
    expect([...kinds].sort()).toEqual(kinds);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      if (prev && cur && prev.kind === cur.kind) {
        expect(cur.createdAt.getTime()).toBeGreaterThanOrEqual(prev.createdAt.getTime());
      }
    }
  });

  it("không phơi `object_key` ra shape công khai", async () => {
    const [row] = await listRentalPhotos(rentalId);
    expect(row).toBeDefined();
    expect(row && "objectKey" in row).toBe(false);
  });
});

describe("updateRentalHandover", () => {
  it("ghi loại giấy tờ và địa chỉ giao xe — ba cột `0012` lần đầu có người ghi", async () => {
    const r = await updateRentalHandover(
      rentalId,
      { documentType: "CCCD", deliveryAddress: "Khách sạn Rex, Q1" },
      new Date(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rental.documentType).toBe("CCCD");
    expect(r.rental.deliveryAddress).toBe("Khách sạn Rex, Q1");
    expect(r.rental.documentReturnedAt).toBeNull();
  });

  it("lưu từng phần — không truyền trường nào thì trường đó giữ nguyên", async () => {
    await updateRentalHandover(rentalId, { documentType: "PASSPORT" }, new Date());
    const r = await updateRentalHandover(
      rentalId,
      { deliveryAddress: "Địa chỉ mới" },
      new Date(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Địa chỉ đổi, loại giấy tờ KHÔNG bị xoá theo — đây là điểm khác nhau giữa
    // "không truyền" (`undefined`) và "truyền null để xoá".
    expect(r.rental.documentType).toBe("PASSPORT");
    expect(r.rental.deliveryAddress).toBe("Địa chỉ mới");
  });

  it("truyền null thì XOÁ giá trị, khác hẳn với không truyền", async () => {
    await updateRentalHandover(rentalId, { documentType: "CCCD" }, new Date());
    const r = await updateRentalHandover(rentalId, { documentType: null }, new Date());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rental.documentType).toBeNull();
  });

  /**
   * Đây là ca canh CHECK `rentals_document_return_needs_type`. UI ẩn nút "đã trả
   * giấy tờ" khi chưa ghi loại — nhưng UI không phải hàng rào, và service phải
   * trả `reason` đọc được thay vì để lỗi Postgres thô nổi lên thành 500.
   */
  it("từ chối đánh dấu đã trả khi chưa biết giữ giấy gì", async () => {
    await updateRentalHandover(rentalId, { documentType: null }, new Date());
    const r = await updateRentalHandover(rentalId, { documentReturned: true }, new Date());
    expect(r).toEqual({ ok: false, reason: "DOCUMENT_RETURN_NEEDS_TYPE" });
  });

  it("cho phép ghi loại và đánh dấu đã trả trong CÙNG một lần lưu", async () => {
    await updateRentalHandover(rentalId, { documentType: null }, new Date());
    const now = new Date("2026-11-05T04:00:00Z");
    const r = await updateRentalHandover(
      rentalId,
      { documentType: "CCCD", documentReturned: true },
      now,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rental.documentReturnedAt).toEqual(now);
  });

  it("đơn không có thật trả RENTAL_NOT_FOUND", async () => {
    const r = await updateRentalHandover(
      "00000000-0000-4000-8000-000000000000",
      { documentType: "CCCD" },
      new Date(),
    );
    expect(r).toEqual({ ok: false, reason: "RENTAL_NOT_FOUND" });
  });
});
