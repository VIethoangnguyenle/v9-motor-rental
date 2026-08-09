import { api } from "./api";

/**
 * Trả [] khi API không tới được, KHÔNG ném lỗi.
 *
 * CI build apps/web mà không có Postgres. Ném lỗi ở đây biến "chưa có DB" thành
 * build đỏ ở mọi PR. Đổi lại: `dynamicParams = true` khiến trang xe vẫn render
 * được lúc chạy. Cùng đánh đổi đã ghi trong apps/web/AGENTS.md cho /health.
 */
export async function fetchVehicles() {
  const { data, error } = await api.vehicles.get();
  if (error) {
    console.warn(`[web] không lấy được danh sách xe: ${JSON.stringify(error.value)}`);
    return [];
  }
  return data;
}

export async function fetchVehicle(slug: string) {
  const { data, error } = await api.vehicles({ slug }).get();
  if (error) return null;
  return data;
}

export type VehicleSummary = Awaited<ReturnType<typeof fetchVehicles>>[number];
export type VehicleDetail = NonNullable<Awaited<ReturnType<typeof fetchVehicle>>>;
