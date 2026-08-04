import { afterAll, describe, expect, it } from "bun:test";
import { SQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa set — cần .env và `docker compose up -d`");

const sql = new SQL(url);
afterAll(async () => {
  await sql.close();
});

describe("btree_gist", () => {
  it("cho phép exclusion constraint chặn tstzrange chồng lấn trên cùng một xe", async () => {
    // Toàn bộ chạy trong transaction rồi ROLLBACK: chứng minh extension dùng được
    // mà KHÔNG commit một dòng business schema nào (§2 design doc cấm việc đó).
    await sql
      .begin(async (tx) => {
        await tx`
          CREATE TEMP TABLE probe_rentals (
            id          bigserial PRIMARY KEY,
            vehicle_id  uuid NOT NULL,
            period      tstzrange NOT NULL,
            CONSTRAINT probe_no_overlap
              EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)
          ) ON COMMIT DROP
        `;

        const vehicle = "11111111-1111-1111-1111-111111111111";

        await tx`
          INSERT INTO probe_rentals (vehicle_id, period)
          VALUES (${vehicle}::uuid, tstzrange('2026-01-01', '2026-01-05', '[)'))
        `;

        // Chồng lấn trên CÙNG xe → phải bị chặn bằng SQLSTATE 23P01.
        //
        // Lỗi trong transaction làm "poison" transaction đó cho tới khi ROLLBACK TO
        // SAVEPOINT (hành vi Postgres chuẩn) — Bun.SQL xác nhận điều này: câu INSERT
        // "chạm đầu-đuôi" bên dưới thất bại với "current transaction is aborted" nếu
        // câu INSERT lỗi này không được bọc trong tx.savepoint(). Dùng tx.savepoint()
        // (Bun.SQL tự SAVEPOINT / ROLLBACK TO SAVEPOINT quanh callback khi nó throw).
        let errno: string | undefined;
        try {
          await tx.savepoint(async (sp) => {
            await sp`
              INSERT INTO probe_rentals (vehicle_id, period)
              VALUES (${vehicle}::uuid, tstzrange('2026-01-03', '2026-01-08', '[)'))
            `;
          });
        } catch (e) {
          // Bun.SQL bọc lỗi Postgres thành PostgresError. `.code` là mã lỗi CHUNG của
          // Bun (vd "ERR_POSTGRES_SERVER_ERROR"), KHÔNG phải SQLSTATE — SQLSTATE thật
          // nằm ở `.errno`. Xác nhận bằng thực nghiệm trước khi viết assertion này.
          errno = (e as { errno?: string }).errno;
        }
        expect(errno).toBe("23P01");

        // Chạm đầu-đuôi trên cùng xe → PHẢI được chấp nhận, khớp overlaps() của @v9/shared.
        await tx`
          INSERT INTO probe_rentals (vehicle_id, period)
          VALUES (${vehicle}::uuid, tstzrange('2026-01-05', '2026-01-09', '[)'))
        `;

        const rows = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM probe_rentals`;
        expect(rows[0]?.n).toBe(2);

        throw new Error("rollback-on-purpose");
      })
      .catch((e: Error) => {
        if (e.message !== "rollback-on-purpose") throw e;
      });
  });
});
