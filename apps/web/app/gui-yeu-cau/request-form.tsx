"use client";

import { useActionState } from "react";
import Link from "next/link";
import messages from "@/messages/vi.json";
import type { VehicleSummary } from "@/lib/vehicles";
import { submitRequest } from "./actions";
import { EMPTY_STATE, type RequestFormState } from "./form-state";

/**
 * ⚠️ File `"use client"` ĐẦU TIÊN của `apps/web`, và điều đó có hệ quả đã được
 * dựa vào ở nơi khác: comment CORS trong `apps/api/src/index.ts` từng lập luận
 * rằng siết `origin` an toàn VÌ app này không có file client nào.
 *
 * Lập luận đó vẫn đúng, nhưng lý do đã đổi và comment bên kia đã được cập nhật
 * theo: component này KHÔNG gọi API. Nó gọi `submitRequest`, một Server Action —
 * request bay từ trình duyệt về **server Next**, rồi server Next mới nói chuyện
 * với `apps/api`. Không có request nào từ origin công khai chạm vào API, nên
 * CORS không phải nới.
 *
 * Đừng "đơn giản hoá" thành `fetch` thẳng sang `NEXT_PUBLIC_API_URL` ở đây: nó
 * chạy được trên máy bạn (dev không siết origin theo cùng cách), rồi 403 trên
 * production, và triệu chứng là "form im lặng không gửi được".
 */
export function RequestForm({
  vehicles,
  selectedSlug,
}: {
  readonly vehicles: readonly VehicleSummary[];
  readonly selectedSlug: string | null;
}) {
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(
    submitRequest,
    EMPTY_STATE,
  );

  const v = state.values;

  if (state.status === "ok") {
    return (
      <div className="border border-hairline p-6">
        {/* `role="status"` để trình đọc màn hình đọc câu xác nhận — form vừa biến
            mất khỏi DOM, nên không còn gì khác báo cho họ biết chuyện gì xảy ra. */}
        <p role="status" className="m-0 text-body-strong">
          {state.message}
        </p>
        <Link href="/xe" className="label-upper mt-6 inline-block text-ink hover:underline">
          {messages.vehicles.all}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.status === "error" && (
        <p role="alert" className="border border-hairline p-4 text-body-strong">
          {state.message}
        </p>
      )}

      <label className="flex flex-col gap-2">
        <span className="label-upper text-ink">{messages.request.vehicle}</span>
        <select
          name="vehicleSlug"
          required
          defaultValue={v.vehicleSlug ?? selectedSlug ?? ""}
          className="text-input"
        >
          <option value="" disabled>
            {messages.request.vehiclePlaceholder}
          </option>
          {vehicles.map((veh) => (
            <option key={veh.slug} value={veh.slug}>
              {veh.make} {veh.model}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="label-upper text-ink">{messages.request.fullName}</span>
        <input
          name="fullName"
          required
          maxLength={200}
          autoComplete="name"
          defaultValue={v.fullName ?? ""}
          className="text-input"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="label-upper text-ink">{messages.request.phone}</span>
        <input
          name="phone"
          type="tel"
          required
          maxLength={40}
          autoComplete="tel"
          inputMode="tel"
          defaultValue={v.phone ?? ""}
          className="text-input"
        />
        <span className="caption-text text-body">{messages.request.phoneHint}</span>
      </label>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="label-upper text-ink">{messages.request.startDate}</span>
          <input
            name="startDate"
            type="date"
            required
            defaultValue={v.startDate ?? ""}
            className="text-input"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="label-upper text-ink">{messages.request.days}</span>
          <input
            name="days"
            type="number"
            required
            min={1}
            max={92}
            step={1}
            inputMode="numeric"
            defaultValue={v.days ?? "1"}
            className="text-input"
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="label-upper text-ink">
          {messages.request.deliveryAddress}{" "}
          <span className="text-muted">({messages.request.optional})</span>
        </span>
        <input
          name="deliveryAddress"
          maxLength={500}
          autoComplete="street-address"
          defaultValue={v.deliveryAddress ?? ""}
          className="text-input"
        />
        <span className="caption-text text-body">{messages.request.deliveryHint}</span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="label-upper text-ink">
          {messages.request.note} <span className="text-muted">({messages.request.optional})</span>
        </span>
        <textarea
          name="note"
          rows={3}
          maxLength={2000}
          placeholder={messages.request.notePlaceholder}
          defaultValue={v.note ?? ""}
          className="text-input"
        />
      </label>

      {/* Câu nhắc "gửi yêu cầu chưa phải là đặt xe" đứng NGAY TRÊN nút, không ở
          chân trang: DESIGN.md §7 — lời phủ nhận phải đi cùng lời mời, nếu không
          nó không được đọc. */}
      <p className="m-0 text-body">{messages.booking.note}</p>

      <button
        type="submit"
        disabled={pending}
        className="btn-shape border-ink bg-ink text-canvas transition-colors hover:bg-transparent hover:text-ink disabled:opacity-60"
      >
        {pending ? messages.request.submitting : messages.booking.cta}
      </button>
    </form>
  );
}
