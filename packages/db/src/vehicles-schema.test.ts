import { describe, expect, it } from "bun:test";
import { SQL } from "bun";

import { setupDb } from "./test-support";

const { inRollback } = setupDb();

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
      let constraint: string | undefined;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit, status)
            VALUES ('probe-status', ${base.make}, ${base.model}, ${base.engine_cc},
                    ${base.price_per_day}, ${base.deposit}, 'available')
          `;
        });
      } catch (e) {
        // `instanceof SQL.PostgresError` thay cho ép kiểu cấu trúc
        // `(e as { errno?: string })`: ép kiểu vẫn biên dịch IM LẶNG nếu hình dạng
        // lỗi đổi — đúng kiểu hỏng mà CLAUDE.md cảnh báo ở mục `.code` vs `.errno`.
        // Nhắc lại mục đó: SQLSTATE thật nằm ở `.errno`; `.code` luôn là
        // "ERR_POSTGRES_SERVER_ERROR".
        if (!(e instanceof SQL.PostgresError)) throw e;
        expect(e.errno).toBe("23514"); // check_violation
        // Và phải khẳng định TÊN constraint, không chỉ mã lỗi: mọi CHECK trên bảng
        // này đều ném `23514`, nên so mã lỗi chỉ chứng minh "có một ràng buộc nào
        // đó chặn" chứ không chứng minh "đúng ràng buộc đang test chặn".
        constraint = e.constraint;
      }
      expect(constraint).toBe("vehicles_status_valid");
    });
  });

  /**
   * Đối trọng của test trên. Trước đây KHÔNG hàng nào trong cả bộ test có
   * `status = 'published'`, nên một lỗi gõ trong danh sách IN (`'publised'`) vẫn
   * cspell:ignore publised
   * làm mọi test cũ xanh, và mệnh đề `WHERE status = 'published'` của partial
   * index `vehicles_published_idx` không được câu nào chạm tới. Nó sẽ lộ lần đầu
   * lúc shop bấm Publish trong Directus — tức là ngoài đời.
   */
  it("chấp nhận 'published' và 'archived'", async () => {
    await inRollback(async (tx) => {
      for (const status of ["published", "archived"]) {
        const rows = await tx<{ status: string }[]>`
          INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit, status)
          VALUES (${`probe-${status}`}, ${base.make}, ${base.model}, ${base.engine_cc},
                  ${base.price_per_day}, ${base.deposit}, ${status})
          RETURNING status
        `;
        expect(rows[0]?.status).toBe(status);
      }
    });
  });

  it("từ chối slug có chữ hoa hoặc khoảng trắng", async () => {
    await inRollback(async (tx) => {
      let constraint: string | undefined;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit)
            VALUES ('Honda CB500X', ${base.make}, ${base.model}, ${base.engine_cc},
                    ${base.price_per_day}, ${base.deposit})
          `;
        });
      } catch (e) {
        if (!(e instanceof SQL.PostgresError)) throw e;
        expect(e.errno).toBe("23514");
        constraint = e.constraint;
      }
      // Không phải `23514` chung chung: nếu regex slug bị xoá và một CHECK khác nổ
      // thay, assertion này đỏ.
      expect(constraint).toBe("vehicles_slug_format");
    });
  });

  it("từ chối giá ngày âm, tiền cọc âm, và phân khối bằng 0", async () => {
    await inRollback(async (tx) => {
      const cases: [string, number, number, number, string][] = [
        ["probe-price", -1, base.deposit, base.engine_cc, "vehicles_money_nonneg"],
        ["probe-deposit", base.price_per_day, -1, base.engine_cc, "vehicles_money_nonneg"],
        ["probe-cc", base.price_per_day, base.deposit, 0, "vehicles_engine_cc_positive"],
      ];
      for (const [slug, price, deposit, cc, expected] of cases) {
        let constraint: string | undefined;
        try {
          await tx.savepoint(async (sp) => {
            await sp`
              INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit)
              VALUES (${slug}, ${base.make}, ${base.model}, ${cc}, ${price}, ${deposit})
            `;
          });
        } catch (e) {
          if (!(e instanceof SQL.PostgresError)) throw e;
          expect(e.errno).toBe("23514");
          constraint = e.constraint;
        }
        expect(constraint).toBe(expected);
      }
    });
  });

  /**
   * Trigger `vehicles_set_updated_at` (migration 0004). Directus ghi thẳng vào
   * Postgres nên không có chỗ nào ở tầng app đặt được cột này — xem comment đầu
   * file migration.
   *
   * ⚠️ Hàng probe được insert với `created_at`/`updated_at` LÙI VỀ QUÁ KHỨ, và đó
   * là thứ làm test này chứng minh được điều gì: trigger dùng `now()`, mà `now()`
   * là timestamp của TRANSACTION nên nó đứng yên suốt transaction. Insert bằng giá
   * trị mặc định rồi UPDATE ngay trong cùng transaction sẽ cho
   * `updated_at == created_at` dù trigger chạy hoàn hảo — một test "thất bại" mà
   * không có gì hỏng. Đẩy `created_at` về quá khứ giữ nguyên ngữ nghĩa `now()` ở
   * production (mọi hàng sửa trong một transaction mang cùng một mốc) thay vì bẻ
   * trigger sang `clock_timestamp()` chỉ để chiều test.
   */
  it("UPDATE kéo updated_at lên hiện tại (trigger vehicles_set_updated_at)", async () => {
    await inRollback(async (tx) => {
      const inserted = await tx<{ id: string; bumped: boolean }[]>`
        INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit,
                              created_at, updated_at)
        VALUES ('probe-touch', ${base.make}, ${base.model}, ${base.engine_cc},
                ${base.price_per_day}, ${base.deposit},
                now() - interval '1 hour', now() - interval '1 hour')
        RETURNING id, (updated_at > created_at) AS bumped
      `;
      const vehicleId = inserted[0]?.id;
      expect(vehicleId).toBeString();
      // Trước UPDATE hai cột bằng nhau, nên `bumped` sau UPDATE không thể đến từ
      // trạng thái ban đầu.
      expect(inserted[0]?.bumped).toBe(false);

      const updated = await tx<{ bumped: boolean; isNow: boolean }[]>`
        UPDATE vehicles SET color = 'đỏ' WHERE id = ${vehicleId}::uuid
        RETURNING (updated_at > created_at) AS bumped, (updated_at = now()) AS "isNow"
      `;
      expect(updated[0]?.bumped).toBe(true);
      // Không chỉ "lớn hơn": đúng bằng now() của transaction — tức chính trigger đặt,
      // chứ không phải một giá trị cũ nào đó tình cờ lớn hơn created_at.
      expect(updated[0]?.isNow).toBe(true);
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
