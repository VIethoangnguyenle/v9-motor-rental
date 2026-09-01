import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  availableRequestTransitions,
  REQUEST_STATUSES,
  type RequestStatus,
} from "@v9/shared/domain/rental-request";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { errorMessage } from "../lib/errors";
import {
  changeRequestStatus,
  newRequestCountQuery,
  requestsQuery,
  type RentalRequestRow,
} from "../lib/requests";

/** Nhãn trạng thái. `Record` bắt đủ nhánh — cùng khuôn `STATUS_LABEL` của đơn thuê. */
const STATUS_LABEL: Record<RequestStatus, string> = {
  NEW: "Chưa xử lý",
  CONTACTED: "Đã liên hệ",
  CLOSED: "Đã đóng",
};

/** Nhãn HÀNH ĐỘNG đưa yêu cầu TỚI trạng thái đó — khác tên trạng thái ở trên. */
const ACTION_LABEL: Record<RequestStatus, string> = {
  NEW: "Đưa về chưa xử lý",
  CONTACTED: "Đã gọi cho khách",
  CLOSED: "Đóng yêu cầu",
};

const STATUS_CLASS: Record<RequestStatus, string> = {
  NEW: "bg-accent/15 text-accent",
  CONTACTED: "bg-warning/10 text-warning",
  CLOSED: "bg-status-completed/15 text-status-completed",
};

const SENT_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Ngày-theo-lịch, đọc UTC — chuẩn hoá về `YYYY-MM-DD` bất kể Eden trả kiểu gì.
 *
 * ⚠️ Bẫy đã ĐO, không suy: API khai `startDate` là `t.String()` và JSON thô trả
 * đúng `"2026-10-20"`, NHƯNG **Eden Treaty tự parse chuỗi trông giống ISO date
 * thành `Date` ở phía client**. Đo trong trình duyệt:
 *
 *     typeof row.startDate            → "object"
 *     row.startDate instanceof Date   → true
 *     String(row.startDate)           → "Tue Oct 20 2026 07:00:00 GMT+0700"
 *
 * Hai hệ quả. Thứ nhất, `startDate.split(...)` ném ở runtime dù `tsc` xanh —
 * kiểu suy từ schema nói `string`, thực tế là `Date`. Thứ hai, và âm thầm hơn:
 * Eden dựng `Date` đó ở **nửa đêm UTC**, nên máy ở múi giờ ÂM đọc ra ngày HÔM
 * TRƯỚC. Ở TP.HCM (UTC+7) không lộ; ở một máy đặt giờ châu Âu/Mỹ thì lịch hẹn
 * giao xe lệch một ngày, và không có gì báo lỗi.
 *
 * Nên đọc lại bằng `timeZone: "UTC"`, KHÔNG bằng `SHOP_TIMEZONE`: giá trị gốc là
 * một ngày trên lịch, Eden đã mã hoá nó thành mốc nửa đêm UTC, nên UTC là hệ toạ
 * độ duy nhất trả lại đúng ngày ban đầu, độc lập với đồng hồ của máy đang xem.
 */
const YMD_UTC_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toYmd(value: string | Date): string {
  return typeof value === "string" ? value : YMD_UTC_FMT.format(value);
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`. Đổi chuỗi, không đi vòng qua `Date` lần nữa. */
function toVnDate(value: string | Date): string {
  const [y, m, d] = toYmd(value).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function RequestCard({
  row,
  busy,
  onChange,
}: {
  readonly row: RentalRequestRow;
  readonly busy: boolean;
  readonly onChange: (id: string, to: RequestStatus) => void;
}) {
  const status = row.status;
  const next = availableRequestTransitions(status);

  return (
    <li className="rounded-card border border-border bg-surface card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-ink">
            {row.fullName}{" "}
            {/* Số điện thoại là HÀNH ĐỘNG, không phải chữ: shop chạy trên Zalo và
                điện thoại (PRODUCT.md), nên nhân viên phải gọi được bằng một chạm.
                Cùng cách làm với bảng khách hàng. */}
            <a href={`tel:${row.phone}`} className="font-normal text-accent underline">
              {row.phone}
            </a>
          </p>
          <p className="m-0 mt-1 text-sm text-muted">
            {row.vehicleMake} {row.vehicleModel} · {toVnDate(row.startDate)} · {row.days} ngày
          </p>
        </div>
        <span className={`rounded-card px-2 py-1 text-xs ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {row.deliveryAddress && (
        <p className="m-0 mt-2 text-sm text-ink">Giao tới: {row.deliveryAddress}</p>
      )}
      {row.note && <p className="m-0 mt-1 text-sm text-muted">{row.note}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Gửi lúc {SENT_FMT.format(row.createdAt)}</span>
        <Link
          to="/calendar"
          search={{ view: "timeline", from: toYmd(row.startDate) }}
          className="text-xs text-accent underline"
        >
          Xem lịch quanh ngày này →
        </Link>
      </div>

      {next.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {next.map((to) => (
            <Button
              key={to}
              type="button"
              variant={to === "CLOSED" ? "ghost" : "primary"}
              disabled={busy}
              onClick={() => onChange(row.id, to)}
            >
              {ACTION_LABEL[to]}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * Màn tiếp nhận yêu cầu từ `apps/web`.
 *
 * Trang này là nửa còn lại của luồng mà `PRODUCT.md` mô tả: "khách gửi được yêu
 * cầu ngoài giờ làm việc và **không bị bỏ sót**". Nếu chỉ có form bên web mà
 * không có màn này thì yêu cầu vẫn trôi — chỉ khác là trôi trong database thay
 * vì trôi trong hộp tin nhắn Zalo, và không ai nhìn thấy nó tệ hơn.
 */
export function RequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<RequestStatus | null>("NEW");
  const list = useQuery(requestsQuery(filter));

  const change = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: RequestStatus }) => {
      const r = await changeRequestStatus(id, to);
      if (!r.ok) throw new Error(errorMessage(r.value, "Không đổi được trạng thái yêu cầu"));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requests"] });
      void qc.invalidateQueries({ queryKey: newRequestCountQuery.queryKey });
    },
  });

  return (
    // `<div>`, không `<main>`: `AppShell` đã bọc `children` trong CHÍNH MỘT
    // `<main>`. Hai landmark cho cùng nội dung là lỗi mà `staff-list-page` và
    // `health-page` đang mắc; trang mới không lặp lại.
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">Yêu cầu thuê</h1>

      <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
        {[null, ...REQUEST_STATUSES].map((s) => (
          <button
            key={s ?? "all"}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={`min-h-11 rounded-card px-3 text-sm font-medium ${
              filter === s ? "bg-accent text-accent-ink" : "border border-border text-ink"
            }`}
          >
            {s === null ? "Tất cả" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {change.error && <Alert tone="error">{change.error.message}</Alert>}

      {list.isPending && <p className="text-sm text-muted">Đang tải…</p>}

      {list.data && !list.data.ok && (
        <Alert tone="error" live="polite">
          {errorMessage(list.data.value, "Không tải được danh sách yêu cầu. Thử tải lại trang.")}
        </Alert>
      )}

      {list.data?.ok && list.data.requests.length === 0 && (
        // Nói rõ ĐANG LỌC GÌ. Một câu "chưa có yêu cầu nào" trong khi bộ lọc đang
        // ở "Đã đóng" là một câu sai về shop — cùng lớp lỗi `failed` vs `empty`
        // mà `apps/web` đã tách ra ở `lib/vehicles.ts`.
        <p className="text-sm text-muted">
          {filter === null
            ? "Chưa có yêu cầu nào từ web."
            : `Không có yêu cầu nào ở trạng thái "${STATUS_LABEL[filter]}".`}
        </p>
      )}

      {list.data?.ok && list.data.requests.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {list.data.requests.map((row) => (
            <RequestCard
              key={row.id}
              row={row}
              busy={change.isPending}
              onChange={(id, to) => change.mutate({ id, to })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
