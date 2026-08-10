import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./env";
import { auth } from "./plugins/auth";
import { staffGuard } from "./plugins/staff-guard";
import { timing } from "./plugins/timing";
import { health } from "./routes/health";
import { vehicles } from "./routes/vehicles";

const app = new Elysia()
  .use(cors())
  .use(timing)
  .use(auth)
  // ⚠️ PHẢI đứng trước mọi route nghiệp vụ. Đặt sau thì route đăng ký trước nó
  // không được bảo vệ, và không có gì báo lỗi.
  .use(staffGuard)
  .use(health)
  .use(vehicles)
  .listen({ port: env.port, hostname: env.host });

console.warn(`api đang chạy tại http://${env.host}:${String(env.port)}`);

/** Eden Treaty ở frontend lấy type từ đây. */
export type App = typeof app;
export { app };
