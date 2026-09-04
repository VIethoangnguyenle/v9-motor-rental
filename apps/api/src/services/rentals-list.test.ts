import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { queueGroupOf } from "@v9/shared/domain/rental";
import { like } from "drizzle-orm";
import { db } from "../db";
import { getStatsSummary } from "./stats";
import { listRentalsLedger, listRentalsQueue, queueBoundaries } from "./rentals-list";

const P = "ztest-ds-";
/** Đồng hồ cố định của cả file — mọi mốc dưới đây neo vào nó. */
const NOW = new Date("2026-09-04T15:00:00+07:00");
const at = (iso: string) => new Date(iso);

/**
 * Ba mốc đồng hồ cho hàng rào SQL ↔ TS — §6 design doc đòi so ở "nhiều mốc
 * `now` khác nhau kể cả sát biên (đúng `now`, đúng `dayEnd`, `dayEnd - 1ms`)".
 * `queueBoundaries` phụ thuộc `now`, nên MỖI mốc dưới đây tính lại `b` của
 * RIÊNG nó — không dùng chung `b` của `NOW`.
 *
 * - `NOW`: mốc gốc, dùng cho mọi test khác trong describe này.
 * - `NOW2`: đúng bằng `endsAt` của hàng OVERDUE VÀ `startsAt` của hàng
 *   PICKUP_OVERDUE — hai hàng seed CỐ Ý dùng chung giờ 09:00 sáng 09-04. Pin
 *   CHÍNH XÁC biên `b.now` của cả nhánh 1 lẫn nhánh 2 cùng lúc: tại mốc này cả
 *   hai hàng chuyển từ "quá hạn" (`<`) sang "chưa quá hạn, rơi vào nhóm hôm
 *   nay" — đúng chỗ một lỗi `<` → `<=` sẽ lộ ra mà không cần thêm dữ liệu.
 * - `DAY_END`: đúng bằng `b.dayEnd` của `NOW` (tính tay: `NOW` là 09-04 giờ
 *   VN nên `dayEnd` là nửa đêm 09-05). Đẩy đồng hồ tới đúng mốc này khiến hai
 *   hàng DUE_TODAY/PICKUP_TODAY (endsAt/startsAt = 20:00 hôm 09-04) chuyển
 *   HẲN sang OVERDUE/PICKUP_OVERDUE — một phép kiểm khác các mốc trên, vì nó
 *   xuyên qua ranh giới `dayEnd` được TÍNH LẠI cho `now` mới (`dayEnd(DAY_END)`
 *   là nửa đêm 09-06, không phải 09-05 nữa).
 *
 * `dayEnd - 1ms` KHÔNG có trong danh sách trên: đã kiểm tay — với đúng bộ tám
 * hàng seed này, kết quả tại `dayEnd - 1ms` giống HỆT tại `DAY_END` (không
 * hàng nào có mốc riêng nằm lọt trong đúng một mili-giây cuối ngày), nên thêm
 * nó vào sweep chỉ tốn thời gian chạy chứ không kiểm thêm được gì — đúng điều
 * dặn "nếu một mốc không kiểm thêm gì thì nói thẳng, đừng giữ lại cho đẹp".
 * Biên `dayEnd` cho nhánh 4 (BOOKED, mốc `startsAt`) được pin RIÊNG ở khối
 * "biên dayEnd cho BOOKED" bên dưới bằng một hàng đặt ĐÚNG lên mốc đó — cách
 * DUY NHẤT phân biệt được `dayEnd` với `dayEnd - 1ms` là có một hàng nằm đúng
 * giữa hai mốc, và không hàng nào trong tám hàng seed chính làm được việc đó.
 */
const NOW2 = at("2026-09-04T09:00:00+07:00");
const DAY_END = at("2026-09-05T00:00:00+07:00");

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
/**
 * Nhân viên RIÊNG cho đúng MỘT hàng biên (`edgeDayEndRental` ở dưới). Tách
 * khỏi `staffId` để hàng đó không lọt vào các test đếm-đúng-số của khối
 * "hàng rào SQL ↔ TS" (`groupCounts` kỳ vọng đúng 1 mỗi nhóm/tổng 5) — nếu
 * seed chung `staffId` thì mỗi lần thêm một hàng biên là một lần phải sửa lại
 * mọi con số kỳ vọng ở nơi khác, dễ quên.
 */
let staffId2: string;

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
  /** Mặc định `staffId` — hàng biên `dayEnd` truyền `staffId2` để tự cô lập. */
  createdBy?: string;
}) {
  const out = input.status === "ONGOING" || input.status === "COMPLETED";
  const [row] = await db
    .insert(schema.rentals)
    .values({
      vehicleId: input.vehicleId,
      customerId,
      createdBy: input.createdBy ?? staffId,
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
  const [s2] = await db
    .insert(schema.staffUsers)
    .values({
      id: `${P}owner2`,
      email: `${P}owner2@example.com`,
      fullName: "Nhân viên biên test",
      role: "OWNER",
      status: "ACTIVE",
    })
    .returning();
  if (!c || !s || !s2) throw new Error("seed hỏng");
  customerId = c.id;
  staffId = s.id;
  staffId2 = s2.id;

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
  const vDayEndEdge = await makeVehicle("v9");

  await seedRental({ vehicleId: vOverdue, status: "ONGOING", startsAt: at("2026-09-01T09:00:00+07:00"), endsAt: at("2026-09-04T09:00:00+07:00") }); // OVERDUE
  await seedRental({ vehicleId: vPickupOverdue, status: "BOOKED",  startsAt: at("2026-09-04T09:00:00+07:00"), endsAt: at("2026-09-08T09:00:00+07:00") }); // PICKUP_OVERDUE
  await seedRental({ vehicleId: vDueToday, status: "ONGOING", startsAt: at("2026-09-02T09:00:00+07:00"), endsAt: at("2026-09-04T20:00:00+07:00") }); // DUE_TODAY
  await seedRental({ vehicleId: vPickupToday, status: "BOOKED",  startsAt: at("2026-09-04T20:00:00+07:00"), endsAt: at("2026-09-06T20:00:00+07:00") }); // PICKUP_TODAY
  await seedRental({ vehicleId: vUpcoming, status: "BOOKED",  startsAt: at("2026-09-09T09:00:00+07:00"), endsAt: at("2026-09-11T09:00:00+07:00") }); // UPCOMING
  await seedRental({ vehicleId: vBeyondHorizon, status: "BOOKED",  startsAt: at("2026-09-25T09:00:00+07:00"), endsAt: at("2026-09-27T09:00:00+07:00") }); // ngoài chân trời
  await seedRental({ vehicleId: vCompleted, status: "COMPLETED", startsAt: at("2026-08-01T09:00:00+07:00"), endsAt: at("2026-08-05T09:00:00+07:00") });
  await seedRental({ vehicleId: vCancelled, status: "CANCELLED", startsAt: at("2026-09-04T08:00:00+07:00"), endsAt: at("2026-09-07T08:00:00+07:00") });

  // Hàng biên RIÊNG cho nhánh 4 (`BOOKED`, mốc `b.dayEnd`) — `startsAt` đặt
  // ĐÚNG lên `DAY_END` (= `dayEnd` của `NOW`). Không hàng nào trong tám hàng
  // trên làm được việc này vì tất cả seed ở giờ 09:00/20:00, không bao giờ
  // đúng nửa đêm — mà `dayEnd` LUÔN LÀ nửa đêm. `createdBy: staffId2` để hàng
  // này không lọt vào các test đếm-đúng-số của `staffId` ở trên.
  await seedRental({
    vehicleId: vDayEndEdge,
    status: "BOOKED",
    startsAt: DAY_END,
    endsAt: at("2026-09-07T00:00:00+07:00"),
    createdBy: staffId2,
  });
});

afterAll(clean);

describe("listRentalsQueue — hàng rào SQL ↔ TS", () => {
  it("SQL và queueGroupOf gán CÙNG một nhóm cho mọi hàng — ở NOW, sát biên b.now, và đúng b.dayEnd", async () => {
    for (const pos of [NOW, NOW2, DAY_END]) {
      // Tính lại `b` cho ĐÚNG `pos` này — không dùng chung `b` của NOW, vì
      // `dayEnd`/`horizon` của `DAY_END` khác của `NOW` (xem JSDoc của ba mốc
      // ở đầu file).
      const b = await queueBoundaries(pos);
      const { rentals } = await listRentalsQueue(pos, { pageSize: 100, createdBy: staffId });

      expect(rentals.length).toBeGreaterThan(0);
      for (const r of rentals) {
        expect({ id: r.id, group: r.group }).toEqual({ id: r.id, group: requireGroup(queueGroupOf(r, b)) });
      }
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

  /**
   * Pin RIÊNG biên `dayEnd` cho nhánh 4 (`BOOKED`, mốc `startsAt`) — hàng
   * `edgeDayEndRental` (seed ở `beforeAll`, `createdBy: staffId2`) có
   * `startsAt` đúng bằng `DAY_END`.
   *
   * Đúng LÚC `dayEnd` (không sớm hơn, không muộn hơn) là mốc mà nhánh 4 loại
   * trừ (`startsAt < dayEnd` sai vì BẰNG chứ không nhỏ hơn) — hàng rơi qua
   * nhánh 5 (`UPCOMING`) tại `NOW`. Đẩy đồng hồ tới đúng `DAY_END` thì
   * `dayEnd` được TÍNH LẠI (nửa đêm 09-06, không còn là 09-05 nữa), nên
   * `startsAt` cũ giờ nhỏ hơn `dayEnd` mới — hàng chuyển hẳn sang nhánh 4
   * (`PICKUP_TODAY`). Hai mốc cho hai nhóm khác nhau — đúng loại bằng chứng
   * mà một lỗi `<` → `<=` ở nhánh 4 sẽ làm sai.
   *
   * Nhánh 3 (`ONGOING`, mốc `dayEnd`) và nhánh 5 (`BOOKED`, mốc `horizon`)
   * KHÔNG có bài kiểm tương tự: cả hai trùng NGUYÊN VĂN vế lọc tương ứng của
   * `queueWhere` (xem JSDoc `queueWhere` ở `rentals-list.ts`), nên một hàng
   * nằm đúng lên biên của chúng bị chính `WHERE` loại trước khi `CASE` kịp
   * chạy — đổi `<` thành `<=` ở hai nhánh đó không đổi được hàng nào từng lọt
   * qua `WHERE`, tức không có hàng nào để so lệch. Đây là hệ quả CỐ Ý của
   * thiết kế `queueWhere` (dùng được hai partial index), không phải khoảng
   * trống cần vá thêm test.
   */
  it("biên dayEnd cho BOOKED (nhánh 4): startsAt đúng bằng dayEnd đổi nhóm khi đồng hồ chạm mốc", async () => {
    const bAtNow = await queueBoundaries(NOW);
    const atNow = await listRentalsQueue(NOW, { pageSize: 100, createdBy: staffId2 });
    expect(atNow.rentals).toHaveLength(1);
    const rowAtNow = atNow.rentals[0];
    if (!rowAtNow) throw new Error("hàng biên dayEnd không thấy ở NOW");
    expect(rowAtNow.group).toBe("UPCOMING");
    expect(rowAtNow.group).toBe(requireGroup(queueGroupOf(rowAtNow, bAtNow)));

    const bAtDayEnd = await queueBoundaries(DAY_END);
    const atDayEnd = await listRentalsQueue(DAY_END, { pageSize: 100, createdBy: staffId2 });
    expect(atDayEnd.rentals).toHaveLength(1);
    const rowAtDayEnd = atDayEnd.rentals[0];
    if (!rowAtDayEnd) throw new Error("hàng biên dayEnd không thấy ở DAY_END");
    expect(rowAtDayEnd.group).toBe("PICKUP_TODAY");
    expect(rowAtDayEnd.group).toBe(requireGroup(queueGroupOf(rowAtDayEnd, bAtDayEnd)));
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

/**
 * Sổ cái đọc CHÍN hàng của khách seed, không phải tám: `edgeDayEndRental`
 * (`createdBy: staffId2`, seed riêng cho biên `dayEnd` của hàng đợi ở trên)
 * dùng CHUNG `customerId` với tám hàng còn lại, và `listRentalsLedger` không
 * lọc theo `createdBy` — nó lọc theo `q` khớp tên/điện thoại khách hoặc biển
 * số xe. Đếm tay từ `beforeAll`: 4 BOOKED gốc + hàng biên (cũng BOOKED) = 5
 * BOOKED; tổng chung 9.
 */
describe("listRentalsLedger", () => {
  it("KHÔNG cần from/to — không chọn ngày vẫn ra kết quả", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, pageSize: 100 });
    expect(r.total).toBe(9);
  });

  it("CÓ đơn đã huỷ — khác hẳn lịch", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, pageSize: 100 });
    expect(r.rentals.map((x) => x.status)).toContain("CANCELLED");
  });

  it("lọc theo trạng thái", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, statuses: ["BOOKED"], pageSize: 100 });
    expect(r.total).toBe(5);
    expect(new Set(r.rentals.map((x) => x.status))).toEqual(new Set(["BOOKED"]));
  });

  it("tìm được theo biển số", async () => {
    const r = await listRentalsLedger({ q: "59X1-12345", pageSize: 100 });
    expect(r.total).toBeGreaterThan(0);
  });

  it("tìm được theo số điện thoại đã chuẩn hoá", async () => {
    const r = await listRentalsLedger({ q: "+84912000301", pageSize: 100 });
    expect(r.total).toBe(9);
  });

  /**
   * Ba đơn có `handed_over_at` trong seed: OVERDUE, DUE_TODAY, COMPLETED —
   * mỗi đơn 1.000.000 ₫. Bốn đơn BOOKED gốc, hàng biên BOOKED, và một đơn
   * CANCELLED không có mốc giao xe nên KHÔNG được cộng: đó chính là vị từ
   * doanh thu, và một đơn chưa giao lọt vào tổng tiền là kiểu sai im lặng mà
   * CHECK `rentals_handover_only_when_out` sinh ra để chặn ở tầng dưới.
   */
  it("collectedAmount chỉ cộng đơn ĐÃ GIAO XE", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, pageSize: 100 });
    expect(r.collectedAmount).toBe(3_000_000);
    expect(typeof r.collectedAmount).toBe("number");
  });

  it("sắp gần nhất lên trước", async () => {
    const r = await listRentalsLedger({ q: `${P}Trần`, pageSize: 100 });
    const times = r.rentals.map((x) => x.startsAt.getTime());
    expect(times).toEqual([...times].sort((a, z) => z - a));
  });

  it("phân trang không sót và không trùng", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const r = await listRentalsLedger({ q: `${P}Trần`, page, pageSize: 3 });
      seen.push(...r.rentals.map((x) => x.id));
    }
    expect(seen.length).toBe(9);
    expect(new Set(seen).size).toBe(9);
  });
});
