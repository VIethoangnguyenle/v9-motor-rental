import { afterAll } from "bun:test";
import { SQL, type TransactionSQL } from "bun";

/**
 * Hạ tầng dùng chung cho mọi test chạm Postgres trong package này.
 *
 * Trước đây `btree-gist.test.ts` và `vehicles-schema.test.ts` có 10 dòng đầu
 * GIỐNG NHAU TỪNG KÝ TỰ, và chỉ một trong hai file có `inRollback`. Người viết
 * test tiếp theo sẽ chép từ file họ mở trước — nên bản chép tay có cơ hội sống
 * đúng bằng bản có helper. Gom về một chỗ để không còn cái để chọn nhầm.
 *
 * Test cần Postgres đang chạy: `docker compose up -d`.
 */
export interface DbTestContext {
  /** Client dùng chung. Đóng tự động ở `afterAll` của file gọi `setupDb()`. */
  sql: SQL;
  /** Xem doc của `inRollback` bên dưới. */
  inRollback: (fn: (tx: TransactionSQL) => Promise<void>) => Promise<void>;
}

/**
 * Mở kết nối cho MỘT file test và đăng ký sẵn `afterAll` để đóng nó.
 *
 * Là hàm chứ không phải một client dùng chung ở module scope: `bun test` chạy
 * nhiều file test trong cùng tiến trình và dùng chung module cache, nên một
 * client khai ở module scope sẽ bị `afterAll` của file NẠP TRƯỚC đóng mất trong
 * khi file sau vẫn đang dùng. Mỗi file gọi `setupDb()` một lần thì mỗi file có
 * kết nối riêng và `afterAll` riêng, đúng trong mọi thứ tự chạy.
 */
export function setupDb(): DbTestContext {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL chưa set — cần .env và `docker compose up -d`");

  const sql = new SQL(url);
  afterAll(async () => {
    await sql.close();
  });

  /**
   * Chạy fn trong transaction rồi luôn ROLLBACK — không commit dữ liệu test nào,
   * **với điều kiện fn chỉ dùng `tx`**. Client ngoài (`sql` trả về từ `setupDb`,
   * hoặc biến `sql` ở module scope của file test) vẫn nằm trong scope bên trong
   * callback; chạm vào nó là ghi NGOÀI transaction và commit thật — đúng một kiểu
   * hỏng mà helper này sinh ra để chặn.
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

  return { sql, inRollback };
}
