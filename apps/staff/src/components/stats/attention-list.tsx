import { Link } from "@tanstack/react-router";
import { STATUS_ICON } from "../../lib/rental-status";
import type { StatsSummary } from "../../lib/rentals";
import type { RentalsSearch } from "../../lib/rentals-search";
import { Icon, type IconName } from "../ui/icon";

/**
 * `icon` chứ không phải một chấm tô màu. Bốn dòng này nằm CẠNH NHAU, và cặp
 * `status-overdue` ↔ `warning` — ΔE≈0,040 dưới deuteranopia (design doc §2.5),
 * tức cùng MỘT màu với ~6% nam giới — vẫn kề nhau sau khi chèn dòng thứ ba
 * (`pickupOverdue` đỏ đứng ngay trên `dueToday` vàng). Chèn dòng mới KHÔNG gỡ
 * được cặp đó, chỉ dời chỗ nó; thứ tách được bốn dòng vẫn là hình dạng.
 */
interface Row {
  readonly key: string;
  readonly label: string;
  /**
   * Cả `to` lẫn `search` trong MỘT union phân biệt, thay vì hai field rời.
   * `search` của `/rentals` là bắt buộc (`RentalsSearch` không có field
   * optional) còn `/staff` không nhận search nào — để rời nhau thì `<Link
   * to={row.to} search={row.search}>` phải nhận một `search` hợp lệ cho MỌI
   * nhánh của `to`, và không có kiểu nào thoả. Gói lại rồi `{...row.target}`
   * thì mỗi nhánh tự mang đúng bộ prop của nó.
   */
  readonly target:
    | { readonly to: "/rentals"; readonly search: RentalsSearch }
    | { readonly to: "/staff" };
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
 * Đích chung của ba dòng đơn thuê — hàng đợi mặc định (`rentals-search.ts`)
 * đã tự nhảy tới nhóm gấp nhất, nên không có gì để tham số hoá theo từng dòng.
 * Một hằng số dùng chung thay vì gõ lại object này ba lần.
 */
const RENTALS_QUEUE_TARGET: Row["target"] = {
  to: "/rentals",
  search: { mode: "queue", q: "", page: 1, from: "", to: "" },
};

/**
 * Bốn dòng, sắp theo ĐỘ GẤP — không còn theo thứ tự mockup (design doc §8), vì
 * mockup đó được vẽ khi danh sách mới có ba dòng và chưa có `pickupOverdue`:
 *
 *  1. `overdue` — xe đang ngoài đường quá hạn trả. Tài sản ngoài tầm kiểm soát.
 *  2. `pickupOverdue` — đơn đã qua giờ nhận mà vẫn `BOOKED`. Xe bị giữ chỗ,
 *     không cho ai thuê được, và có thể khách đã bỏ kèo. Là vấn đề ĐANG sống.
 *  3. `dueToday` — chưa phải vấn đề, mới là việc sắp tới trong ngày.
 *  4. `pendingStaff` — hành chính, không đụng tới xe.
 *
 * Ba dòng đầu (`overdue`, `pickupOverdue`, `dueToday`) đều là **đơn thuê** —
 * `/rentals?mode=queue` mở đúng hàng đợi đó, tự nhảy tới nhóm gấp nhất, nên
 * không cần neo ngày nào cả. `pendingStaff` là **nhân viên**, một domain khác
 * hẳn, vẫn giữ `/staff` như cũ.
 *
 * `overdueFrom`/`pickupOverdueFrom` (`services/stats.ts`) không còn dùng ở
 * đây — hàng đợi tự sắp xếp theo độ gấp rồi, không cần mốc ngày để neo tới.
 * Hai field đó giờ không còn nơi tiêu thụ nào ngoài chính `services/stats.ts`,
 * `routes/stats.ts` và test của chúng — không đụng trong đợt này.
 *
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
      target: RENTALS_QUEUE_TARGET,
      // Đọc TỪ `STATUS_ICON` chứ không gõ lại `"alert-triangle"`: dòng này đếm
      // đúng tập đơn mà `isOverdue` chọn (`services/stats.ts` lọc
      // `ONGOING AND ends_at < now`), nên hai chỗ phải mang cùng một hình. Gõ
      // tay là mở đường cho chúng lệch nhau mà không có gì nổ.
      icon: STATUS_ICON.OVERDUE,
      className: "text-status-overdue",
    });
  }
  if (attention.pickupOverdue > 0) {
    rows.push({
      key: "pickupOverdue",
      // "đơn", không phải "xe" như ba dòng kia — và đó là chủ ý. `BOOKED` quá
      // `startsAt` có HAI cách đọc: khách chưa tới lấy, hoặc nhân viên đã giao
      // mà quên bấm "đã giao" (`rental-status.ts` ghi rõ vế thứ hai đắt hơn
      // nhiều). Tức chỗ này KHÔNG biết xe đang ở đâu; chỉ có cái đơn là chắc
      // chắn đang sai trạng thái. Viết "N xe chưa ai tới lấy" là khẳng định vế
      // thứ nhất, và sẽ dạy sai đúng lúc vế thứ hai xảy ra.
      label: `${String(attention.pickupOverdue)} đơn quá giờ nhận xe`,
      target: RENTALS_QUEUE_TARGET,
      // CÙNG token đỏ với dòng trên, cố ý — `rentalChipClass` cũng dùng một
      // token đỏ cho cả hai và tách chúng bằng CÁCH TÔ. Ở đây không có mảng tô
      // để tách, chỉ có hình: tam giác (kín) vs đồng hồ (tròn). Màu vì vậy nói
      // đúng một điều — "cùng hạng đỏ, cần người xử lý" — thay vì bịa ra token
      // thứ năm để nói một điều mà nhãn đã nói rõ hơn.
      icon: STATUS_ICON.PICKUP_OVERDUE,
      className: "text-status-overdue",
    });
  }
  if (attention.dueToday > 0) {
    rows.push({
      key: "dueToday",
      label: `${String(attention.dueToday)} xe phải trả hôm nay`,
      target: RENTALS_QUEUE_TARGET,
      // Lịch có dấu kiểm — việc gắn với NGÀY, và đường bao vuông tách hẳn
      // khỏi đồng hồ tròn của dòng ngay phía trên.
      icon: "calendar-check",
      className: "text-warning",
    });
  }
  if (attention.pendingStaff !== undefined && attention.pendingStaff > 0) {
    rows.push({
      key: "pendingStaff",
      label: `${String(attention.pendingStaff)} nhân viên chờ duyệt`,
      target: { to: "/staff" },
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
              <Link {...row.target} className={ROW}>
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
