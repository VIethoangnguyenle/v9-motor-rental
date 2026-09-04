import type { RentalLedgerRow } from "../../lib/rentals-list";
import type { RentalsSearch } from "../../lib/rentals-search";
import { RentalList } from "./rental-list";

const MONEY_FMT = new Intl.NumberFormat("vi-VN");

interface RentalLedgerProps {
  readonly rentals: readonly RentalLedgerRow[];
  readonly collectedAmount: number;
  readonly search: RentalsSearch;
  readonly now: Date;
  readonly onRange: (from: string, to: string) => void;
  readonly onOpen: (id: string) => void;
}

export function RentalLedger({
  rentals,
  collectedAmount,
  search,
  now,
  onRange,
  onOpen,
}: RentalLedgerProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Từ ngày
          <input
            type="date"
            value={search.from}
            onChange={(e) => onRange(e.target.value, search.to)}
            className="min-h-11 rounded-card border border-border card-pad text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Đến ngày
          <input
            type="date"
            value={search.to}
            onChange={(e) => onRange(search.from, e.target.value)}
            className="min-h-11 rounded-card border border-border card-pad text-ink"
          />
        </label>
        {/*
         * "Đã thu", KHÔNG phải "Doanh thu" — và đó là một quyết định, không phải
         * cách nói vòng. Con số này cộng đúng vị từ doanh thu của `stats.ts`
         * (`handed_over_at IS NOT NULL`) nhưng qua một CỬA SỔ khác: giao với
         * khoảng thuê, không phải mốc giao xe. Gọi nó là "Doanh thu" thì nó sẽ
         * bị đem đối chiếu với thẻ ở Thống kê rồi báo là bug.
         */}
        <p className="ml-auto text-sm text-muted">
          Đã thu (đơn đã giao xe):{" "}
          <span className="font-semibold tabular-nums text-ink">
            {MONEY_FMT.format(collectedAmount)} ₫
          </span>
        </p>
      </div>
      <RentalList rows={rentals} now={now} onOpen={onOpen} />
    </div>
  );
}
