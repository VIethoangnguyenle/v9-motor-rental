import { Elysia, t } from "elysia";
import { findPublishedVehicleBySlug, listPublishedVehicles } from "../services/vehicles";

const photoSchema = t.Object({
  fileId: t.String({ format: "uuid" }),
  alt: t.String(),
});

/**
 * `plate` KHÔNG có trong schema này, và đó chính là cơ chế chặn: Elysia cắt mọi
 * field không được khai. Cái bảo vệ là schema — không phải một câu SELECT viết
 * cẩn thận, vì câu SELECT đó sẽ thành SELECT * vào một ngày nào đó.
 */
const summarySchema = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String(),
  make: t.String(),
  model: t.String(),
  year: t.Nullable(t.Integer()),
  engineCc: t.Integer(),
  odoKm: t.Nullable(t.Integer()),
  color: t.Nullable(t.String()),
  pricePerDay: t.Integer(),
  deposit: t.Integer(),
  photo: t.Nullable(photoSchema),
});

const detailSchema = t.Composite([
  summarySchema,
  t.Object({
    description: t.Nullable(t.String()),
    photos: t.Array(photoSchema),
  }),
]);

/** `name` là bắt buộc — thiếu nó Elysia chạy lại plugin mỗi lần `.use()`. */
export const vehicles = new Elysia({ name: "vehicles" })
  .get("/vehicles", () => listPublishedVehicles(), {
    response: t.Array(summarySchema),
  })
  .get(
    "/vehicles/:slug",
    async ({ params, status }) => {
      const vehicle = await findPublishedVehicleBySlug(params.slug);
      if (!vehicle) return status(404, { message: "Không tìm thấy xe" });
      return status(200, vehicle);
    },
    {
      params: t.Object({ slug: t.String() }),
      response: {
        200: detailSchema,
        404: t.Object({ message: t.String() }),
      },
    },
  );
