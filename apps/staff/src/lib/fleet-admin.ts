import type { ApiErrorCode } from "@v9/api";
import type { VehicleRule } from "@v9/shared/domain/vehicle";
import { api } from "./api";
import { errorCode } from "./errors";

/**
 * Đường ĐỌC/GHI của màn Đội xe.
 *
 * Tách khỏi `lib/rentals.ts` (nơi có `fleetQuery` cho form lên đơn) vì hai bên
 * tiêu thụ hai thứ khác nhau: form lên đơn chỉ cần danh sách để tra giá, còn màn
 * này cần chi tiết, ảnh, doanh thu và bốn đường ghi. Gộp lại là bắt mọi chỗ import
 * `fleetQuery` kéo theo cả tầng ghi.
 *
 * Mọi kiểu SUY RA từ `response` schema của API — không gõ tay `interface`, không
 * dùng `as`. Lý lẽ đầy đủ ở `lib/me.ts`.
 */

type FleetByIdRoutes = ReturnType<typeof api.fleet>;

export type FleetVehicleDetail = NonNullable<Awaited<ReturnType<FleetByIdRoutes["get"]>>["data"]>;
export type VehicleRevenue = NonNullable<
  Awaited<ReturnType<typeof api.stats.vehicles.get>>["data"]
>[number];

/** Thân của `POST /fleet` — suy từ chính hợp đồng route, kể cả khi nó đổi. */
export type VehicleBody = Parameters<typeof api.fleet.post>[0];

export type DetailResult =
  | { ok: true; vehicle: FleetVehicleDetail }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

export type RevenueResult =
  { ok: true; rows: VehicleRevenue[] } | { ok: false; code: ApiErrorCode | null; value: unknown };

/**
 * Nhánh lỗi giữ CẢ `code`, `value` gốc LẪN `rules`.
 *
 * `rules` là thứ làm form đánh dấu được đúng ô nhập thay vì hiện một câu chung ở
 * đầu trang — nó chỉ có mặt ở 422 `VEHICLE_INVALID`/`PHOTO_ALT_INVALID`. Giữ nó
 * ở đây thay vì bắt mỗi chỗ gọi tự moi ra khỏi `value`: moi được thì moi sai
 * được, và sai theo chiều im lặng (mảng rỗng, không ô nào được đánh dấu).
 */
export type WriteResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: ApiErrorCode | null;
      value: unknown;
      rules: readonly string[];
    };

/** `rules` chỉ có ở 422; mọi lỗi khác cho mảng rỗng. */
function rulesOf(value: unknown): readonly string[] {
  if (typeof value !== "object" || value === null) return [];
  if (!("rules" in value)) return [];
  const raw: unknown = value.rules;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === "string");
}

function fail<T>(error: { value: unknown }): WriteResult<T> {
  return {
    ok: false,
    code: errorCode(error.value),
    value: error.value,
    rules: rulesOf(error.value),
  };
}

export const fleetDetailQuery = (id: string) => ({
  queryKey: ["fleet-detail", id] as const,
  queryFn: async (): Promise<DetailResult> => {
    const res = await api.fleet({ id }).get();
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, vehicle: res.data };
  },
});

/**
 * Doanh thu theo xe. Query RIÊNG với `fleetQuery`, không gộp: hai bên đổi theo
 * hai nhịp khác nhau — danh sách đổi khi chủ shop sửa xe, số liệu đổi mỗi lần một
 * đơn hoàn tất — nên gộp là bắt cả hai chịu nhịp làm mới của bên nhanh hơn.
 */
export const vehicleRevenueQuery = {
  queryKey: ["stats-vehicles"] as const,
  queryFn: async (): Promise<RevenueResult> => {
    const res = await api.stats.vehicles.get();
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, rows: res.data };
  },
};

export async function createVehicle(body: VehicleBody): Promise<WriteResult<FleetVehicleDetail>> {
  const res = await api.fleet.post(body);
  if (res.error) return fail(res.error);
  return { ok: true, value: res.data };
}

/**
 * `expectedUpdatedAt` khai bằng CHÍNH kiểu mà `GET /fleet/:id` trả về, không phải
 * `string` cũng không phải `Date` gõ tay.
 *
 * Eden suy kiểu từ `t.Date()` của response nên nó nói `Date`, trong khi thứ đi
 * qua JSON lúc chạy là một chuỗi ISO. Khai `string` thì TS đỏ; khai `Date` rồi
 * `as` là nói dối về thứ đang cầm. Lấy đúng `FleetVehicleDetail["updatedAt"]`
 * giữ được cả hai: chỗ gọi truyền lại NGUYÊN VĂN giá trị vừa nhận, và không ai
 * phải biết nó là chuỗi hay đối tượng.
 */
export async function updateVehicle(
  id: string,
  body: VehicleBody & { expectedUpdatedAt: FleetVehicleDetail["updatedAt"] },
): Promise<WriteResult<FleetVehicleDetail>> {
  const res = await api.fleet({ id }).post(body);
  if (res.error) return fail(res.error);
  return { ok: true, value: res.data };
}

export async function archiveVehicle(id: string): Promise<WriteResult<null>> {
  const res = await api.fleet({ id }).archive.post();
  if (res.error) return fail(res.error);
  return { ok: true, value: null };
}

export async function uploadVehiclePhoto(
  id: string,
  alt: string,
  file: File,
): Promise<WriteResult<null>> {
  const res = await api.fleet({ id }).photos.post({ alt, file });
  if (res.error) return fail(res.error);
  return { ok: true, value: null };
}

export async function deleteVehiclePhoto(id: string, photoId: string): Promise<WriteResult<null>> {
  const res = await api.fleet({ id }).photos({ photoId }).delete();
  if (res.error) return fail(res.error);
  return { ok: true, value: null };
}

export async function updateVehiclePhoto(
  id: string,
  photoId: string,
  body: { alt: string; sort: number },
): Promise<WriteResult<null>> {
  const res = await api.fleet({ id }).photos({ photoId }).post(body);
  if (res.error) return fail(res.error);
  return { ok: true, value: null };
}

/**
 * Ô nhập nào bị đánh dấu, cho một mã luật của domain.
 *
 * `Record<string, …>` chứ không `Record<VehicleRule, …>`: khoá tra cứu tới từ
 * MẠNG dưới dạng `string`, nên khai hẹp hơn chỉ đẩy một phép `as` sang chỗ gọi.
 * `satisfies` vẫn giữ được phần quan trọng — mọi khoá viết ở đây phải là một
 * `VehicleRule` có thật, nên gõ sai tên luật là lỗi biên dịch.
 */
export const RULE_FIELD: Record<string, string | undefined> = {
  SLUG_FORMAT: "slug",
  MAKE_REQUIRED: "make",
  MODEL_REQUIRED: "model",
  ENGINE_CC_POSITIVE: "engineCc",
  PRICE_NON_NEGATIVE: "pricePerDay",
  DEPOSIT_NON_NEGATIVE: "deposit",
  STATUS_INVALID: "status",
} satisfies Partial<Record<VehicleRule, string>>;

/**
 * Lỗi của một lần GHI, mang theo mã luật bị vi phạm.
 *
 * Một lớp thật chứ không phải `new Error(...) as Error & { rules }`: repo cấm
 * `as` ở frontend vì nó là chỗ người viết khẳng định một hình dạng thay vì kiểm
 * nó. Ở đây hình dạng do CHÍNH ta dựng, nên khai nó ra là đủ — và `instanceof`
 * cho phía đọc một phép kiểm thật thay vì một lời hứa.
 */
export class WriteError extends Error {
  readonly rules: readonly string[];

  constructor(message: string, rules: readonly string[]) {
    super(message);
    this.name = "WriteError";
    this.rules = rules;
  }
}

/** Mã luật kèm theo một lỗi ghi; mảng rỗng cho mọi loại lỗi khác. */
export function rulesOfError(error: Error | null): readonly string[] {
  return error instanceof WriteError ? error.rules : [];
}
