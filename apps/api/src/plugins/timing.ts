import { Elysia } from "elysia";

/**
 * Ghi latency có cấu trúc để so với perf budget trong CLAUDE.md.
 * `name` là bắt buộc — thiếu nó Elysia sẽ chạy lại plugin mỗi lần `.use()`.
 */
export const timing = new Elysia({ name: "timing" })
  .onRequest(({ store }) => {
    (store as { startedAt?: number }).startedAt = performance.now();
  })
  .onAfterResponse(({ store, request, set }) => {
    const startedAt = (store as { startedAt?: number }).startedAt;
    if (startedAt === undefined) return;
    const ms = Math.round((performance.now() - startedAt) * 100) / 100;
    console.warn(
      JSON.stringify({
        route: new URL(request.url).pathname,
        method: request.method,
        status: set.status ?? 200,
        ms,
      }),
    );
  })
  .as("global");
