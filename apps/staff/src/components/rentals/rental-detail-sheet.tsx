import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { formatVnd } from "@v9/shared/domain/money";
import {
  availableTransitions,
  SHOP_TIMEZONE,
  type RentalStatus,
} from "@v9/shared/domain/rental";
import { errorMessage } from "../../lib/errors";
import { changeRentalStatus, type CalendarRental, type FleetVehicle } from "../../lib/rentals";
import { STATUS_LABEL, TRANSITION_LABEL, rentalChipClass } from "../../lib/rental-status";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";

const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * `endsAt` là biên MỞ (khớp `tstzrange '[)'` và `toApiRange` ở `rental-form.tsx`):
 * đơn "10/09 → 12/09" lưu `endsAt = 13/09 00:00`. Hiện thẳng `endsAt` ra màn hình
 * là hiện sai một ngày — đúng lỗi còn tồn tại ở `customer-rental-history.tsx` và
 * `customer-table.tsx`. Lùi một mili-giây đưa mốc về trong ngày cuối THẬT rồi mới
 * format, thay vì trừ 24 giờ (trừ giờ sẽ lệch vào ngày đổi giờ ở múi có DST —
 * `SHOP_TIMEZONE` hôm nay không có, nhưng hàm này không nên phụ thuộc điều đó).
 */
function formatLastDay(endsAt: Date): string {
  return DATE_FMT.format(new Date(endsAt.getTime() - 1));
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
export function RentalDetailSheet({
  rental,
  vehicle,
  onClose,
  onChanged,
}: RentalDetailSheetProps) {
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  /** Huỷ đơn là hành động không quay lại được — hỏi một nhịp trước khi gửi. */
  const [confirming, setConfirming] = useState<RentalStatus | null>(null);

  // Trả tiêu điểm về nơi người dùng bấm khi sheet đóng. `rental-form.tsx` chưa
  // làm việc này (nợ đã biết); trang mới thì không lặp lại.
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
      onChanged(to);
    },
  });

  const now = new Date();
  const vehicleLabel = vehicle
    ? `${vehicle.make} ${vehicle.model}${vehicle.plate ? ` · ${vehicle.plate}` : ""}`
    : "Xe không còn trong đội";
  const nextStatuses = availableTransitions(rental.status);

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Đơn thuê ${vehicleLabel}`}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-card bg-surface p-4 sm:inset-y-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">{vehicleLabel}</h2>
            <p className="mt-1 text-sm text-muted">
              {rental.customerName ?? "—"}
              {rental.customerPhone ? ` · ${rental.customerPhone}` : ""}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="Đóng">
            ✕
          </Button>
        </div>

        {/* Trạng thái hiện bằng CHỮ, không chỉ bằng màu — đây là chỗ duy nhất
            trong app đọc được trạng thái mà không cần hover. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-card px-2 py-1 text-xs ${rentalChipClass(rental, now)}`}>
            {STATUS_LABEL[rental.status]}
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
                        disabled={change.isPending}
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
                  disabled={change.isPending}
                  onClick={() => (destructive ? setConfirming(to) : change.mutate(to))}
                >
                  {change.isPending && !destructive ? "Đang lưu…" : TRANSITION_LABEL[to]}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
