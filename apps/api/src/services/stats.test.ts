import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import { getStatsSummary } from "./stats";

const P = "ztest-tk-";

let vehicleId: string;
let customerId: string;
let staffId: string;

/**
 * ⚠️ File test DUY NHẤT được phép xoá TOÀN BỘ bảng `rentals`, và nó buộc phải:
 * `getStatsSummary` tổng hợp trên cả bảng và không nhận bộ lọc nào, nên một hàng
 * lạ còn sót làm mọi assertion số học ở dưới sai.
 *
 * Chấp nhận được vì `rentals` là bảng mới và DB dev chưa có dữ liệu vận hành thật.
 * Ngày nào dev bắt đầu giữ đơn thật, đổi cách này.
 */
async function clean() {
  await db.delete(schema.rentals);
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
 * `getStatsSummary` tổng hợp trên TOÀN BỘ bảng `rentals`, không nhận `from/to`
 * — nên xoá sạch bảng trước MỖI test (không chỉ ở đầu/cuối file) là cách duy
 * nhất giữ mỗi assertion số học độc lập với các test khác. Đây là cách "clear
 * rentals between tests" mà task mô tả, thay vì cố chọn khoảng ngày không giao
 * nhau xuyên suốt cả file — với nhiều `it()` cùng dùng một `vehicleId`, giữ
 * khoảng ngày không giao nhau xuyên file sẽ ngày càng khó theo dõi.
 */
beforeEach(async () => {
  await db.delete(schema.rentals);
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

describe("getStatsSummary", () => {
  // Ca 2h sáng: đây là lý do cả file này tồn tại. 2026-08-15T02:00:00+07:00 là
  // 2026-08-14T19:00:00Z — lúc 2h sáng giờ HCM, UTC vẫn còn là NGÀY HÔM TRƯỚC.
  // Cắt kỳ bằng UTC (thay vì `AT TIME ZONE`) sẽ đẩy đơn giao lúc 1h sáng giờ VN
  // vào "hôm qua" — sai, và tự đúng lại lúc 7h sáng nên không ai bắt được bằng
  // mắt thường. Test này là hàng rào duy nhất.
  it("đơn giao lúc 1h sáng giờ VN được tính vào HÔM NAY dù UTC còn là hôm qua", async () => {
    await handedOver("2026-08-15T01:00:00+07:00", 1_000_000, 1, 2);

    const now = new Date("2026-08-15T02:00:00+07:00");
    const stats = await getStatsSummary(now);

    expect(stats.revenue.today.amount).toBe(1_000_000);
    expect(stats.revenue.today.orders).toBe(1);
  });

  it("đơn giao 23h hôm trước KHÔNG tính vào hôm nay, xuất hiện ở prevAmount", async () => {
    await handedOver("2026-08-14T23:00:00+07:00", 2_000_000, 3, 4);

    const now = new Date("2026-08-15T02:00:00+07:00");
    const stats = await getStatsSummary(now);

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
    const stats = await getStatsSummary(now);

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
    const stats = await getStatsSummary(now);

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

    const stats = await getStatsSummary(now);

    expect(stats.attention.overdue).toBe(1);
    expect(stats.attention.dueToday).toBe(1);
  });
});
