import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import {
  changeRequestStatus,
  countNewRequests,
  createRentalRequest,
  listRentalRequests,
} from "./requests";

const P = "ztest-yeucau-";

let publishedSlug: string;
let draftSlug: string;
let staffId: string;

async function clean() {
  // rental_requests đi TRƯỚC: FK RESTRICT tới vehicles. Lọc theo tiền tố chứ
  // không DELETE trần — `bun test` chạy mọi file trong cùng một database dev,
  // và một câu DELETE không điều kiện ở đây làm đỏ file test khác theo thứ tự
  // Bun chọn. Cùng lý lẽ đã ghi ở `rentals.test.ts`.
  await db.delete(schema.rentalRequests).where(like(schema.rentalRequests.fullName, `${P}%`));
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

beforeAll(async () => {
  await clean();
  publishedSlug = `${P}cb500x`;
  draftSlug = `${P}nhap`;

  await db.insert(schema.vehicles).values([
    {
      slug: publishedSlug,
      make: "Honda",
      model: "CB500X",
      engineCc: 471,
      pricePerDay: 450_000,
      deposit: 5_000_000,
      status: "published",
    },
    {
      slug: draftSlug,
      make: "Yamaha",
      model: "MT-07",
      engineCc: 689,
      pricePerDay: 700_000,
      deposit: 7_000_000,
      status: "draft",
    },
  ]);

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
});

afterAll(clean);

const base = () => ({
  vehicleSlug: publishedSlug,
  fullName: `${P}Nguyễn Văn A`,
  phone: "0912000202",
  startDate: "2026-10-01",
  days: 3,
});

describe("createRentalRequest", () => {
  it("nhận yêu cầu cho xe đã published", async () => {
    const r = await createRentalRequest(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.status).toBe("NEW");
    expect(r.request.days).toBe(3);
    expect(r.request.startDate).toBe("2026-10-01");
  });

  it("chuẩn hoá số điện thoại như `customers` — cùng `normalizePhone`", async () => {
    const r = await createRentalRequest({ ...base(), phone: "+84 912 000 303" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.phone).toBe("0912000303");
  });

  it("từ chối số điện thoại không dùng được", async () => {
    const r = await createRentalRequest({ ...base(), phone: "abc" });
    expect(r).toEqual({ ok: false, reason: "INVALID_PHONE" });
  });

  /**
   * Xe `draft` trả CÙNG `reason` với xe không tồn tại. Đây là endpoint công khai:
   * phân biệt hai ca là nói cho người lạ biết trong database có chiếc xe đó
   * nhưng shop chưa đăng.
   */
  it("từ chối xe chưa published, cùng lý do với xe không tồn tại", async () => {
    const draft = await createRentalRequest({ ...base(), vehicleSlug: draftSlug });
    const missing = await createRentalRequest({ ...base(), vehicleSlug: `${P}khong-co` });
    expect(draft).toEqual({ ok: false, reason: "VEHICLE_NOT_AVAILABLE" });
    expect(missing).toEqual({ ok: false, reason: "VEHICLE_NOT_AVAILABLE" });
  });

  it("từ chối số ngày ngoài trần", async () => {
    expect(await createRentalRequest({ ...base(), days: 0 })).toEqual({
      ok: false,
      reason: "INVALID_DAYS",
    });
    expect(await createRentalRequest({ ...base(), days: 93 })).toEqual({
      ok: false,
      reason: "INVALID_DAYS",
    });
  });

  /**
   * ⚠️ Ca này là lý do bảng `rental_requests` cố ý KHÔNG có exclusion constraint.
   * `apps/web` không đọc availability, nên hai khách xin cùng một xe cùng một
   * khoảng ngày là chuyện bình thường — chặn ở đây là dạy database một điều web
   * không biết, và khách thứ hai bị từ chối bằng lỗi không ai giải thích được.
   */
  it("CHO PHÉP hai yêu cầu trùng xe trùng ngày — web không biết xe còn trống", async () => {
    const a = await createRentalRequest({ ...base(), phone: "0912000404" });
    const b = await createRentalRequest({ ...base(), phone: "0912000505" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});

describe("changeRequestStatus", () => {
  it("NEW → CONTACTED đóng dấu ai xử lý và lúc nào", async () => {
    const created = await createRentalRequest({ ...base(), phone: "0912000606" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const now = new Date("2026-09-15T03:00:00Z");
    const r = await changeRequestStatus(created.request.id, "CONTACTED", staffId, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.status).toBe("CONTACTED");
    expect(r.request.handledBy).toBe(staffId);
    expect(r.request.handledAt).toEqual(now);
  });

  it("từ chối đường đi lùi", async () => {
    const created = await createRentalRequest({ ...base(), phone: "0912000707" });
    if (!created.ok) return;
    await changeRequestStatus(created.request.id, "CONTACTED", staffId, new Date());
    const back = await changeRequestStatus(created.request.id, "NEW", staffId, new Date());
    expect(back).toEqual({ ok: false, reason: "INVALID_REQUEST_TRANSITION" });
  });

  it("id không có thật trả REQUEST_NOT_FOUND, không ném", async () => {
    const r = await changeRequestStatus(
      "00000000-0000-4000-8000-000000000000",
      "CONTACTED",
      staffId,
      new Date(),
    );
    expect(r).toEqual({ ok: false, reason: "REQUEST_NOT_FOUND" });
  });
});

describe("listRentalRequests", () => {
  it("kèm tên xe — màn tiếp nhận không dùng được `vehicle_id` trần", async () => {
    await createRentalRequest({ ...base(), phone: "0912000808" });
    const rows = await listRentalRequests("NEW");
    const mine = rows.filter((r) => r.fullName.startsWith(P));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]?.vehicleMake).toBe("Honda");
    expect(mine[0]?.vehicleSlug).toBe(publishedSlug);
  });

  it("lọc theo trạng thái", async () => {
    const created = await createRentalRequest({ ...base(), phone: "0912000909" });
    if (!created.ok) return;
    await changeRequestStatus(created.request.id, "CLOSED", staffId, new Date());

    const closed = await listRentalRequests("CLOSED");
    expect(closed.some((r) => r.id === created.request.id)).toBe(true);

    const isNew = await listRentalRequests("NEW");
    expect(isNew.some((r) => r.id === created.request.id)).toBe(false);
  });
});

describe("countNewRequests", () => {
  it("đếm đúng số yêu cầu chưa xử lý của riêng fixture này", async () => {
    const before = await countNewRequests();
    const created = await createRentalRequest({ ...base(), phone: "0912001010" });
    expect(created.ok).toBe(true);
    expect(await countNewRequests()).toBe(before + 1);

    if (!created.ok) return;
    await changeRequestStatus(created.request.id, "CLOSED", staffId, new Date());
    expect(await countNewRequests()).toBe(before);
  });
});

describe("ràng buộc DB", () => {
  /**
   * CHECK `rental_requests_handled_consistent` là lưới thứ hai dưới
   * `changeRequestStatus`. Nó tồn tại để một câu UPDATE viết tay không tạo ra
   * được hàng "đã liên hệ mà không biết lúc nào" — thứ làm màn tiếp nhận nói dối.
   */
  it("Postgres từ chối trạng thái đã xử lý mà thiếu `handled_at`", async () => {
    const created = await createRentalRequest({ ...base(), phone: "0912001111" });
    if (!created.ok) return;
    // `await` bên trong một hàm, KHÔNG truyền query builder thẳng vào `expect`:
    // builder của Drizzle là thenable nhưng không phải Promise, và
    // `expect(builder).rejects` đọc nó như một giá trị thường rồi báo lỗi kiểu
    // thay vì chạy câu lệnh — test xanh/đỏ vì lý do không liên quan tới CHECK.
    let rejected = false;
    try {
      await db
        .update(schema.rentalRequests)
        .set({ status: "CONTACTED" })
        .where(eq(schema.rentalRequests.id, created.request.id));
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });
});
