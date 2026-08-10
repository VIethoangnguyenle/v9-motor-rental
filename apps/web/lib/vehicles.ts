import { api } from "./api";

type VehicleListResponse = NonNullable<Awaited<ReturnType<typeof api.vehicles.get>>["data"]>;

export type VehicleSummary = VehicleListResponse[number];

export interface VehicleListResult {
  readonly vehicles: VehicleSummary[];
  /**
   * `true` = **không gọi được API**. KHÁC hẳn `vehicles.length === 0`, nghĩa là
   * "shop chưa đăng xe nào". Gộp hai trạng thái này lại là cách trang tĩnh khẳng
   * định một điều sai về shop: build lúc API chết sẽ nướng thẳng câu "Chưa có xe
   * nào được đăng" vào HTML, và câu đó ở lại tới lần revalidate sau.
   */
  readonly failed: boolean;
}

/**
 * Eden gói lỗi mạng thành một `Error` đặt trong `error.value`, mà `JSON.stringify`
 * của một `Error` là `{}` — bản trước log đúng như thế, quan sát nguyên văn trong
 * output của `next build`:
 *
 *     [web] không lấy được danh sách xe: {}
 *
 * `status` là thứ nói được điều gì (Eden đặt **503** cho lỗi kết nối, đo thật), và
 * `cause` là chỗ Node cất `ECONNREFUSED` khi `fetch` hỏng ở tầng dưới.
 */
function describeEdenError(status: number, value: unknown): string {
  if (value instanceof Error) {
    // `cause` khai là `unknown`, nên CHỈ đọc khi nó thật sự là Error. `String(cause)`
    // trên một object thường cho ra "[object Object]" — đúng loại vô dụng mà hàm này
    // sinh ra để dẹp. ESLint (`no-base-to-string`) bắt được chỗ này, đã sửa theo nó.
    const cause = value.cause instanceof Error ? ` — ${value.cause.message}` : "";
    return `HTTP ${String(status)}: ${value.message}${cause}`;
  }
  return `HTTP ${String(status)}: ${JSON.stringify(value)}`;
}

/**
 * KHÔNG ném lỗi, kể cả khi API chết — trả `failed: true` để nơi gọi tự phân biệt.
 *
 * `next build` chạy trong CI, nơi không có Postgres và không có API. Ném lỗi ở đây
 * biến "chưa có DB" thành build đỏ ở mọi PR (§6.2 của
 * docs/plans/2026-08-10-fleet-catalogue-design.md). Nhưng trả `[]` trơn cũng sai:
 * trang sẽ nói "Chưa có xe nào được đăng", một câu sai về shop, và không ai phát
 * hiện vì nó trông y hệt trạng thái rỗng hợp lệ.
 *
 * ⚠️ Đánh đổi còn lại, đã biết: gọi lúc CHẠY mà API chết thì ISR cache nhánh
 * `failed` đè lên trang tốt cho tới hết cửa sổ revalidate. Chấp nhận được vì câu
 * hiển thị là câu trung tính "chưa tải được", không phải một lời khẳng định sai.
 * `fetchVehicle` bên dưới thì KHÔNG chấp nhận được, nên nó ném — xem comment ở đó.
 */
export async function fetchVehicles(): Promise<VehicleListResult> {
  const { data, error } = await api.vehicles.get();
  if (error) {
    console.warn(
      `[web] không lấy được danh sách xe: ${describeEdenError(error.status, error.value)}`,
    );
    return { vehicles: [], failed: true };
  }
  return { vehicles: data, failed: false };
}

/**
 * `null` CHỈ khi API nói 404 — tức xe không tồn tại, hoặc draft/archived (API cố ý
 * trả 404 giống hệt cho cả ba). Nơi gọi dịch `null` thành `notFound()`.
 */
export async function fetchVehicle(slug: string) {
  const { data, error } = await api.vehicles({ slug }).get();
  if (error) {
    if (error.status === 404) return null;
    // Mọi lỗi KHÁC 404 là sự cố hạ tầng, không phải "xe không tồn tại". Trả `null`
    // ở đây khiến Next cache một trang 404 ĐÈ LÊN trang thật đã prerender: đo được
    // trên `.next/server/app/xe/<slug>.meta` — `x-nextjs-prerender` biến mất,
    // `"status": 404`. Và cái 404 đó sống thêm hết cửa sổ revalidate SAU KHI API đã
    // hồi phục, phục vụ cho cả khách lẫn Googlebot. Ném lỗi thì ISR giữ nguyên bản
    // stale — đúng thứ ta muốn khi API chỉ chớp tắt.
    throw new Error(`API lỗi khi lấy xe ${slug}: ${describeEdenError(error.status, error.value)}`);
  }
  return data;
}

export type VehicleDetail = NonNullable<Awaited<ReturnType<typeof fetchVehicle>>>;
