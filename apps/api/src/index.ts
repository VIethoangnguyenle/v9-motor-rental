import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import supertokens from "supertokens-node";
import { env } from "./env";
import { auth } from "./plugins/auth";
import { staffGuard } from "./plugins/staff-guard";
import { timing } from "./plugins/timing";
import { health } from "./routes/health";
import { staff } from "./routes/staff";
import { vehicles } from "./routes/vehicles";

const app = new Elysia()
  // ⚠️ `cors()` KHÔNG THAM SỐ là một lỗ hổng, không phải mặc định lành. Đã đọc
  // @elysiajs/cors@1.4.2 (dist/index.mjs): mặc định `origin = true` +
  // `credentials = true`, và nhánh `origin === true` phản chiếu thẳng
  // `set.headers["access-control-allow-origin"] = request.headers.get("Origin")`.
  // Nghĩa là BẤT KỲ trang web nào cũng gọi được API này kèm cookie của nhân viên
  // và ĐỌC ĐƯỢC response — trình duyệt chỉ chặn khi allow-origin không khớp, mà
  // ở đây nó luôn khớp vì được chép từ chính Origin của kẻ gọi.
  //
  // Vô hại cho tới hôm nay: chưa có session thì không có gì để mượn. Đợt này
  // CHÍNH LÀ đợt cookie ra đời (`apps/staff` có đăng nhập thật), nên phải siết
  // cùng lúc — để lệch một commit là để lệch một khoảng thời gian có lỗ hổng
  // thật. §7 docs/plans/2026-08-10-staff-auth-design.md.
  //
  // Siết origin KHÔNG làm vỡ `apps/web`: đã grep 2026-08-11 — `apps/web` không
  // có MỘT file `"use client"` nào, mọi lời gọi API nằm trong server component
  // (`app/page.tsx`, `app/xe/page.tsx`, `app/xe/[slug]/page.tsx`) chạy lúc
  // build/render phía server. Fetch phía server không đi qua CORS.
  .use(
    cors({
      // Mảng chuỗi là hình dạng hợp lệ: `origin?: Origin | boolean | Origin[]`
      // (dist/index.d.ts). Runtime dựng `originMap` rồi so khớp NGUYÊN VĂN cả
      // protocol, và khi không khớp thì KHÔNG phát `access-control-allow-origin`.
      origin: [env.staffAppUrl],
      credentials: true,
      // `getAllCORSHeaders()` trả `rid`, `fdi-version`, `anti-csrf`,
      // `st-auth-mode` — các header supertokens-web-js gắn vào MỌI request.
      // Thiếu chúng ở đây thì preflight không cho qua, trình duyệt chặn request
      // THẬT, và frontend hỏng theo kiểu khó chẩn đoán nhất: server không thấy
      // request nào tới, log sạch bong.
      //
      // ⚠️ Gọi được vì `supertokens.init()` chạy ở TOP-LEVEL của
      // `./plugins/auth` — module đó được import (dòng trên) nên thân nó đã
      // chạy xong trước thân file này. Đảo thứ tự thành import động, hay gọi
      // hàm này từ một module chạy sớm hơn, sẽ ném "Initialisation not done".
      allowedHeaders: ["content-type", ...supertokens.getAllCORSHeaders()],
    }),
  )
  .use(timing)
  .use(auth)
  // ⚠️ PHẢI đứng trước mọi route nghiệp vụ. Đặt sau thì route đăng ký trước nó
  // không được bảo vệ, và không có gì báo lỗi.
  .use(staffGuard)
  .use(health)
  .use(vehicles)
  // Elysia trả 404 TRƯỚC khi `onBeforeHandle` chạy, nên guard chỉ phủ được route
  // CÓ THẬT. Chừng nào `/staff/*` chưa đăng ký ở đây thì `GET /staff/me` không
  // cookie ra 404 chứ không phải 401 — và 404 đó trông y hệt "đã được bảo vệ".
  .use(staff)
  .listen({ port: env.port, hostname: env.host });

console.warn(`api đang chạy tại http://${env.host}:${String(env.port)}`);

/** Eden Treaty ở frontend lấy type từ đây. */
export type App = typeof app;
export { app };

/**
 * Re-export CHỈ để `apps/staff` so `code` lỗi theo kiểu thay vì chuỗi trần
 * (`errorCode()` ở `apps/staff/src/lib/errors.ts`). `boundaries/dependencies`
 * chỉ cho `frontend` import TYPE từ `api-root` — đây là entrypoint DUY NHẤT
 * `@v9/api` phơi ra (`exports["."]` trong `package.json`), nên không re-export
 * ở đây thì `ApiErrorCode` không tới được `apps/staff` dù đã export ở
 * `routes/staff.ts`.
 */
export type { ApiErrorCode } from "./routes/staff";
