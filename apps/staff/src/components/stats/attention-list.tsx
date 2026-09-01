import { Link } from "@tanstack/react-router";
import { STATUS_ICON } from "../../lib/rental-status";
import type { StatsSummary } from "../../lib/rentals";
import { Icon, type IconName } from "../ui/icon";

/**
 * `icon` chứ không phải một chấm tô màu. Ba dòng này nằm CẠNH NHAU, và hai dòng
 * đầu mang cặp `status-overdue` ↔ `warning` — ΔE≈0,040 dưới deuteranopia (design
 * doc §2.5), tức cùng MỘT màu với ~6% nam giới. Ba chấm tròn cùng hình khác màu
 * ở đây là thông tin đi bằng đúng một kênh, tại đúng chỗ tệ nhất trong app để
 * làm vậy; hình dạng mới là thứ tách được ba dòng.
 */
interface Row {
  readonly key: string;
  readonly label: string;
  readonly to: "/calendar" | "/staff";
  readonly icon: IconName;
  readonly className: string;
}

/**
 * Vùng chạm tối thiểu 44px, cùng ngưỡng `Button`/`AppNav` — yêu cầu #6: mỗi dòng
 * PHẢI bấm được, không phải chỉ đọc.
 *
 * Chuyển động nói tiếp điều đó: nền chạy tới `canvas` trong 120ms thay vì nhảy,
 * tức con trỏ vừa vào là hàng tự nhận mình bấm được. Cùng token với `Button`
 * (`ui/button.tsx`) — hai thứ bấm được thì phản hồi phải giống nhau. Cú pháp
 * `duration-(--duration-instant)`: xem `index.css`.
 *
 * `transition-[background-color]` chứ KHÔNG `transition-colors`: danh sách của
 * `transition-colors` gồm cả `outline-color` (đọc trong CSS đã build), mà
 * `:focus-visible` toàn cục tô vòng tiêu điểm bằng `outline`. Dùng nó là cho
 * vòng focus bò từ màu chữ sang accent trong 120ms — design doc §4.4 mục 3 xếp
 * vòng focus vào diện KHÔNG animate, vì một vòng tiêu điểm tới trễ là lỗi chứ
 * không phải hiệu ứng. Hàng này cũng chỉ đổi đúng một màu khi rê chuột.
 */
const ROW =
  "flex min-h-11 items-center justify-between gap-3 rounded-card px-3 text-sm text-ink transition-[background-color] duration-(--duration-instant) ease-standard hover:bg-canvas";

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
      // Đọc TỪ `STATUS_ICON` chứ không gõ lại `"alert-triangle"`: dòng này đếm
      // đúng tập đơn mà `isOverdue` chọn (`services/stats.ts` lọc
      // `ONGOING AND ends_at < now`), nên hai chỗ phải mang cùng một hình. Gõ
      // tay là mở đường cho chúng lệch nhau mà không có gì nổ.
      icon: STATUS_ICON.OVERDUE,
      className: "text-status-overdue",
    });
  }
  if (attention.dueToday > 0) {
    rows.push({
      key: "dueToday",
      label: `${String(attention.dueToday)} xe phải trả hôm nay`,
      to: "/calendar",
      // Lịch có dấu kiểm — việc gắn với NGÀY, và đường bao vuông tách hẳn
      // khỏi tam giác của dòng ngay phía trên.
      icon: "calendar-check",
      className: "text-warning",
    });
  }
  if (attention.pendingStaff !== undefined && attention.pendingStaff > 0) {
    rows.push({
      key: "pendingStaff",
      label: `${String(attention.pendingStaff)} nhân viên chờ duyệt`,
      to: "/staff",
      icon: "nav-staff",
      className: "text-accent",
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
                  <Icon name={row.icon} className={row.className} />
                  {row.label}
                </span>
                <Icon name="chevron-right" className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
