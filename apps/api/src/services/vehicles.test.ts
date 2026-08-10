import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { client, db } from "../db";
import {
  findPublishedVehicleBySlug,
  listPublishedVehicles,
  publishedVehiclesQuery,
} from "./vehicles";

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
  // ⚠️ `client` là singleton module-scope của apps/api (src/db.ts), KHÔNG phải kết
  // nối riêng của file này — `bun test` chạy mọi file trong CÙNG một tiến trình với
  // chung module cache, nên đóng nó ở đây là đóng cho cả tiến trình. Hiện an toàn
  // vì đây là test DUY NHẤT của apps/api chạm `../db`. File test apps/api thứ hai
  // nào cũng chạm `../db` thì PHẢI bỏ dòng này và chuyển sang mẫu `setupDb()` của
  // packages/db/src/test-support.ts, nếu không file nạp sau sẽ chết vì kết nối đã
  // bị đóng — và thứ tự nạp là thứ không ai kiểm soát.
  await client.close();
});

describe("mệnh đề ORDER BY của danh mục", () => {
  // Bất biến mong manh nhất của đợt này, và cho tới giờ CHỈ có một comment canh giữ
  // trong khi mọi bất biến ở tầng DB đều đã có test. Rủi ro thật không phải "ai đó
  // viết sai SQL" mà "ai đó rút gọn cho gọn": `desc(schema.vehicles.createdAt)` đọc
  // sạch hơn hẳn, chạy đúng, trả đúng thứ tự — và lặng lẽ làm partial index
  // vehicles_published_idx chỉ còn khớp một cột thay vì hai.
  const { sql: generated } = publishedVehiclesQuery().toSQL();

  it("giữ nguyên văn `DESC NULLS LAST` — không có nó thì index khớp hụt một cột", () => {
    expect(generated).toContain("DESC NULLS LAST");
  });

  it("có `id` làm khoá phụ cuối — `sort` NULL + `created_at` trùng thì thứ tự là tuỳ ý", () => {
    // Khoá thứ ba PHẢI đứng SAU hai khoá kia: chính prefix `(sort, created_at)` là
    // thứ khớp index. Đảo lên đầu thì index thành vô dụng.
    expect(generated).toMatch(/order by\s+.*"sort".*"created_at" desc nulls last,\s*.*"id"/is);
  });
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
