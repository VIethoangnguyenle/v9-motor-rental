/**
 * Đo p50/p95/p99 của /health để so với perf budget trong CLAUDE.md.
 * Cố ý không dùng công cụ ngoài: một file, không dependency, chạy ở mọi máy.
 *
 * File này nằm trong `boundaries/ignore` của eslint.config.js — nó là công cụ vận hành,
 * không phải một tầng trong kiến trúc, nên được phép chạm thẳng vào bất cứ đâu.
 */
const url = process.env.BENCH_URL ?? "http://localhost:3001/health";
const total = Number(process.env.BENCH_N ?? 2000);
const concurrency = Number(process.env.BENCH_C ?? 50);
const budgetP95 = Number(process.env.BENCH_BUDGET_P95_MS ?? 5);

async function worker(n: number, out: number[]): Promise<void> {
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const res = await fetch(url);
    await res.text();
    out.push(performance.now() - t0);
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round((sorted[idx] ?? 0) * 100) / 100;
}

// Warm-up: bỏ mẫu đi, chỉ để JIT và connection pool ổn định trước khi đo.
await worker(50, []);

const samples: number[] = [];
const started = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, () => worker(Math.ceil(total / concurrency), samples)),
);
const elapsed = (performance.now() - started) / 1000;

samples.sort((a, b) => a - b);
const p95 = percentile(samples, 95);

console.warn(
  JSON.stringify(
    {
      url,
      requests: samples.length,
      concurrency,
      rps: Math.round(samples.length / elapsed),
      p50: percentile(samples, 50),
      p95,
      p99: percentile(samples, 99),
      budget_p95: budgetP95,
    },
    null,
    2,
  ),
);

if (p95 > budgetP95) {
  console.error(
    `VƯỢT PERF BUDGET: /health p95 = ${String(p95)}ms > ${String(budgetP95)}ms — xem CLAUDE.md §Perf budget`,
  );
  process.exit(1);
}
