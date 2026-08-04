import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa được set — copy .env.example thành .env");

const client = new SQL(url);
const db = drizzle({ client });

await migrate(db, { migrationsFolder: `${import.meta.dirname}/../migrations` });
console.warn("migration đã apply xong");
await client.close();
