import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "./env";

/**
 * ĐÂY LÀ CHỖ DUY NHẤT trong repo biết driver Postgres là gì.
 *
 * Đang dùng Bun.SQL native qua drizzle-orm/bun-sql vì lý do throughput (§4.8 design doc).
 * Adapter này trẻ hơn postgres-js; nếu gặp vấn đề transaction hoặc pool, đường lùi là
 * đổi ĐÚNG file này sang:
 *
 *   import postgres from "postgres";
 *   import { drizzle } from "drizzle-orm/postgres-js";
 *   export const db = drizzle(postgres(env.databaseUrl));
 *
 * Không service nào phải đổi theo — chúng chỉ import `db` và `client`.
 */
export const client = new SQL(env.databaseUrl);
export const db = drizzle({ client });
