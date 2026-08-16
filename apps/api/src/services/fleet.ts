import { schema } from "@v9/db";
import type { Vnd } from "@v9/shared/domain/money";
import { asc, ne } from "drizzle-orm";
import { db } from "../db";

/**
 * Shape NỘI BỘ — có `plate`. Đây là lý do `/fleet` là route riêng chứ không phải
 * một field thêm vào `/vehicles`: comment ở `routes/vehicles.ts` nói rõ rằng
 * `plate` VẮNG MẶT trong schema công khai chính là cơ chế chặn, vì Elysia cắt mọi
 * field không được khai. Nới schema đó để staff dùng ké là tháo hàng rào của một
 * route công khai.
 *
 * `pricePerDay`/`deposit` CÓ mặt ở đây — khác `plate`, giá không phải dữ liệu
 * nhạy cảm, và staff (form lên đơn) là bên tiêu thụ TỰ NHIÊN của giá đội xe nội
 * bộ. Trước đây `rental-form.tsx` phải mượn `GET /vehicles` (route CÔNG KHAI của
 * `apps/web`) để tra giá, nên xe `draft` — có mặt ở `/fleet`, vắng mặt ở
 * `/vehicles` — không bao giờ tra được giá và cảnh báo "giá gõ nhầm" lặng lẽ tắt
 * cho đúng nhóm xe chưa lên web, tức nhóm rủi ro nhất. Thêm hai cột này vào ĐÚNG
 * route nội bộ này xoá luôn đường vòng đó.
 */
export interface FleetVehicle {
  readonly id: string;
  readonly slug: string;
  readonly make: string;
  readonly model: string;
  readonly plate: string | null;
  readonly status: string;
  readonly pricePerDay: Vnd;
  readonly deposit: Vnd;
}

/**
 * Mọi xe trừ `archived`. Xe `draft` VẪN có mặt: chưa lên web không có nghĩa là
 * không cho thuê được — trạng thái đó là trạng thái DANH MỤC, không phải trạng
 * thái rảnh/bận (xem comment ở `packages/db/src/schema/vehicles.ts`).
 */
export async function listFleet(): Promise<FleetVehicle[]> {
  return db
    .select({
      id: schema.vehicles.id,
      slug: schema.vehicles.slug,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      plate: schema.vehicles.plate,
      status: schema.vehicles.status,
      pricePerDay: schema.vehicles.pricePerDay,
      deposit: schema.vehicles.deposit,
    })
    .from(schema.vehicles)
    .where(ne(schema.vehicles.status, "archived"))
    .orderBy(asc(schema.vehicles.make), asc(schema.vehicles.model), asc(schema.vehicles.id));
}
