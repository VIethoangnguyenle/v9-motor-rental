// `@v9/shared` (barrel `index.ts`) là "shared-root", KHÔNG được frontend import —
// hàng rào boundaries chỉ cho `frontend` chạm `shared-domain`/`shared-client`.
// `formatVnd` sống ở `domain/money`, nên đi thẳng subpath đó (khớp cách
// `calendar-layout.ts` import `SHOP_TIMEZONE` từ `@v9/shared/domain/rental`).
import { formatVnd } from "@v9/shared/domain/money";
import type { StatsSummary } from "../../lib/rentals";

type PeriodKey = keyof StatsSummary["revenue"];

const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Hôm nay",
  thisWeek: "Tuần này",
  thisMonth: "Tháng này",
};

/** `null` = không tính được (chia cho 0) — nơi gọi tự hiện câu thay thế. */
function formatPercentChange(amount: number, prevAmount: number): string | null {
  if (prevAmount === 0) return null;
  const pct = Math.round(((amount - prevAmount) / prevAmount) * 100);
  // Dấu trừ THẬT (−, U+2212) khớp mockup design doc, không phải dấu gạch ngang bàn phím.
  return pct >= 0 ? `+${String(pct)}%` : `−${String(Math.abs(pct))}%`;
}

function RevenueCard({
  period,
  stat,
}: {
  readonly period: PeriodKey;
  readonly stat: StatsSummary["revenue"][PeriodKey];
}) {
  const pct = formatPercentChange(stat.amount, stat.prevAmount);
  return (
    <div className="rounded-card border border-border bg-surface card-pad">
      <p className="text-xs text-muted">{PERIOD_LABEL[period]}</p>
      <p className="mt-1 text-lg font-bold text-ink">{formatVnd(stat.amount)}</p>
      <p className="mt-1 text-xs text-muted">
        {stat.orders} đơn · {pct ?? "kỳ trước chưa có đơn"}
      </p>
    </div>
  );
}

/**
 * Ba thẻ doanh thu. `grid-cols-1` cho tới `md` (768px) — điện thoại xếp DỌC có
 * chủ ý (yêu cầu #1 của task): "48.200.000 ₫" không sống nổi trong một cột 100px
 * kiểu `grid-cols-3` ép trên màn hình hẹp.
 */
export function RevenueCards({ revenue }: { readonly revenue: StatsSummary["revenue"] }) {
  const periods: PeriodKey[] = ["today", "thisWeek", "thisMonth"];
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Doanh thu</h2>
      {/*
       * Yêu cầu #3 + #4 gộp vào MỘT câu thay vì lặp lại ở từng thẻ: "theo ngày
       * giao xe" (không phải tiền đã thu thật) và cảnh báo kỳ-đang-chạy-dở
       * (không phải sụt doanh thu). Ba thẻ đứng cạnh nhau nên một câu chung đọc
       * được cho cả ba, và app này ưu tiên mật độ thông tin hơn là lặp câu.
       *
       * Câu chỉ nêu tên "Tuần này"/"Tháng này", KHÔNG nêu "Hôm nay" — dù `today`
       * cũng là một kỳ chưa qua hết ngày. So "hôm nay tới giờ" với "trọn hôm qua"
       * là quy ước quen thuộc của mọi bảng doanh thu ngày; còn % âm ở ngày 1–2 của
       * tuần/tháng (so với kỳ trước đủ 7/30 ngày dữ liệu) dễ đọc nhầm thành sụt
       * doanh thu thật nếu không có nhãn.
       */}
      <p className="mt-1 text-xs text-muted">
        Tính theo ngày giao xe, không phải ngày đặt hay ngày thu tiền. Tuần này và tháng này đang
        tính dở — so với kỳ trước đã hết, % âm ở đầu kỳ là bình thường.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {periods.map((period) => (
          <RevenueCard key={period} period={period} stat={revenue[period]} />
        ))}
      </div>
    </section>
  );
}
