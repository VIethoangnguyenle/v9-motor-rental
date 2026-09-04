import { QUEUE_GROUPS, type QueueGroup } from "@v9/shared/domain/rental";
import type { RentalQueueRow, RentalsQueueResult } from "../../lib/rentals-list";
import { RentalList } from "./rental-list";

/**
 * Nhãn tiếng Việt của năm nhóm. `Record` đủ cả năm nhánh chứ không phải một
 * object tự do: thêm một nhóm ở `@v9/shared` mà quên nhãn ở đây là LỖI BIÊN
 * DỊCH, cùng khuôn `STATUS_LABEL`.
 */
const GROUP_LABEL: Record<QueueGroup, string> = {
  OVERDUE: "Quá hạn trả",
  PICKUP_OVERDUE: "Chưa lấy xe",
  DUE_TODAY: "Nhận lại hôm nay",
  PICKUP_TODAY: "Giao hôm nay",
  UPCOMING: "Sắp tới",
};

interface RentalQueueProps {
  readonly rentals: readonly RentalQueueRow[];
  readonly groupCounts: Extract<RentalsQueueResult, { ok: true }>["groupCounts"];
  readonly now: Date;
  readonly onOpen: (id: string) => void;
}

/**
 * Lặp qua `QUEUE_GROUPS` chứ không qua các nhóm CÓ MẶT trong `rentals`: thứ tự
 * hiển thị phải là thứ tự độ gấp đã khai ở domain, không phải thứ tự tình cờ của
 * trang dữ liệu hiện tại. Trang 2 của hàng đợi mà tự sắp lại nhóm theo thứ nó
 * nhận được là một màn hình đổi cấu trúc giữa hai lần bấm.
 *
 * Số đếm lấy từ `groupCounts` (toàn bộ hàng đợi), KHÔNG phải `rows.length`
 * (trang đang xem): "Quá hạn trả (7)" phải đúng kể cả khi trang này chứa 3.
 *
 * Nhóm rỗng BIẾN MẤT, không hiện "0" — cùng luật `attention-list.tsx`.
 */
export function RentalQueue({ rentals, groupCounts, now, onOpen }: RentalQueueProps) {
  return (
    <div className="flex flex-col gap-6">
      {QUEUE_GROUPS.map((group) => {
        const rows = rentals.filter((r) => r.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              {GROUP_LABEL[group]} ({groupCounts[group]})
            </h2>
            <RentalList rows={rows} now={now} onOpen={onOpen} />
          </section>
        );
      })}
    </div>
  );
}
