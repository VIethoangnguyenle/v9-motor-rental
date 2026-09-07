import { formatVnd } from "@v9/shared/domain/money";
import {
  FLEET_GROUPS,
  GROUP_HINT,
  GROUP_LABEL,
  fleetGroupOf,
  onRentLabel,
} from "../../lib/fleet-group";
import type { FleetVehicle } from "../../lib/rentals";

/**
 * Danh sách đội xe chia theo TÌNH TRẠNG — hình dạng của màn hẹp (<768).
 *
 * KHÔNG phải bảng thu nhỏ. Màn rộng hỏi "đội xe của tôi đúng chưa" và trả lời
 * bằng một bảng đầy đủ để sửa; màn hẹp hỏi "xe nào đang ở đâu" vì chủ shop đang
 * đứng ngoài đường và khách vừa hỏi còn con nào. Hai câu hỏi khác nhau thì hai
 * bố cục khác nhau — cùng tiền lệ `field-page.tsx` đã đặt cho tầng vận hành mobile.
 *
 * Mỗi dòng vì thế chỉ mang ba thứ: tên xe, biển số, và MỘT dòng trả lời câu hỏi
 * kế tiếp. Giá và doanh thu nằm một lớp sâu hơn, trong sheet chi tiết.
 */

const DAY_FMT = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });

const day = (v: Date | string | null): string | null =>
  v === null ? null : DAY_FMT.format(new Date(v));

export function FleetGroups({
  rows,
  onOpen,
}: {
  readonly rows: readonly FleetVehicle[];
  readonly onOpen: (id: string) => void;
}) {
  // MỘT `now` cho cả danh sách — cùng lý lẽ `fleet-table.tsx`.
  const now = new Date();

  const grouped = FLEET_GROUPS.map((group) => ({
    group,
    items: rows.filter(
      (v) =>
        fleetGroupOf({
          status: v.status,
          onRentUntil: v.onRentUntil === null ? null : new Date(v.onRentUntil),
          nextFrom: v.nextFrom === null ? null : new Date(v.nextFrom),
        }) === group,
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {grouped.map(({ group, items }) => (
        <section key={group} className="flex flex-col gap-1">
          <h2 className="m-0 flex items-baseline gap-2 text-sm font-semibold text-ink">
            {GROUP_LABEL[group]}
            <span className="font-normal text-muted tabular-nums">{items.length}</span>
          </h2>
          <p className="m-0 text-xs text-muted">{GROUP_HINT[group]}</p>

          <ul className="mt-1">
            {items.map((v) => {
              const until = v.onRentUntil === null ? null : new Date(v.onRentUntil);
              const next = day(v.nextFrom);
              return (
                <li key={v.id} className="border-b border-border">
                  {/*
                    Cả DÒNG là vùng bấm, không phải một nút nhỏ ở cuối: một tay,
                    ngoài nắng, ngón cái — vùng chạm càng rộng càng ít trượt.
                    `min-h-11` giữ ngưỡng 44px kể cả khi dòng chỉ có một hàng chữ.
                  */}
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(v.id);
                    }}
                    className="flex min-h-11 w-full flex-col items-start gap-0.5 py-2 text-left"
                  >
                    <span className="font-semibold text-ink">
                      {v.make} {v.model}
                    </span>
                    <span className="text-sm text-muted tabular-nums">
                      {v.plate ?? "chưa có biển số"}
                      {v.photoCount === 0 && (
                        <span className="text-status-overdue"> · chưa có ảnh</span>
                      )}
                    </span>
                    {until !== null && (
                      <span
                        className={`text-sm tabular-nums ${
                          until.getTime() < now.getTime() ? "text-status-overdue" : "text-ink"
                        }`}
                      >
                        {/* Viết hoa chữ đầu: đây là dòng CHÍNH của mục, không phải chú thích. */}
                        {onRentLabel(until, now).replace(/^./, (c) => c.toUpperCase())}
                      </span>
                    )}
                    {until === null && next !== null && (
                      <span className="text-sm text-muted tabular-nums">Có đơn từ {next}</span>
                    )}
                    {until === null && next === null && (
                      <span className="text-sm text-muted tabular-nums">
                        {formatVnd(v.pricePerDay)}/ngày
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
