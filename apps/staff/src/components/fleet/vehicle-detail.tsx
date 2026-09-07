import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatVnd } from "@v9/shared/domain/money";
import { errorMessage } from "../../lib/errors";
import {
  archiveVehicle,
  fleetDetailQuery,
  updateVehicle,
  vehicleRevenueQuery,
  WriteError,
  rulesOfError,
  type FleetVehicleDetail,
} from "../../lib/fleet-admin";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { VehicleForm, toBody, type VehicleFormValues } from "./vehicle-form";
import { VehiclePhotos } from "./vehicle-photos";

/** Giá trị số → chuỗi cho ô nhập; `null` thành rỗng, không thành "null". */
const s = (v: number | string | null): string => (v === null ? "" : String(v));

function toValues(v: FleetVehicleDetail): VehicleFormValues {
  return {
    slug: v.slug,
    make: v.make,
    model: v.model,
    engineCc: s(v.engineCc),
    pricePerDay: s(v.pricePerDay),
    deposit: s(v.deposit),
    status: v.status,
    plate: s(v.plate),
    year: s(v.year),
    odoKm: s(v.odoKm),
    color: s(v.color),
    description: s(v.description),
    sort: s(v.sort),
  };
}

/**
 * Doanh thu của một xe.
 *
 * ⚠️ Nhãn PHẢI nói phạm vi. `getVehicleRevenue` đếm đơn `COMPLETED`, còn màn
 * Thống kê đếm mọi đơn đã giao xe (`handed_over_at IS NOT NULL`, tức gồm cả
 * `ONGOING`). Cộng cột này của mọi xe sẽ luôn nhỏ hơn con số ở màn Thống kê, và
 * chủ shop cộng tay một lần là thấy. Con số "đang chạy" đứng ngay cạnh để chênh
 * lệch đó đọc được trên màn hình thay vì thành một câu hỏi không ai trả lời.
 * §3 `docs/plans/2026-09-07-staff-fleet-surface-design.md`.
 */
function Revenue({ vehicleId }: { readonly vehicleId: string }) {
  const query = useQuery(vehicleRevenueQuery);
  if (query.isPending) return <Skeleton className="h-16" />;
  if (!query.data?.ok) return null;

  const row = query.data.rows.find((r) => r.vehicleId === vehicleId);
  if (row === undefined) return null;

  return (
    <section className="flex flex-col gap-1 border-t border-border pt-4">
      <h3 className="m-0 text-sm font-semibold text-ink">Doanh thu — đơn đã hoàn tất</h3>
      <p className="m-0 text-lg font-semibold text-ink tabular-nums">{formatVnd(row.revenue)}</p>
      <p className="m-0 text-sm text-muted">
        {row.orders} đơn · {row.days} ngày đã cho thuê
      </p>
      {row.ongoingOrders > 0 && (
        <p className="m-0 text-sm text-muted">
          Đang chạy: {row.ongoingOrders} đơn · {formatVnd(row.ongoingRevenue)} (chưa tính vào số
          trên)
        </p>
      )}
    </section>
  );
}

export function VehicleDetail({
  vehicleId,
  onArchived,
}: {
  readonly vehicleId: string;
  /** Xe vừa rời khỏi danh sách — phía gọi đóng panel/sheet và bỏ `?id=`. */
  readonly onArchived: () => void;
}) {
  const qc = useQueryClient();
  const query = useQuery(fleetDetailQuery(vehicleId));
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async (values: VehicleFormValues) => {
      const vehicle = query.data?.ok === true ? query.data.vehicle : null;
      if (vehicle === null) throw new Error("Chưa tải được xe");

      const r = await updateVehicle(vehicleId, {
        ...toBody(values),
        // Truyền lại NGUYÊN VĂN mốc vừa nhận — đây là cơ chế phát hiện ghi đè.
        // Server so nó với `updated_at` hiện tại; lệch thì 409 `VEHICLE_STALE`.
        expectedUpdatedAt: vehicle.updatedAt,
      });
      if (!r.ok) throw new WriteError(errorMessage(r.value, "Không lưu được xe"), r.rules);
    },
    onSuccess: async () => {
      setSaved(true);
      // Cả danh sách LẪN chi tiết đều lệch sau khi lưu: `GET /fleet` mang tên,
      // giá và tình trạng suy ra; `GET /fleet/:id` mang mốc `updatedAt` mới —
      // mà thiếu mốc mới thì lần lưu KẾ TIẾP nhận 409 dù không ai đụng vào.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["fleet"] }),
        qc.invalidateQueries({ queryKey: ["fleet-detail", vehicleId] }),
      ]);
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      const r = await archiveVehicle(vehicleId);
      if (!r.ok) throw new Error(errorMessage(r.value, "Không lưu kho được xe"));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      onArchived();
    },
  });

  if (query.isPending) return <Skeleton className="h-64" />;
  if (!query.data?.ok) {
    return (
      <Alert tone="error" live="polite">
        {errorMessage(query.data?.value, "Không tải được xe")}
      </Alert>
    );
  }

  const vehicle = query.data.vehicle;
  const rules = rulesOfError(save.error);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-bold text-ink">
          {vehicle.make} {vehicle.model}
        </h2>
        <p className="m-0 text-sm text-muted tabular-nums">
          {vehicle.plate ?? "chưa có biển số"} · {vehicle.slug}
        </p>
      </header>

      {saved && !save.isPending && save.error === null && (
        <Alert tone="info" live="polite">
          Đã lưu.
        </Alert>
      )}

      {/*
        `key` gắn vào `updatedAt`: sau khi lưu thành công, `VehicleForm` phải dựng
        lại từ dữ liệu MỚI. Không có `key` thì `useState(initial)` trong form giữ
        nguyên giá trị cũ, và ô nhập sẽ không phản ánh thứ server vừa chuẩn hoá
        (`make`/`model` bị `trim`) — người dùng thấy chữ mình gõ, database giữ chữ
        khác, và không có gì nói ra điều đó.
      */}
      <VehicleForm
        key={String(vehicle.updatedAt)}
        initial={toValues(vehicle)}
        submitLabel="Lưu thay đổi"
        pending={save.isPending}
        error={save.error === null ? null : save.error.message}
        rules={rules}
        onSubmit={(values) => {
          setSaved(false);
          save.mutate(values);
        }}
      />

      <VehiclePhotos vehicle={vehicle} />

      <Revenue vehicleId={vehicleId} />

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="m-0 text-sm font-semibold text-ink">Lưu kho</h3>
        <p className="m-0 text-sm text-muted">
          Xe biến khỏi danh sách vận hành và khỏi trang khách. Đơn cũ và doanh thu của nó vẫn còn.
        </p>
        {archive.error && <Alert tone="error">{archive.error.message}</Alert>}
        {confirmArchive ? (
          <div className="flex gap-2">
            <Button
              type="button"
              pending={archive.isPending}
              onClick={() => {
                archive.mutate();
              }}
            >
              Lưu kho xe này
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirmArchive(false);
              }}
            >
              Thôi
            </Button>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirmArchive(true);
              }}
            >
              Lưu kho…
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
