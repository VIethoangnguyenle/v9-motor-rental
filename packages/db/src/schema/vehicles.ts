import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Một bản ghi = MỘT CHIẾC XE CỤ THỂ, không phải một mẫu xe.
 * Quyết định + lý do ở §2 và §2.1 của
 * docs/plans/2026-08-10-fleet-catalogue-design.md.
 *
 * Tiền là `integer`, KHÔNG phải `bigint`. Hai lý do, đo trên drizzle-orm@0.45.2:
 *
 *  1. `integer` (tối đa ~2,1 tỷ) thừa sức chứa giá một ngày thuê và tiền cọc
 *     tính bằng đồng.
 *  2. `integer` là kiểu duy nhất round-trip về `number` thuần mà KHÔNG có tuỳ
 *     chọn nào để chọn sai. `bigint` bắt phải chọn `mode`:
 *     `mode: "number"` dựng PgBigInt53 (trả `number`), còn `mode: "bigint"`
 *     dựng PgBigInt64 và trả `BigInt` — thứ làm vỡ `type Vnd = number` của
 *     @v9/shared.
 *
 * KHÔNG phải vì "Drizzle trả bigint về dưới dạng string" — nó không trả string;
 * đó là hành vi của `numeric`/`decimal` (PgNumeric). Nhầm chỗ này từng nằm ở
 * chính comment này và ở §3.1 design doc; cả hai đã sửa.
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
    // Sàn cho tiền và phân khối. `NOT NULL` chặn được "không có giá", không chặn
    // được "giá âm" — và một giá ngày âm hôm nay insert được, rồi chảy thẳng ra
    // trang công khai. Cùng lý lẽ với CHECK của `status` ở trên: luật thuộc về DB
    // chứ không thuộc về code review.
    check("vehicles_money_nonneg", sql`${t.pricePerDay} >= 0 AND ${t.deposit} >= 0`),
    check("vehicles_engine_cc_positive", sql`${t.engineCc} > 0`),
    // Partial index CHỈ chứa hàng published, nên khoá đánh trên cột dùng để SẮP XẾP.
    // Đánh trên `status` là vô dụng: bên trong index này nó là hằng số.
    //
    // ⚠️ Index sinh ra là ("sort","created_at" DESC NULLS LAST). Endpoint danh sách
    // PHẢI viết ĐÚNG NGUYÊN VĂN mệnh đề này, không rút gọn:
    //
    //     ORDER BY sort, created_at DESC NULLS LAST
    //
    // Thiếu `NULLS LAST` là MẤT index trong im lặng — không lỗi, không cảnh báo,
    // chỉ chậm. Mặc định của Postgres cho `DESC` là `NULLS FIRST`, và planner
    // KHÔNG coi hai thứ đó thay thế được cho nhau, kể cả khi `created_at` là
    // NOT NULL nên trên thực tế không hàng nào có NULL. Đo bằng EXPLAIN trên
    // 20k hàng published: `ORDER BY sort, created_at DESC` rơi xuống Incremental
    // Sort; chỉ `... DESC NULLS LAST` mới ra Index Scan sạch.
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
  (t) => [
    index("vehicle_photos_vehicle_idx").on(t.vehicleId, t.sort),
    /**
     * `NOT NULL` ở trên chặn được "không có alt", KHÔNG chặn được `''` hay
     * `'IMG_2481.jpg'` — và cả hai đều lọt thẳng ra trang công khai, nơi
     * `PRODUCT.md` §Accessibility nói alt phải mô tả THẬT (loại xe, phân khối,
     * tình trạng) vì nội dung của app dựa nhiều vào ảnh.
     *
     * Ràng buộc diễn đạt ĐÚNG hai điều `PRODUCT.md` nói, không hơn: alt phải có
     * nội dung, và alt không được là một tên file.
     *
     * Bản đầu của CHECK này ép `length >= 10` — một proxy sai. Nó chặn nhầm mô
     * tả ngắn hợp lệ (fixture `'ảnh probe'` ở `vehicles-schema.test.ts` dài 9 ký
     * tự và bị từ chối), trong khi vẫn cho lọt `DSC_00012.jpeg` vì chuỗi đó dài
     * hơn 10. Độ dài không phân biệt được mô tả với tên file; phần đuôi mở rộng
     * thì có. Luật thuộc về DB chứ không thuộc về code review — cùng lý lẽ
     * `vehicles_status_valid` ở trên.
     *
     * ⚠️ CHECK này KHÔNG phát hiện được ảnh SAI nội dung. Một tấm ảnh test kèm
     * alt viết đúng vẫn qua được, và đó chính là ca đã xảy ra thật: file
     * `honda-cb500x-01.png` trong Directus là một bảng màu kiểm tra, mang alt
     * "Honda CB500X 471cc màu đỏ, nhìn nghiêng bên phải". Không có ràng buộc kỹ
     * thuật nào bắt được điều đó — nó là việc của người đăng ảnh.
     */
    check(
      "vehicle_photos_alt_meaningful",
      sql`btrim(${t.alt}) <> '' AND ${t.alt} !~* '\\.(jpe?g|png|webp|avif|gif|heic|heif|bmp|tiff?)$'`,
    ),
  ],
);
