import { Elysia, t, type Static } from "elysia";
import { MAX_PHOTO_BYTES, type PhotoKind } from "@v9/shared/domain/rental-photo";
import { staffGuard } from "../plugins/staff-guard";
import {
  addRentalPhoto,
  deleteRentalPhoto,
  listRentalPhotos,
  readRentalPhoto,
  type AddPhotoResult,
  type ReadPhotoResult,
} from "../services/photos";
import { updateRentalHandover, type UpdateHandoverResult } from "../services/rentals";

/** Suy TỪ `reason` của service — xem lý lẽ ở `routes/rentals.ts`. */
export type HandoverErrorCode =
  | Extract<AddPhotoResult, { ok: false }>["reason"]
  // `DeletePhotoResult` KHÔNG liệt kê ở đây: `reason` của nó là `PHOTO_NOT_FOUND`,
  // đúng bằng `ReadPhotoResult`, và lặp lại là lỗi `no-duplicate-type-constituents`.
  // Nếu một ngày nó có `reason` riêng thì thêm dòng cho nó — `satisfies` bên dưới
  // sẽ báo thiếu bản dịch ngay lúc biên dịch.
  | Extract<ReadPhotoResult, { ok: false }>["reason"]
  | Extract<UpdateHandoverResult, { ok: false }>["reason"];

const MESSAGES = {
  RENTAL_NOT_FOUND: "Không tìm thấy đơn thuê",
  PHOTO_NOT_FOUND: "Không tìm thấy ảnh",
  PHOTO_TYPE_INVALID: "Chỉ nhận ảnh JPEG, PNG hoặc WebP",
  PHOTO_SIZE_INVALID: `Ảnh phải nhỏ hơn ${String(Math.floor(MAX_PHOTO_BYTES / 1024 / 1024))} MB`,
  DOCUMENT_RETURN_NEEDS_TYPE: "Chưa ghi loại giấy tờ thì không đánh dấu đã trả được",
} as const satisfies Record<HandoverErrorCode, string>;

const toError = (code: HandoverErrorCode) => ({ code, message: MESSAGES[code] });

const errorSchema = t.Object({ message: t.String(), code: t.String() });

/**
 * Khai tường minh + ràng buộc hai chiều, cùng khuôn `statusSchema` của
 * `routes/rentals.ts`: thêm một loại ảnh ở domain mà quên ở đây là lỗi biên dịch.
 */
const kindSchema = t.Union([t.Literal("DOCUMENT"), t.Literal("HANDOVER"), t.Literal("RETURN")]);
type KindSchemaValue = Static<typeof kindSchema>;
type KindSetsMatch = [PhotoKind] extends [KindSchemaValue]
  ? [KindSchemaValue] extends [PhotoKind]
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tồn tại CHỈ để ép kiểm hai chiều.
const _kindSchemaMatchesDomain: KindSetsMatch = true;

const photoSchema = t.Object({
  id: t.String({ format: "uuid" }),
  rentalId: t.String({ format: "uuid" }),
  kind: kindSchema,
  contentType: t.String(),
  sizeBytes: t.Integer(),
  uploadedBy: t.String(),
  createdAt: t.Date(),
});

const rentalIdParams = t.Object({ id: t.String({ format: "uuid" }) });
const photoParams = t.Object({
  id: t.String({ format: "uuid" }),
  photoId: t.String({ format: "uuid" }),
});

/**
 * Luồng bàn giao xe: ảnh tình trạng + ảnh giấy tờ + chi tiết giấy tờ/địa chỉ.
 *
 * ⚠️ **Không route nào ở đây công khai.** Toàn bộ bucket `checkins` là dữ liệu
 * nội bộ — ảnh CCCD và bằng chứng tranh chấp. `staffGuard` mặc định chặn nên
 * chỉ cần KHÔNG khai chúng trong `PUBLIC_ROUTES`; đây là ghi chú để không ai
 * thêm nhầm một dòng vào đó cho "tiện test".
 *
 * Ảnh đi QUA api chứ không presigned URL: MinIO không phơi ra internet ở prod
 * (`Caddyfile` không route tới nó, `compose.prod.yaml` không map cổng). Lý do
 * đầy đủ ở `storage.ts`.
 */
export const handover = new Elysia({ name: "handover" })
  .use(staffGuard)

  .get("/rentals/:id/photos", async ({ params }) => listRentalPhotos(params.id), {
    params: rentalIdParams,
    response: { 200: t.Array(photoSchema) },
  })

  .post(
    "/rentals/:id/photos",
    async ({ params, body, staff, status }) => {
      if (!staff) return status(401, { message: "Chưa đăng nhập", code: "NOT_AUTHENTICATED" });

      const r = await addRentalPhoto({
        rentalId: params.id,
        kind: body.kind,
        contentType: body.file.type,
        bytes: await body.file.arrayBuffer(),
        uploadedBy: staff.id,
      });

      if (r.ok) return status(201, r.photo);
      if (r.reason === "RENTAL_NOT_FOUND") return status(404, toError(r.reason));
      return status(400, toError(r.reason));
    },
    {
      params: rentalIdParams,
      // `t.File` với `maxSize` là hàng rào ĐẦU TIÊN: Elysia từ chối trước khi
      // handler chạy, nên một file 500 MB không bao giờ được đọc hết vào bộ nhớ.
      // `isPhotoSizeValid` ở domain là hàng rào thứ hai, CHECK ở DB là thứ ba.
      body: t.Object({
        kind: kindSchema,
        file: t.File({ maxSize: MAX_PHOTO_BYTES, type: ["image/jpeg", "image/png", "image/webp"] }),
      }),
      response: { 201: photoSchema, 400: errorSchema, 401: errorSchema, 404: errorSchema },
    },
  )

  .get(
    "/rentals/:id/photos/:photoId/content",
    async ({ params, status, set }) => {
      const r = await readRentalPhoto(params.id, params.photoId);
      if (!r.ok) return status(404, toError(r.reason));

      set.headers["content-type"] = r.contentType;
      set.headers["content-length"] = String(r.sizeBytes);
      // Ảnh không đổi sau khi ghi (object key mang id), nên cache được lâu. Nhưng
      // `private`, KHÔNG `public`: đây là ảnh giấy tờ tuỳ thân — proxy dùng chung
      // không được giữ bản sao.
      set.headers["cache-control"] = "private, max-age=3600";
      // Chặn trình duyệt tự đoán kiểu nội dung. Với file người dùng gửi lên, đoán
      // sai kiểu là đường biến một "ảnh" thành tài liệu chạy được.
      set.headers["x-content-type-options"] = "nosniff";
      return r.stream;
    },
    { params: photoParams },
  )

  .delete(
    "/rentals/:id/photos/:photoId",
    async ({ params, status }) => {
      const r = await deleteRentalPhoto(params.id, params.photoId);
      if (r.ok) return status(200, { ok: true });
      return status(404, toError(r.reason));
    },
    {
      params: photoParams,
      response: { 200: t.Object({ ok: t.Boolean() }), 404: errorSchema },
    },
  )

  .post(
    "/rentals/:id/handover",
    async ({ params, body, status }) => {
      const r = await updateRentalHandover(params.id, body, new Date());
      if (r.ok) return status(200, { ok: true });
      if (r.reason === "RENTAL_NOT_FOUND") return status(404, toError(r.reason));
      return status(409, toError(r.reason));
    },
    {
      params: rentalIdParams,
      // Cả ba đều `Optional`: màn bàn giao lưu từng phần khi nhân viên điền tới
      // đâu, không bắt điền đủ mới được lưu. `Nullable` để xoá được giá trị đã ghi.
      body: t.Object({
        documentType: t.Optional(t.Nullable(t.Union([t.Literal("CCCD"), t.Literal("PASSPORT")]))),
        deliveryAddress: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
        documentReturned: t.Optional(t.Boolean()),
      }),
      response: { 200: t.Object({ ok: t.Boolean() }), 404: errorSchema, 409: errorSchema },
    },
  );
