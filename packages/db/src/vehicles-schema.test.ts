import { afterAll, describe, expect, it } from "bun:test";
import { SQL, type TransactionSQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa set — cần .env và `docker compose up -d`");

const sql = new SQL(url);
afterAll(async () => {
  await sql.close();
});

/**
 * Chạy fn trong transaction rồi luôn ROLLBACK — không commit dữ liệu test nào.
 *
 * Tham số là `TransactionSQL`, KHÔNG phải `SQL`: `savepoint()` chỉ có trên
 * `TransactionSQL`. Ép kiểu về `SQL` thì mất `savepoint` và typecheck chết.
 */
async function inRollback(fn: (tx: TransactionSQL) => Promise<void>): Promise<void> {
  await sql
    .begin(async (tx) => {
      await fn(tx);
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
