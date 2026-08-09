import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Một bản ghi = MỘT CHIẾC XE CỤ THỂ, không phải một mẫu xe.
 * Quyết định + lý do ở §2 và §2.1 của
 * docs/plans/2026-08-10-fleet-catalogue-design.md.
 *
 * Tiền là `integer`, KHÔNG phải `bigint`: Drizzle trả bigint về dưới dạng
 * string và làm vỡ `type Vnd = number` của @v9/shared — vỡ im lặng, chỉ sai
 * lúc đem đi cộng.
 */
export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year"),
    engineCc: integer("engine_cc").notNull(),
    odoKm: integer("odo_km"),
    color: text("color"),
    /** Biển số: NỘI BỘ. Không endpoint công khai nào được trả trường này. */
    plate: text("plate"),
    description: text("description"),
    pricePerDay: integer("price_per_day").notNull(),
    deposit: integer("deposit").notNull(),
    /**
     * Trạng thái DANH MỤC, không phải trạng thái rảnh/bận. Không giá trị nào
     * mang nghĩa "xe đang có sẵn" — apps/web bị cấm hứa điều đó.
     * CHECK nằm ở tầng DB để lần ai đó thêm 'available' thì Postgres từ chối.
     */
    status: text("status").notNull().default("draft"),
    sort: integer("sort"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("vehicles_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("vehicles_status_valid", sql`${t.status} IN ('draft', 'published', 'archived')`),
    // Partial index CHỈ chứa hàng published, nên khoá đánh trên cột dùng để SẮP XẾP.
    // Đánh trên `status` là vô dụng: bên trong index này nó là hằng số.
    index("vehicles_published_idx")
      .on(t.sort, t.createdAt.desc())
      .where(sql`${t.status} = 'published'`),
  ],
);

/**
 * `file_id` trỏ tới directus.directus_files(id) nhưng CỐ Ý KHÔNG có foreign key:
 * bảng đó chỉ tồn tại sau khi Directus boot lần đầu, mà trên bản clone mới
 * `bun run db:migrate` chạy trước điều đó. Xem §3.1 design doc.
 */
export const vehiclePhotos = pgTable(
  "vehicle_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").notNull(),
    /** PRODUCT.md §Accessibility: mô tả thật, không phải tên file. NOT NULL là cố ý. */
    alt: text("alt").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("vehicle_photos_vehicle_idx").on(t.vehicleId, t.sort)],
);
