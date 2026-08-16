import { Elysia, t } from "elysia";
import { listFleet } from "../services/fleet";

/**
 * `name` là BẮT BUỘC — thiếu nó Elysia chạy lại plugin mỗi lần `.use()`.
 *
 * Route này KHÔNG khai trong `PUBLIC_ROUTES` của staff-guard, nên nó được bảo vệ
 * theo mặc định. Đó là chủ ý: biển số là dữ liệu nội bộ, và `/vehicles` công khai
 * cố ý không có trường đó.
 */
export const fleet = new Elysia({ name: "fleet" }).get("/fleet", () => listFleet(), {
  response: t.Array(
    t.Object({
      id: t.String({ format: "uuid" }),
      slug: t.String(),
      make: t.String(),
      model: t.String(),
      plate: t.Nullable(t.String()),
      status: t.String(),
      pricePerDay: t.Integer(),
      deposit: t.Integer(),
    }),
  ),
});
