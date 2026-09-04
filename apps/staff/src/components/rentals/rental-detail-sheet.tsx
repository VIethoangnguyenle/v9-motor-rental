import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { formatVnd } from "@v9/shared/domain/money";
import { availableTransitions, SHOP_TIMEZONE, type RentalStatus } from "@v9/shared/domain/rental";
import { errorMessage } from "../../lib/errors";
import { changeRentalStatus, type CalendarRental, type FleetVehicle } from "../../lib/rentals";
import {
  STATUS_LABEL,
  TRANSITION_LABEL,
  lastMomentOf,
  rentalChipClass,
} from "../../lib/rental-status";
import { Alert } from "../ui/alert";
import { HandoverDetails } from "./handover-details";
import { HandoverPhotos } from "./handover-photos";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Modal } from "../ui/modal";

const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * `endsAt` là biên MỞ, nên phải qua `lastMomentOf` trước khi format — lý lẽ đầy
 * đủ ở `lib/rental-status.ts`. Hàm này từng là bản RIÊNG của file này
 * (`formatLastDay`) kèm ghi chú "đúng lỗi còn tồn tại ở `customer-rental-history.tsx`
 * và `customer-table.tsx`"; nay phần khó đã nằm ở chỗ dùng chung và hai file kia
 * gọi cùng một hàm, nên ghi chú đó không còn đúng nữa.
 */
function formatLastDay(endsAt: Date): string {
  return DATE_FMT.format(lastMomentOf(endsAt));
}

/**
 * Nhịp của khoảnh khắc dàn dựng — xem `@utility just-changed` ở `index.css`.
 *
 * Sheet phải sống đủ lâu để vòng sáng có khung hình mà chạy. `onChanged` ở
 * `rental-calendar.tsx` gọi `setSelectedId(null)`, tức gỡ sheet khỏi cây ngay
 * trong cùng một commit — gọi nó thẳng trong `onSuccess` là hiệu ứng không có
 * lấy một khung hình nào. Cùng lớp lỗi mà `ui/modal.tsx` đã ghi cho hiệu ứng ra.
 *
 * Hai con số vì bản reduced-motion là một dấu ĐỨNG YÊN: 600ms của một vòng đang
 * mờ dần thì đọc được, 600ms của một vòng bất động thì gần như không. Design doc
 * §4.6 giao 2s cho bản đó.
 *
 * `BEAT_MS` phải khớp thời lượng khai trong `@utility just-changed`; ngắn hơn là
 * cắt cụt hiệu ứng, dài hơn là bắt người dùng chờ một sheet đã xong việc.
 */
const BEAT_MS = 600;
const BEAT_REDUCED_MS = 2000;

/**
 * Hỏi chính trình duyệt thay vì đoán: khối `@media` trong `@utility just-changed`
 * và nhịp ở đây phải cùng nhìn một cờ, nếu không thì một trong hai chạy bản của
 * người kia.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface RentalDetailSheetProps {
  readonly rental: CalendarRental;
  readonly vehicle: FleetVehicle | undefined;
  readonly onClose: () => void;
  /** Đổi trạng thái xong — phía gọi hiện xác nhận và làm mới lịch. */
  readonly onChanged: (to: RentalStatus) => void;
}

/**
 * Chi tiết một đơn + các nút đổi trạng thái.
 *
 * Đây là câu trả lời cho hai chỗ hỏng cùng lúc, nên nó là một sheet chứ không
 * phải một nút rời trên thanh đơn:
 *
 * 1. **Không có đường nào đổi trạng thái từ UI.** `changeRentalStatus` ở
 *    `apps/api` không có call site nào trong app này, nên không đơn nào rời được
 *    `BOOKED` — `revenueAt` đòi `handedOverAt` (chỉ đặt ở nhánh `→ ONGOING`) nên
 *    ba thẻ doanh thu đứng yên ở `0 ₫` vĩnh viễn, và `isPickupOverdue` tô đỏ mọi
 *    đơn đã qua ngày hẹn để cảnh báo về một nút không tồn tại.
 * 2. **Trạng thái chỉ đọc được bằng `title=`.** Đây là PWA dùng trên điện thoại
 *    trong gara — `title` KHÔNG bao giờ hiện khi chạm (đã ghi ở đầu
 *    `lib/rental-status.ts`). Chạm vào thanh đơn để mở sheet này là cách đọc
 *    trạng thái trên đúng thiết bị mà app nhắm tới.
 *
 * Danh sách nút dựng từ `availableTransitions` của `@v9/shared` — KHÔNG chép tay.
 * Bảng `ALLOWED` bên đó là nguồn sự thật duy nhất; một mảng nút chép tay ở đây
 * biên dịch được cho tới ngày luật đổi, và ngày đó nút vẫn mời người dùng đi một
 * đường server trả 409.
 */
export function RentalDetailSheet({ rental, vehicle, onClose, onChanged }: RentalDetailSheetProps) {
  const queryClient = useQueryClient();
  /** Huỷ đơn là hành động không quay lại được — hỏi một nhịp trước khi gửi. */
  const [confirming, setConfirming] = useState<RentalStatus | null>(null);

  /**
   * Số lần đơn này đổi trạng thái TRONG PHIÊN mở sheet hiện tại.
   *
   * State cục bộ chứ không suy từ dữ liệu: "vừa đổi" là một sự kiện của phiên
   * làm việc này, không phải một thuộc tính của đơn. Tải lại trang thì nó biến
   * mất, và đó là đúng.
   *
   * ĐẾM chứ không phải cờ `boolean`, và con số đi thẳng vào `key` của chip: một
   * cờ đã bật thì lần đổi trạng thái THỨ HAI trong cùng sheet không khởi động
   * lại được hoạt ảnh — CSS animation chỉ chạy khi `animation-name` vừa được gắn
   * vào một phần tử, mà class thì đã nằm sẵn ở đó. Đổi `key` là dựng lại phần
   * tử, tức dựng lại luôn `::after`. Hôm nay chưa với tới được (nhịp đầu đóng
   * sheet trước khi kịp bấm nút thứ hai), nhưng nó là cái bẫy chờ đúng người
   * sau nào giữ sheet mở lâu hơn.
   */
  const [changeCount, setChangeCount] = useState(0);

  /**
   * Hàm đóng của `Modal`, giữ trong ref để `onSuccess` của mutation với tới
   * được — nó nằm ngoài tầm của render prop. Cùng khuôn `rental-form.tsx`, và
   * cùng lý do: đóng phải đi qua `dialog.close()` thì hiệu ứng ra mới chạy.
   * Mặc định no-op vì trước lượt vẽ đầu tiên chưa có `<dialog>` nào để đóng.
   */
  const closeRef = useRef<() => void>(() => undefined);

  /**
   * Nhịp đang chạy: bộ đếm giờ, và câu xác nhận nó còn nợ phía gọi.
   *
   * Người dùng bấm ✕ hoặc Esc giữa nhịp thì `onChanged` chưa kịp chạy — mà đó
   * chính là thứ dựng câu "Đã cập nhật…" trên lịch. Cleanup chạy nốt nó, để
   * đóng sớm không phải đổi lấy việc app im lặng.
   *
   * Ref giữ `notify` chứ KHÔNG giữ cả phần đóng: lúc cleanup chạy thì `<dialog>`
   * đang bị gỡ vì một lý do khác, và gọi `close()` vào đó là nói với một phần tử
   * đã hết phiên. Chỉ nhánh hết-giờ mới được đóng.
   */
  const beat = useRef<{ timer: ReturnType<typeof setTimeout>; notify: () => void } | null>(null);
  useEffect(
    () => () => {
      const pending = beat.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pending.notify();
    },
    [],
  );

  // Hai effect từng nằm đây — một để trả tiêu điểm về nơi người dùng bấm, một để
  // bắt Esc — đã chuyển vào `ui/modal.tsx`, nơi `dialog.showModal()` làm cả hai
  // theo spec và thêm hai thứ bản viết tay này không có: bẫy Tab và `inert` cho
  // phần còn lại của trang. Ba lớp phủ của app giờ dùng chung đúng một cơ chế.
  const change = useMutation({
    mutationFn: async (to: RentalStatus) => {
      const r = await changeRentalStatus(rental.id, to);
      if (!r.ok) {
        // 409 `INVALID_TRANSITION` gần như luôn nghĩa là ai đó vừa đổi đơn này ở
        // máy khác — nói ra điều đó, đừng lặp lại câu chung chung của server.
        throw new Error(
          r.code === "INVALID_TRANSITION"
            ? "Đơn vừa được đổi trạng thái ở nơi khác. Tải lại lịch rồi thử lại."
            : errorMessage(r.value, "Không đổi được trạng thái đơn"),
        );
      }
      return to;
    },
    onSuccess: (to) => {
      // Lịch VÀ thống kê đều đọc lệch sau khi đổi: `handedOverAt` vừa đặt là mốc
      // ghi nhận doanh thu, nên `statsQuery` cũng phải bay theo, không chỉ lịch.
      void queryClient.invalidateQueries({ queryKey: ["rentals"] });
      // `["stats-summary"]`, KHÔNG phải `["stats"]`: `invalidateQueries` so khớp
      // tiền tố theo TỪNG PHẦN TỬ mảng, không theo chuỗi con — `"stats"` không
      // khớp `"stats-summary"`, và sai chỗ này thì doanh thu đứng yên đúng như
      // lỗi mà nút "Đã giao xe" sinh ra để sửa.
      void queryClient.invalidateQueries({ queryKey: ["stats-summary"] });

      // Chip đổi cả CHỮ lẫn cách tô ngay trong commit này (`shownStatus`); vòng
      // sáng nói CHỖ NÀO vừa đổi. Báo lên trên — tức đóng sheet — chỉ sau khi
      // nhịp chạy xong; xem `BEAT_MS`.
      setChangeCount((n) => n + 1);
      const notify = () => {
        beat.current = null;
        onChanged(to);
      };
      if (beat.current) {
        // Nhịp trước còn NỢ một câu xác nhận. Huỷ đồng hồ mà không trả nốt là
        // đánh rơi `onChanged` đầu tiên trong im lặng — đúng lớp lỗi cả đợt này
        // sinh ra để dọn.
        clearTimeout(beat.current.timer);
        beat.current.notify();
      }
      const holdMs = prefersReducedMotion() ? BEAT_REDUCED_MS : BEAT_MS;
      beat.current = {
        timer: setTimeout(() => {
          notify();
          // Đóng qua `close` chứ không để phía gọi gỡ component: đây là đường
          // đóng thứ hai của sheet, và nó phải đi qua `dialog.close()` như nút ✕
          // thì hiệu ứng ra mới có khung hình. Gọi SAU `notify` nên thứ tự là
          // vòng sáng chạy hết nhịp → sheet mới bắt đầu tan.
          closeRef.current();
        }, holdMs),
        notify,
      };
    },
  });

  const now = new Date();

  /**
   * Trạng thái để VẼ, không phải trạng thái trong prop.
   *
   * `change.data` là giá trị `mutationFn` trả về sau khi server xác nhận, nên nó
   * đúng ngay từ khung hình đầu — không phải đợi vòng `invalidateQueries` →
   * refetch → prop mới về. Hai lý do, và lý do thứ hai mới là lý do bắt buộc:
   *
   *   • chip lật cùng lúc với vòng sáng thay vì lệch sau nó một RTT;
   *   • trên đường `→ CANCELLED` thì KHÔNG có prop mới nào để mà đợi:
   *     `listRentalsInRange` lọc `status <> 'CANCELLED'`, nên đơn vừa huỷ rơi
   *     khỏi danh sách và `rental-calendar.tsx` ghim lại bản CŨ. Thiếu dòng này,
   *     vòng sáng chạy quanh một cái chip vẫn ghi "Đã đặt".
   */
  const shownStatus: RentalStatus = change.data ?? rental.status;
  const shownRental = { ...rental, status: shownStatus };

  const vehicleLabel = vehicle
    ? `${vehicle.make} ${vehicle.model}${vehicle.plate ? ` · ${vehicle.plate}` : ""}`
    : "Xe không còn trong đội";
  const nextStatuses = availableTransitions(shownStatus);

  /**
   * Đã giao xe / Huỷ đơn là hành động của CẢ ĐƠN, không phải của một khối nội
   * dung — neo ở khe `footer` của `Modal` (chân panel, không cuộn theo), thay
   * vì nằm cuối content dưới ảnh giao/trả xe. Trước đây 4/7 nút của sheet này
   * nằm dưới nếp gấp trên điện thoại; BA nút "Thêm ảnh" CỐ Ý ở lại trong nội
   * dung — một nút cho mỗi `PhotoKind` (`DOCUMENT`, `HANDOVER`, `RETURN` —
   * `@v9/shared/domain/rental-photo`), chúng thuộc về khối ảnh của chính
   * chúng (giấy tờ / giao xe / nhận lại xe). Nút của `RETURN` — ảnh lúc NHẬN
   * LẠI xe — đứng cuối cùng và nằm dưới nếp gấp: `PRODUCT.md` nguyên tắc #3
   * gọi ảnh bàn giao là "bằng chứng bảo vệ cả hai phía", nên người sau đọc
   * chú thích này cần biết nó tồn tại và đang ở đâu, không chỉ biết nó "cố ý
   * ở lại".
   */
  const renderFooter = () => (
    <div className="card-pad flex flex-col gap-2">
      {change.error && <Alert tone="error">{change.error.message}</Alert>}

      {nextStatuses.length === 0 ? (
        // Đơn đã kết thúc. Nói ra, đừng để một vùng nút trống người dùng tự đoán.
        <p className="text-sm text-muted">Đơn đã kết thúc, không còn thao tác nào.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {nextStatuses.map((to) => {
            const destructive = to === "CANCELLED";
            if (destructive && confirming === to) {
              return (
                <div key={to} className="flex flex-col gap-2">
                  <Alert tone="warning">
                    Huỷ đơn này? Đơn đã huỷ không mở lại được, và xe sẽ trống lại trong khoảng{" "}
                    {DATE_FMT.format(rental.startsAt)} – {formatLastDay(rental.endsAt)}.
                  </Alert>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      pending={change.isPending}
                      onClick={() => change.mutate(to)}
                    >
                      {change.isPending ? "Đang huỷ…" : "Huỷ đơn"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                      Quay lại
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <Button
                key={to}
                type="button"
                variant={destructive ? "ghost" : "primary"}
                pending={change.isPending}
                onClick={() => (destructive ? setConfirming(to) : change.mutate(to))}
              >
                {change.isPending && !destructive ? "Đang lưu…" : TRANSITION_LABEL[to]}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    // `placement="adaptive"`: đáy màn trên điện thoại (mở bằng cách chạm một
    // thanh trên lịch, ngón cái ở đó), giữa màn từ ≥640px.
    <Modal
      label={`Đơn thuê ${vehicleLabel}`}
      placement="adaptive"
      onClose={onClose}
      footer={renderFooter}
    >
      {(close) => {
        // Ghi vào ref NGAY trong lượt vẽ, cùng khuôn `onCloseRef` của
        // `ui/modal.tsx`. `close` ổn định (`useCallback` deps rỗng) nên gán lại
        // mỗi lần vẽ là vô hại.
        closeRef.current = close;
        return (
          <div className="flex flex-col gap-4 card-pad">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-ink">{vehicleLabel}</h2>
                <p className="mt-1 text-sm text-muted">
                  {rental.customerName ?? "—"}
                  {rental.customerPhone ? ` · ${rental.customerPhone}` : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" onClick={close} aria-label="Đóng">
                <Icon name="close" />
              </Button>
            </div>

            {/* Trạng thái hiện bằng CHỮ, không chỉ bằng màu — đây là chỗ duy nhất
            trong app đọc được trạng thái mà không cần hover. */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                // `key` đổi theo mỗi nhịp để phần tử được dựng lại — xem `changeCount`.
                key={changeCount}
                className={`rounded-card px-2 py-1 text-xs ${rentalChipClass(shownRental, now)}${changeCount > 0 ? " just-changed" : ""}`}
              >
                {STATUS_LABEL[shownStatus]}
              </span>
              <span className="text-sm text-ink">
                {DATE_FMT.format(rental.startsAt)} – {formatLastDay(rental.endsAt)}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-px rounded-card border border-border bg-border">
              <div className="bg-surface card-pad">
                <dt className="text-xs text-muted">Tổng tiền</dt>
                <dd className="text-sm font-semibold text-ink tabular-nums">
                  {formatVnd(rental.totalAmount)}
                </dd>
              </div>
              <div className="bg-surface card-pad">
                <dt className="text-xs text-muted">Tiền cọc</dt>
                <dd className="text-sm font-semibold text-ink tabular-nums">
                  {formatVnd(rental.depositAmount)}
                </dd>
              </div>
            </dl>

            {rental.note && <p className="text-sm text-ink">{rental.note}</p>}

            {/*
             * Giấy tờ + ảnh đứng TRÊN nút đổi trạng thái, không phải dưới: nhân
             * viên chụp ảnh rồi mới bấm "đã giao xe", nên thứ tự trên màn hình khớp
             * thứ tự việc làm ngoài đời. Đặt nút trước thì luồng tự nhiên là bấm
             * xong rồi cuộn xuống chụp — và tấm ảnh "lúc giao" chụp sau khi xe đã đi.
             */}
            <HandoverDetails
              rentalId={rental.id}
              documentType={rental.documentType}
              documentReturnedAt={rental.documentReturnedAt}
              deliveryAddress={rental.deliveryAddress}
            />

            <HandoverPhotos rentalId={rental.id} />
          </div>
        );
      }}
    </Modal>
  );
}
