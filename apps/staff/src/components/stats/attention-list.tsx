import { Link } from "@tanstack/react-router";
import type { StatsSummary } from "../../lib/rentals";

interface Row {
  readonly key: string;
  readonly label: string;
  readonly to: "/calendar" | "/staff";
  readonly dotClassName: string;
}

/**
 * Vùng chạm tối thiểu 44px, cùng ngưỡng `Button`/`AppNav` — yêu cầu #6: mỗi dòng
 * PHẢI bấm được, không phải chỉ đọc.
 */
const ROW =
  "flex min-h-11 items-center justify-between gap-3 rounded-card px-3 text-sm text-ink hover:bg-canvas";

/**
 * Ba dòng, đúng thứ tự mockup (design doc §8): quá hạn → trả hôm nay → chờ duyệt.
 * `attention.pendingStaff` là `undefined` với STAFF (server không gửi field —
 * xem `routes/stats.ts`) — yêu cầu #7: VẮNG thì không render dòng đó, không
 * render "0". Một STAFF thấy "0 nhân viên chờ duyệt" sẽ tưởng đúng là 0, trong
 * khi sự thật là "bạn không được biết số này".
 */
export function AttentionList({ attention }: { readonly attention: StatsSummary["attention"] }) {
  const rows: Row[] = [];

  if (attention.overdue > 0) {
    rows.push({
      key: "overdue",
      label: `${String(attention.overdue)} xe quá hạn chưa trả`,
      to: "/calendar",
      dotClassName: "text-status-overdue",
    });
  }
  if (attention.dueToday > 0) {
    rows.push({
      key: "dueToday",
      label: `${String(attention.dueToday)} xe phải trả hôm nay`,
      to: "/calendar",
      dotClassName: "text-warning",
    });
  }
  if (attention.pendingStaff !== undefined && attention.pendingStaff > 0) {
    rows.push({
      key: "pendingStaff",
      label: `${String(attention.pendingStaff)} nhân viên chờ duyệt`,
      to: "/staff",
      dotClassName: "text-accent",
    });
  }

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Cần chú ý</h2>
      {rows.length === 0 ? (
        // Yêu cầu #8: không có việc gì thì NÓI vậy — không hiện khung rỗng, vì
        // khung rỗng khiến người xem đi tìm lỗi tải dữ liệu thay vì hiểu là "ổn".
        <p className="mt-2 text-sm text-muted">Không có việc gì cần chú ý ngay lúc này.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.key}>
              <Link to={row.to} className={ROW}>
                <span className="flex items-center gap-2">
                  <span aria-hidden className={row.dotClassName}>
                    ●
                  </span>
                  {row.label}
                </span>
                <span aria-hidden className="text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
