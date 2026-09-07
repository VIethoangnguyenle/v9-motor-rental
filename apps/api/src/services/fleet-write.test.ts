import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import type { VehicleRule } from "@v9/shared/domain/vehicle";
import { like } from "drizzle-orm";
import { db } from "../db";
import {
  archiveVehicle,
  createVehicle,
  findFleetVehicle,
  listFleet,
  updateVehicle,
  type VehicleInput,
} from "./fleet";
import { getVehicleRevenue } from "./stats";

const P = "ztest-fw-";
const NOW = new Date("2026-09-07T12:00:00+07:00");
const at = (iso: string) => new Date(iso);

let customerId: string;
let staffId: string;

const input = (patch: Partial<VehicleInput> = {}): VehicleInput => ({
  slug: `${P}cb500x`,
  make: "Honda",
  model: "CB500X",
  engineCc: 471,
  pricePerDay: 500_000,
  deposit: 5_000_000,
  status: "draft",
  plate: "59H1-234.56",
  year: 2022,
  odoKm: 12_000,
  color: "đỏ",
  description: null,
  sort: null,
  ...patch,
});

/**
 * Lọc theo tiền tố ở MỌI bảng, không `delete` trần: `bun test` chạy mọi file
 * trong cùng một tiến trình và cùng một database dev, nên một câu DELETE không
 * điều kiện sẽ xoá dữ liệu của file test khác — triệu chứng là "test kia thỉnh
 * thoảng đỏ", tuỳ thứ tự Bun chọn. Cùng lý lẽ `rentals.test.ts`.
 *
 * `rentals` đi TRƯỚC vì nó có FK RESTRICT tới cả ba bảng còn lại.
 */
async function clean() {
  await db.delete(schema.rentals).where(like(schema.rentals.createdBy, `${P}%`));
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

beforeAll(async () => {
  await clean();
  const [c] = await db
    .insert(schema.customers)
    .values({ fullName: `${P}Khách`, phone: "0912000909" })
    .returning();
  const [s] = await db
    .insert(schema.staffUsers)
    .values({
      id: `${P}owner`,
      email: `${P}owner@example.com`,
      fullName: `${P}Chủ shop`,
      role: "OWNER",
      status: "ACTIVE",
    })
    .returning();
  customerId = c!.id;
  staffId = s!.id;
});

afterAll(clean);

describe("createVehicle", () => {
  it("tạo được xe hợp lệ và đọc lại thấy đủ trường", async () => {
    const r = await createVehicle(input({ slug: `${P}ok` }), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.vehicle.slug).toBe(`${P}ok`);
    expect(r.vehicle.plate).toBe("59H1-234.56");
    expect(r.vehicle.photoCount).toBe(0);
    // Xe mới chưa có đơn nào, nên cả hai mốc suy ra đều rỗng.
    expect(r.vehicle.onRentUntil).toBeNull();
    expect(r.vehicle.nextFrom).toBeNull();
  });

  it("từ chối và trả về TỪNG luật bị vi phạm, không chỉ một câu chung", async () => {
    const r = await createVehicle(
      input({ slug: `${P}SAI HOA`, make: "  ", engineCc: 0, pricePerDay: -1 }),
      NOW,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("VEHICLE_INVALID");
    if (r.reason !== "VEHICLE_INVALID") return;

    // Bốn luật, không phải "một lỗi": form phải đánh dấu được bốn ô.
    const expected: VehicleRule[] = [
      "ENGINE_CC_POSITIVE",
      "MAKE_REQUIRED",
      "PRICE_NON_NEGATIVE",
      "SLUG_FORMAT",
    ];
    expect([...r.rules].sort()).toEqual(expected.sort());
  });

  it("slug trùng trả SLUG_TAKEN chứ không ném lỗi Postgres thô", async () => {
    const slug = `${P}dup`;
    expect((await createVehicle(input({ slug }), NOW)).ok).toBe(true);

    const again = await createVehicle(input({ slug }), NOW);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("SLUG_TAKEN");
  });
});

describe("updateVehicle — phát hiện ghi đè", () => {
  it("sửa được khi mốc khớp, và mốc mới khác mốc cũ", async () => {
    const created = await createVehicle(input({ slug: `${P}upd` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const later = new Date(NOW.getTime() + 60_000);
    const r = await updateVehicle(
      created.vehicle.id,
      input({ slug: `${P}upd`, pricePerDay: 700_000 }),
      created.vehicle.updatedAt,
      later,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vehicle.pricePerDay).toBe(700_000);
    expect(r.vehicle.updatedAt.getTime()).not.toBe(created.vehicle.updatedAt.getTime());
  });

  /**
   * Đây là ca mà cả cơ chế `expectedUpdatedAt` sinh ra để bắt: hai cửa ghi (form
   * `apps/staff` và Data Studio của Directus) cùng cầm một bản, một bên lưu
   * trước. Không có phép kiểm này thì bên thứ hai xoá lặng lẽ thay đổi của bên
   * thứ nhất.
   */
  it("mốc cũ bị từ chối bằng VEHICLE_STALE, và KHÔNG ghi đè", async () => {
    const created = await createVehicle(input({ slug: `${P}stale` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const stamp = created.vehicle.updatedAt;
    const first = await updateVehicle(
      created.vehicle.id,
      input({ slug: `${P}stale`, color: "xanh" }),
      stamp,
      new Date(NOW.getTime() + 60_000),
    );
    expect(first.ok).toBe(true);

    const second = await updateVehicle(
      created.vehicle.id,
      input({ slug: `${P}stale`, color: "vàng" }),
      stamp, // mốc CŨ
      new Date(NOW.getTime() + 120_000),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("VEHICLE_STALE");

    // Giá trị của lần ghi ĐẦU còn nguyên — chứng minh lần hai không lọt phần nào.
    const after = await findFleetVehicle(created.vehicle.id, NOW);
    expect(after?.color).toBe("xanh");
  });

  it("phân biệt xe không tồn tại với xe bị sửa mất mốc", async () => {
    const r = await updateVehicle(
      "00000000-0000-4000-8000-000000000000",
      input({ slug: `${P}ghost` }),
      NOW,
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("VEHICLE_NOT_FOUND");
  });
});

describe("archiveVehicle", () => {
  async function makeRental(vehicleId: string, status: string, from: string, to: string) {
    await db.insert(schema.rentals).values({
      vehicleId,
      customerId,
      createdBy: staffId,
      startsAt: at(from),
      endsAt: at(to),
      status,
      totalAmount: 1_000_000,
      depositAmount: 5_000_000,
      ...(status === "COMPLETED" || status === "ONGOING" ? { handedOverAt: at(from) } : {}),
      ...(status === "COMPLETED" ? { returnedAt: at(to) } : {}),
    });
  }

  it("xe không có đơn thì lưu kho được, và biến khỏi listFleet", async () => {
    const created = await createVehicle(input({ slug: `${P}arch` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await archiveVehicle(created.vehicle.id, NOW)).toEqual({ ok: true });

    const list = await listFleet(NOW);
    expect(list.some((v) => v.id === created.vehicle.id)).toBe(false);
    // Nhưng hàng vẫn còn — đó là điều kiện để doanh thu của nó không mất.
    expect((await findFleetVehicle(created.vehicle.id, NOW))?.status).toBe("archived");
  });

  it("xe đang có đơn hiệu lực thì bị chặn", async () => {
    const created = await createVehicle(input({ slug: `${P}busy` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await makeRental(
      created.vehicle.id,
      "ONGOING",
      "2026-09-06T08:00:00+07:00",
      "2026-09-09T08:00:00+07:00",
    );

    const r = await archiveVehicle(created.vehicle.id, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("VEHICLE_HAS_ACTIVE_RENTAL");
  });

  /**
   * Đơn TƯƠNG LAI cũng chặn. Một đơn `BOOKED` cho tuần sau vẫn là lời hứa với
   * khách, và lưu kho chiếc xe đó làm nó biến khỏi mọi màn vận hành.
   */
  it("đơn đã chốt cho tương lai cũng chặn", async () => {
    const created = await createVehicle(input({ slug: `${P}future` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await makeRental(
      created.vehicle.id,
      "BOOKED",
      "2026-09-20T08:00:00+07:00",
      "2026-09-22T08:00:00+07:00",
    );

    const r = await archiveVehicle(created.vehicle.id, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("VEHICLE_HAS_ACTIVE_RENTAL");
  });

  it("đơn đã hoàn tất KHÔNG chặn", async () => {
    const created = await createVehicle(input({ slug: `${P}done` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await makeRental(
      created.vehicle.id,
      "COMPLETED",
      "2026-08-01T08:00:00+07:00",
      "2026-08-04T08:00:00+07:00",
    );

    expect(await archiveVehicle(created.vehicle.id, NOW)).toEqual({ ok: true });
  });
});

describe("listFleet — tình trạng suy ra từ rentals", () => {
  it("onRentUntil chỉ tính đơn PHỦ LÊN now; nextFrom là đơn kế tiếp", async () => {
    const created = await createVehicle(input({ slug: `${P}derive` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.vehicle.id;

    const mk = (status: string, from: string, to: string) =>
      db.insert(schema.rentals).values({
        vehicleId: id,
        customerId,
        createdBy: staffId,
        startsAt: at(from),
        endsAt: at(to),
        status,
        totalAmount: 1_000_000,
        depositAmount: 0,
        ...(status === "ONGOING" ? { handedOverAt: at(from) } : {}),
      });

    // Đơn đang phủ lên NOW (2026-09-07T12:00+07)
    await mk("ONGOING", "2026-09-06T08:00:00+07:00", "2026-09-09T08:00:00+07:00");
    // Đơn tương lai
    await mk("BOOKED", "2026-09-15T08:00:00+07:00", "2026-09-17T08:00:00+07:00");

    const row = (await listFleet(NOW)).find((v) => v.id === id);
    expect(row?.onRentUntil?.toISOString()).toBe(at("2026-09-09T08:00:00+07:00").toISOString());
    expect(row?.nextFrom?.toISOString()).toBe(at("2026-09-15T08:00:00+07:00").toISOString());
  });

  /**
   * ⚠️ Ca này bắt lỗi mà bản đầu của `onRentUntilSql` mắc phải, và nó KHÔNG lộ ra
   * ở bất kỳ ca nào khác: một đơn `ONGOING` đã quá `ends_at` nghĩa là khách vẫn
   * đang giữ xe (chưa nhận lại), nên xe vẫn bận. Điều kiện cũ chỉ hỏi
   * `starts_at <= now AND ends_at > now` nên nó trả `null`, và màn hình mời nhân
   * viên cho thuê một chiếc xe không có ở shop.
   */
  it("đơn ONGOING đã QUÁ HẠN vẫn làm xe bận", async () => {
    const created = await createVehicle(input({ slug: `${P}overdue` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await db.insert(schema.rentals).values({
      vehicleId: created.vehicle.id,
      customerId,
      createdBy: staffId,
      // Cả hai mốc đều NẰM TRƯỚC `NOW` — đơn đã hết hạn mà chưa ai trả xe.
      startsAt: at("2026-09-01T08:00:00+07:00"),
      endsAt: at("2026-09-03T08:00:00+07:00"),
      status: "ONGOING",
      handedOverAt: at("2026-09-01T08:00:00+07:00"),
      totalAmount: 1_000_000,
      depositAmount: 0,
    });

    const row = (await listFleet(NOW)).find((v) => v.id === created.vehicle.id);
    expect(row?.onRentUntil).not.toBeNull();
    expect(row?.onRentUntil?.toISOString()).toBe(at("2026-09-03T08:00:00+07:00").toISOString());
  });

  /**
   * Đơn `BOOKED` cho TƯƠNG LAI thì ngược lại — chưa giao xe thì xe còn ở shop.
   * Hai ca này là hai nửa của cùng một luật; thiếu một nửa là điều kiện SQL sai
   * theo một chiều.
   */
  it("đơn BOOKED cho tương lai KHÔNG làm xe bận hôm nay", async () => {
    const created = await createVehicle(input({ slug: `${P}booked` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await db.insert(schema.rentals).values({
      vehicleId: created.vehicle.id,
      customerId,
      createdBy: staffId,
      startsAt: at("2026-09-20T08:00:00+07:00"),
      endsAt: at("2026-09-22T08:00:00+07:00"),
      status: "BOOKED",
      totalAmount: 1_000_000,
      depositAmount: 0,
    });

    const row = (await listFleet(NOW)).find((v) => v.id === created.vehicle.id);
    expect(row?.onRentUntil).toBeNull();
    expect(row?.nextFrom?.toISOString()).toBe(at("2026-09-20T08:00:00+07:00").toISOString());
  });

  /**
   * Ca này canh chỗ dễ sai nhất của phép suy: đơn đã HUỶ không chiếm xe. Bỏ
   * `status = ANY(...)` khỏi câu SQL thì xe hiện ra là "đang ở ngoài" trong khi
   * nó đang nằm ở shop.
   */
  it("đơn CANCELLED không làm xe trông như đang bận", async () => {
    const created = await createVehicle(input({ slug: `${P}cancel` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await db.insert(schema.rentals).values({
      vehicleId: created.vehicle.id,
      customerId,
      createdBy: staffId,
      startsAt: at("2026-09-06T08:00:00+07:00"),
      endsAt: at("2026-09-09T08:00:00+07:00"),
      status: "CANCELLED",
      totalAmount: 1_000_000,
      depositAmount: 0,
    });

    const row = (await listFleet(NOW)).find((v) => v.id === created.vehicle.id);
    expect(row?.onRentUntil).toBeNull();
  });
});

describe("getVehicleRevenue", () => {
  /**
   * Ca này khoá đúng quyết định của §3 design doc: doanh thu đếm đơn `COMPLETED`,
   * còn `ONGOING` đứng riêng ở `ongoing*`. Gộp hai nhóm lại là làm màn Đội xe
   * nói cùng con số với màn Thống kê — nghe như nhất quán, nhưng khi đó nhãn
   * "đơn đã hoàn tất" trở thành lời nói dối.
   */
  it("tách đơn hoàn tất khỏi đơn đang chạy, và đếm số ngày đã đặt", async () => {
    const created = await createVehicle(input({ slug: `${P}rev` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.vehicle.id;

    const mk = (status: string, from: string, to: string, amount: number) =>
      db.insert(schema.rentals).values({
        vehicleId: id,
        customerId,
        createdBy: staffId,
        startsAt: at(from),
        endsAt: at(to),
        status,
        totalAmount: amount,
        depositAmount: 0,
        handedOverAt: at(from),
        ...(status === "COMPLETED" ? { returnedAt: at(to) } : {}),
      });

    await mk("COMPLETED", "2026-08-01T08:00:00+07:00", "2026-08-04T08:00:00+07:00", 1_500_000);
    await mk("COMPLETED", "2026-08-10T08:00:00+07:00", "2026-08-12T08:00:00+07:00", 1_000_000);
    await mk("ONGOING", "2026-09-06T08:00:00+07:00", "2026-09-09T08:00:00+07:00", 900_000);

    const row = (await getVehicleRevenue()).find((v) => v.vehicleId === id);
    expect(row?.revenue).toBe(2_500_000);
    expect(row?.orders).toBe(2);
    expect(row?.days).toBe(5); // 3 + 2
    expect(row?.ongoingRevenue).toBe(900_000);
    expect(row?.ongoingOrders).toBe(1);
  });

  it("xe chưa có đơn nào vẫn có mặt với số 0, không vắng khỏi bảng", async () => {
    const created = await createVehicle(input({ slug: `${P}norev` }), NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const row = (await getVehicleRevenue()).find((v) => v.vehicleId === created.vehicle.id);
    expect(row).toBeDefined();
    expect(row?.revenue).toBe(0);
    expect(row?.orders).toBe(0);
  });
});

describe("dọn dẹp bắc cầu", () => {
  it("xoá hết dữ liệu tiền tố của file này", async () => {
    await clean();
    const left = await db
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(like(schema.vehicles.slug, `${P}%`));
    expect(left).toHaveLength(0);
  });
});
