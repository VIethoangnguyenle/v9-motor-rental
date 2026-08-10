/**
 * Luật quyền hạn của nhân viên. Hàm thuần, không chạm DB — đó là điều kiện để
 * TDD nghiêm khả thi ở đây, và là lý do luật "OWNER cuối cùng" nằm ở đây chứ
 * không nằm rải rác trong service.
 *
 * Quyết định + lý do: §3.1 docs/plans/2026-08-10-staff-auth-design.md.
 * `src/domain/**` KHÔNG được import bất cứ gì. Đừng thêm import vào file này.
 */

export type StaffRole = "OWNER" | "STAFF" | "SALES";
export type StaffStatus = "PENDING" | "ACTIVE" | "DISABLED";

export interface StaffActor {
  readonly id: string;
  readonly role: StaffRole;
  readonly status: StaffStatus;
}

export type StaffDenyReason =
  | "KHONG_PHAI_OWNER"
  | "TU_DUYET_MINH"
  | "KHONG_CHO_DUYET"
  | "TU_KHOA_MINH"
  | "OWNER_CUOI_CUNG";

/** Discriminated union, không throw — pattern 3 của repo. */
export type Permission = { ok: true } | { ok: false; reason: StaffDenyReason };

const OK: Permission = { ok: true };
const deny = (reason: StaffDenyReason): Permission => ({ ok: false, reason });

function requireOwner(actor: StaffActor): Permission | null {
  if (actor.role !== "OWNER" || actor.status !== "ACTIVE") return deny("KHONG_PHAI_OWNER");
  return null;
}

export function canApprove(actor: StaffActor, target: StaffActor): Permission {
  const notOwner = requireOwner(actor);
  if (notOwner) return notOwner;
  if (actor.id === target.id) return deny("TU_DUYET_MINH");
  if (target.status !== "PENDING") return deny("KHONG_CHO_DUYET");
  return OK;
}

/**
 * `activeOwnerCount` là số OWNER đang ACTIVE **tính cả target**. Service phải
 * đếm trong cùng transaction với lệnh UPDATE, nếu không hai OWNER tự hạ role
 * đồng thời sẽ cùng thấy count = 2 và cùng đi qua.
 */
export function canChangeRole(
  actor: StaffActor,
  target: StaffActor,
  newRole: StaffRole,
  activeOwnerCount: number,
): Permission {
  const notOwner = requireOwner(actor);
  if (notOwner) return notOwner;
  const hasOwnerLeft = target.role === "OWNER" && newRole !== "OWNER" && activeOwnerCount <= 1;
  if (hasOwnerLeft) return deny("OWNER_CUOI_CUNG");
  return OK;
}

export function canDisable(
  actor: StaffActor,
  target: StaffActor,
  activeOwnerCount: number,
): Permission {
  const notOwner = requireOwner(actor);
  if (notOwner) return notOwner;
  if (actor.id === target.id) return deny("TU_KHOA_MINH");
  if (target.role === "OWNER" && activeOwnerCount <= 1) return deny("OWNER_CUOI_CUNG");
  return OK;
}
