import { describe, expect, it } from "bun:test";
import { Glob } from "bun";

/**
 * Cấm arbitrary value cho khoảng cách trong apps/staff: `p-[13px]`, `gap-[7px]`,
 * `mt-[22px]`… Thang cách đã khai trong `index.css`; một số lẻ cạnh nó là một
 * thang cách thứ hai không ai biết.
 *
 * Chỉ chặn nhóm KHOẢNG CÁCH. Arbitrary value cho thứ khác (`grid-cols-[...]`,
 * `w-[88px]` cho cột dính của lịch) là hợp lệ và không bị đụng tới — chặn quá tay
 * thì người ta tắt hàng rào, và một hàng rào bị tắt tệ hơn không có.
 *
 * Là TEST chứ không phải plugin ESLint: `bun test` đã nằm sẵn trong CI, còn thêm
 * plugin nghĩa là đụng `eslint.config.js`, mà mỗi lần đụng file đó phải chạy lại
 * bốn probe của skill `v9-fences`.
 */
const FORBIDDEN =
  /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[/;

describe("thang cách", () => {
  it("không có arbitrary value cho khoảng cách trong .tsx", async () => {
    const root = new URL("../..", import.meta.url).pathname;
    const offenders: string[] = [];
    let scanned = 0;

    for await (const rel of new Glob("src/**/*.tsx").scan({ cwd: root })) {
      scanned += 1;
      const text = await Bun.file(`${root}/${rel}`).text();
      text.split("\n").forEach((line, i) => {
        if (FORBIDDEN.test(line)) offenders.push(`${rel}:${String(i + 1)} — ${line.trim()}`);
      });
    }

    // Bằng chứng scan không rỗng: một test xanh vì quét 0 file thì không bảo vệ
    // gì cả. apps/staff hiện có 22 file .tsx (đếm bằng `find`), nên ngưỡng > 10
    // là dư sức chịu được vài file mới mà vẫn báo động nếu glob gãy.
    expect(scanned).toBeGreaterThan(10);

    expect(offenders).toEqual([]);
  });
});
