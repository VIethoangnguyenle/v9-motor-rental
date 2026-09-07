import { Elysia, t, type Static } from "elysia";
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from "@v9/shared/domain/rental-photo";
import { VEHICLE_MESSAGES, type VehicleStatus } from "@v9/shared/domain/vehicle";
import { requireRole, staffGuard } from "../plugins/staff-guard";
import {
  archiveVehicle,
  createVehicle,
  findFleetVehicle,
  listFleet,
  updateVehicle,
  type ArchiveResult,
  type VehicleWriteResult,
} from "../services/fleet";
import {
  addVehiclePhoto,
  deleteVehiclePhoto,
  updateVehiclePhoto,
  type AddVehiclePhotoResult,
  type DeleteVehiclePhotoResult,
  type UpdateVehiclePhotoResult,
} from "../services/vehicle-photos";

/**
 * Suy TỪ `reason` của service, không phải gõ tay — thêm một `reason` mới mà quên
 * dịch là lỗi biên dịch ở `satisfies` bên dưới. Lý lẽ đầy đủ ở `routes/rentals.ts`.
 */
export type FleetErrorCode =
  | Extract<VehicleWriteResult, { ok: false }>["reason"]
  | Extract<ArchiveResult, { ok: false }>["reason"]
  | Extract<AddVehiclePhotoResult, { ok: false }>["reason"]
  | Extract<DeleteVehiclePhotoResult, { ok: false }>["reason"]
  | Extract<UpdateVehiclePhotoResult, { ok: false }>["reason"];

const MESSAGES = {
  VEHICLE_INVALID: "Thông tin xe chưa hợp lệ",
  SLUG_TAKEN: "Mã xe này đã có xe khác dùng",
  VEHICLE_NOT_FOUND: "Không tìm thấy xe",
  VEHICLE_STALE: "Xe này vừa được sửa ở nơi khác — tải lại rồi thử lại",
  VEHICLE_HAS_ACTIVE_RENTAL: "Xe đang có đơn hiệu lực — không lưu kho được",
  PHOTO_NOT_FOUND: "Không tìm thấy ảnh",
  PHOTO_TYPE_INVALID: "Chỉ nhận ảnh JPEG, PNG hoặc WebP",
  // Nói ĐƠN VỊ người dùng đọc được, và suy từ chính hằng của domain — sửa trần ở
  // `@v9/shared/domain/rental-photo` mà quên sửa câu này thì câu này nói dối.
  PHOTO_SIZE_INVALID: `Ảnh phải nhỏ hơn ${String(Math.floor(MAX_PHOTO_BYTES / 1024 / 1024))} MB`,
  PHOTO_ALT_INVALID: "Mô tả ảnh chưa hợp lệ",
  DIRECTUS_FAILED: "Không lưu được ảnh vào kho ảnh — thử lại, hoặc báo người quản trị",
} as const satisfies Record<FleetErrorCode, string>;

const toError = (code: FleetErrorCode) => ({ code, message: MESSAGES[code] });

const errorSchema = t.Object({ message: t.String(), code: t.String() });

/**
 * `VEHICLE_INVALID` mang thêm `rules` — mã của TỪNG luật bị vi phạm, để form đánh
 * dấu đúng ô nhập thay vì hiện một câu chung ở đầu trang. `message` gộp các câu
 * của `VEHICLE_MESSAGES` cho nơi gọi nào chỉ muốn một dòng.
 */
const invalidSchema = t.Composite([errorSchema, t.Object({ rules: t.Array(t.String()) })]);

/**
 * Union literal thay vì `t.String()`: thân request sai status bị chặn ở tầng
 * schema với 422, trước khi chạm service. Cùng khuôn `roleSchema` ở
 * `routes/staff.ts` và `statusSchema` ở `routes/rentals.ts`.
 *
 * Hai `extends` bên dưới ép hai tập KHỚP NHAU theo cả hai chiều: thêm một trạng
 * thái vào `VEHICLE_STATUSES` mà quên ở đây — hoặc ngược lại — là lỗi biên dịch
 * tại chỗ, không phải một trạng thái lặng lẽ không đi qua được API.
 */
const statusSchema = t.Union([t.Literal("draft"), t.Literal("published"), t.Literal("archived")]);
type StatusSchemaValue = Static<typeof statusSchema>;
type StatusSetsMatch = [VehicleStatus] extends [StatusSchemaValue]
  ? [StatusSchemaValue] extends [VehicleStatus]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tồn tại CHỈ để ép kiểm hai chiều ở trên; không đọc lúc chạy.
const _statusSchemaMatchesDomain: StatusSetsMatch = true;

const summarySchema = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String(),
  make: t.String(),
  model: t.String(),
  plate: t.Nullable(t.String()),
  status: t.String(),
  pricePerDay: t.Integer(),
  deposit: t.Integer(),
  year: t.Nullable(t.Integer()),
  engineCc: t.Integer(),
  odoKm: t.Nullable(t.Integer()),
  color: t.Nullable(t.String()),
  photoCount: t.Integer(),
  /** Suy ra từ `rentals`, KHÔNG phải một cột — xem `services/fleet.ts`. */
  onRentUntil: t.Nullable(t.Date()),
  nextFrom: t.Nullable(t.Date()),
});

const detailSchema = t.Composite([
  summarySchema,
  t.Object({
    description: t.Nullable(t.String()),
    sort: t.Nullable(t.Integer()),
    updatedAt: t.Date(),
    photos: t.Array(
      t.Object({
        id: t.String({ format: "uuid" }),
        fileId: t.String({ format: "uuid" }),
        alt: t.String(),
      }),
    ),
  }),
]);

/**
 * `t.String()` trần cho `slug`/`make`/`model`, KHÔNG `minLength`: luật hợp lệ
 * sống ở `@v9/shared/domain/vehicle` và trả về mã luật để form đánh dấu đúng ô.
 * Nhân bản một nửa luật vào đây tạo bản thứ hai lệch được — và bản ở đây nói
 * bằng 422 không có `rules`, tức nói kém hơn.
 */
const bodySchema = t.Object({
  slug: t.String(),
  make: t.String(),
  model: t.String(),
  engineCc: t.Integer(),
  pricePerDay: t.Integer(),
  deposit: t.Integer(),
  status: statusSchema,
  plate: t.Nullable(t.String()),
  year: t.Nullable(t.Integer()),
  odoKm: t.Nullable(t.Integer()),
  color: t.Nullable(t.String()),
  description: t.Nullable(t.String()),
  sort: t.Nullable(t.Integer()),
});

const idParams = t.Object({ id: t.String({ format: "uuid" }) });
const photoParams = t.Object({
  id: t.String({ format: "uuid" }),
  photoId: t.String({ format: "uuid" }),
});

const okSchema = t.Object({ ok: t.Boolean() });

const photoSchema = t.Object({
  id: t.String({ format: "uuid" }),
  fileId: t.String({ format: "uuid" }),
  alt: t.String(),
  sort: t.Integer(),
});

function writeFailure(r: Extract<VehicleWriteResult, { ok: false }>) {
  if (r.reason === "VEHICLE_INVALID") {
    return {
      code: 422 as const,
      body: {
        ...toError(r.reason),
        // Câu chi tiết lấy từ ĐÚNG bảng mà form staff dùng, nên hai bên không thể
        // nói hai điều khác nhau về cùng một luật.
        message: r.rules.map((rule) => VEHICLE_MESSAGES[rule]).join(" · "),
        rules: [...r.rules],
      },
    };
  }
  if (r.reason === "VEHICLE_NOT_FOUND") return { code: 404 as const, body: toError(r.reason) };
  // `SLUG_TAKEN` và `VEHICLE_STALE` đều là 409 — xung đột với trạng thái hiện có
  // của dữ liệu, không phải thân request sai. Hai `code` khác nhau để frontend
  // phân biệt: một cái bảo đổi mã xe, một cái bảo tải lại.
  return { code: 409 as const, body: toError(r.reason) };
}

/**
 * `name` là BẮT BUỘC — thiếu nó Elysia chạy lại plugin mỗi lần `.use()`.
 *
 * Không route nào ở đây khai trong `PUBLIC_ROUTES` của staff-guard, nên tất cả
 * được bảo vệ theo mặc định. Đó là chủ ý: biển số là dữ liệu nội bộ, và
 * `/vehicles` công khai cố ý không có trường đó.
 *
 * ĐỌC mở cho mọi nhân viên ACTIVE — `rental-form.tsx` tra giá qua `GET /fleet`.
 * GHI chỉ OWNER. Hàng rào là `requireRole` ở server; điều kiện `ownerOnly` trên
 * thanh điều hướng của `apps/staff` là hàng rào của TRẢI NGHIỆM, không thay được
 * cái này.
 */
export const fleet = new Elysia({ name: "fleet" })
  .use(staffGuard)

  .get("/fleet", () => listFleet(new Date()), { response: t.Array(summarySchema) })

  .get(
    "/fleet/:id",
    async ({ params, status }) => {
      const vehicle = await findFleetVehicle(params.id, new Date());
      if (!vehicle) return status(404, toError("VEHICLE_NOT_FOUND"));
      return status(200, vehicle);
    },
    { params: idParams, response: { 200: detailSchema, 404: errorSchema } },
  )

  .post(
    "/fleet",
    async ({ body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);

      const r = await createVehicle(body, new Date());
      if (r.ok) return status(201, r.vehicle);

      const f = writeFailure(r);
      if (f.code === 422) return status(422, f.body);
      if (f.code === 404) return status(404, f.body);
      return status(409, f.body);
    },
    {
      body: bodySchema,
      response: {
        201: detailSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        422: invalidSchema,
      },
    },
  )

  /**
   * `POST`, không `PATCH` — không route nào trong repo dùng `PATCH`, và
   * `POST /staff/users/:id/*` là khuôn sửa tài nguyên đã có. Mở một verb mới cho
   * một route duy nhất là tiền lệ không có lý do.
   *
   * `expectedUpdatedAt` là BẮT BUỘC, không tuỳ chọn: cho phép bỏ qua nó là để lại
   * một đường ghi đè không kiểm, và đường đó sẽ là đường mà mọi chỗ gọi vội vàng
   * chọn.
   */
  .post(
    "/fleet/:id",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);

      const { expectedUpdatedAt, ...input } = body;
      const r = await updateVehicle(params.id, input, expectedUpdatedAt, new Date());
      if (r.ok) return status(200, r.vehicle);

      const f = writeFailure(r);
      if (f.code === 422) return status(422, f.body);
      if (f.code === 404) return status(404, f.body);
      return status(409, f.body);
    },
    {
      params: idParams,
      body: t.Composite([bodySchema, t.Object({ expectedUpdatedAt: t.Date() })]),
      response: {
        200: detailSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        422: invalidSchema,
      },
    },
  )

  /**
   * ── Ảnh xe ────────────────────────────────────────────────────────────────
   *
   * File đi qua `apps/api` rồi mới sang Directus, KHÔNG upload thẳng từ trình
   * duyệt: Directus ở prod nằm sau Caddy tại `data.` và token máy không được
   * phát cho frontend. Lý lẽ đầy đủ ở `directus.ts`.
   *
   * ⚠️ `t.File({ type })` kiểm ĐUÔI TÊN FILE, KHÔNG kiểm nội dung. Đo lại 2026-09-07 qua chính route này, khớp bảng ở `docs/DEBT.md`: một
   * file WebP MANG ĐUÔI `.webp` được nhận (201); cùng byte đó không đuôi thì bị
   * từ chối 422. Nghĩa là `File.type` suy từ ĐUÔI TÊN FILE, không từ byte —
   * `Content-Type` người gửi khai bị bỏ qua hoàn toàn, và bước đoán từ byte (vốn
   * không biết WebP) chỉ chạy khi tên file không có đuôi.
   *
   * Hệ quả phải biết: hàng rào này chống nhầm lẫn, không chống người cố tình —
   * byte bất kỳ dưới tên `x.png` đi qua được. Chấp nhận được ở đây vì `alt` và
   * `slug` mới là thứ ra trang công khai, `image/svg+xml` không có trong
   * `TYPE_EXTENSION` nên không khoá nào mang đuôi `.svg`, và Directus mới là nơi
   * phục vụ byte chứ không phải `apps/api`. Lý lẽ đầy đủ ở `docs/DEBT.md`.
   */
  .post(
    "/fleet/:id/photos",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);

      const r = await addVehiclePhoto({
        vehicleId: params.id,
        alt: body.alt,
        contentType: body.file.type,
        bytes: await body.file.arrayBuffer(),
        filename: body.file.name,
      });

      if (r.ok) return status(201, r.photo);
      if (r.reason === "VEHICLE_NOT_FOUND") return status(404, toError(r.reason));
      if (r.reason === "PHOTO_ALT_INVALID") {
        return status(422, {
          ...toError(r.reason),
          message: r.rules.map((rule) => VEHICLE_MESSAGES[rule]).join(" · "),
          rules: [...r.rules],
        });
      }
      // `DIRECTUS_FAILED` là 502, không 400: lỗi nằm ở dịch vụ phía sau, không ở
      // thứ người dùng gửi. Trả 400 ở đây là bảo chủ shop sửa ảnh của mình trong
      // khi thứ hỏng là kho ảnh.
      if (r.reason === "DIRECTUS_FAILED") return status(502, toError(r.reason));
      return status(422, { ...toError(r.reason), rules: [] });
    },
    {
      params: idParams,
      // `t.File` với `maxSize` là hàng rào ĐẦU TIÊN: Elysia từ chối trước khi
      // handler chạy, nên một file 500 MB không bao giờ được đọc hết vào bộ nhớ.
      // `isPhotoSizeValid` ở domain là hàng rào thứ hai. Hai tham số suy từ
      // `@v9/shared/domain/rental-photo`, không gõ lại.
      body: t.Object({
        alt: t.String(),
        file: t.File({ maxSize: MAX_PHOTO_BYTES, type: [...PHOTO_CONTENT_TYPES] }),
      }),
      response: {
        201: photoSchema,
        403: errorSchema,
        404: errorSchema,
        422: invalidSchema,
        502: errorSchema,
      },
    },
  )

  .post(
    "/fleet/:id/photos/:photoId",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);

      const r = await updateVehiclePhoto(params.id, params.photoId, body);
      if (r.ok) return status(200, { ok: true });
      if (r.reason === "PHOTO_NOT_FOUND") return status(404, toError(r.reason));
      return status(422, {
        ...toError(r.reason),
        message: r.rules.map((rule) => VEHICLE_MESSAGES[rule]).join(" · "),
        rules: [...r.rules],
      });
    },
    {
      params: photoParams,
      body: t.Object({ alt: t.String(), sort: t.Integer() }),
      response: {
        200: okSchema,
        403: errorSchema,
        404: errorSchema,
        422: invalidSchema,
      },
    },
  )

  .delete(
    "/fleet/:id/photos/:photoId",
    async ({ params, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);

      const r = await deleteVehiclePhoto(params.id, params.photoId);
      if (r.ok) return status(200, { ok: true });
      if (r.reason === "PHOTO_NOT_FOUND") return status(404, toError(r.reason));
      return status(502, toError(r.reason));
    },
    {
      params: photoParams,
      response: { 200: okSchema, 403: errorSchema, 404: errorSchema, 502: errorSchema },
    },
  )

  .post(
    "/fleet/:id/archive",
    async ({ params, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);

      const r = await archiveVehicle(params.id, new Date());
      if (r.ok) return status(200, { ok: true });
      if (r.reason === "VEHICLE_NOT_FOUND") return status(404, toError(r.reason));
      return status(409, toError(r.reason));
    },
    {
      params: idParams,
      response: { 200: okSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema },
    },
  );
