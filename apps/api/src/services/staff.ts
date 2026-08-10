import { and, asc, eq } from "drizzle-orm";
import { schema } from "@v9/db";
import {
  canApprove,
  canChangeRole,
  canDisable,
  type Permission,
  type StaffActor,
  type StaffRole,
  type StaffStatus,
} from "@v9/shared/domain/staff";
import { db } from "../db";

export interface StaffUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly role: StaffRole;
  readonly status: StaffStatus;
  readonly approvedBy: string | null;
  readonly createdAt: Date;
}

/**
 * Deps là tham số (pattern 2 của repo). `supertokens-node` đòi `supertokens.init()`
 * chạy trước, và init đó nằm ở `plugins/auth.ts` — mà `services/` bị ESLint cấm
 * import `plugins/`. Route (nơi được phép chạm cả hai) truyền hàm thật vào; test
 * truyền một spy, không cần mock framework và không cần SuperTokens sống.
 */
export interface StaffDeps {
  /** Thu hồi mọi session của một người. Ở prod là Session.revokeAllSessionsForUser. */
  readonly revokeSessions: (userId: string) => Promise<unknown>;
}

const columns = {
  id: schema.staffUsers.id,
  email: schema.staffUsers.email,
  fullName: schema.staffUsers.fullName,
  phone: schema.staffUsers.phone,
  role: schema.staffUsers.role,
  status: schema.staffUsers.status,
  approvedBy: schema.staffUsers.approvedBy,
  createdAt: schema.staffUsers.createdAt,
};

/**
 * Drizzle khai `role`/`status` là `text` nên TS chỉ thấy `string`. CHECK ở tầng DB
 * đã giới hạn giá trị thật (`staff_users_role_valid`/`staff_users_status_valid`),
 * nên ép kiểu ở ĐÚNG một chỗ này là an toàn — tránh rải `as` khắp các hàm bên dưới.
 */
function toStaffUser(row: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  status: string;
  approvedBy: string | null;
  createdAt: Date;
}): StaffUser {
  return {
    ...row,
    role: row.role as StaffRole,
    status: row.status as StaffStatus,
  };
}

export async function loadStaff(id: string): Promise<StaffUser | null> {
  const [row] = await db
    .select(columns)
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.id, id));
  return row ? toStaffUser(row) : null;
}

export async function listStaff(status?: StaffStatus): Promise<StaffUser[]> {
  const rows = await db
    .select(columns)
    .from(schema.staffUsers)
    .where(status ? eq(schema.staffUsers.status, status) : undefined)
    // `id` là khoá phụ: `created_at` mặc định `now()` nên hàng ghi trong cùng một
    // transaction có thể trùng giá trị, và khi đó thứ tự Postgres trả về là tuỳ ý.
    // Cùng lý do vehicles.ts thêm `id` vào ORDER BY của nó.
    .orderBy(asc(schema.staffUsers.createdAt), asc(schema.staffUsers.id));
  return rows.map(toStaffUser);
}

/**
 * Gọi từ override `signUpPOST`. Cố ý KHÔNG nhận `role`/`status` làm tham số —
 * người tự đăng ký không được tự chọn quyền của mình, và không có tham số thì
 * không có đường nào để truyền một giá trị khác PENDING/STAFF vào đây.
 */
export async function createPendingStaff(input: {
  id: string;
  email: string;
  fullName: string;
  phone?: string | undefined;
}): Promise<void> {
  await db.insert(schema.staffUsers).values({
    id: input.id,
    email: input.email,
    fullName: input.fullName,
    phone: input.phone ?? null,
  });
}

function asActor(s: StaffUser): StaffActor {
  return { id: s.id, role: s.role, status: s.status };
}

async function loadActorAndTarget(actorId: string, targetId: string) {
  const [actor, target] = await Promise.all([loadStaff(actorId), loadStaff(targetId)]);
  if (!actor || !target) return null;
  return { actor, target };
}

/** Kiểu `tx` thật của `db.transaction` — suy từ chính `db`, không hard-code driver. */
type StaffTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Tách xây query khỏi chạy, cùng lý do `publishedVehiclesQuery` (vehicles.ts):
 * cho phép test khoá `FOR UPDATE` bằng `.toSQL()` mà không cần mở transaction
 * thật — `.toSQL()` không chạm DB nên gọi trên `db` (thay vì `tx`) vẫn ra đúng
 * văn bản SQL. Tham số `executor` ở đây CHỈ quyết định phần build câu lệnh; nó
 * không phải chỗ ép "phải dùng tx" — chỗ ép đó nằm ở `countActiveOwnersLocked`
 * ngay dưới, nhận đúng kiểu `StaffTx`.
 *
 * `ORDER BY id` để mọi transaction khoá các hàng theo ĐÚNG MỘT thứ tự cố định:
 * hai `SELECT ... FOR UPDATE` cùng khớp một tập hàng mà quét theo thứ tự khác
 * nhau có thể khoá chéo và deadlock (`40P01`, nằm ở `.errno` — xem CLAUDE.md
 * gốc). Cùng tập hàng, cùng thứ tự thì transaction tới sau luôn chờ đúng một
 * chỗ thay vì tạo vòng chờ.
 */
export function activeOwnersLockedQuery(executor: { select: typeof db.select }) {
  return executor
    .select({ id: schema.staffUsers.id })
    .from(schema.staffUsers)
    .where(and(eq(schema.staffUsers.role, "OWNER"), eq(schema.staffUsers.status, "ACTIVE")))
    .orderBy(asc(schema.staffUsers.id))
    .for("update");
}

/**
 * Số OWNER đang ACTIVE — và KHOÁ các hàng đó bằng `SELECT ... FOR UPDATE`.
 *
 * Chạy trong CÙNG transaction với UPDATE là ĐIỀU KIỆN CẦN nhưng KHÔNG ĐỦ: mức
 * cô lập mặc định của Postgres là READ COMMITTED, và ở mức đó một `SELECT`
 * (kể cả `count(*)`) thường không khoá hàng nào cả — nó chỉ đọc snapshot tại
 * thời điểm câu lệnh bắt đầu. Hai transaction `changeStaffRole`/`disableStaff`
 * chạy song song vẫn cùng đọc được count = 2, cùng đi qua điều kiện "còn hơn 1
 * OWNER", và cùng UPDATE — mất OWNER cuối cùng dù xét riêng từng lời gọi đều
 * hợp lệ. `FOR UPDATE` khoá đúng các hàng khớp WHERE ngay khi đọc; transaction
 * thứ hai chạm cùng hàng phải CHỜ transaction thứ nhất commit/rollback rồi mới
 * đọc lại — lúc đó thấy hàng đã đổi, count giảm, và bị chặn đúng như phải chặn.
 *
 * Tham số PHẢI là `tx` thật (kiểu suy từ `db.transaction`, không phải interface
 * duck-type chung với `db`) — gọi bằng `db` bên trong callback của
 * `db.transaction` mở một CONNECTION KHÁC, khoá đặt trên đó không có tác dụng
 * gì với transaction đang chạy. Đây là chỗ dễ sai nhất của hàm này.
 */
async function countActiveOwnersLocked(tx: StaffTx): Promise<number> {
  const rows = await activeOwnersLockedQuery(tx);
  return rows.length;
}

export type StaffMutationResult = Permission | { ok: false; reason: "KHONG_TIM_THAY" };

export async function approveStaff(
  actorId: string,
  targetId: string,
  role: StaffRole,
): Promise<StaffMutationResult> {
  const ctx = await loadActorAndTarget(actorId, targetId);
  if (!ctx) return { ok: false, reason: "KHONG_TIM_THAY" };

  const allowed = canApprove(asActor(ctx.actor), asActor(ctx.target));
  if (!allowed.ok) return allowed;

  await db
    .update(schema.staffUsers)
    .set({
      status: "ACTIVE",
      role,
      approvedAt: new Date(),
      approvedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(schema.staffUsers.id, targetId));
  return { ok: true };
}

/**
 * Đếm OWNER đang ACTIVE (khoá bằng `FOR UPDATE`) và UPDATE nằm trong CÙNG một
 * transaction (cùng `tx`, không phải `db`) — xem `countActiveOwnersLocked` cho
 * lý do vì sao đếm suông (`count(*)` không khoá) là chưa đủ dù đã cùng transaction.
 */
export async function changeStaffRole(
  actorId: string,
  targetId: string,
  newRole: StaffRole,
): Promise<StaffMutationResult> {
  const ctx = await loadActorAndTarget(actorId, targetId);
  if (!ctx) return { ok: false, reason: "KHONG_TIM_THAY" };

  return db.transaction(async (tx) => {
    const allowed = canChangeRole(
      asActor(ctx.actor),
      asActor(ctx.target),
      newRole,
      await countActiveOwnersLocked(tx),
    );
    if (!allowed.ok) return allowed;

    await tx
      .update(schema.staffUsers)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(schema.staffUsers.id, targetId));
    return { ok: true };
  });
}

/**
 * Cùng lý do transaction như `changeStaffRole`: đếm OWNER (có khoá `FOR UPDATE`)
 * và khoá tài khoản phải đọc-ghi trên cùng một `tx`, không phải trên `db`.
 *
 * `deps.revokeSessions` được gọi SAU KHI transaction commit — vì sao vẫn cần thu
 * hồi dù `staff-guard` đã đọc DB mỗi request: guard chặn được người DISABLED ngay
 * từ request kế tiếp, nhưng session cũ (access token + refresh token) vẫn còn
 * sống trong SuperTokens cho tới khi hết hạn hoặc bị thu hồi. Dọn nó là vệ sinh,
 * không phải trang trí — đây là lý do chính repo chọn "role đọc từ DB" thay vì
 * "role nhét trong claim của token" (§2 design doc).
 */
export async function disableStaff(
  deps: StaffDeps,
  actorId: string,
  targetId: string,
): Promise<StaffMutationResult> {
  const ctx = await loadActorAndTarget(actorId, targetId);
  if (!ctx) return { ok: false, reason: "KHONG_TIM_THAY" };

  const result = await db.transaction(async (tx) => {
    const allowed = canDisable(
      asActor(ctx.actor),
      asActor(ctx.target),
      await countActiveOwnersLocked(tx),
    );
    if (!allowed.ok) return allowed;

    await tx
      .update(schema.staffUsers)
      .set({ status: "DISABLED", updatedAt: new Date() })
      .where(eq(schema.staffUsers.id, targetId));
    return { ok: true } as const;
  });

  if (result.ok) await deps.revokeSessions(targetId);
  return result;
}
