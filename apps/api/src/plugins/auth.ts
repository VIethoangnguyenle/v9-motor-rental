import { Elysia } from "elysia";

// ─────────────────────────────────────────────────────────────────────────
// SEAM: JWT auth — CHƯA IMPLEMENT.
// Phiên scaffold cố ý không có auth (§2 design doc). Type và điểm móc đã sẵn
// để phiên sau chỉ phải điền phần verify, không phải đi sửa mọi route.
// Tìm bằng: grep -rn "SEAM: JWT auth"
// ─────────────────────────────────────────────────────────────────────────

export type Role = "OWNER" | "STAFF" | "SALES";

export interface AuthContext {
  readonly userId: string;
  readonly role: Role;
}

export const auth = new Elysia({ name: "auth" }).derive(
  { as: "global" },
  ({ headers }): { auth: AuthContext | null } => {
    const header = headers.authorization;
    if (!header?.startsWith("Bearer ")) return { auth: null };
    // SEAM: JWT auth — verify token ở đây, trả AuthContext.
    return { auth: null };
  },
);
