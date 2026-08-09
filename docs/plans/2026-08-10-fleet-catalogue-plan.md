# Danh mục đội xe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shop nhập đội xe và ảnh thật trong Directus; `apps/web` hiển thị chúng ở `/xe` và `/xe/[slug]`, thay cho dữ liệu giả đang chạy.

**Architecture:** `packages/db` làm chủ schema (`vehicles`, `vehicle_photos`) qua migration. Directus **nhận** hai bảng đó để nhập liệu — nó không có DDL trên `public` nên không đổi được cấu trúc. `apps/api` phơi hai endpoint đọc có type; `apps/web` render tĩnh (SSG + ISR) và dựng URL ảnh trỏ vào `/assets` của Directus.

**Tech Stack:** Bun · Elysia + TypeBox · Drizzle ORM 0.45.2 (bun-sql) · Postgres 17 · Directus 11 · MinIO · Next 16 App Router · Tailwind v4 · Eden Treaty

**Spec:** [`2026-08-10-fleet-catalogue-design.md`](2026-08-10-fleet-catalogue-design.md) — đọc §7 trước khi bắt đầu.

---

## Trước khi bắt đầu — đọc ba luật này, chúng sẽ cắn nếu bỏ qua

1. **`bun run --filter` đặt cwd ở thư mục package, nên `.env` ở root không tới nơi.** Mọi script ở root động tới DB đều đã mang `--env-file`. Đừng "dọn" nó đi.
2. **Bun.SQL để SQLSTATE ở `.errno`, không phải `.code`.** Không dùng tới trong plan này, nhưng nếu bạn viết thêm xử lý lỗi Postgres thì nhớ.
3. **`eslint-plugin-boundaries` ép kiến trúc thật.** Bảng cho phép, đã đọc từ `eslint.config.js`:

| Từ                         | Được import                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/routes/**`   | `routes`, `services`, `plugins`, `packages/shared/src/domain/**`                                                                     |
| `apps/api/src/services/**` | `services`, `apps/api/src/{db,env}.ts`, `packages/db/**`, `packages/shared/src/domain/**`                                            |
| `apps/{web,staff}/**`      | `apps/{web,staff}/**`, `packages/shared/src/domain/**`, `packages/shared/src/client.ts`, và `import type` từ `apps/api/src/index.ts` |

**`packages/shared/src/index.ts` (barrel) KHÔNG nằm trong danh sách nào.** Đó là lý do Task 4 tồn tại: web lấy `formatVnd` qua subpath `@v9/shared/domain/money`, **không** qua `@v9/shared`. Đừng "sửa" bằng cách thêm `shared-root` vào allow-list của `frontend` — làm thế là mở hàng rào để tránh một dòng export.

## File structure

| File                                                | Trách nhiệm                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/db/src/schema/vehicles.ts`                | **Tạo.** Drizzle table `vehicles`, `vehicle_photos` + CHECK + index   |
| `packages/db/src/schema/index.ts`                   | **Sửa.** Re-export hai bảng                                           |
| `packages/db/migrations/0002_*.sql`                 | **Sinh ra.** Không viết tay                                           |
| `packages/db/src/vehicles-schema.test.ts`           | **Tạo.** Chứng minh CHECK và CASCADE chạy thật                        |
| `packages/shared/package.json`                      | **Sửa.** Thêm subpath export `./domain/money`                         |
| `apps/api/src/services/vehicles.ts`                 | **Tạo.** Truy vấn + map sang shape công khai. `plate` chết ở đây      |
| `apps/api/src/services/vehicles.test.ts`            | **Tạo.** Test service, cần Postgres                                   |
| `apps/api/src/routes/vehicles.ts`                   | **Tạo.** Elysia plugin `vehicles` + TypeBox schema                    |
| `apps/api/src/index.ts`                             | **Sửa.** `.use(vehicles)`                                             |
| `apps/web/lib/directus.ts`                          | **Tạo.** `assetUrl(fileId)` — chỗ duy nhất biết URL Directus          |
| `apps/web/lib/vehicles.ts`                          | **Tạo.** Gọi Eden, nuốt lỗi thành `[]` / `null`                       |
| `apps/web/app/_components/site-header.tsx`          | **Tạo.** Tách từ `page.tsx` để 3 trang dùng chung                     |
| `apps/web/app/_components/site-footer.tsx`          | **Tạo.** Tách từ `page.tsx`                                           |
| `apps/web/app/_components/vehicle-card.tsx`         | **Tạo.** Thẻ xe dùng ở `/` và `/xe`                                   |
| `apps/web/app/_components/layout.ts`                | **Tạo.** Hằng `CONTAINER`                                             |
| `apps/web/app/xe/page.tsx`                          | **Tạo.** Danh sách                                                    |
| `apps/web/app/xe/[slug]/page.tsx`                   | **Tạo.** Chi tiết                                                     |
| `apps/web/app/page.tsx`                             | **Sửa.** Dùng data thật, dùng component tách ra                       |
| `apps/web/app/_placeholder-data.ts`                 | **Xoá**                                                               |
| `apps/web/messages/vi.json`                         | **Sửa.** Thêm khoá, viết lại `vehicles.empty`                         |
| `apps/web/next.config.ts`                           | **Sửa.** `images.remotePatterns`                                      |
| `apps/web/Dockerfile`                               | **Sửa.** `ARG NEXT_PUBLIC_DIRECTUS_URL` + vá `COPY public` đang thiếu |
| `.github/workflows/deploy.yml`                      | **Sửa.** Thêm build-arg cho URL Directus                              |
| `compose.yaml`, `compose.prod.yaml`, `.env.example` | **Sửa.** `STORAGE_*` cho Directus, `NEXT_PUBLIC_DIRECTUS_URL`         |
| `docs/runbooks/directus-vehicles.md`                | **Tạo.** Các bước bấm trong Directus                                  |
| `CLAUDE.md`                                         | **Sửa.** Probe asset + cập nhật §Việc còn để lại                      |

---

## Task 0: Probe — Directus có nhận được bảng có sẵn mà không cần DDL không?

**Đây là chốt chặn. Nếu nó hỏng, DỪNG và báo người — §3 và §5 của design doc phải viết lại trước khi code.** Không viết một dòng migration nào trước khi task này xanh.

**Files:**

- Modify: `docs/plans/2026-08-10-fleet-catalogue-design.md` (ghi kết quả probe vào §7)

- [ ] **Step 1: Dựng hạ tầng**

```bash
docker compose up -d
docker compose ps
```

Expected: `postgres`, `minio`, `directus`, `supertokens` đều `Up`. `minio-init` đã `Exited (0)` — nó là job một lần, không phải service chết.

- [ ] **Step 2: Tạo bảng probe bằng role `v9` (role làm chủ `public`)**

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "CREATE TABLE public.probe_fleet (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     file_id uuid
   );"
```

Expected: `CREATE TABLE`

- [ ] **Step 3: Xác nhận `directus_app` đọc được bảng vừa tạo**

Đây là kiểm chứng cho `ALTER DEFAULT PRIVILEGES` ở migration `0001` — nó chỉ áp cho bảng do đúng role đã chạy nó tạo ra, và cho tới giờ chưa có bảng nào sinh sau để chứng minh.

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; SELECT count(*) FROM public.probe_fleet;"
```

Expected: `count | 0`.
**Nếu ra `permission denied for table probe_fleet`:** default privileges không phủ. Dừng và báo người — cần một migration `GRANT` bổ sung, và đó là thay đổi ngoài phạm vi plan này.

- [ ] **Step 4: Directus nhận collection**

Mở `http://localhost:8055`, đăng nhập bằng `DIRECTUS_ADMIN_EMAIL` / `DIRECTUS_ADMIN_PASSWORD` trong `.env`.
Vào **Settings → Data Model**. `probe_fleet` phải xuất hiện trong danh sách bảng chưa quản lý. Bấm vào nó để tạo collection.

Expected: collection tạo được, không báo lỗi quyền. (Thao tác này chỉ chèn metadata vào schema `directus`.)

- [ ] **Step 5: Thử gắn field ảnh — ĐÂY là câu hỏi thật của probe**

Trong `probe_fleet`, bấm **Create Field → Image** (hoặc sửa field `file_id` có sẵn thành relation tới Directus Files).

Ghi lại **chính xác** điều xảy ra:

- **Xanh** = Directus lưu field, không báo lỗi → thiết kế đứng vững, đi tiếp.
- **Đỏ với `must be owner of table probe_fleet` hoặc `permission denied`** = Directus đòi DDL → thiết kế phải đổi. Dừng, báo người, mở §7 của design doc và chọn đường lùi (1) hoặc (2) ở đó.

- [ ] **Step 6: Xác nhận hàng rào DDL vẫn còn nguyên**

Bất kể Step 5 ra gì, thêm cột phải bị từ chối:

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; ALTER TABLE public.probe_fleet ADD COLUMN x int;"
```

Expected: `ERROR: must be owner of table probe_fleet`

- [ ] **Step 7: Dọn**

Xoá collection `probe_fleet` trong Directus UI (Settings → Data Model → Delete Collection), rồi:

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c "DROP TABLE IF EXISTS public.probe_fleet;"
```

Expected: `DROP TABLE`

- [ ] **Step 8: Ghi kết quả vào design doc và commit**

Mở `docs/plans/2026-08-10-fleet-catalogue-design.md`, thêm vào cuối §7 một mục:

```markdown
### 7.1 Kết quả probe (chạy ngày <YYYY-MM-DD>)

- Directus nhận collection từ bảng có sẵn: **<được / không>**
- Gắn field ảnh không cần DDL: **<được / không>** — <dán nguyên văn thông báo nếu lỗi>
- `directus_app` đọc được bảng sinh sau migration 0001: **<được / không>**
- `ALTER TABLE` bằng `directus_app` vẫn bị từ chối: **<đúng / sai>**

Kết luận: <đi tiếp theo thiết kế hiện tại / chuyển sang đường lùi (1) / (2)>
```

```bash
git add docs/plans/2026-08-10-fleet-catalogue-design.md
git commit -m "docs: kết quả probe Directus adopt bảng có sẵn"
```

---

## Task 1: Schema `vehicles` + `vehicle_photos`

**Files:**

- Create: `packages/db/src/schema/vehicles.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/vehicles-schema.test.ts`

- [ ] **Step 1: Viết test trước**

Test này chứng minh `CHECK` và `ON DELETE CASCADE` chạy ở tầng Postgres — không phải chứng minh Drizzle biên dịch được. Viết theo đúng kiểu `packages/db/src/btree-gist.test.ts`: mọi thứ trong transaction rồi ROLLBACK.

Tạo `packages/db/src/vehicles-schema.test.ts`:

```ts
import { afterAll, describe, expect, it } from "bun:test";
import { SQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa set — cần .env và `docker compose up -d`");

const sql = new SQL(url);
afterAll(async () => {
  await sql.close();
});

/** Chạy fn trong transaction rồi luôn ROLLBACK — không commit dữ liệu test nào. */
async function inRollback(fn: (tx: SQL) => Promise<void>): Promise<void> {
  await sql
    .begin(async (tx) => {
      await fn(tx as unknown as SQL);
      throw new Error("rollback-on-purpose");
    })
    .catch((e: Error) => {
      if (e.message !== "rollback-on-purpose") throw e;
    });
}

const base = {
  make: "Honda",
  model: "Probe",
  engine_cc: 500,
  price_per_day: 500_000,
  deposit: 5_000_000,
};

describe("schema vehicles", () => {
  it("từ chối status ngoài ba giá trị hợp lệ", async () => {
    await inRollback(async (tx) => {
      let errno: string | undefined;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit, status)
            VALUES ('probe-status', ${base.make}, ${base.model}, ${base.engine_cc},
                    ${base.price_per_day}, ${base.deposit}, 'available')
          `;
        });
      } catch (e) {
        // SQLSTATE thật nằm ở .errno, KHÔNG phải .code — xem CLAUDE.md.
        errno = (e as { errno?: string }).errno;
      }
      expect(errno).toBe("23514"); // check_violation
    });
  });

  it("từ chối slug có chữ hoa hoặc khoảng trắng", async () => {
    await inRollback(async (tx) => {
      let errno: string | undefined;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit)
            VALUES ('Honda CB500X', ${base.make}, ${base.model}, ${base.engine_cc},
                    ${base.price_per_day}, ${base.deposit})
          `;
        });
      } catch (e) {
        errno = (e as { errno?: string }).errno;
      }
      expect(errno).toBe("23514");
    });
  });

  it("xoá xe thì ảnh của nó biến theo (CASCADE)", async () => {
    await inRollback(async (tx) => {
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit)
        VALUES ('probe-cascade', ${base.make}, ${base.model}, ${base.engine_cc},
                ${base.price_per_day}, ${base.deposit})
        RETURNING id
      `;
      const vehicleId = inserted[0]?.id;
      expect(vehicleId).toBeString();

      await tx`
        INSERT INTO vehicle_photos (vehicle_id, file_id, alt)
        VALUES (${vehicleId}::uuid, gen_random_uuid(), 'ảnh probe')
      `;

      await tx`DELETE FROM vehicles WHERE id = ${vehicleId}::uuid`;

      const left = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM vehicle_photos WHERE vehicle_id = ${vehicleId}::uuid
      `;
      expect(left[0]?.n).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó ĐỎ vì đúng lý do**

```bash
bun test packages/db/src/vehicles-schema.test.ts
```

Expected: FAIL với `relation "vehicles" does not exist`.
**Nếu đỏ vì lý do khác** (ví dụ `DATABASE_URL chưa set`) thì sửa môi trường trước — một test đỏ vì sai môi trường không chứng minh gì cả.

- [ ] **Step 3: Khai schema Drizzle**

Tạo `packages/db/src/schema/vehicles.ts`:

```ts
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
```

- [ ] **Step 4: Re-export**

Sửa `packages/db/src/schema/index.ts` — **giữ nguyên khối comment về `rentals`**, chỉ thay dòng `export {};`:

```ts
/**
 * Khi bảng `rentals` ra đời, migration của nó phải kèm:
 *
 *   ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap
 *     EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);
 *
 * với `period` kiểu tstzrange dùng biên [start, end) — khớp overlaps() trong @v9/shared.
 * Extension btree_gist đã được bật sẵn ở migration 0000 để dòng trên chạy được.
 */
export { vehiclePhotos, vehicles } from "./vehicles";
```

- [ ] **Step 5: Sinh migration và ĐỌC file SQL sinh ra**

```bash
bun run db:generate
```

Expected: tạo `packages/db/migrations/0002_<tên-drizzle-tự-đặt>.sql`.

**Bắt buộc mở file đó ra đọc.** Ba thứ phải có mặt:

1. `CONSTRAINT "vehicles_slug_format" CHECK (...)` và `"vehicles_status_valid"`
2. `CREATE INDEX "vehicles_published_idx" ... WHERE "status" = 'published'`
3. `ON DELETE cascade` trên FK của `vehicle_photos`

Nếu thiếu bất kỳ cái nào: **đừng sửa tay file đã sinh** (làm thế là để snapshot drizzle lệch khỏi thực tế, và lần `db:generate` sau sẽ đòi tạo lại bảng). Thay vào đó chạy `bun run db:custom` và viết phần thiếu vào migration `0003`.

- [ ] **Step 6: Apply**

```bash
bun run db:migrate
```

Expected: log áp dụng `0002_*`, không lỗi.

- [ ] **Step 7: Chạy test, xác nhận XANH**

```bash
bun test packages/db/src/vehicles-schema.test.ts
```

Expected: 3 pass, 0 fail.

- [ ] **Step 8: `directus_app` đọc ghi được bảng thật (tiêu chí #2 của design doc)**

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; SELECT count(*) FROM vehicles;"
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; ALTER TABLE vehicles ADD COLUMN x int;"
```

Expected: lệnh đầu ra `count | 0`; lệnh sau ra `ERROR: must be owner of table vehicles`.
Cả hai đều phải đúng — chặn dữ liệu là hỏng, chặn schema mới là mục tiêu.

- [ ] **Step 9: Commit**

```bash
bun run typecheck && bun run lint
git add packages/db/src/schema/ packages/db/migrations/ packages/db/src/vehicles-schema.test.ts
git commit -m "feat(db): bảng vehicles và vehicle_photos + CHECK trạng thái danh mục"
```

---

## Task 2: Directus lưu file vào MinIO

Hiện Directus không có volume và không có `STORAGE_*` — file upload rơi vào ổ đĩa trong container và mất sau mỗi `docker compose down`. Bucket `vehicles` đã tồn tại từ đợt 1 nhưng chưa ai ghi vào.

**Files:**

- Modify: `compose.yaml`, `compose.prod.yaml`, `.env.example`

- [ ] **Step 1: Thêm storage vào `compose.yaml`**

Trong service `directus`, thêm `minio` vào `depends_on` và tám biến `STORAGE_*` vào `environment` (giữ nguyên mọi biến đang có):

```yaml
depends_on:
  postgres:
    condition: service_healthy
  minio:
    condition: service_healthy
environment:
  # ... các biến KEY/SECRET/DB_* đang có, giữ nguyên ...
  # Ảnh xe lưu vào MinIO, KHÔNG lưu trong container: không có dòng này thì
  # mọi file upload biến mất sau `docker compose down`.
  STORAGE_LOCATIONS: s3
  STORAGE_S3_DRIVER: s3
  STORAGE_S3_KEY: ${MINIO_ROOT_USER}
  STORAGE_S3_SECRET: ${MINIO_ROOT_PASSWORD}
  STORAGE_S3_BUCKET: ${MINIO_BUCKET_VEHICLES}
  STORAGE_S3_REGION: us-east-1
  STORAGE_S3_ENDPOINT: http://minio:9000
  # BẮT BUỘC với MinIO: driver S3 mặc định dựng URL kiểu bucket.host/key,
  # MinIO chỉ phục vụ host/bucket/key. Thiếu dòng này upload trả 403/404
  # với thông báo không nhắc gì tới path style.
  STORAGE_S3_FORCE_PATH_STYLE: "true"
```

- [ ] **Step 2: Cùng thay đổi cho `compose.prod.yaml`**

Áp y hệt Step 1 vào service `directus` trong `compose.prod.yaml`.

- [ ] **Step 3: Thêm biến vào `.env.example`**

Dưới khối Directus đang có:

```bash
# Directus lưu ảnh vào MinIO qua S3 driver. PROD: tạo access key riêng cho
# Directus thay vì dùng MINIO_ROOT_* — root lọt ra prod theo quán tính là
# cách rò rỉ quyền phổ biến nhất.

# apps/web dựng URL ảnh từ biến này. ĐỌC LÚC BUILD (next.config.ts dùng nó cho
# images.remotePatterns), nên đổi nó bắt buộc phải build lại image của web.
NEXT_PUBLIC_DIRECTUS_URL=http://localhost:8055
```

Thêm dòng tương ứng vào `.env` local của bạn.

- [ ] **Step 4: Dựng lại Directus và upload thử**

```bash
docker compose up -d --force-recreate directus
docker compose logs directus --tail 30
```

Expected: không có lỗi S3 lúc khởi động.

Mở `http://localhost:8055` → **Files** → upload một ảnh bất kỳ.

- [ ] **Step 5: Chứng minh byte thật nằm trong MinIO**

```bash
docker compose exec -T minio mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
docker compose exec -T minio mc ls local/vehicles
```

Expected: thấy object vừa upload. Nếu rỗng thì storage chưa nối — kiểm lại `STORAGE_S3_FORCE_PATH_STYLE`.

- [ ] **Step 6: Chứng minh nó sống sót qua vòng đời container (tiêu chí #5)**

Đây là kiểm tra duy nhất phân biệt "đã sửa" với "trông như đã sửa".

```bash
docker compose down
docker compose up -d
```

Mở lại Files trong Directus: ảnh vừa upload phải còn, xem được.

- [ ] **Step 7: Commit**

```bash
git add compose.yaml compose.prod.yaml .env.example
git commit -m "fix(directus): lưu file vào MinIO — trước đó upload mất sau mỗi compose down"
```

---

## Task 3: Script cấu hình Directus (`scripts/directus-setup.ts`)

> **Task này đã được viết lại sau Task 0.** Bản đầu là một danh sách bước bấm trong UI. Probe cho thấy Directus **không** tạo được quan hệ file (nó phát `ALTER TABLE`, Postgres từ chối), nên quan hệ phải chèn bằng SQL — và vì đã phải viết SQL thì viết luôn cả phần còn lại thành script chạy lại được. Xem §7.1 và §4.5 của design doc.

**Files:**

- Create: `scripts/directus-setup.ts`
- Modify: `package.json` (thêm script `directus:setup`)
- Create: `docs/runbooks/directus-vehicles.md`

**Ba sự thật đo được ở Task 0, script phải tôn trọng:**

| Thao tác                       | Được?  | Cách làm trong script                               |
| ------------------------------ | ------ | --------------------------------------------------- |
| Adopt bảng có sẵn              | ✅     | `POST /collections` với **chỉ** khoá `meta`         |
| Sửa interface của field có sẵn | ✅     | `PATCH /fields/<collection>/<field>`                |
| Tạo field mới                  | ❌ DDL | không làm — mọi cột đến từ migration                |
| `POST /relations`              | ❌ DDL | thay bằng `INSERT INTO directus.directus_relations` |
| `DELETE /collections`          | ❌ DDL | dọn bằng SQL                                        |

- [ ] **Step 1: Viết script**

Tạo `scripts/directus-setup.ts`. Yêu cầu cứng: **idempotent** — kiểm-trước-khi-làm ở mọi bước, chạy hai lần liên tiếp thì lần hai không đổi gì. Đọc env `DIRECTUS_URL` (mặc định `http://localhost:8055`), `DIRECTUS_ADMIN_EMAIL`, `DIRECTUS_ADMIN_PASSWORD`, `DATABASE_URL`.

Thứ tự bắt buộc:

1. `POST /auth/login` lấy `access_token`.
2. Adopt `vehicles` rồi `vehicle_photos` — `GET /fields/<collection>` trước; nếu 403/404 thì `POST /collections` với chỉ `meta`. (Bảng tự hiện trong `GET /collections` kể cả khi chưa adopt, nên **đừng** dùng endpoint đó để kiểm — đó là bẫy đã gặp ở Task 0.)
3. `PATCH /fields/...` cho interface:

| Field                  | Cấu hình                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `vehicles.status`      | dropdown đúng ba giá trị `draft` / `published` / `archived`      |
| `vehicles.slug`        | note: "chữ thường, số và dấu gạch ngang. Ví dụ: honda-cb500x-01" |
| `vehicles.plate`       | note: "Nội bộ — không hiển thị trên web"                         |
| `vehicles.description` | interface textarea                                               |

4. Chèn hai quan hệ bằng SQL qua `Bun.SQL` trên `DATABASE_URL` (role `v9`), mỗi cái bọc kiểm tồn tại:
   - `vehicle_photos.file_id` → `directus_files` (M2O, `schema: null`)
   - `vehicle_photos.vehicle_id` → `vehicles`, `one_field = 'photos'` (O2M nhìn từ `vehicles`)
5. Role Public: **read `directus_files`**, không gì khác. Không cấp quyền nào trên `vehicles` / `vehicle_photos` — JSON đi qua `apps/api`, Directus chỉ phơi byte ảnh.
6. `PATCH /settings`: `storage_asset_transform = "presets"`, presets có key `web` (fit `inside`, width 2000, quality 80).
7. `POST /utils/cache/clear`. **Bỏ bước này là hỏng ngầm:** sau khi chèn thẳng vào `directus_relations`, Directus vẫn dùng schema cũ trong bộ nhớ, quan hệ trông như không có tác dụng, và người sau đi debug nhầm chỗ.

Thêm vào `package.json` ở root:

```json
    "directus:setup": "bun --env-file=.env scripts/directus-setup.ts",
```

⚠️ **`scripts/` ở root là thư mục mới, và `boundaries/no-unknown-files` có thể nổ vì nó không khớp element nào.** Nếu `bun run lint` báo lỗi đó, thêm `scripts/**` vào mảng `boundaries/ignore` trong `eslint.config.js` — cùng lý do đã ghi sẵn ở đó cho `apps/api/scripts/**`: đây là công cụ vận hành, không phải một tầng trong kiến trúc app/service/db. **Đụng vào `eslint.config.js` thì bắt buộc chạy lại cả ba probe boundaries trong `CLAUDE.md`** và đọc mã lỗi, không chỉ nhìn exit code.

- [ ] **Step 2: Chạy, rồi chạy lại lần nữa**

```bash
bun run directus:setup
bun run directus:setup
```

Expected: lần một tạo mọi thứ; **lần hai không đổi gì** và không lỗi. Script không idempotent sẽ hỏng đúng vào lần dựng môi trường thứ hai — lúc không ai còn nhớ nó tồn tại. Đây là tiêu chí #1b của design doc.

- [ ] **Step 3: Dọn metadata rác có sẵn**

`directus_collections` đang còn một dòng `probe_vehicles` từ phiên đợt 2 — bảng đã bị xoá từ lâu, dòng metadata thì không, vì `DELETE /collections` cũng cần DDL. Xoá bằng SQL:

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "DELETE FROM directus.directus_collections WHERE collection = 'probe_vehicles';"
```

- [ ] **Step 4: Nhập một xe thật để kiểm đầu-cuối**

Tạo một bản ghi `vehicles` với dữ liệu thật của shop, `status = published`, kèm ít nhất một ảnh có `alt` mô tả thật (loại xe, phân khối, tình trạng — không phải tên file).

- [ ] **Step 5: Xác nhận ảnh ra được và transform tuỳ ý bị chặn**

```bash
# lấy uuid file từ Directus UI rồi thay vào
curl -sI "http://localhost:8055/assets/<uuid>?key=web" | head -3
curl -sI "http://localhost:8055/assets/<uuid>?width=9999" | head -3
```

Expected: lệnh đầu ra `200` + `content-type: image/...`. Lệnh sau **không** trả ảnh 9999px (Directus từ chối hoặc trả ảnh gốc theo preset).

- [ ] **Step 6: Viết runbook**

Tạo `docs/runbooks/directus-vehicles.md`, mở đầu bằng:

```markdown
# Runbook — Directus cho danh mục đội xe

Cấu hình Directus **không** do repo ép — không có gì bắt ai chạy script. Nhưng nó
được viết thành `scripts/directus-setup.ts` nên review được trong diff và chạy lại
được, thay vì sống trong trí nhớ người đã bấm.

Môi trường mới, hoặc sau khi reset volume Postgres:

    docker compose up -d
    bun run db:migrate
    bun run directus:setup     # chạy được nhiều lần, vô hại
```

Phần còn lại của runbook ghi: những gì Directus **không** làm được (tạo field, tạo quan hệ, xoá collection — đều cần DDL) và cách dọn metadata rác bằng SQL khi một bảng bị xoá.

- [ ] **Step 7: Commit**

```bash
bun run typecheck && bun run lint
git add scripts/directus-setup.ts package.json docs/runbooks/directus-vehicles.md
git commit -m "feat: script cấu hình Directus idempotent — quan hệ ảnh qua metadata, không qua DDL"
```

---

## Task 4: Mở đường hợp lệ cho `formatVnd` tới frontend

`apps/{web,staff}` chỉ được import `packages/shared/src/domain/**` và `src/client.ts` — **không** được import barrel `src/index.ts`. Mà `packages/shared` mới export `.` và `./client`. Nên hiện web không có cách nào hợp lệ để lấy `formatVnd`.

**Files:**

- Modify: `packages/shared/package.json`

- [ ] **Step 1: Thêm subpath export**

```json
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./domain/money": "./src/domain/money.ts"
  },
```

- [ ] **Step 2: Chứng minh đường mới hợp lệ với boundaries**

```bash
cat > /tmp/probe-money.ts <<'EOF'
import { formatVnd } from "@v9/shared/domain/money";
export const x = formatVnd(1200000);
EOF
cp /tmp/probe-money.ts apps/web/lib/probe-money.ts
bun x eslint apps/web/lib/probe-money.ts
rm apps/web/lib/probe-money.ts
```

Expected: **không có lỗi `boundaries/dependencies`**.
Nếu vẫn nổ boundaries: dừng lại. Đừng nới allow-list của `frontend` — báo người, vì đó là thay đổi hàng rào kiến trúc và phải chạy lại toàn bộ bộ probe trong `CLAUDE.md`.

- [ ] **Step 3: Commit**

```bash
bun run typecheck
git add packages/shared/package.json
git commit -m "feat(shared): export subpath domain/money để frontend dùng formatVnd"
```

---

## Task 5: `apps/api` — service và route

**Files:**

- Create: `apps/api/src/services/vehicles.ts`
- Create: `apps/api/src/services/vehicles.test.ts`
- Create: `apps/api/src/routes/vehicles.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Viết test trước**

Test nằm ở `services/` chứ không ở `routes/` vì boundaries: `routes/**` không được import `@v9/db` hay `../db`, nên không seed được dữ liệu.

Tạo `apps/api/src/services/vehicles.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { client, db } from "../db";
import { findPublishedVehicleBySlug, listPublishedVehicles } from "./vehicles";

// Tiền tố riêng để dọn sạch mà không đụng dữ liệu thật của shop.
const P = "ztest-";

beforeAll(async () => {
  const [pub] = await db
    .insert(schema.vehicles)
    .values({
      slug: `${P}cb500x-01`,
      make: "Honda",
      model: "CB500X",
      year: 2022,
      engineCc: 471,
      odoKm: 12000,
      color: "Đen",
      plate: "59A1-234.56",
      description: "Xe test",
      pricePerDay: 500_000,
      deposit: 5_000_000,
      status: "published",
      sort: 1,
    })
    .returning();

  await db.insert(schema.vehicles).values({
    slug: `${P}z900-01`,
    make: "Kawasaki",
    model: "Z900",
    engineCc: 948,
    pricePerDay: 900_000,
    deposit: 10_000_000,
    status: "draft",
  });

  if (!pub) throw new Error("seed hỏng");
  await db.insert(schema.vehiclePhotos).values([
    { vehicleId: pub.id, fileId: crypto.randomUUID(), alt: "ảnh thứ hai", sort: 2 },
    { vehicleId: pub.id, fileId: crypto.randomUUID(), alt: "ảnh đầu", sort: 1 },
  ]);
});

afterAll(async () => {
  // Xoá xe là đủ — ảnh đi theo nhờ ON DELETE CASCADE.
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  // `client` là singleton của apps/api. Đóng ở đây an toàn vì đây là file test
  // duy nhất trong apps/api dùng nó; nếu sau này có file thứ hai, bỏ dòng này
  // ra khỏi cả hai và để tiến trình test tự kết thúc.
  await client.close();
});

describe("listPublishedVehicles", () => {
  it("chỉ trả xe published", async () => {
    const all = await listPublishedVehicles();
    const slugs = all.map((v) => v.slug);
    expect(slugs).toContain(`${P}cb500x-01`);
    expect(slugs).not.toContain(`${P}z900-01`);
  });

  it("không để lộ biển số", async () => {
    const all = await listPublishedVehicles();
    const v = all.find((x) => x.slug === `${P}cb500x-01`);
    expect(v).toBeDefined();
    expect(Object.keys(v as object)).not.toContain("plate");
  });

  it("trả đúng MỘT ảnh, là ảnh có sort nhỏ nhất", async () => {
    const all = await listPublishedVehicles();
    const v = all.find((x) => x.slug === `${P}cb500x-01`);
    expect(v?.photo?.alt).toBe("ảnh đầu");
  });
});

describe("findPublishedVehicleBySlug", () => {
  it("trả cả bộ ảnh theo thứ tự sort", async () => {
    const v = await findPublishedVehicleBySlug(`${P}cb500x-01`);
    expect(v?.photos.map((p) => p.alt)).toEqual(["ảnh đầu", "ảnh thứ hai"]);
    expect(v?.description).toBe("Xe test");
  });

  it("trả null cho xe draft", async () => {
    expect(await findPublishedVehicleBySlug(`${P}z900-01`)).toBeNull();
  });

  it("trả null cho slug không tồn tại", async () => {
    expect(await findPublishedVehicleBySlug(`${P}khong-co`)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ vì đúng lý do**

```bash
bun test apps/api/src/services/vehicles.test.ts
```

Expected: FAIL với `Cannot find module './vehicles'` hoặc tương đương.

- [ ] **Step 3: Viết service**

Tạo `apps/api/src/services/vehicles.ts`:

```ts
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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

type VehicleRow = typeof schema.vehicles.$inferSelect;

function toSummary(row: VehicleRow, photo: VehiclePhoto | null): VehicleSummary {
  return {
    id: row.id,
    slug: row.slug,
    make: row.make,
    model: row.model,
    year: row.year,
    engineCc: row.engineCc,
    odoKm: row.odoKm,
    color: row.color,
    pricePerDay: row.pricePerDay,
    deposit: row.deposit,
    photo,
  };
}

export async function listPublishedVehicles(): Promise<VehicleSummary[]> {
  // asc() của Postgres đã là NULLS LAST mặc định — xe chưa đặt `sort` rơi xuống cuối.
  const rows = await db
    .select()
    .from(schema.vehicles)
    .where(eq(schema.vehicles.status, "published"))
    .orderBy(asc(schema.vehicles.sort), desc(schema.vehicles.createdAt));

  if (rows.length === 0) return [];

  const photos = await db
    .select()
    .from(schema.vehiclePhotos)
    .where(
      inArray(
        schema.vehiclePhotos.vehicleId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(schema.vehiclePhotos.sort));

  const first = new Map<string, VehiclePhoto>();
  for (const p of photos) {
    if (!first.has(p.vehicleId)) first.set(p.vehicleId, { fileId: p.fileId, alt: p.alt });
  }

  return rows.map((r) => toSummary(r, first.get(r.id) ?? null));
}

export async function findPublishedVehicleBySlug(slug: string): Promise<VehicleDetail | null> {
  const rows = await db
    .select()
    .from(schema.vehicles)
    .where(and(eq(schema.vehicles.slug, slug), eq(schema.vehicles.status, "published")))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const photoRows = await db
    .select()
    .from(schema.vehiclePhotos)
    .where(eq(schema.vehiclePhotos.vehicleId, row.id))
    .orderBy(asc(schema.vehiclePhotos.sort));

  const photos = photoRows.map((p) => ({ fileId: p.fileId, alt: p.alt }));

  return {
    ...toSummary(row, photos[0] ?? null),
    description: row.description,
    photos,
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
bun test apps/api/src/services/vehicles.test.ts
```

Expected: 6 pass, 0 fail.

- [ ] **Step 5: Viết route**

Tạo `apps/api/src/routes/vehicles.ts`:

```ts
import { Elysia, t } from "elysia";
import { findPublishedVehicleBySlug, listPublishedVehicles } from "../services/vehicles";

const photoSchema = t.Object({
  fileId: t.String({ format: "uuid" }),
  alt: t.String(),
});

/**
 * `plate` KHÔNG có trong schema này, và đó chính là cơ chế chặn: Elysia cắt mọi
 * field không được khai. Cái bảo vệ là schema — không phải một câu SELECT viết
 * cẩn thận, vì câu SELECT đó sẽ thành SELECT * vào một ngày nào đó.
 */
const summarySchema = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String(),
  make: t.String(),
  model: t.String(),
  year: t.Nullable(t.Integer()),
  engineCc: t.Integer(),
  odoKm: t.Nullable(t.Integer()),
  color: t.Nullable(t.String()),
  pricePerDay: t.Integer(),
  deposit: t.Integer(),
  photo: t.Nullable(photoSchema),
});

const detailSchema = t.Composite([
  summarySchema,
  t.Object({
    description: t.Nullable(t.String()),
    photos: t.Array(photoSchema),
  }),
]);

/** `name` là bắt buộc — thiếu nó Elysia chạy lại plugin mỗi lần `.use()`. */
export const vehicles = new Elysia({ name: "vehicles" })
  .get("/vehicles", () => listPublishedVehicles(), {
    response: t.Array(summarySchema),
  })
  .get(
    "/vehicles/:slug",
    async ({ params, status }) => {
      const vehicle = await findPublishedVehicleBySlug(params.slug);
      if (!vehicle) return status(404, { message: "Không tìm thấy xe" });
      return status(200, vehicle);
    },
    {
      params: t.Object({ slug: t.String() }),
      response: {
        200: detailSchema,
        404: t.Object({ message: t.String() }),
      },
    },
  );
```

- [ ] **Step 6: Gắn vào app**

Sửa `apps/api/src/index.ts` — thêm import và một `.use()`:

```ts
import { health } from "./routes/health";
import { vehicles } from "./routes/vehicles";

const app = new Elysia()
  .use(cors())
  .use(timing)
  .use(auth)
  .use(health)
  .use(vehicles)
  .listen({ port: env.port, hostname: env.host });
```

- [ ] **Step 7: Kiểm đầu-cuối bằng HTTP thật**

```bash
bun run --filter @v9/api dev &
sleep 2
curl -s localhost:3001/vehicles | head -c 400; echo
curl -s localhost:3001/vehicles | grep -ci plate || echo "0 — không rò biển số"
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/vehicles/khong-ton-tai
```

Expected: JSON có xe đã nhập ở Task 3 · `0 — không rò biển số` · `404`.
Nhớ tắt tiến trình dev sau khi kiểm (`kill %1`).

- [ ] **Step 8: Commit**

```bash
bun test && bun run typecheck && bun run lint
git add apps/api/src/services/vehicles.ts apps/api/src/services/vehicles.test.ts \
        apps/api/src/routes/vehicles.ts apps/api/src/index.ts
git commit -m "feat(api): GET /vehicles và /vehicles/:slug — biển số chặn bằng response schema"
```

---

## Task 6: `apps/web` — hạ tầng dùng chung

Tách phần dùng chung ra trước, để hai trang mới và trang chủ không copy-paste ba bản header/footer.

**Files:**

- Modify: `apps/web/next.config.ts`
- Create: `apps/web/lib/directus.ts`, `apps/web/lib/vehicles.ts`
- Create: `apps/web/app/_components/layout.ts`, `site-header.tsx`, `site-footer.tsx`, `vehicle-card.tsx`
- Modify: `apps/web/messages/vi.json`

- [ ] **Step 1: Cho phép `next/image` lấy ảnh từ Directus**

Sửa `apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";

// Đọc LÚC BUILD. Đổi NEXT_PUBLIC_DIRECTUS_URL bắt buộc phải build lại image của web —
// cùng bản chất với VITE_API_URL của apps/staff.
const directus = new URL(process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "http://localhost:8055");

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: `${import.meta.dirname}/../..`,
  images: {
    // Thiếu khối này thì next/image TỪ CHỐI THẲNG ảnh từ Directus, không phải cảnh báo.
    remotePatterns: [
      {
        protocol: directus.protocol === "https:" ? "https" : "http",
        hostname: directus.hostname,
        port: directus.port,
        pathname: "/assets/**",
      },
    ],
  },
};

export default config;
```

- [ ] **Step 2: Truyền biến đó vào bản build production**

`next.config.ts` đọc `NEXT_PUBLIC_DIRECTUS_URL` **lúc build**, nên đặt nó trong `environment` của compose là vô tác dụng — đúng bản chất `VITE_API_URL` của `apps/staff`. Phải đi qua build arg.

Sửa `apps/web/Dockerfile`, ngay dưới cặp `ARG/ENV` của `NEXT_PUBLIC_API_URL`:

```dockerfile
ARG NEXT_PUBLIC_DIRECTUS_URL
ENV NEXT_PUBLIC_DIRECTUS_URL=$NEXT_PUBLIC_DIRECTUS_URL
```

Sửa `.github/workflows/deploy.yml`, thêm một dòng vào khối `build-args`:

```yaml
build-args: |
  VITE_API_URL=https://api.${{ vars.ROOT_DOMAIN }}
  NEXT_PUBLIC_API_URL=https://api.${{ vars.ROOT_DOMAIN }}
  NEXT_PUBLIC_DIRECTUS_URL=https://data.${{ vars.ROOT_DOMAIN }}
```

Sửa `compose.prod.yaml`, service `web` — thêm comment giải thích vì sao biến này **không** nằm trong `environment`:

```yaml
web:
  image: ghcr.io/viethoangnguyenle/v9-motor-rental-web:latest
  restart: unless-stopped
  depends_on:
    api:
      condition: service_healthy
  environment:
    NEXT_PUBLIC_API_URL: https://api.${ROOT_DOMAIN}
    PORT: "3000"
  # KHÔNG đặt NEXT_PUBLIC_DIRECTUS_URL ở đây — next.config.ts đọc nó lúc build
  # để dựng images.remotePatterns, nên nó đi qua --build-arg (xem apps/web/Dockerfile
  # và .github/workflows/deploy.yml). Đặt runtime ở đây không có tác dụng gì.
```

- [ ] **Step 3: Vá một lỗi có sẵn sẽ làm hỏng chính trang này trên prod**

`apps/web/Dockerfile` cố ý bỏ `COPY public` với lý do "`apps/web/public/` chưa tồn tại trong repo". Lý do đó **không còn đúng** — commit `fdfd711` đã thêm `public/placeholder/*.jpg`, và ảnh hero của trang chủ nằm ở đó. Ship như hiện tại là prod mất ảnh hero, còn dev thì bình thường.

Trong stage `runtime` của `apps/web/Dockerfile`, thêm sau dòng COPY static:

```dockerfile
COPY --from=builder /app/apps/web/public ./apps/web/public
```

và xoá khối comment giải thích vì sao dòng này vắng mặt.

> **Ngoài phạm vi design doc.** Đây là lỗi có sẵn, không phải việc của tính năng này. Vá ở đây vì nó nằm trong đúng file đang sửa và vì tính năng này ship một trang chủ phụ thuộc thư mục đó. Nếu muốn tách ra thành commit/PR riêng thì tách — đừng bỏ qua.

- [ ] **Step 4: Thêm khoá vào `messages/vi.json`**

Làm trước các component, vì chúng tham chiếu những khoá này — làm ngược lại thì `typecheck` đỏ giữa chừng.

Thay **toàn bộ** khối `"vehicles"` bằng khối dưới đây. `empty` phải viết lại — câu cũ nói về schema, và nó sai ngay sau đợt này:

```json
  "vehicles": {
    "heading": "Đội xe",
    "lead": "Ảnh chụp từng chiếc, không phải ảnh catalogue của hãng.",
    "detail": "Xem chi tiết",
    "empty": "Chưa có xe nào được đăng. Nhắn Zalo hoặc Fanpage để hỏi xe đang có.",
    "noPhoto": "Chưa có ảnh",
    "all": "Xem tất cả xe",
    "perDay": "/ ngày",
    "depositLabel": "Tiền cọc",
    "longTerm": "Thuê dài ngày có giá riêng — liên hệ shop để được báo giá.",
    "specs": {
      "engine": "Phân khối",
      "year": "Đời xe",
      "odo": "ODO",
      "color": "Màu"
    }
  },
```

- [ ] **Step 5: Chỗ duy nhất biết URL Directus**

Tạo `apps/web/lib/directus.ts`:

```ts
const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "http://localhost:8055";

/**
 * Ảnh luôn đi qua preset `web` (§4.4 design doc). KHÔNG dùng `?width=` tuỳ ý —
 * transform tuỳ ý đã bị chặn ở Directus, và mở lại là mở một vòi CPU cho bot.
 * next/image tự sinh các cỡ responsive từ ảnh này.
 */
export function assetUrl(fileId: string): string {
  return `${DIRECTUS_URL}/assets/${fileId}?key=web`;
}
```

- [ ] **Step 6: Lớp gọi API, nuốt lỗi thành rỗng**

Tạo `apps/web/lib/vehicles.ts`:

```ts
import { api } from "./api";

/**
 * Trả [] khi API không tới được, KHÔNG ném lỗi.
 *
 * CI build apps/web mà không có Postgres. Ném lỗi ở đây biến "chưa có DB" thành
 * build đỏ ở mọi PR. Đổi lại: `dynamicParams = true` khiến trang xe vẫn render
 * được lúc chạy. Cùng đánh đổi đã ghi trong apps/web/AGENTS.md cho /health.
 */
export async function fetchVehicles() {
  const { data, error } = await api.vehicles.get();
  if (error) {
    console.warn(`[web] không lấy được danh sách xe: ${JSON.stringify(error.value)}`);
    return [];
  }
  return data;
}

export async function fetchVehicle(slug: string) {
  const { data, error } = await api.vehicles({ slug }).get();
  if (error) return null;
  return data;
}

export type VehicleSummary = Awaited<ReturnType<typeof fetchVehicles>>[number];
export type VehicleDetail = NonNullable<Awaited<ReturnType<typeof fetchVehicle>>>;
```

- [ ] **Step 7: Hằng layout**

Tạo `apps/web/app/_components/layout.ts`:

```ts
export const CONTAINER = "mx-auto w-full max-w-page px-6";
```

- [ ] **Step 8: Header dùng chung**

Tạo `apps/web/app/_components/site-header.tsx`:

```tsx
import messages from "@/messages/vi.json";
import { CONTAINER } from "./layout";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 h-16 border-b border-hairline bg-canvas">
      <div className={`${CONTAINER} flex h-full items-center justify-between gap-10`}>
        <a
          href="/"
          className="label-upper text-lg whitespace-nowrap text-ink no-underline"
          style={{ fontSize: 18 }}
        >
          {messages.site.title}
        </a>
        {/* DESIGN.md §8 yêu cầu hamburger ở mobile — CHƯA LÀM (cần client
            component). Tạm ẩn dưới 768px để wordmark không gãy dòng. */}
        <nav className="hidden gap-10 md:flex">
          <a href="/xe" className="label-upper text-ink hover:underline">
            {messages.nav.vehicles}
          </a>
          <a href="/#thu-tuc" className="label-upper text-ink hover:underline">
            {messages.nav.howItWorks}
          </a>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 9: Footer dùng chung**

Tạo `apps/web/app/_components/site-footer.tsx`. `note` là optional để trang chủ giữ được dòng trạng thái API mà hai trang xe không phải gọi `/health` chỉ để in một chuỗi:

```tsx
import messages from "@/messages/vi.json";
import { CONTAINER } from "./layout";

export function SiteFooter({ note }: { note?: string }) {
  return (
    <footer className="border-t border-hairline py-16">
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="label-upper mb-4 text-ink">{messages.footer.vehicles}</h3>
            <p className="m-0 text-sm">{messages.vehicles.heading}</p>
          </div>
          <div>
            <h3 className="label-upper mb-4 text-ink">{messages.footer.rental}</h3>
            <p className="m-0 text-sm">{messages.terms.heading}</p>
          </div>
          <div>
            <h3 className="label-upper mb-4 text-ink">{messages.footer.shop}</h3>
            <p className="m-0 text-sm">{messages.site.tagline}</p>
          </div>
        </div>
        <p className="caption-text mt-10 text-muted">
          {messages.footer.legal}
          {note ? ` · ${note}` : ""}
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 10: Thẻ xe dùng chung**

Tạo `apps/web/app/_components/vehicle-card.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { formatVnd } from "@v9/shared/domain/money";
import { assetUrl } from "@/lib/directus";
import type { VehicleSummary } from "@/lib/vehicles";
import messages from "@/messages/vi.json";

export function VehicleCard({ vehicle }: { vehicle: VehicleSummary }) {
  const title = `${vehicle.make} ${vehicle.model}`;
  const specs = [
    `${String(vehicle.engineCc)} cc`,
    vehicle.year === null ? null : `đời ${String(vehicle.year)}`,
    vehicle.odoKm === null ? null : `ODO ${vehicle.odoKm.toLocaleString("vi-VN")} km`,
  ].filter((s): s is string => s !== null);

  return (
    <article>
      <Link href={`/xe/${vehicle.slug}`} className="block no-underline">
        <div className="relative aspect-[16/10] overflow-hidden bg-surface-card">
          {vehicle.photo ? (
            <Image
              src={assetUrl(vehicle.photo.fileId)}
              alt={vehicle.photo.alt}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="caption-text text-muted">{messages.vehicles.noPhoto}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-3 pt-6">
          <h3 className="display-md m-0 text-ink">{title}</h3>
          {/* text-body chứ KHÔNG text-muted: muted trên nền tối chỉ 4.29:1, dưới AA. DESIGN.md §2 */}
          <p className="m-0 text-sm text-body">{specs.join(" · ")}</p>
          <p className="m-0 text-ink">
            <span className="display-sm">{formatVnd(vehicle.pricePerDay)}</span>
            <span className="label-upper ml-2 text-body">{messages.vehicles.perDay}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
```

- [ ] **Step 11: Kiểm và commit**

```bash
bun run typecheck && bun run lint
git add apps/web/next.config.ts apps/web/Dockerfile apps/web/lib/ apps/web/app/_components/ \
        apps/web/messages/vi.json compose.prod.yaml .github/workflows/deploy.yml
git commit -m "feat(web): hạ tầng dùng chung cho trang xe — assetUrl, Eden helper, header/footer/card"
```

Nếu tách Step 3 ra riêng theo ghi chú ở đó thì commit nó trước, với message:
`fix(web): đưa public/ vào image — hero placeholder đang mất trên prod`

---

## Task 7: Trang danh sách `/xe`

**Files:**

- Create: `apps/web/app/xe/page.tsx`

- [ ] **Step 1: Viết trang**

```tsx
import type { Metadata } from "next";
import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
import { CONTAINER } from "@/app/_components/layout";
import { VehicleCard } from "@/app/_components/vehicle-card";
import { fetchVehicles } from "@/lib/vehicles";
import messages from "@/messages/vi.json";

// Danh mục xe đổi vài lần một tuần, không phải vài lần một phút.
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${messages.vehicles.heading} — ${messages.site.title}`,
  description: messages.vehicles.lead,
};

export default async function VehiclesPage() {
  const vehicles = await fetchVehicles();

  return (
    <>
      <SiteHeader />
      <main>
        <section className="py-section">
          <div className={CONTAINER}>
            <h1 className="display-xl m-0 text-ink">{messages.vehicles.heading}</h1>
            <p className="mt-6 max-w-[52ch] text-lg text-body-strong">{messages.vehicles.lead}</p>

            {vehicles.length === 0 ? (
              <p className="mt-10 text-body">{messages.vehicles.empty}</p>
            ) : (
              <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {vehicles.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Xem bằng mắt**

```bash
bun run --filter @v9/api dev &
bun run --filter @v9/web dev &
```

Mở `http://localhost:3000/xe`. Phải thấy xe đã nhập ở Task 3, ảnh hiện ra, giá đúng định dạng `500.000 ₫`.

Nếu ảnh không hiện, mở console trình duyệt: lỗi `hostname is not configured under images` nghĩa là Step 1 của Task 6 chưa ăn — Next đọc `next.config.ts` lúc khởi động, phải restart dev server.

- [ ] **Step 3: Kiểm trạng thái rỗng (tiêu chí #10)**

Trong Directus, đổi xe duy nhất sang `draft`. Tải lại `/xe` (chờ tối đa 5 phút hoặc restart dev server).

Expected: hiện câu "Chưa có xe nào được đăng…", **không** hiện câu nào nói về bảng hay schema.
Đổi lại `published` sau khi kiểm.

- [ ] **Step 4: Commit**

```bash
bun run typecheck && bun run lint
git add apps/web/app/xe/page.tsx
git commit -m "feat(web): trang /xe — danh sách đội xe từ dữ liệu thật"
```

---

## Task 8: Trang chi tiết `/xe/[slug]`

**Files:**

- Create: `apps/web/app/xe/[slug]/page.tsx`

- [ ] **Step 1: Viết trang**

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { formatVnd } from "@v9/shared/domain/money";
import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
import { CONTAINER } from "@/app/_components/layout";
import { assetUrl } from "@/lib/directus";
import { fetchVehicle, fetchVehicles } from "@/lib/vehicles";
import messages from "@/messages/vi.json";

export const revalidate = 300;

// true (mặc định) là CỐ Ý: khi API chết lúc build, generateStaticParams trả []
// và không trang nào được sinh sẵn — dynamicParams giữ cho chúng vẫn render
// được lúc chạy thay vì 404 hàng loạt.
export const dynamicParams = true;

export async function generateStaticParams() {
  const vehicles = await fetchVehicles();
  return vehicles.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await fetchVehicle(slug);
  if (!vehicle) return { title: messages.site.title };

  const title = `Thuê ${vehicle.make} ${vehicle.model} tại TP.HCM`;
  const specs = [
    `${String(vehicle.engineCc)} cc`,
    vehicle.year === null ? null : `đời ${String(vehicle.year)}`,
  ].filter((s): s is string => s !== null);

  return {
    title,
    description: `${vehicle.make} ${vehicle.model} — ${specs.join(", ")}. ${formatVnd(vehicle.pricePerDay)} một ngày. Giao xe tận nơi tại TP.HCM.`,
    openGraph: {
      title,
      images: vehicle.photo ? [assetUrl(vehicle.photo.fileId)] : [],
    },
  };
}

export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vehicle = await fetchVehicle(slug);
  if (!vehicle) notFound();

  const [hero, ...rest] = vehicle.photos;
  const specs = [
    { label: messages.vehicles.specs.engine, value: `${String(vehicle.engineCc)} cc` },
    {
      label: messages.vehicles.specs.year,
      value: vehicle.year === null ? "—" : String(vehicle.year),
    },
    {
      label: messages.vehicles.specs.odo,
      value: vehicle.odoKm === null ? "—" : `${vehicle.odoKm.toLocaleString("vi-VN")} km`,
    },
    { label: messages.vehicles.specs.color, value: vehicle.color ?? "—" },
  ];

  return (
    <>
      <SiteHeader />
      <main>
        {hero ? (
          <section className="relative aspect-[16/9] w-full overflow-hidden bg-surface-card">
            <Image
              src={assetUrl(hero.fileId)}
              alt={hero.alt}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </section>
        ) : null}

        <section className="py-section">
          <div className={CONTAINER}>
            <h1 className="display-xl m-0 text-ink">
              {vehicle.make} {vehicle.model}
            </h1>

            <div className="mt-10 grid grid-cols-1 gap-px border border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-4">
              {specs.map((s) => (
                <div key={s.label} className="flex flex-col gap-2 bg-surface-soft p-6">
                  <span className="display-sm text-ink">{s.value}</span>
                  <span className="label-upper text-body">{s.label}</span>
                </div>
              ))}
            </div>

            {vehicle.description === null ? null : (
              <p className="mt-10 max-w-[62ch]">{vehicle.description}</p>
            )}

            <div className="mt-10 border border-hairline p-6">
              <p className="m-0 text-ink">
                <span className="display-lg">{formatVnd(vehicle.pricePerDay)}</span>
                <span className="label-upper ml-3 text-body">{messages.vehicles.perDay}</span>
              </p>
              <p className="mt-3 mb-0 text-body">
                {messages.vehicles.depositLabel}: {formatVnd(vehicle.deposit)}
              </p>
              <p className="mt-3 mb-0 text-body">{messages.vehicles.longTerm}</p>
              {/* Copy lấy nguyên từ messages.booking — KHÔNG hứa xe còn trống.
                  apps/web/AGENTS.md là luật cứng ở đây. */}
              <a
                href="/#gui-yeu-cau"
                className="btn-shape mt-6 border-ink bg-ink text-canvas no-underline transition-colors hover:bg-transparent hover:text-ink"
              >
                {messages.booking.cta}
              </a>
              <p className="caption-text mt-4 mb-0 text-body">{messages.booking.note}</p>
            </div>

            {rest.length === 0 ? null : (
              <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {rest.map((p) => (
                  <div
                    key={p.fileId}
                    className="relative aspect-[16/10] overflow-hidden bg-surface-card"
                  >
                    <Image
                      src={assetUrl(p.fileId)}
                      alt={p.alt}
                      fill
                      sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Kiểm bằng mắt và kiểm 404**

Mở `http://localhost:3000/xe/<slug-đã-nhập>` — phải thấy ảnh, thông số, giá, cọc, và câu "thuê dài ngày liên hệ".
Mở `http://localhost:3000/xe/khong-ton-tai` — phải ra trang 404 của Next.

- [ ] **Step 3: Đọc lại copy một lượt (tiêu chí "không hứa xe còn trống")**

Đọc toàn bộ chữ trên trang. **Không câu nào** được nói xe đang có sẵn, đã được giữ, hay đơn đã xác nhận. Nếu bạn vừa tự viết một câu mới nghe hay hơn `messages.booking.note` — xoá nó đi và dùng lại khoá có sẵn.

- [ ] **Step 4: Commit**

```bash
bun run typecheck && bun run lint
git add apps/web/app/xe/
git commit -m "feat(web): trang chi tiết /xe/[slug] — SSG + ISR, không JSON-LD availability"
```

---

## Task 9: Trang chủ dùng dữ liệu thật, xoá dữ liệu giả

**Files:**

- Modify: `apps/web/app/page.tsx`
- Delete: `apps/web/app/_placeholder-data.ts`

- [ ] **Step 1: Sửa trang chủ**

Thay `apps/web/app/page.tsx` bằng bản dưới. Thay đổi: import `PLACEHOLDER_VEHICLES` biến mất, header/footer dùng component chung, lưới xe dùng `VehicleCard`, thêm link "xem tất cả". **`PlaceholderTag` chỉ còn ở ảnh hero** — hero vẫn là ảnh AI sinh, gỡ nhãn ở đó mà chưa thay ảnh là nói dối khách.

```tsx
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
import { CONTAINER } from "@/app/_components/layout";
import { VehicleCard } from "@/app/_components/vehicle-card";
import { fetchVehicles } from "@/lib/vehicles";
import messages from "@/messages/vi.json";

export const revalidate = 60;

/**
 * Ảnh hero vẫn là ẢNH AI SINH, không phải xe của shop. Nhãn này phải còn nguyên
 * cho tới khi thay bằng ảnh thật — gỡ nhãn mà không thay ảnh là nói dối khách.
 * PRODUCT.md nguyên tắc #2.
 */
function PlaceholderTag() {
  return (
    <span className="caption-text absolute right-3 bottom-3 border border-hairline bg-canvas/70 px-2 py-0.5 text-body">
      {messages.placeholder.imageTag}
    </span>
  );
}

export default async function Page() {
  const [{ data, error }, vehicles] = await Promise.all([api.health.get(), fetchVehicles()]);
  const apiStatus = error ? "lỗi" : data.status;

  return (
    <>
      <SiteHeader />

      <main>
        {/* ── Băng ảnh hero: ảnh CHÍNH LÀ băng, không khung card ──
            priority vì ảnh này là LCP của trang. DESIGN.md §8. */}
        <section className="relative flex min-h-[min(78vh,720px)] items-end overflow-hidden">
          <Image
            src="/placeholder/hero.jpg"
            alt="Mô tô phân khối lớn đỗ trong garage tối"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* Phủ đen thuần để chữ đọc được trên ảnh — không phải gradient màu,
              đây thuộc nhóm "độ sâu từ ảnh". DESIGN.md §6. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/15" />
          <div className="relative w-full py-16">
            <div className={CONTAINER}>
              <h1 className="display-xl m-0 text-ink">{messages.hero.headline}</h1>
              <p className="my-6 max-w-[46ch] text-lg text-body-strong">{messages.hero.sub}</p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="#gui-yeu-cau"
                  className="btn-shape border-ink bg-ink text-canvas no-underline transition-colors hover:bg-transparent hover:text-ink"
                >
                  {messages.booking.cta}
                </a>
                <Link
                  href="/xe"
                  className="btn-shape border-ink bg-transparent text-ink no-underline transition-colors hover:bg-ink hover:text-canvas"
                >
                  {messages.hero.secondaryCta}
                </Link>
              </div>
            </div>
            <PlaceholderTag />
          </div>
        </section>

        {/* ── Bảng thủ tục: dữ kiện đã xác nhận trong PRODUCT.md, không bịa ── */}
        <section id="thu-tuc" className="py-section">
          <div className={CONTAINER}>
            <h2 className="display-lg m-0 text-ink">{messages.terms.heading}</h2>
            <div className="mt-10 grid grid-cols-1 gap-px border border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-4">
              {[
                messages.terms.papers,
                messages.terms.deposit,
                messages.terms.unit,
                messages.terms.delivery,
              ].map((item) => (
                <div key={item.label} className="flex flex-col gap-2 bg-surface-soft p-6">
                  <span className="display-sm text-ink">{item.value}</span>
                  <span className="label-upper text-body">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-10 max-w-[62ch]">{messages.terms.photoNote}</p>
          </div>
        </section>

        {/* ── Lưới xe: ba chiếc đầu, dữ liệu thật ── */}
        <section id="doi-xe" className="pb-section">
          <div className={CONTAINER}>
            <h2 className="display-lg m-0 text-ink">{messages.vehicles.heading}</h2>
            <p className="mt-4 text-lg text-body-strong">{messages.vehicles.lead}</p>

            {vehicles.length === 0 ? (
              <p className="mt-10 text-body">{messages.vehicles.empty}</p>
            ) : (
              <>
                <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {vehicles.slice(0, 3).map((v) => (
                    <VehicleCard key={v.id} vehicle={v} />
                  ))}
                </div>
                <Link
                  href="/xe"
                  className="label-upper mt-10 inline-block text-ink hover:underline"
                >
                  {messages.vehicles.all} →
                </Link>
              </>
            )}
          </div>
        </section>

        {/* ── Băng CTA: copy lấy nguyên từ messages, KHÔNG hứa xe còn trống ── */}
        <section id="gui-yeu-cau" className="border-y border-hairline py-section text-center">
          <div className={CONTAINER}>
            <h2 className="display-md m-0 text-ink">{messages.booking.cta}</h2>
            <p className="mx-auto my-6 max-w-[52ch] text-body">{messages.booking.note}</p>
            <a
              href="#gui-yeu-cau"
              className="btn-shape border-ink bg-transparent text-ink no-underline transition-colors hover:bg-ink hover:text-canvas"
            >
              {messages.booking.cta}
            </a>
          </div>
        </section>
      </main>

      <SiteFooter note={`${messages.scaffold.apiHealth}: ${apiStatus}`} />
    </>
  );
}
```

- [ ] **Step 2: Xoá dữ liệu giả**

```bash
git rm apps/web/app/_placeholder-data.ts
```

- [ ] **Step 3: Xác nhận không còn ai tham chiếu**

```bash
rg -n "_placeholder-data|PLACEHOLDER_VEHICLES" --glob '!node_modules' .
```

Expected: **không có kết quả nào** ngoài file design/plan trong `docs/`.

- [ ] **Step 4: Build thật và grep HTML sinh ra (tiêu chí #9)**

```bash
bun run --filter @v9/web build
rg -l "<tên xe thật của bạn>" apps/web/.next/server/app/ | head
```

Expected: có file khớp. Đây là chứng minh trang **tĩnh** chứa dữ liệu thật, không phải chỉ dev server render được.

- [ ] **Step 5: Commit**

```bash
bun test && bun run typecheck && bun run lint
git add apps/web/app/page.tsx
git commit -m "feat(web): trang chủ dùng đội xe thật, xoá _placeholder-data.ts"
```

---

## Task 10: Tài liệu, ADR, và verify toàn bộ

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Thêm probe asset vào `CLAUDE.md`**

Trong mục "Ba service dùng chung một Postgres", ngay sau khối probe DDL đang có, thêm:

````markdown
**Kiểm sau mỗi lần nâng Directus hoặc dựng lại môi trường** — cấu hình collection và
quyền Public sống trong DB của Directus, không trong git (xem `docs/runbooks/directus-vehicles.md`):

```bash
# PHẢI ra 200 và content-type: image/*
curl -sI "http://localhost:8055/assets/<uuid-một-ảnh-xe>?key=web" | head -3
```
````

- [ ] **Step 2: Cập nhật §Việc còn để lại trong `CLAUDE.md`**

- Bỏ `vehicles` khỏi danh sách schema chưa có (giữ nguyên `customers`, `rentals`, `booking_requests`).
- Thêm một dòng: `booking_requests` + form gửi yêu cầu trên `apps/web` là đợt kế tiếp.

- [ ] **Step 3: Ghi ADR vào Agent Memory (tiêu chí #12)**

Lưu quyết định + lý do, **không** lưu code:

- "Một bản ghi `vehicles` = một chiếc xe cụ thể, không tách `vehicle_models`" — kèm điều kiện xem lại ở §2.1 design doc.
- "`apps/web` lấy JSON qua `apps/api`, ảnh qua `/assets` của Directus" — kèm lý do preset và quyền Public hẹp.
- "Cấu hình Directus không nằm trong git" — kèm trỏ tới runbook.

- [ ] **Step 4: Chạy lại bộ probe boundaries của `CLAUDE.md`**

Bắt buộc vì Task 4 đã đụng `packages/shared/package.json` (đường resolve của boundaries).
Chạy đủ ba probe trong mục "Hàng rào phải được probe" và **đọc mã lỗi**, không chỉ nhìn exit code:

- Probe ① phải nổ với `boundaries/dependencies`
- Probe ② phải nổ với `boundaries/no-unknown-files`
- Probe ③ phải im

- [ ] **Step 5: Verify toàn bộ**

```bash
bun test
bun run typecheck
bun run lint
bun run format:check
bun run bench
```

Expected: tất cả xanh. `bench` không được vượt perf budget — nếu `/health` p95 tăng, nghi ngờ trước hết là số kết nối Postgres, không phải hai endpoint mới.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: probe asset Directus + cập nhật việc còn để lại"
```

---

## Bảng đối chiếu với tiêu chí "xong" của design doc

| Tiêu chí design doc                         | Task chứng minh                            |
| ------------------------------------------- | ------------------------------------------ |
| ~~#1 Directus nhận bảng có sẵn, không DDL~~ | Task 0 — **đã đo, KHÔNG đạt**              |
| #1b Quan hệ ảnh qua metadata, idempotent    | Task 3 Step 2 (chạy script hai lần)        |
| #2 `directus_app` đọc ghi được bảng mới     | Task 0 Step 3, Task 1 Step 8               |
| #3 `directus_app` vẫn không đổi được schema | Task 0 Step 6, Task 1 Step 8               |
| #4 Ảnh nằm trong MinIO                      | Task 2 Step 5                              |
| #5 Ảnh sống sót qua `compose down`          | Task 2 Step 6                              |
| #6 `plate` không rò                         | Task 5 Step 1 (test), Task 5 Step 7 (curl) |
| #7 Xe `draft` không lên web                 | Task 5 Step 1 (test)                       |
| #8 Transform tuỳ ý bị chặn                  | Task 3 Step 6                              |
| #9 Trang tĩnh chứa tên xe thật              | Task 9 Step 4                              |
| #10 Trạng thái rỗng không nói về schema     | Task 7 Step 3                              |
| #11 `bun test` / `typecheck` / `lint` xanh  | Task 10 Step 5                             |
| #12 ADR đã ghi                              | Task 10 Step 3                             |
