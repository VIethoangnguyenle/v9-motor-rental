import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { queueGroupOf } from "@v9/shared/domain/rental";
import { like } from "drizzle-orm";
import { db } from "../db";
import { getStatsSummary } from "./stats";
import { listRentalsQueue, queueBoundaries } from "./rentals-list";

const P = "ztest-ds-";
/** Đồng hồ cố định của cả file — mọi mốc dưới đây neo vào nó. */
const NOW = new Date("2026-09-04T15:00:00+07:00");
const at = (iso: string) => new Date(iso);

/**
 * Mọi hàng `listRentalsQueue` trả về ĐÃ ở trong hàng đợi, nên `queueGroupOf`
 * không thể trả `null` cho nó — nếu có thì đó tự nó là drift giữa SQL và
 * domain, đáng nổ to hơn là một lỗi kiểu ở `toEqual`. Không dùng `as`: đây là
 * khẳng định RUNTIME, và `r.group` (kiểu `QueueGroup` không `null`) không so
 * được thẳng với kiểu trả về của `queueGroupOf` (`QueueGroup | null`) nếu
 * không thu hẹp trước.
 */
function requireGroup(g: ReturnType<typeof queueGroupOf>) {
  if (g === null) throw new Error("queueGroupOf trả null cho một hàng đã có trong hàng đợi");
  return g;
}

let customerId: string;
let staffId: string;

async function clean() {
  await db.delete(schema.rentals).where(like(schema.rentals.createdBy, `${P}%`));
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

/**
 * Ghi thẳng bằng `db.insert`, KHÔNG qua `createRental` + `changeRentalStatus`:
 * ở đây ta cần dựng chính xác từng tổ hợp (status × quan hệ thời gian), kể cả
 * những tổ hợp mà đường nghiệp vụ bình thường mất nhiều bước mới tới. Các CHECK
 * của bảng vẫn có hiệu lực, nên một tổ hợp KHÔNG hợp lệ (ONGOING mà
 * `handed_over_at IS NULL`) sẽ nổ ngay tại đây — đó là điều ta muốn.
 *
 * `vehicleId` là THAM SỐ, một xe RIÊNG cho mỗi hàng — không dùng chung một xe
 * cho cả tám hàng như bản đầu tiên của test này. Tám khoảng ngày ở `beforeAll`
 * cố ý áp sát nhau (mỗi nhóm một hàng, liền kề nhóm kế) để phủ đúng biên của
 * `queueGroupOf`, và nhiều cặp trong số đó chồng lấn thời gian — đúng ý đồ, xe
 * KHÁC NHAU thì `rentals_no_overlap` (migration `0010`, `packages/db`) không
 * can thiệp. Dùng chung một xe thì exclusion constraint đó chặn ngay ở INSERT
 * thứ ba (`23P01`) vì hai đơn ONGOING của cùng xe chồng ngày — đã đo, không
 * suy luận: đó chính xác là điều xảy ra khi test này còn seed theo cách đó.
 */
async function seedRental(input: {
  vehicleId: string;
  status: "BOOKED" | "ONGOING" | "COMPLETED" | "CANCELLED";
  startsAt: Date;
  endsAt: Date;
}) {
  const out = input.status === "ONGOING" || input.status === "COMPLETED";
  const [row] = await db
    .insert(schema.rentals)
    .values({
      vehicleId: input.vehicleId,
      customerId,
      createdBy: staffId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
      handedOverAt: out ? input.startsAt : null,
      returnedAt: input.status === "COMPLETED" ? input.endsAt : null,
      totalAmount: 1_000_000,
      depositAmount: 5_000_000,
    })
    .returning();
  if (!row) throw new Error("seed đơn hỏng");
  return row;
}

/** Một xe riêng cho một hàng seed — xem lý do ở JSDoc của `seedRental`. */
async function makeVehicle(
  suffix: string,
  overrides: { make?: string; model?: string; plate?: string | null } = {},
) {
  const [v] = await db
    .insert(schema.vehicles)
    .values({
      slug: `${P}${suffix}`,
      make: overrides.make ?? "Honda",
      model: overrides.model ?? "Wave Alpha",
      engineCc: 110,
      pricePerDay: 150_000,
      deposit: 2_000_000,
      plate: overrides.plate ?? null,
    })
    .returning();
  if (!v) throw new Error("seed xe hỏng");
  return v.id;
}

beforeAll(async () => {
  await clean();
  const [c] = await db
    .insert(schema.customers)
    .values({ fullName: `${P}Trần Quốc Bảo`, phone: "0912000301" })
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
  if (!c || !s) throw new Error("seed hỏng");
  customerId = c.id;
  staffId = s.id;

  // Một hàng cho MỖI nhóm, cộng ba hàng cố ý nằm ngoài hàng đợi. Hàng OVERDUE
  // (sắp đầu danh sách) mang chiếc xe có tên/biển cụ thể — test "mang đủ tên
  // khách và tên xe" ở dưới đọc đúng chiếc này.
  const vOverdue = await makeVehicle("v1", { make: "Yamaha", model: "MT-07", plate: "59X1-12345" });
  const vPickupOverdue = await makeVehicle("v2");
  const vDueToday = await makeVehicle("v3");
  const vPickupToday = await makeVehicle("v4");
  const vUpcoming = await makeVehicle("v5");
  const vBeyondHorizon = await makeVehicle("v6");
  const vCompleted = await makeVehicle("v7");
  const vCancelled = await makeVehicle("v8");

  await seedRental({ vehicleId: vOverdue, status: "ONGOING", startsAt: at("2026-09-01T09:00:00+07:00"), endsAt: at("2026-09-04T09:00:00+07:00") }); // OVERDUE
  await seedRental({ vehicleId: vPickupOverdue, status: "BOOKED",  startsAt: at("2026-09-04T09:00:00+07:00"), endsAt: at("2026-09-08T09:00:00+07:00") }); // PICKUP_OVERDUE
  await seedRental({ vehicleId: vDueToday, status: "ONGOING", startsAt: at("2026-09-02T09:00:00+07:00"), endsAt: at("2026-09-04T20:00:00+07:00") }); // DUE_TODAY
  await seedRental({ vehicleId: vPickupToday, status: "BOOKED",  startsAt: at("2026-09-04T20:00:00+07:00"), endsAt: at("2026-09-06T20:00:00+07:00") }); // PICKUP_TODAY
  await seedRental({ vehicleId: vUpcoming, status: "BOOKED",  startsAt: at("2026-09-09T09:00:00+07:00"), endsAt: at("2026-09-11T09:00:00+07:00") }); // UPCOMING
  await seedRental({ vehicleId: vBeyondHorizon, status: "BOOKED",  startsAt: at("2026-09-25T09:00:00+07:00"), endsAt: at("2026-09-27T09:00:00+07:00") }); // ngoài chân trời
  await seedRental({ vehicleId: vCompleted, status: "COMPLETED", startsAt: at("2026-08-01T09:00:00+07:00"), endsAt: at("2026-08-05T09:00:00+07:00") });
  await seedRental({ vehicleId: vCancelled, status: "CANCELLED", startsAt: at("2026-09-04T08:00:00+07:00"), endsAt: at("2026-09-07T08:00:00+07:00") });
});

afterAll(clean);

describe("listRentalsQueue — hàng rào SQL ↔ TS", () => {
  it("SQL và queueGroupOf gán CÙNG một nhóm cho mọi hàng", async () => {
    const b = await queueBoundaries(NOW);
    const { rentals } = await listRentalsQueue(NOW, { pageSize: 100, createdBy: staffId });

    expect(rentals.length).toBeGreaterThan(0);
    for (const r of rentals) {
      expect({ id: r.id, group: r.group }).toEqual({ id: r.id, group: requireGroup(queueGroupOf(r, b)) });
    }
  });

  it("năm nhóm đủ mặt, và ba hàng ngoài hàng đợi KHÔNG lọt vào", async () => {
    const { rentals, total, groupCounts } = await listRentalsQueue(NOW, {
      pageSize: 100,
      createdBy: staffId,
    });
    expect(groupCounts).toMatchObject({
      OVERDUE: 1,
      PICKUP_OVERDUE: 1,
      DUE_TODAY: 1,
      PICKUP_TODAY: 1,
      UPCOMING: 1,
    });
    expect(total).toBe(5);
    expect(rentals.map((r) => r.status)).not.toContain("COMPLETED");
    expect(rentals.map((r) => r.status)).not.toContain("CANCELLED");
  });

  it("sắp theo độ gấp trước, rồi tới mốc thời gian", async () => {
    const { rentals } = await listRentalsQueue(NOW, { pageSize: 100, createdBy: staffId });
    expect(rentals.map((r) => r.group)).toEqual([
      "OVERDUE",
      "PICKUP_OVERDUE",
      "DUE_TODAY",
      "PICKUP_TODAY",
      "UPCOMING",
    ]);
  });

  it("phân trang không sót và không trùng", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const r = await listRentalsQueue(NOW, { page, pageSize: 2, createdBy: staffId });
      seen.push(...r.rentals.map((x) => x.id));
    }
    const { total } = await listRentalsQueue(NOW, { pageSize: 100, createdBy: staffId });
    expect(seen.length).toBe(total);
    expect(new Set(seen).size).toBe(total);
  });

  it("mang đủ tên khách và tên xe để danh sách in được, không cần vòng mạng thứ hai", async () => {
    const { rentals } = await listRentalsQueue(NOW, { pageSize: 100, createdBy: staffId });
    const first = rentals[0];
    expect(first?.customerName).toBe(`${P}Trần Quốc Bảo`);
    expect(first?.vehicleMake).toBe("Yamaha");
    expect(first?.vehiclePlate).toBe("59X1-12345");
  });
});

describe("listRentalsQueue ↔ getStatsSummary", () => {
  /**
   * Đây là hàng rào chống MÂU THUẪN NGƯỜI DÙNG NHÌN THẤY: `attention-list.tsx`
   * hiện "N xe quá hạn chưa trả" rồi link thẳng sang màn này. Bấm vào con số 3
   * mà thấy 4 dòng là một cái bug người dùng báo được, không phải chuyện nội bộ.
   *
   * ⚠️ `bun test` chạy MỌI file trong MỘT tiến trình và MỘT database — đo trực
   * tiếp lúc viết test này, bảng `rentals` của DB dev đã có sẵn 5 đơn thật
   * (không phải rỗng như con số ước lượng cũ), và một trong số đó rơi thẳng vào
   * cửa sổ hàng đợi (OVERDUE/PICKUP_OVERDUE/UPCOMING của NOW). Không lọc thì
   * CẢ HAI describe block ở trên cũng sai, không chỉ khối so sánh này — nên
   * `createdBy: staffId` được truyền cho MỌI lời gọi `listRentalsQueue` trong
   * file, không riêng gì ở đây. Cùng cách `stats.test.ts` đã lọc theo nhân viên
   * seed của chính nó — xem JSDoc của `StatsFilter` (`services/stats.ts`).
   */
  it("OVERDUE và PICKUP_OVERDUE khớp TUYỆT ĐỐI với attention", async () => {
    const stats = await getStatsSummary(NOW, { createdBy: staffId });
    const { groupCounts } = await listRentalsQueue(NOW, { pageSize: 100, createdBy: staffId });
    expect(groupCounts.OVERDUE).toBe(stats.attention.overdue);
    expect(groupCounts.PICKUP_OVERDUE).toBe(stats.attention.pickupOverdue);
  });

  it("DUE_TODAY của hàng đợi ≤ dueToday của Thống kê, không bao giờ lớn hơn", async () => {
    const stats = await getStatsSummary(NOW, { createdBy: staffId });
    const { groupCounts } = await listRentalsQueue(NOW, { pageSize: 100, createdBy: staffId });
    expect(groupCounts.DUE_TODAY).toBeLessThanOrEqual(stats.attention.dueToday);
  });
});
