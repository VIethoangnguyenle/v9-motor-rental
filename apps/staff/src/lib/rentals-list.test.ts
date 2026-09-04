import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { rentalsLedgerQuery, rentalsQueueQuery } from "./rentals-list";

describe("khoá query của rentals nằm chung tiền tố ['rentals']", () => {
  it("invalidateQueries(['rentals']) khớp cả queue lẫn ledger, không khớp khoá gạch-nối kiểu cũ", () => {
    // TanStack so khớp tiền tố THEO TỪNG PHẦN TỬ MẢNG, không theo chuỗi con —
    // đây chính là bẫy mà `rental-detail-sheet.tsx` đã ghi lại cho `stats-summary`
    // và commit trước đó của rentals-list.ts đã dẫm phải: `["rentals-queue", 1]`
    // không phải phần tử con của `["rentals"]`, nên `invalidateQueries({queryKey:
    // ["rentals"]})` bỏ sót nó hoàn toàn dù tên trông rất giống.
    const qc = new QueryClient();
    const queueKey = rentalsQueueQuery(1).queryKey;
    const ledgerKey = rentalsLedgerQuery({ mode: "ledger", q: "", page: 1, from: "", to: "" }).queryKey;
    const legacyHyphenKey = ["rentals-queue", 1] as const;

    qc.setQueryData(queueKey, { ok: true });
    qc.setQueryData(ledgerKey, { ok: true });
    qc.setQueryData(legacyHyphenKey, { ok: true });

    void qc.invalidateQueries({ queryKey: ["rentals"] });

    expect(qc.getQueryState(queueKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(ledgerKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(legacyHyphenKey)?.isInvalidated).toBe(false);
  });
});
