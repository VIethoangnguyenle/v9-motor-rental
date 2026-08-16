import { schema } from "@v9/db";
import { asc, ne } from "drizzle-orm";
import { db } from "../db";

/**
 * Shape NỘI BỘ — có `plate`. Đây là lý do `/fleet` là route riêng chứ không phải
 * một field thêm vào `/vehicles`: comment ở `routes/vehicles.ts` nói rõ rằng
 * `plate` VẮNG MẶT trong schema công khai chính là cơ chế chặn, vì Elysia cắt mọi
 * field không được khai. Nới schema đó để staff dùng ké là tháo hàng rào của một
 * route công khai.
 */
export interface FleetVehicle {
  readonly id: string;
  readonly slug: string;
  readonly make: string;
  readonly model: string;
  readonly plate: string | null;
  readonly status: string;
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
    })
    .from(schema.vehicles)
    .where(ne(schema.vehicles.status, "archived"))
    .orderBy(asc(schema.vehicles.make), asc(schema.vehicles.model), asc(schema.vehicles.id));
}
