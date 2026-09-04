import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import {
  isOverdue,
  isPickupOverdue,
  RENTAL_STATUSES,
  type RentalStatus,
} from "@v9/shared/domain/rental";
import { db } from "../db";
import { getStatsSummary } from "./stats";

const P = "ztest-tk-";

let vehicleId: string;
let customerId: string;
let staffId: string;

/**
 * `getStatsSummary` giờ nhận `filter.createdBy` (xem `stats.ts`), nên file này
 * KHÔNG còn cần xoá toàn bộ bảng `rentals` để cô lập assertion số học — mọi lời
 * gọi trong file này truyền `{ createdBy: staffId }`, và `staffId` là hàng
 * `staff_users` seed riêng của file này (id bắt đầu bằng `P`). Xoá theo
 * `like(created_by, 'ztest-tk-%')` chỉ đụng đúng hàng của FILE NÀY — một đơn
 * thuê ai đó nhập tay qua UI (mang `created_by` thật, không mang tiền tố test)
 * sống sót qua mọi lần `bun test`.
 */
async function clean() {
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
      pricePerDay: 500_000,
      deposit: 5_000_000,
    })
    .returning();
  const [c] = await db
    .insert(schema.customers)
    .values({ fullName: `${P}Minh Anh`, phone: "0912000102" })
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
  if (!v || !c || !s) throw new Error("seed hỏng");
  vehicleId = v.id;
  customerId = c.id;
  staffId = s.id;
});

afterAll(clean);

/**
 * `getStatsSummary` không nhận `from/to`, chỉ nhận `createdBy` — nên các `it()`
 * trong file này vẫn cần dọn ĐƠN CỦA CHÍNH FILE NÀY giữa các lần chạy để giữ mỗi
 * assertion số học độc lập (nhiều `it()` cùng dùng một `vehicleId`/`staffId`,
 * giữ khoảng ngày không giao nhau xuyên suốt file sẽ ngày càng khó theo dõi).
 *
 * Khác bản cũ ở đúng một chỗ: lọc theo `like(created_by, 'ztest-tk-%')` thay vì
 * xoá trần cả bảng — phạm vi xoá không bao giờ vượt ra ngoài dữ liệu do FILE NÀY
 * tạo, dù chạy song song với file test khác hay với người đang thao tác tay
 * trên UI.
 */
beforeEach(async () => {
  await db.delete(schema.rentals).where(like(schema.rentals.createdBy, `${P}%`));
});

/** Đơn ĐÃ GIAO XE ở đúng một thời điểm — dùng cho các test doanh thu. */
async function handedOver(
  handedOverAtIso: string,
  amount: number,
  startDay: number,
  endDay: number,
) {
  await db.insert(schema.rentals).values({
    vehicleId,
    customerId,
    createdBy: staffId,
    startsAt: new Date(`2026-08-${String(startDay).padStart(2, "0")}T00:00:00+07:00`),
    endsAt: new Date(`2026-08-${String(endDay).padStart(2, "0")}T00:00:00+07:00`),
    totalAmount: amount,
    depositAmount: 0,
    status: "ONGOING",
    handedOverAt: new Date(handedOverAtIso),
  });
}

/**
 * Đơn với trạng thái/`endsAt`/`handedOverAt` kiểm soát riêng — dùng cho test
 * `overdue`/`dueToday` và test "chưa giao xe", nơi `handedOver()` (luôn
 * `status: "ONGOING"`) không đủ linh hoạt.
 */
async function seedRental(opts: {
  startsAt: string;
  endsAt: string;
  status: "BOOKED" | "ONGOING" | "COMPLETED";
  handedOverAt?: string;
  totalAmount?: number;
}) {
  await db.insert(schema.rentals).values({
    vehicleId,
    customerId,
    createdBy: staffId,
    startsAt: new Date(opts.startsAt),
    endsAt: new Date(opts.endsAt),
    totalAmount: opts.totalAmount ?? 1_000_000,
    depositAmount: 0,
    status: opts.status,
    handedOverAt: opts.handedOverAt ? new Date(opts.handedOverAt) : null,
  });
}

/**
 * Xe RIÊNG cho một ca biên của test hợp đồng SQL ↔ TS bên dưới —
 * KHÔNG dùng `vehicleId` chung của file: `rentals_no_overlap` (migration
 * `0010`) từ chối hai đơn KHÔNG `CANCELLED` chồng khoảng thời gian trên CÙNG
 * một xe, và ca biên cần nhiều đơn cùng đứng sát mốc `now` trên các trục khác
 * nhau (`endsAt` lẫn `startsAt`) — tách xe là cách rẻ nhất để mỗi trục độc
 * lập mà không phải tính toán một chuỗi mốc không chồng lấn thủ công.
 */
async function seedBoundaryVehicle(suffix: string): Promise<string> {
  const [v] = await db
    .insert(schema.vehicles)
    .values({
      slug: `${P}boundary-${suffix}`,
      make: "Honda",
      model: "Boundary",
      engineCc: 150,
      pricePerDay: 100_000,
      deposit: 1_000_000,
    })
    .returning();
  if (!v) throw new Error("seed xe biên hỏng");
  return v.id;
}

/**
 * Ghi thẳng một hàng `rentals` với `vehicleId`/`status`/`startsAt`/`endsAt` tuỳ
 * ý — `seedRental()` ở trên KHÔNG nhận `vehicleId`, và test hợp đồng bên dưới
 * cần kiểm soát nó để rải nhiều đơn qua nhiều xe khác nhau (xem
 * `seedBoundaryVehicle`).
 *
 * Tự suy `handedOverAt`/`returnedAt` theo `status`, đúng bốn CHECK hai chiều
 * của `packages/db/src/schema/rentals.ts` (`rentals_ongoing_has_handover`,
 * `rentals_completed_has_return`, và hai chiều ngược): ONGOING/COMPLETED bắt
 * buộc có `handedOverAt`; chỉ COMPLETED mới có thêm `returnedAt`; BOOKED/
 * CANCELLED thì cả hai phải là `null`.
 */
async function seedBoundaryRental(opts: {
  vehicleId: string;
  status: RentalStatus;
  startsAt: Date;
  endsAt: Date;
}) {
  const handedOverAt =
    opts.status === "ONGOING" || opts.status === "COMPLETED" ? opts.startsAt : null;
  const returnedAt = opts.status === "COMPLETED" ? opts.endsAt : null;
  await db.insert(schema.rentals).values({
    vehicleId: opts.vehicleId,
    customerId,
    createdBy: staffId,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    totalAmount: 1_000_000,
    depositAmount: 0,
    status: opts.status,
    handedOverAt,
    returnedAt,
  });
}

describe("getStatsSummary", () => {
  // Ca 2h sáng: đây là lý do cả file này tồn tại. 2026-08-15T02:00:00+07:00 là
  // 2026-08-14T19:00:00Z — lúc 2h sáng giờ HCM, UTC vẫn còn là NGÀY HÔM TRƯỚC.
  // Cắt kỳ bằng UTC (thay vì `AT TIME ZONE`) sẽ đẩy đơn giao lúc 1h sáng giờ VN
  // vào "hôm qua" — sai, và tự đúng lại lúc 7h sáng nên không ai bắt được bằng
  // mắt thường. Test này là hàng rào duy nhất.
  it("đơn giao lúc 1h sáng giờ VN được tính vào HÔM NAY dù UTC còn là hôm qua", async () => {
    await handedOver("2026-08-15T01:00:00+07:00", 1_000_000, 1, 2);

    const now = new Date("2026-08-15T02:00:00+07:00");
    const stats = await getStatsSummary(now, { createdBy: staffId });

    expect(stats.revenue.today.amount).toBe(1_000_000);
    expect(stats.revenue.today.orders).toBe(1);
  });

  it("đơn giao 23h hôm trước KHÔNG tính vào hôm nay, xuất hiện ở prevAmount", async () => {
    await handedOver("2026-08-14T23:00:00+07:00", 2_000_000, 3, 4);

    const now = new Date("2026-08-15T02:00:00+07:00");
    const stats = await getStatsSummary(now, { createdBy: staffId });

    expect(stats.revenue.today.amount).toBe(0);
    expect(stats.revenue.today.orders).toBe(0);
    expect(stats.revenue.today.prevAmount).toBe(2_000_000);
  });

  // Tuần bắt đầu Thứ Hai (quy ước VN). Xác nhận bằng psql trước khi viết test:
  //   SELECT extract(dow from '2026-08-16'::date), extract(dow from '2026-08-17'::date);
  //   -> 0 (Chủ Nhật), 1 (Thứ Hai)
  //   SELECT date_trunc('week', '2026-08-17T12:00+07'::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')
  //          AT TIME ZONE 'Asia/Ho_Chi_Minh';
  //   -> 2026-08-17 00:00:00+07 (Thứ Hai CHÍNH nó, không lùi về Chủ Nhật trước)
  // Nên đơn giao Chủ Nhật 16/8 phải rơi vào TUẦN TRƯỚC khi `now` là Thứ Hai 17/8.
  it("tuần bắt đầu Thứ Hai: đơn giao Chủ Nhật rơi vào TUẦN TRƯỚC khi now là Thứ Hai kế tiếp", async () => {
    await handedOver("2026-08-16T12:00:00+07:00", 3_000_000, 5, 6);

    const now = new Date("2026-08-17T10:00:00+07:00");
    const stats = await getStatsSummary(now, { createdBy: staffId });

    expect(stats.revenue.thisWeek.amount).toBe(0);
    expect(stats.revenue.thisWeek.orders).toBe(0);
    expect(stats.revenue.thisWeek.prevAmount).toBe(3_000_000);
  });

  it("đơn chưa giao xe (handed_over_at null) đóng góp 0 doanh thu ở cả ba kỳ", async () => {
    await seedRental({
      startsAt: "2026-08-15T00:00:00+07:00",
      endsAt: "2026-08-17T00:00:00+07:00",
      status: "BOOKED",
      totalAmount: 5_000_000,
    });

    const now = new Date("2026-08-15T12:00:00+07:00");
    const stats = await getStatsSummary(now, { createdBy: staffId });

    expect(stats.revenue.today).toEqual({ amount: 0, orders: 0, prevAmount: 0 });
    expect(stats.revenue.thisWeek).toEqual({ amount: 0, orders: 0, prevAmount: 0 });
    expect(stats.revenue.thisMonth).toEqual({ amount: 0, orders: 0, prevAmount: 0 });
  });

  // `overdue`/`dueToday` chỉ đếm đơn ONGOING — một đơn BOOKED có `ends_at` trong
  // quá khứ KHÔNG được tính là quá hạn, vì nó chưa từng được giao.
  it("overdue và dueToday đếm đúng, chỉ tính đơn ONGOING", async () => {
    const now = new Date("2026-08-20T10:00:00+07:00");

    // Quá hạn: ONGOING, ends_at (18/8) đã qua so với now (20/8 10h).
    await seedRental({
      startsAt: "2026-08-01T00:00:00+07:00",
      endsAt: "2026-08-18T00:00:00+07:00",
      status: "ONGOING",
      handedOverAt: "2026-08-01T00:00:00+07:00",
    });

    // Đến hạn hôm nay: ONGOING, ends_at (20/8 15h) rơi trong cửa sổ [20/8 00h, 21/8 00h).
    await seedRental({
      startsAt: "2026-08-19T00:00:00+07:00",
      endsAt: "2026-08-20T15:00:00+07:00",
      status: "ONGOING",
      handedOverAt: "2026-08-19T00:00:00+07:00",
    });

    // Chưa tới hạn: ONGOING nhưng ends_at (30/8) còn xa — không quá hạn, không đến hạn hôm nay.
    await seedRental({
      startsAt: "2026-08-21T00:00:00+07:00",
      endsAt: "2026-08-30T00:00:00+07:00",
      status: "ONGOING",
      handedOverAt: "2026-08-21T00:00:00+07:00",
    });

    // BOOKED chưa giao xe, `ends_at` cũng đã qua — KHÔNG được tính là quá hạn.
    await seedRental({
      startsAt: "2026-07-01T00:00:00+07:00",
      endsAt: "2026-07-05T00:00:00+07:00",
      status: "BOOKED",
    });

    const stats = await getStatsSummary(now, { createdBy: staffId });

    expect(stats.attention.overdue).toBe(1);
    expect(stats.attention.dueToday).toBe(1);
  });

  // `pickupOverdue` đếm `isPickupOverdue` (@v9/shared/domain/rental): BOOKED
  // đã qua `starts_at` — khách hẹn lấy xe mà không tới. Khác `overdue` ở chỗ
  // xét `starts_at`, không phải `ends_at`, và chỉ tính đơn CHƯA giao xe.
  it("pickupOverdue đếm đúng: BOOKED quá startsAt, không tính ONGOING hay BOOKED chưa tới hẹn", async () => {
    const now = new Date("2026-08-20T10:00:00+07:00");

    // Quá hẹn lấy xe: BOOKED, starts_at (18/8) đã qua so với now (20/8).
    await seedRental({
      startsAt: "2026-08-18T00:00:00+07:00",
      endsAt: "2026-08-22T00:00:00+07:00",
      status: "BOOKED",
    });

    // Chưa tới hẹn: BOOKED nhưng starts_at (25/8) còn ở tương lai.
    await seedRental({
      startsAt: "2026-08-25T00:00:00+07:00",
      endsAt: "2026-08-28T00:00:00+07:00",
      status: "BOOKED",
    });

    // Đã lấy xe rồi (ONGOING) dù starts_at cũng đã qua từ lâu — KHÔNG được tính
    // vào pickupOverdue, vì khách đã tới nhận xe. Khoảng ngày tách rời hai đơn
    // BOOKED ở trên: cả ba đơn dùng CHUNG một xe (`vehicleId` seed ở
    // `beforeAll`), và `rentals_no_overlap` (migration `0010`) từ chối chồng
    // lấn bất kể trạng thái (trừ CANCELLED).
    await seedRental({
      startsAt: "2026-08-01T00:00:00+07:00",
      endsAt: "2026-08-05T00:00:00+07:00",
      status: "ONGOING",
      handedOverAt: "2026-08-01T00:00:00+07:00",
    });

    const stats = await getStatsSummary(now, { createdBy: staffId });

    expect(stats.attention.pickupOverdue).toBe(1);
  });

  // Hai mốc neo (`overdueFrom`/`pickupOverdueFrom`) là để client đưa vào
  // `search.from` của route `/calendar` (`lib/calendar-search.ts`) — phải là
  // đơn SỚM NHẤT trong nhóm, không phải đơn mới nhất hay bất kỳ đơn nào.
  it("overdueFrom/pickupOverdueFrom là mốc SỚM NHẤT trong nhóm", async () => {
    const now = new Date("2026-08-20T10:00:00+07:00");

    // Bốn đơn nối đuôi nhau KHÔNG chồng lấn (chung một xe — cùng lý do đã ghi
    // ở test `pickupOverdue` ngay trên): [1/8,10/8) → [10/8,15/8) → [15/8,17/8)
    // → [17/8,19/8). Biên chạm nhau vẫn hợp lệ vì `period` là nửa mở `[)`.
    //
    // Hai đơn quá hạn, ends_at khác nhau — overdueFrom phải là mốc SỚM hơn (10/8).
    await seedRental({
      startsAt: "2026-08-01T00:00:00+07:00",
      endsAt: "2026-08-10T00:00:00+07:00",
      status: "ONGOING",
      handedOverAt: "2026-08-01T00:00:00+07:00",
    });
    await seedRental({
      startsAt: "2026-08-10T00:00:00+07:00",
      endsAt: "2026-08-15T00:00:00+07:00",
      status: "ONGOING",
      handedOverAt: "2026-08-10T00:00:00+07:00",
    });

    // Hai đơn quá hẹn lấy xe, starts_at khác nhau — pickupOverdueFrom phải là
    // mốc SỚM hơn (15/8).
    await seedRental({
      startsAt: "2026-08-15T00:00:00+07:00",
      endsAt: "2026-08-17T00:00:00+07:00",
      status: "BOOKED",
    });
    await seedRental({
      startsAt: "2026-08-17T00:00:00+07:00",
      endsAt: "2026-08-19T00:00:00+07:00",
      status: "BOOKED",
    });

    const stats = await getStatsSummary(now, { createdBy: staffId });

    expect(stats.attention.overdueFrom).toBe("2026-08-10");
    expect(stats.attention.pickupOverdueFrom).toBe("2026-08-15");
  });

  it("overdueFrom/pickupOverdueFrom là null khi nhóm tương ứng rỗng", async () => {
    const now = new Date("2026-08-20T10:00:00+07:00");

    const stats = await getStatsSummary(now, { createdBy: staffId });

    expect(stats.attention.overdue).toBe(0);
    expect(stats.attention.pickupOverdue).toBe(0);
    expect(stats.attention.overdueFrom).toBeNull();
    expect(stats.attention.pickupOverdueFrom).toBeNull();
  });
});

/**
 * ⚠️ Hàng rào QUAN TRỌNG NHẤT của file này. `overdue`/`pickupOverdue` có HAI
 * định nghĩa sống song song — SQL ở `stats.ts` (`status = 'ONGOING' AND
 * ends_at < now`) và TS ở `@v9/shared/domain/rental` (`isOverdue`,
 * `isPickupOverdue`). Hôm nay chúng khớp; rủi ro là TRÔI theo thời gian, không
 * phải sai ngay bây giờ — một lần sửa `<` thành `<=` ở MỘT bên là hai con số
 * khác nhau cho cùng một shop, và không có gì báo.
 *
 * Test dưới đây seed đúng ca biên `endsAt`/`startsAt` LỆCH `now` ±1ms, nhân
 * với MỌI `RentalStatus`, rồi khẳng định: đếm được từ SQL (`getStatsSummary`)
 * PHẢI bằng đếm được từ áp `isOverdue`/`isPickupOverdue` lên ĐÚNG tập dữ liệu
 * vừa seed — không hardcode con số kỳ vọng, để test còn đúng nếu ai đó đổi bố
 * cục ca biên mà quên đổi assertion.
 *
 * Đã đo là test CẮN được, cả hai vế, bằng cách lệch MỘT bên rồi hoàn nguyên:
 *
 *   • `ends_at < ${now}` → `<=` trong `stats.ts`: overdue đỏ, TS đếm 1 còn SQL
 *     đếm 3 (thêm ca `endsAt === now` trên CẢ hai trục seed).
 *   • `starts_at < ${now}` → `<=`: pickupOverdue đỏ, TS đếm 3 còn SQL đếm 5.
 *
 * Ghi số ra đây thay vì "đã kiểm rồi": một hàng rào tự khai là kín mà không
 * kèm bằng chứng thì tệ hơn không có, vì nó khiến người sau thôi kiểm lại.
 */
describe("getStatsSummary — hợp đồng SQL ↔ TS (isOverdue/isPickupOverdue)", () => {
  it("overdue/pickupOverdue của SQL khớp isOverdue/isPickupOverdue tại ca biên ±1ms quanh now, cho MỌI RentalStatus", async () => {
    const now = new Date("2026-08-20T10:00:00+07:00");
    const t = now.getTime();

    interface SeededRow {
      readonly status: RentalStatus;
      readonly startsAt: Date;
      readonly endsAt: Date;
    }
    const rows: SeededRow[] = [];

    for (const status of RENTAL_STATUSES) {
      // Trục `endsAt` (ca biên của `isOverdue`): ba đơn CHẠM NHAU tại biên,
      // không chồng lấn ([)  — nửa mở, xem `period` ở migration `0010`), lấy
      // đúng `endsAt` = now-1ms / now / now+1ms.
      const endsVehicle =
        status === "CANCELLED"
          ? vehicleId
          : await seedBoundaryVehicle(`ends-${status.toLowerCase()}`);
      const e1 = new Date(t - 1);
      const e2 = new Date(t);
      const e3 = new Date(t + 1);
      const endsAxisRows: SeededRow[] = [
        { status, startsAt: new Date(t - 1_000_000), endsAt: e1 },
        { status, startsAt: e1, endsAt: e2 },
        { status, startsAt: e2, endsAt: e3 },
      ];

      // Trục `startsAt` (ca biên của `isPickupOverdue`): CÙNG khuôn, xe RIÊNG
      // (không dùng chung xe trục `endsAt` — hai trục có khoảng thời gian
      // chồng nhau quanh `now`, và exclusion constraint không phân biệt "trục
      // nào" khi hai đơn chung một xe).
      const startsVehicle =
        status === "CANCELLED"
          ? vehicleId
          : await seedBoundaryVehicle(`starts-${status.toLowerCase()}`);
      const s1 = new Date(t - 1);
      const s2 = new Date(t);
      const s3 = new Date(t + 1);
      const startsAxisRows: SeededRow[] = [
        { status, startsAt: s1, endsAt: s2 },
        { status, startsAt: s2, endsAt: s3 },
        { status, startsAt: s3, endsAt: new Date(t + 1_000_000) },
      ];

      for (const r of endsAxisRows) {
        await seedBoundaryRental({ vehicleId: endsVehicle, ...r });
        rows.push(r);
      }
      for (const r of startsAxisRows) {
        await seedBoundaryRental({ vehicleId: startsVehicle, ...r });
        rows.push(r);
      }
    }

    const stats = await getStatsSummary(now, { createdBy: staffId });

    const expectedOverdue = rows.filter((r) => isOverdue(r, now)).length;
    const expectedPickupOverdue = rows.filter((r) => isPickupOverdue(r, now)).length;

    // Cả hai vế PHẢI > 0 — nếu không, một test "khớp nhau" chỉ vì cả hai đều
    // đếm ra 0 (ví dụ boundary rows lọt hết vào WHERE sai) sẽ xanh giả.
    expect(expectedOverdue).toBeGreaterThan(0);
    expect(expectedPickupOverdue).toBeGreaterThan(0);

    expect(stats.attention.overdue).toBe(expectedOverdue);
    expect(stats.attention.pickupOverdue).toBe(expectedPickupOverdue);
  });
});
