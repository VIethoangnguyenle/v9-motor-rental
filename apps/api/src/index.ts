import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./env";
import { auth } from "./plugins/auth";
import { timing } from "./plugins/timing";
import { health } from "./routes/health";

const app = new Elysia()
  .use(cors())
  .use(timing)
  .use(auth)
  .use(health)
  .listen({ port: env.port, hostname: env.host });

console.warn(`api đang chạy tại http://${env.host}:${String(env.port)}`);

/** Eden Treaty ở frontend lấy type từ đây. */
export type App = typeof app;
export { app };
