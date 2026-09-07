import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import { listFleet } from "./fleet";
import { listPublishedVehicles } from "./vehicles";

/**
 * `listFleet` nhận `now` làm THAM SỐ (cùng lý lẽ `getStatsSummary`), nên test
 * ghim một mốc cố định thay vì để `new Date()` trôi theo giờ chạy.
 */
const NOW = new Date("2026-09-07T12:00:00+07:00");

const P = "ztest-fleet-";

async function clean() {
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
}

beforeAll(async () => {
  await clean();
  await db.insert(schema.vehicles).values([
    {
      slug: `${P}pub`,
      make: "Honda",
      model: "CB500X",
      engineCc: 471,
      plate: "59H1-234.56",
      pricePerDay: 500_000,
      deposit: 5_000_000,
      status: "published",
    },
    {
      slug: `${P}draft`,
      make: "Kawasaki",
      model: "Z900",
      engineCc: 948,
      plate: "59H1-887.21",
      pricePerDay: 900_000,
      deposit: 10_000_000,
      status: "draft",
    },
    {
      slug: `${P}arch`,
      make: "Yamaha",
      model: "MT-07",
      engineCc: 689,
      plate: "59H1-402.90",
      pricePerDay: 700_000,
      deposit: 7_000_000,
      status: "archived",
    },
  ]);
});

afterAll(async () => {
  await clean();
});

describe("listFleet", () => {
  it("có biển số — đây là shape NỘI BỘ, khác /vehicles", async () => {
    const rows = await listFleet(NOW);
    const v = rows.find((r) => r.slug === `${P}pub`);
    expect(v?.plate).toBe("59H1-234.56");
  });

  it("gồm cả xe draft — chưa lên web không có nghĩa là không cho thuê được", async () => {
    const slugs = (await listFleet(NOW)).map((r) => r.slug);
    expect(slugs).toContain(`${P}draft`);
  });

  it("trả pricePerDay và deposit — kể cả cho xe draft, ca mà /vehicles công khai không phục vụ được", async () => {
    const rows = await listFleet(NOW);
    const pub = rows.find((r) => r.slug === `${P}pub`);
    const draft = rows.find((r) => r.slug === `${P}draft`);
    expect(pub?.pricePerDay).toBe(500_000);
    expect(pub?.deposit).toBe(5_000_000);
    expect(draft?.pricePerDay).toBe(900_000);
    expect(draft?.deposit).toBe(10_000_000);
  });

  it("loại xe archived", async () => {
    const slugs = (await listFleet(NOW)).map((r) => r.slug);
    expect(slugs).not.toContain(`${P}arch`);
  });
});

describe("ranh giới với shape công khai", () => {
  // `/fleet` tồn tại CHỈ vì shape công khai cố ý không có `plate`. Nếu một ngày
  // ai đó thêm `plate` vào `listPublishedVehicles`, lý do tồn tại của cả file này
  // biến mất — và không có gì khác báo. Test này là thứ báo.
  it("listPublishedVehicles vẫn KHÔNG trả biển số", async () => {
    const all = await listPublishedVehicles();
    // Xe `${P}pub` seed ở trên là `published`, nên mảng này PHẢI có ít nhất một
    // hàng — không thì assertion dưới đây đi qua một mảng rỗng và không chứng
    // minh được gì.
    expect(all.length).toBeGreaterThan(0);
    for (const v of all) {
      expect(Object.keys(v)).not.toContain("plate");
    }
  });
});
