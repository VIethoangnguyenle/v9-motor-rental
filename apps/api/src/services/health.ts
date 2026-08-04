import { env } from "../env";
import { client } from "../db";

export interface CheckResult {
  readonly ok: boolean;
  readonly detail: string;
}

export async function checkPostgres(): Promise<CheckResult> {
  try {
    const rows = await client<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
    `;
    return rows.length === 1
      ? { ok: true, detail: "connected, btree_gist enabled" }
      : { ok: false, detail: "connected nhưng thiếu btree_gist — chạy bun run db:migrate" };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export async function checkMinio(): Promise<CheckResult> {
  try {
    const res = await fetch(`${env.minio.endpoint}/minio/health/live`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok
      ? { ok: true, detail: `reachable at ${env.minio.endpoint}` }
      : { ok: false, detail: `HTTP ${String(res.status)}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
