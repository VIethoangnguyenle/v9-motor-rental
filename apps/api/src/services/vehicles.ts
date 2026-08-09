import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@v9/db";
import type { Vnd } from "@v9/shared/domain/money";
import { db } from "../db";

export interface VehiclePhoto {
  readonly fileId: string;
  readonly alt: string;
}

/**
 * Shape CÔNG KHAI. `plate` cố ý không có mặt — biển số là dữ liệu nội bộ.
 * Đây là bức tường thứ nhất; TypeBox schema ở routes/vehicles.ts là bức thứ hai.
 */
export interface VehicleSummary {
  readonly id: string;
  readonly slug: string;
  readonly make: string;
  readonly model: string;
  readonly year: number | null;
  readonly engineCc: number;
  readonly odoKm: number | null;
  readonly color: string | null;
  readonly pricePerDay: Vnd;
  readonly deposit: Vnd;
  /** MỘT ảnh, không phải mảng: lưới xe chỉ dùng được một. `null` khi chưa upload ảnh nào. */
  readonly photo: VehiclePhoto | null;
}

export interface VehicleDetail extends VehicleSummary {
  readonly description: string | null;
  readonly photos: VehiclePhoto[];
}

/**
 * Lấy ảnh của một tập xe. Gom về đúng một chỗ vì mệnh đề ORDER BY bên dưới là
 * thứ quyết định "ảnh nào lên lưới" — viết lại ở hai nơi là mở đường cho hai nơi
 * lệch nhau.
 */
async function photosOf(vehicleIds: string[]) {
  if (vehicleIds.length === 0) return [];
  return (
    db
      .select({
        vehicleId: schema.vehiclePhotos.vehicleId,
        fileId: schema.vehiclePhotos.fileId,
        alt: schema.vehiclePhotos.alt,
      })
      .from(schema.vehiclePhotos)
      .where(inArray(schema.vehiclePhotos.vehicleId, vehicleIds))
      // Thêm `id` làm khoá phụ: upload hàng loạt cho mọi ảnh `sort = 0`, và khi đó
      // thứ tự Postgres trả về là tuỳ ý — tức ảnh nào lên lưới có thể đổi giữa hai
      // lần ISR rebuild. `id` làm nó xác định.
      .orderBy(asc(schema.vehiclePhotos.sort), asc(schema.vehiclePhotos.id))
  );
}

/**
 * Danh mục công khai. Hai truy vấn rồi ghép trong JS — cố ý: một lateral join chỉ
 * để lấy MỘT ảnh mỗi xe khó đọc hơn nhiều mà không nhanh hơn ở quy mô đội xe của
 * một shop.
 */
export async function listPublishedVehicles(): Promise<VehicleSummary[]> {
  const rows = await db
    .select({
      id: schema.vehicles.id,
      slug: schema.vehicles.slug,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      year: schema.vehicles.year,
      engineCc: schema.vehicles.engineCc,
      odoKm: schema.vehicles.odoKm,
      color: schema.vehicles.color,
      pricePerDay: schema.vehicles.pricePerDay,
      deposit: schema.vehicles.deposit,
    })
    .from(schema.vehicles)
    .where(eq(schema.vehicles.status, "published"))
    // ⚠️ `NULLS LAST` phải viết ra, không được rút gọn thành desc(createdAt).
    // Partial index sinh ra là ("sort","created_at" DESC NULLS LAST), còn mặc định
    // của Postgres cho DESC là NULLS FIRST — planner KHÔNG coi hai cái là một, kể cả
    // khi created_at là NOT NULL. Viết lệch thì rơi xuống Incremental Sort và index
    // thành vô dụng. Đã đo bằng EXPLAIN trên 20k hàng.
    .orderBy(sql`${schema.vehicles.sort}, ${schema.vehicles.createdAt} DESC NULLS LAST`);

  const photos = await photosOf(rows.map((r) => r.id));

  // Ảnh đã sắp sẵn, nên ảnh ĐẦU TIÊN gặp của mỗi xe chính là ảnh cần lấy.
  const firstPhoto = new Map<string, VehiclePhoto>();
  for (const p of photos) {
    if (!firstPhoto.has(p.vehicleId)) firstPhoto.set(p.vehicleId, { fileId: p.fileId, alt: p.alt });
  }

  // Map từng cột một. KHÔNG spread hàng DB vào response — đó chính là đường
  // `plate` thoát ra ngoài.
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    make: r.make,
    model: r.model,
    year: r.year,
    engineCc: r.engineCc,
    odoKm: r.odoKm,
    color: r.color,
    pricePerDay: r.pricePerDay,
    deposit: r.deposit,
    photo: firstPhoto.get(r.id) ?? null,
  }));
}

/**
 * Trang chi tiết. `null` cho cả ba trường hợp "không có xe", "xe draft" và
 * "xe archived" — trang công khai không được phân biệt chúng, vì phân biệt được
 * tức là để lộ sự tồn tại của xe chưa publish.
 */
export async function findPublishedVehicleBySlug(slug: string): Promise<VehicleDetail | null> {
  const [row] = await db
    .select({
      id: schema.vehicles.id,
      slug: schema.vehicles.slug,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      year: schema.vehicles.year,
      engineCc: schema.vehicles.engineCc,
      odoKm: schema.vehicles.odoKm,
      color: schema.vehicles.color,
      description: schema.vehicles.description,
      pricePerDay: schema.vehicles.pricePerDay,
      deposit: schema.vehicles.deposit,
    })
    .from(schema.vehicles)
    .where(and(eq(schema.vehicles.slug, slug), eq(schema.vehicles.status, "published")))
    .limit(1);

  if (!row) return null;

  const photos = (await photosOf([row.id])).map((p) => ({ fileId: p.fileId, alt: p.alt }));

  return {
    id: row.id,
    slug: row.slug,
    make: row.make,
    model: row.model,
    year: row.year,
    engineCc: row.engineCc,
    odoKm: row.odoKm,
    color: row.color,
    description: row.description,
    pricePerDay: row.pricePerDay,
    deposit: row.deposit,
    photo: photos[0] ?? null,
    photos,
  };
}
