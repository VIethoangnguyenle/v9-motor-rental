import { treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Chữ ký thật của treaty là `<const App extends Elysia<any, any, any, any, any, any, any>>`.
 * Bảy tham số any đó là của chính Elysia, không có cách nào viết hẹp hơn mà vẫn nhận được
 * mọi app hợp lệ. Thu hẹp bừa ở đây sẽ làm client từ chối app thật lúc biên dịch.
 */
type AnyElysiaApp = Elysia<any, any, any, any, any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Factory tạo Eden client có type.
 *
 * QUAN TRỌNG: file này CỐ Ý generic trên T và KHÔNG import gì từ apps/api.
 * Nếu nó import App type trực tiếp, ta có chu trình shared → api → shared,
 * vì apps/api import domain logic từ chính package này.
 * Frontend là nơi ghép hai đầu lại:
 *
 *   import type { App } from "@v9/api";
 *   import { createApiClient } from "@v9/shared/client";
 *   export const api = createApiClient<App>(url);
 *
 * Phụ thuộc vào `elysia` ở đây chỉ là type (bị xoá lúc build), và là thư viện bên
 * thứ ba — KHÔNG phải @v9/api, nên không tạo chu trình workspace.
 * Xem §4.1 của docs/plans/2026-08-04-scaffolding-design.md.
 */
export function createApiClient<T extends AnyElysiaApp>(baseUrl: string) {
  if (!baseUrl) {
    throw new Error("createApiClient cần baseUrl — kiểm tra NEXT_PUBLIC_API_URL / VITE_API_URL");
  }
  return treaty<T>(baseUrl);
}
