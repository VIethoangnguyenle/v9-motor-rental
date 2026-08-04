import { Elysia, t } from "elysia";
import { checkMinio, checkPostgres } from "../services/health";

const checkSchema = t.Object({ ok: t.Boolean(), detail: t.String() });

/**
 * /health là liveness — phải rẻ. Caddy và Docker healthcheck gọi nó liên tục,
 * nên nó KHÔNG được chạm database.
 * /health/deep là readiness — kiểm tra thật cả Postgres lẫn MinIO.
 */
export const health = new Elysia({ name: "health" })
  .get("/health", () => ({ status: "ok" as const }), {
    response: t.Object({ status: t.Literal("ok") }),
  })
  .get(
    "/health/deep",
    async ({ status }) => {
      const [postgres, minio] = await Promise.all([checkPostgres(), checkMinio()]);
      if (postgres.ok && minio.ok) {
        return status(200, { status: "ok" as const, postgres, minio });
      }
      return status(503, { status: "degraded" as const, postgres, minio });
    },
    {
      response: {
        200: t.Object({ status: t.Literal("ok"), postgres: checkSchema, minio: checkSchema }),
        503: t.Object({ status: t.Literal("degraded"), postgres: checkSchema, minio: checkSchema }),
      },
    },
  );
