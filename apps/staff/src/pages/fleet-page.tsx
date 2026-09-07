import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FleetGroups } from "../components/fleet/fleet-groups";
import { FleetTable } from "../components/fleet/fleet-table";
import { VehicleDetail } from "../components/fleet/vehicle-detail";
import { EMPTY_VALUES, VehicleForm, toBody } from "../components/fleet/vehicle-form";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import { Skeleton } from "../components/ui/skeleton";
import { TextField } from "../components/ui/text-field";
import { ToggleGroup } from "../components/ui/toggle-group";
import { errorMessage } from "../lib/errors";
import { createVehicle, rulesOfError, vehicleRevenueQuery, WriteError } from "../lib/fleet-admin";
import { FLEET_GROUPS, GROUP_LABEL, fleetGroupOf } from "../lib/fleet-group";
import { fleetQuery, type FleetVehicle } from "../lib/rentals";
import { useLayoutVariant } from "../hooks/use-layout-variant";

/**
 * Màn Đội xe — chỉ OWNER.
 *
 * BA hình dạng, không phải một bảng thu nhỏ hai lần. Lý lẽ đầy đủ ở §4
 * `docs/plans/2026-09-07-staff-fleet-surface-design.md`; tóm tắt:
 *
 *   <768   danh sách chia nhóm theo tình trạng · chi tiết mở TOÀN MÀN
 *   768–1023 bảng đầy đủ · chi tiết mở PHỦ LÊN (sheet)
 *   ≥1024  bảng đầy đủ · chi tiết ở PANEL CỐ ĐỊNH bên phải
 *
 * Vì sao tablet không dùng bố cục hai cột: sidebar của `AppShell` chiếm 168px,
 * nên ở 768px vùng nội dung còn 600px — hẹp hơn cả `min-w-[760px]` mà bảng này
 * cần. Bố cục hai cột ở đó hỏng trước khi được dựng.
 *
 * `?q=`, `?group=`, `?id=` sống ở URL: F5 không mất chỗ đứng, Back trả về đúng
 * bộ lọc vừa xem, và gửi được link "xem giúp con CB500X". Cùng lý lẽ bốn màn kia.
 */
export function FleetPage() {
  const variant = useLayoutVariant();
  // `strict: false` chứ không `fleetRoute.useSearch()` — import route vào page
  // dựng ra chu trình module. Cùng idiom `customers-list-page.tsx`.
  const search = useSearch({ strict: false });
  const navigate = useNavigate({ from: "/fleet" });
  const qc = useQueryClient();

  // Dot access, không type-guard: `validateFleetSearch` ở route đã lọc rồi.
  const q = search.q ?? "";
  const group = search.group ?? null;
  const openId = search.id ?? null;

  const [creating, setCreating] = useState(false);

  const list = useQuery(fleetQuery);
  const revenue = useQuery(vehicleRevenueQuery);

  const create = useMutation({
    mutationFn: async (values: Parameters<typeof toBody>[0]) => {
      const r = await createVehicle(toBody(values));
      if (!r.ok) throw new WriteError(errorMessage(r.value, "Không tạo được xe"), r.rules);
      return r.value.id;
    },
    onSuccess: async (id) => {
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ["fleet"] });
      // Mở luôn xe vừa tạo: việc kế tiếp gần như luôn là thêm ảnh cho nó.
      await navigate({ search: (s) => ({ ...s, id }) });
    },
  });

  const open = (id: string) => void navigate({ search: (s) => ({ ...s, id }) });
  const close = () => void navigate({ search: (s) => ({ ...s, id: null }) });

  const vehicles: readonly FleetVehicle[] = list.data?.ok === true ? list.data.vehicles : [];
  const revenueRows = revenue.data?.ok === true ? revenue.data.rows : [];

  const needle = q.trim().toLowerCase();
  const filtered = vehicles.filter((v) => {
    const matchesText =
      needle === "" ||
      `${v.make} ${v.model} ${v.slug} ${v.plate ?? ""}`.toLowerCase().includes(needle);
    if (!matchesText) return false;
    if (group === null) return true;
    return (
      fleetGroupOf({
        status: v.status,
        onRentUntil: v.onRentUntil === null ? null : new Date(v.onRentUntil),
        nextFrom: v.nextFrom === null ? null : new Date(v.nextFrom),
      }) === group
    );
  });

  const createRules = rulesOfError(create.error);

  const listShape =
    variant === "mobile" ? (
      <FleetGroups rows={filtered} onOpen={open} />
    ) : (
      <FleetTable
        rows={filtered}
        revenue={revenueRows}
        selectedId={openId}
        // Chỉ desktop mới có panel cạnh bảng; ở tablet chi tiết mở PHỦ LÊN nên
        // bảng bên dưới vẫn còn nguyên chỗ cho bảy cột.
        compact={variant === "desktop" && openId !== null}
        onOpen={open}
      />
    );

  const detail =
    openId === null ? null : (
      <VehicleDetail
        vehicleId={openId}
        onArchived={() => {
          close();
        }}
      />
    );

  // `<div>`, không `<main>` — `AppShell` đã có một `<main>` bọc ngoài.
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-xl font-bold text-ink">Đội xe</h1>
        <Button
          type="button"
          onClick={() => {
            setCreating(true);
          }}
        >
          Thêm xe
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="max-w-sm flex-1">
          <TextField
            label="Tìm xe (tên, mã xe hoặc biển số)"
            value={q}
            onChange={(e) => {
              // KHÔNG debounce: lọc chạy trên mảng đã có trong bộ nhớ, không bắn
              // request nào. Debounce ở đây chỉ làm ô gõ trễ mà không tiết kiệm gì.
              // `replace: true` để một phiên gõ không đẻ ra chuỗi history entry.
              void navigate({ search: (s) => ({ ...s, q: e.target.value }), replace: true });
            }}
          />
        </div>
        <ToggleGroup
          label="Lọc theo tình trạng"
          value={group ?? "ALL"}
          options={[
            { value: "ALL", label: "Tất cả" },
            ...FLEET_GROUPS.filter((g) => g !== "ARCHIVED").map((g) => ({
              value: g,
              label: GROUP_LABEL[g],
            })),
          ]}
          onChange={(next) => {
            void navigate({ search: (s) => ({ ...s, group: next === "ALL" ? null : next }) });
          }}
        />
      </div>

      {list.isPending && <Skeleton className="h-40" />}
      {list.data?.ok === false && (
        <Alert tone="error" live="polite">
          {errorMessage(list.data.value, "Không tải được đội xe")}
        </Alert>
      )}

      {list.data?.ok === true &&
        (vehicles.length === 0 ? (
          // Rỗng LẦN ĐẦU khác rỗng vì bộ lọc — hai câu khác nhau, và chỉ câu đầu
          // có lối đi tiếp.
          <p className="m-0 text-sm text-muted">
            Chưa có xe nào trong hệ thống. Bấm “Thêm xe” để nhập chiếc đầu tiên.
          </p>
        ) : filtered.length === 0 ? (
          <p className="m-0 text-sm text-muted">Không có xe nào khớp bộ lọc đang chọn.</p>
        ) : variant === "desktop" ? (
          // Bố cục hai cột CHỈ ở ≥1024. `items-start` để panel không bị kéo cao
          // bằng bảng khi bảng dài.
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">{listShape}</div>
            {detail !== null && (
              <aside className="w-[420px] shrink-0 rounded-card border border-border p-4">
                <div className="mb-2 flex justify-end">
                  <Button type="button" variant="ghost" onClick={close}>
                    Đóng
                  </Button>
                </div>
                {detail}
              </aside>
            )}
          </div>
        ) : (
          listShape
        ))}

      {/*
        Tablet và mobile dùng CÙNG `Modal`, khác `placement`: `adaptive` cho
        tablet (panel giữa màn ≥640) và `bottom` cho điện thoại (trượt từ đáy,
        `pb-safe`). Không dựng component sheet thứ hai — `ui/modal.tsx` đã lo
        `showModal()`, bẫy Tab, `inert` và trả tiêu điểm.
      */}
      {variant !== "desktop" && openId !== null && (
        <Modal
          label="Chi tiết xe"
          placement={variant === "mobile" ? "bottom" : "adaptive"}
          onClose={close}
        >
          {(closeModal) => (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex justify-end">
                <Button type="button" variant="ghost" onClick={closeModal}>
                  Đóng
                </Button>
              </div>
              {detail}
            </div>
          )}
        </Modal>
      )}

      {creating && (
        <Modal
          label="Thêm xe"
          placement="adaptive"
          onClose={() => {
            setCreating(false);
          }}
        >
          {(closeModal) => (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-lg font-bold text-ink">Thêm xe</h2>
                <Button type="button" variant="ghost" onClick={closeModal}>
                  Đóng
                </Button>
              </div>
              <VehicleForm
                initial={EMPTY_VALUES}
                submitLabel="Tạo xe"
                pending={create.isPending}
                error={create.error === null ? null : create.error.message}
                rules={createRules}
                onSubmit={(values) => {
                  create.mutate(values);
                }}
              />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
