import { schema } from "@v9/db";
import type { Vnd } from "@v9/shared/domain/money";
import {
  checkVehicle,
  type VehicleDraft,
  type VehicleRule,
  type VehicleStatus,
} from "@v9/shared/domain/vehicle";
import { and, asc, eq, getTableName, inArray, ne, sql } from "drizzle-orm";
import { SQL } from "bun";
import { db } from "../db";

/**
 * Shape NỘI BỘ — có `plate`. Đây là lý do `/fleet` là route riêng chứ không phải
 * một field thêm vào `/vehicles`: comment ở `routes/vehicles.ts` nói rõ rằng
 * `plate` VẮNG MẶT trong schema công khai chính là cơ chế chặn, vì Elysia cắt mọi
 * field không được khai. Nới schema đó để staff dùng ké là tháo hàng rào của một
 * route công khai.
 *
 * `pricePerDay`/`deposit` CÓ mặt ở đây — khác `plate`, giá không phải dữ liệu
 * nhạy cảm, và staff (form lên đơn) là bên tiêu thụ TỰ NHIÊN của giá đội xe nội
 * bộ. Trước đây `rental-form.tsx` phải mượn `GET /vehicles` (route CÔNG KHAI của
 * `apps/web`) để tra giá, nên xe `draft` — có mặt ở `/fleet`, vắng mặt ở
 * `/vehicles` — không bao giờ tra được giá và cảnh báo "giá gõ nhầm" lặng lẽ tắt
 * cho đúng nhóm xe chưa lên web, tức nhóm rủi ro nhất. Thêm hai cột này vào ĐÚNG
 * route nội bộ này xoá luôn đường vòng đó.
 */
export interface FleetVehicle {
  readonly id: string;
  readonly slug: string;
  readonly make: string;
  readonly model: string;
  readonly plate: string | null;
  readonly status: string;
  readonly pricePerDay: Vnd;
  readonly deposit: Vnd;
  readonly year: number | null;
  readonly engineCc: number;
  readonly odoKm: number | null;
  readonly color: string | null;
  readonly photoCount: number;
  /**
   * Hết hạn của đơn đang phủ lên `now`; `null` = xe đang rảnh NGAY LÚC NÀY.
   *
   * ⚠️ Đây là giá trị SUY RA, không phải một cột. `vehicles.status` là trạng thái
   * DANH MỤC và có `CHECK vehicles_status_valid` chặn ai đó thêm `'available'`
   * (xem `packages/db/src/schema/vehicles.ts`). Rảnh/bận phải hỏi bảng `rentals`.
   */
  readonly onRentUntil: Date | null;
  /** Đơn kế tiếp bắt đầu lúc nào; `null` = không có đơn nào phía trước. */
  readonly nextFrom: Date | null;
}

export interface FleetPhoto {
  readonly id: string;
  readonly fileId: string;
  readonly alt: string;
}

export interface FleetVehicleDetail extends FleetVehicle {
  readonly description: string | null;
  readonly sort: number | null;
  /** Mốc để phát hiện ghi đè — xem `updateVehicle`. */
  readonly updatedAt: Date;
  /**
   * Mảng THƯỜNG, không `readonly [...]`: schema response của Elysia đòi kiểu khả
   * biến, và `ReadonlyArray` không gán vào đó được. Cùng hình dạng
   * `VehicleDetail.photos` ở `services/vehicles.ts` — field `readonly`, phần tử
   * `readonly`, mảng thì không.
   */
  readonly photos: FleetPhoto[];
}

/**
 * Trạng thái ĐANG CHIẾM XE: đơn đã chốt hoặc đang chạy. `COMPLETED`/`CANCELLED`
 * không chiếm xe.
 *
 * Viết ra thành hằng thay vì rải chuỗi trong SQL: `listFleet` và `archiveVehicle`
 * phải hỏi ĐÚNG một câu hỏi ("xe này có đang bận không"), và hai bản chép tay là
 * hai bản trôi được khỏi nhau — lúc đó chủ shop lưu kho được một chiếc xe mà màn
 * hình vừa báo là đang ở ngoài.
 */
const OCCUPYING = ["BOOKED", "ONGOING"] as const;

/** Dùng cho `nextFrom` — đơn TƯƠNG LAI thì cả hai trạng thái đều tính. */
const OCCUPYING_SQL = sql.raw(`ARRAY[${OCCUPYING.map((s) => `'${s}'`).join(",")}]`);

/**
 * ⚠️ Tham chiếu cột của bảng NGOÀI, viết ĐẦY ĐỦ tên bảng.
 *
 * Nội suy `${schema.vehicles.id}` vào một `sql` template cho ra `"id"` TRẦN,
 * không phải `"vehicles"."id"` — đã in `toSQL()` để xem. Bên trong một subquery
 * tương quan chạy trên `rentals r`, `"id"` khớp vào `rentals.id`, nên điều kiện
 * trở thành `r.vehicle_id = r.id`: không bao giờ đúng, không lỗi, chỉ trả NULL
 * cho mọi hàng. Một xe đang nằm ngoài đường hiện ra là "trống", và không có gì
 * kêu.
 *
 * Lấy tên bảng từ `getTableName` chứ không gõ chuỗi `"vehicles"`: đổi tên bảng
 * mà quên chỗ này thì lỗi quay lại đúng hình dạng im lặng cũ.
 */
const VEHICLE_ID = sql.raw(`${getTableName(schema.vehicles)}.id`);

/**
 * Hai mốc suy ra từ `rentals`, dùng chung bởi `listFleet` và `findFleetVehicle`.
 * Viết một lần: hai bản chép tay là hai bản trôi được khỏi nhau, và lúc đó danh
 * sách với trang chi tiết nói hai điều khác nhau về cùng một chiếc xe.
 */
/**
 * "Xe đang KHÔNG cho thuê được" — hai ca, không phải một.
 *
 * ⚠️ Bản đầu chỉ hỏi `starts_at <= now AND ends_at > now`, và nó bỏ sót đúng ca
 * đáng lo nhất: đơn `ONGOING` đã QUÁ HẠN. `ONGOING` nghĩa là xe đã giao và chưa
 * nhận lại — `ends_at` trôi qua không mang xe về, nó chỉ làm đơn thành quá hạn
 * (đó là cách `getStatsSummary` đếm `overdue`). Với điều kiện cũ, một chiếc xe
 * khách đang giữ quá hạn hiện ra là "Trống", tức mời nhân viên cho thuê một
 * chiếc xe không có ở shop.
 *
 * Lỗi này KHÔNG lộ ra trong test đơn vị — nó lộ ra khi nhìn màn hình: cùng một
 * dòng vừa ghi "Trống" vừa ghi "+1 đơn đang chạy".
 *
 * `BOOKED` thì vẫn hỏi khoảng thời gian: đơn đã chốt cho tuần sau không làm xe
 * bận hôm nay.
 */
const onRentUntilSql = (now: Date) => sql<Date | null>`(
  SELECT MAX(r.ends_at) FROM rentals r
  WHERE r.vehicle_id = ${VEHICLE_ID}
    AND (
      r.status = 'ONGOING'
      OR (r.status = 'BOOKED' AND r.starts_at <= ${now} AND r.ends_at > ${now})
    )
)`;

const nextFromSql = (now: Date) => sql<Date | null>`(
  SELECT MIN(r.starts_at) FROM rentals r
  WHERE r.vehicle_id = ${VEHICLE_ID}
    AND r.status = ANY(${OCCUPYING_SQL})
    AND r.starts_at > ${now}
)`;

const photoCountSql = sql<number>`(
  SELECT COUNT(*)::int FROM vehicle_photos p WHERE p.vehicle_id = ${VEHICLE_ID}
)`;

/**
 * Mọi xe trừ `archived`. Xe `draft` VẪN có mặt: chưa lên web không có nghĩa là
 * không cho thuê được — trạng thái đó là trạng thái DANH MỤC, không phải trạng
 * thái rảnh/bận (xem comment ở `packages/db/src/schema/vehicles.ts`).
 *
 * ⚠️ `now` là THAM SỐ, không phải `now()` của SQL — cùng lý do `getStatsSummary`
 * nhận nó: lỗi biên giới thời gian ở đây TỰ BIẾN MẤT lúc chạy test vào giờ khác,
 * và một test chạy lúc 10h sáng sẽ xanh mãi mãi.
 */
export async function listFleet(now: Date): Promise<FleetVehicle[]> {
  const rows = await db
    .select({
      id: schema.vehicles.id,
      slug: schema.vehicles.slug,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      plate: schema.vehicles.plate,
      status: schema.vehicles.status,
      pricePerDay: schema.vehicles.pricePerDay,
      deposit: schema.vehicles.deposit,
      year: schema.vehicles.year,
      engineCc: schema.vehicles.engineCc,
      odoKm: schema.vehicles.odoKm,
      color: schema.vehicles.color,
      photoCount: photoCountSql,
      // `starts_at <= now < ends_at` — nửa mở bên phải, cùng quy ước với
      // `tstzrange` của exclusion constraint chống đặt trùng.
      onRentUntil: onRentUntilSql(now),
      nextFrom: nextFromSql(now),
    })
    .from(schema.vehicles)
    .where(ne(schema.vehicles.status, "archived"))
    .orderBy(asc(schema.vehicles.make), asc(schema.vehicles.model), asc(schema.vehicles.id));

  return rows;
}

/** Kể cả xe `archived` — màn Đội xe có bộ lọc "xem xe đã lưu kho". */
export async function findFleetVehicle(id: string, now: Date): Promise<FleetVehicleDetail | null> {
  const [row] = await db
    .select({
      id: schema.vehicles.id,
      slug: schema.vehicles.slug,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      plate: schema.vehicles.plate,
      status: schema.vehicles.status,
      pricePerDay: schema.vehicles.pricePerDay,
      deposit: schema.vehicles.deposit,
      year: schema.vehicles.year,
      engineCc: schema.vehicles.engineCc,
      odoKm: schema.vehicles.odoKm,
      color: schema.vehicles.color,
      description: schema.vehicles.description,
      sort: schema.vehicles.sort,
      updatedAt: schema.vehicles.updatedAt,
      photoCount: photoCountSql,
      // `starts_at <= now < ends_at` — nửa mở bên phải, cùng quy ước với
      // `tstzrange` của exclusion constraint chống đặt trùng.
      onRentUntil: onRentUntilSql(now),
      nextFrom: nextFromSql(now),
    })
    .from(schema.vehicles)
    .where(eq(schema.vehicles.id, id))
    .limit(1);

  if (!row) return null;

  const photos = await db
    .select({
      id: schema.vehiclePhotos.id,
      fileId: schema.vehiclePhotos.fileId,
      alt: schema.vehiclePhotos.alt,
    })
    .from(schema.vehiclePhotos)
    .where(eq(schema.vehiclePhotos.vehicleId, id))
    // `id` làm khoá phụ: upload hàng loạt cho mọi ảnh `sort = 0`, và khi đó thứ tự
    // Postgres trả về là tuỳ ý. Cùng lý lẽ `photosOf` ở `services/vehicles.ts`.
    .orderBy(asc(schema.vehiclePhotos.sort), asc(schema.vehiclePhotos.id));

  return { ...row, photos };
}

/**
 * Trường người dùng nhập được. `sort` và `description` là tuỳ chọn vì hai cột đó
 * nullable ở DB; phần còn lại đi qua `checkVehicle`.
 */
export interface VehicleInput extends VehicleDraft {
  readonly plate: string | null;
  readonly year: number | null;
  readonly odoKm: number | null;
  readonly color: string | null;
  readonly description: string | null;
  readonly sort: number | null;
}

export type VehicleWriteResult =
  | { ok: true; vehicle: FleetVehicleDetail }
  | { ok: false; reason: "VEHICLE_INVALID"; rules: readonly VehicleRule[] }
  | { ok: false; reason: "SLUG_TAKEN" }
  | { ok: false; reason: "VEHICLE_NOT_FOUND" }
  | { ok: false; reason: "VEHICLE_STALE" };

/** Mã lỗi Postgres cho vi phạm UNIQUE. `.errno`, KHÔNG `.code` — xem CLAUDE.md. */
const UNIQUE_VIOLATION = "23505";

/**
 * ⚠️ Drizzle KHÔNG ném thẳng lỗi của driver: nó bọc lại thành `DrizzleQueryError`
 * và cất bản gốc ở `.cause`. Một phép kiểm `e instanceof SQL.PostgresError` trần
 * vì thế luôn trượt, và slug trùng sẽ nổi lên thành 500 thay vì `SLUG_TAKEN` —
 * đo được, không phải suy. Đi theo chuỗi `cause` thay vì bắt `DrizzleQueryError`
 * theo tên: tên đó là chi tiết nội bộ của Drizzle, còn `cause` là hợp đồng của
 * chính JavaScript.
 */
function isSlugTaken(e: unknown): boolean {
  for (
    let cur: unknown = e, depth = 0;
    cur !== undefined && cur !== null && depth < 5;
    depth += 1
  ) {
    if (cur instanceof SQL.PostgresError) return cur.errno === UNIQUE_VIOLATION;
    cur = cur instanceof Error ? cur.cause : null;
  }
  return false;
}

/**
 * Tách `VehicleDraft` (thứ `checkVehicle` biết) ra khỏi `VehicleInput` (thứ route
 * nhận): domain cố ý KHÔNG biết `plate`, `odoKm`, `sort` — chúng không có luật
 * nào, nên đưa vào domain là bắt module thuần gánh thêm hình dạng mà nó không
 * dùng tới.
 */
const toDraft = (input: VehicleInput): VehicleDraft => ({
  slug: input.slug,
  make: input.make,
  model: input.model,
  engineCc: input.engineCc,
  pricePerDay: input.pricePerDay,
  deposit: input.deposit,
  status: input.status,
});

export async function createVehicle(input: VehicleInput, now: Date): Promise<VehicleWriteResult> {
  const rules = checkVehicle(toDraft(input));
  if (rules.length > 0) return { ok: false, reason: "VEHICLE_INVALID", rules };

  try {
    const [row] = await db
      .insert(schema.vehicles)
      .values({
        slug: input.slug,
        make: input.make.trim(),
        model: input.model.trim(),
        engineCc: input.engineCc,
        pricePerDay: input.pricePerDay,
        deposit: input.deposit,
        status: input.status,
        plate: input.plate,
        year: input.year,
        odoKm: input.odoKm,
        color: input.color,
        description: input.description,
        sort: input.sort,
      })
      .returning({ id: schema.vehicles.id });

    if (!row) throw new Error("INSERT vehicles không trả về hàng nào");

    const vehicle = await findFleetVehicle(row.id, now);
    if (!vehicle) throw new Error("Vừa tạo xe xong nhưng đọc lại không thấy");
    return { ok: true, vehicle };
  } catch (e) {
    if (isSlugTaken(e)) return { ok: false, reason: "SLUG_TAKEN" };
    throw e;
  }
}

/**
 * Sửa một chiếc xe, có phát hiện ghi đè.
 *
 * `expectedUpdatedAt` là mốc mà client đang cầm. Lệch nghĩa là ai đó đã sửa chiếc
 * xe này ở nơi khác kể từ lúc client đọc nó — Data Studio của Directus là cửa thứ
 * hai, và nó không đi qua đường này. Không kiểm mốc thì ghi sau xoá ghi trước và
 * không có gì kêu.
 *
 * ⚠️ Điều kiện nằm TRONG mệnh đề `WHERE` của chính câu `UPDATE`, không phải một
 * `SELECT` kiểm trước rồi `UPDATE` sau. Ở mức cô lập mặc định READ COMMITTED, hai
 * lời gọi đồng thời đều đọc được cùng một `updated_at` cũ và cùng đi qua phép
 * kiểm — cùng cái bẫy mà `canChangeRole` đã ghi lại cho `activeOwnerCount`.
 */
export async function updateVehicle(
  id: string,
  input: VehicleInput,
  expectedUpdatedAt: Date,
  now: Date,
): Promise<VehicleWriteResult> {
  const rules = checkVehicle(toDraft(input));
  if (rules.length > 0) return { ok: false, reason: "VEHICLE_INVALID", rules };

  try {
    const updated = await db
      .update(schema.vehicles)
      .set({
        slug: input.slug,
        make: input.make.trim(),
        model: input.model.trim(),
        engineCc: input.engineCc,
        pricePerDay: input.pricePerDay,
        deposit: input.deposit,
        status: input.status,
        plate: input.plate,
        year: input.year,
        odoKm: input.odoKm,
        color: input.color,
        description: input.description,
        sort: input.sort,
        // `updatedAt` KHÔNG có mặt ở đây: trigger `vehicles_set_updated_at`
        // (BEFORE UPDATE) đã ghi `now()` cho mọi lệnh UPDATE, kể cả lệnh đến từ
        // Data Studio của Directus hay từ `psql`. Gán ở đây là code chết bị
        // trigger ghi đè — và tệ hơn, nó gợi ý sai rằng cột này do tầng ứng dụng
        // giữ.
      })
      .where(
        and(
          eq(schema.vehicles.id, id),
          // ⚠️ `date_trunc('milliseconds', ...)`, KHÔNG so bằng trực tiếp.
          // Postgres lưu `timestamptz` ở MICRO giây (đo: `03:17:01.694206+00`),
          // còn `Date` của JavaScript chỉ có MILI giây. Mốc đọc về đã mất phần
          // dư ngay lúc đi qua driver, nên `updated_at = $1` KHÔNG BAO GIỜ khớp
          // và mọi lần sửa đều trả `VEHICLE_STALE`. Đo được, không phải suy.
          //
          // Giới hạn đã biết: hai lần ghi rơi vào cùng một mili giây sẽ cho cùng
          // một mốc, nên lần ghi thứ ba cầm mốc của lần đầu vẫn được nhận. Với
          // một shop có đúng một chủ bấm Lưu bằng tay thì cửa sổ đó không với
          // tới được; nếu một ngày có ghi tự động, hãy đổi sang cột phiên bản
          // dạng số nguyên chứ đừng nới phép so này.
          sql`date_trunc('milliseconds', ${schema.vehicles.updatedAt}) = ${expectedUpdatedAt}`,
        ),
      )
      .returning({ id: schema.vehicles.id });

    if (updated.length > 0) {
      const vehicle = await findFleetVehicle(id, now);
      if (!vehicle) throw new Error("Vừa sửa xe xong nhưng đọc lại không thấy");
      return { ok: true, vehicle };
    }

    // Không có hàng nào bị sửa — hai lý do khác nhau, và người dùng cần biết
    // đúng lý do nào: "xe không còn" khác hẳn "xe vừa bị người khác sửa".
    const exists = await db
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, id))
      .limit(1);

    return exists.length === 0
      ? { ok: false, reason: "VEHICLE_NOT_FOUND" }
      : { ok: false, reason: "VEHICLE_STALE" };
  } catch (e) {
    if (isSlugTaken(e)) return { ok: false, reason: "SLUG_TAKEN" };
    throw e;
  }
}

export type ArchiveResult =
  | { ok: true }
  | { ok: false; reason: "VEHICLE_NOT_FOUND" }
  | { ok: false; reason: "VEHICLE_HAS_ACTIVE_RENTAL" };

/**
 * "Xoá xe" của màn Đội xe = chuyển sang `archived`.
 *
 * Hàng ở lại bảng, nên đơn thuê cũ vẫn tra ra được tên xe và doanh thu của nó
 * vẫn cộng được. Xoá cứng không phải lựa chọn: `rentals.vehicle_id` là
 * `ON DELETE RESTRICT`, nên Postgres sẽ từ chối, và nếu gỡ ràng buộc đó thì mất
 * luôn lịch sử.
 *
 * Chặn khi xe đang có đơn hiệu lực: lưu kho một chiếc xe đang nằm ngoài đường là
 * cách làm biến mất chính chiếc xe mà nhân viên sắp phải đi nhận lại.
 */
export async function archiveVehicle(id: string, now: Date): Promise<ArchiveResult> {
  const [vehicle] = await db
    .select({ id: schema.vehicles.id })
    .from(schema.vehicles)
    .where(eq(schema.vehicles.id, id))
    .limit(1);
  if (!vehicle) return { ok: false, reason: "VEHICLE_NOT_FOUND" };

  const active = await db
    .select({ id: schema.rentals.id })
    .from(schema.rentals)
    .where(
      and(
        eq(schema.rentals.vehicleId, id),
        inArray(schema.rentals.status, [...OCCUPYING]),
        // Đơn TƯƠNG LAI cũng chặn, không chỉ đơn đang chạy: một đơn đã chốt cho
        // tuần sau vẫn là một lời hứa với khách.
        sql`${schema.rentals.endsAt} > ${now}`,
      ),
    )
    .limit(1);
  if (active.length > 0) return { ok: false, reason: "VEHICLE_HAS_ACTIVE_RENTAL" };

  await db
    .update(schema.vehicles)
    // `updatedAt` do trigger `vehicles_set_updated_at` giữ — xem `updateVehicle`.
    .set({ status: "archived" satisfies VehicleStatus })
    .where(eq(schema.vehicles.id, id));

  return { ok: true };
}
