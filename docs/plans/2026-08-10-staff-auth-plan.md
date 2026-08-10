# Auth cho `apps/staff` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/staff` có đăng nhập / đăng ký / quên mật khẩu; OWNER duyệt nhân viên; API chuyển sang mặc định chặn.

**Architecture:** Danh tính chia đôi — SuperTokens giữ mật khẩu và session, `public.staff_users` giữ role/trạng thái/hồ sơ. Một plugin Elysia đăng ký trước mọi route áp luật "không nằm trong danh sách công khai thì đòi session". Quên mật khẩu dùng mã 6 số tự quản (`password_reset_codes`), đổi lấy token SuperTokens ngay tại bước xác nhận.

**Tech Stack:** Bun · Elysia 1.4 · TypeBox · Drizzle 0.45 (bun-sql) · `supertokens-node@24.0.3` · `supertokens-web-js@0.16.0` · nodemailer · Vite 8 + TanStack Router/Query · Tailwind v4.

**Design doc:** `docs/plans/2026-08-10-staff-auth-design.md`. Khi plan và design doc mâu thuẫn, design doc thắng — và sửa plan.

---

## Đọc trước khi bắt đầu

Bốn cái bẫy của repo này sẽ cắn trong plan này nếu không biết trước:

1. **SQLSTATE của Bun.SQL nằm ở `.errno`, không phải `.code`.**
2. **`bun run --filter '*'` im lặng bỏ qua workspace thiếu script.** Không thêm workspace nào ở plan này nên không đụng, nhưng `scripts/` được typecheck bằng nửa sau của lệnh `typecheck`.
3. **`eslint.config.js` là hàng rào thật.** Task 7 sửa nó → bắt buộc chạy lại cả ba probe và **đọc tên luật**, không nhìn exit code.
4. **PWA chỉ quan sát được trên bản build**, không phải `vite dev`.

Môi trường cần chạy suốt plan:

```bash
docker compose up -d     # postgres + minio + directus + supertokens
```

## File Structure

| File                                                                                                           | Trách nhiệm                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/domain/staff.ts`                                                                          | Luật thuần về quyền: ai duyệt/đổi role/khoá được ai. Không import gì.                                                  |
| `packages/db/src/schema/staff.ts`                                                                              | Bảng `staff_users`, `password_reset_codes`.                                                                            |
| `apps/api/src/env.ts` (sửa)                                                                                    | Thêm `isProduction`, `devOtp`, `smtp`; fail-fast khi `AUTH_DEV_OTP` xuất hiện ở prod.                                  |
| `apps/api/src/plugins/auth.ts` (sửa)                                                                           | Override `EmailPassword.init`: tắt reset cũ, thêm formFields, bọc `signUpPOST`. Export helper dựng `PreParsedRequest`. |
| `apps/api/src/plugins/staff-guard.ts`                                                                          | Luật mặc định chặn + hai danh sách công khai.                                                                          |
| `apps/api/src/services/staff.ts`                                                                               | Đọc/ghi `staff_users`: load, list pending, approve, đổi role, khoá.                                                    |
| `apps/api/src/services/password-reset.ts`                                                                      | Sinh mã, băm, hết hạn, đếm lần sai, đổi mã lấy mật khẩu mới.                                                           |
| `apps/api/src/services/email.ts`                                                                               | Gửi mail bằng nodemailer. Chỗ duy nhất biết SMTP.                                                                      |
| `apps/api/src/routes/staff.ts`                                                                                 | HTTP + response schema cho `/staff/*`.                                                                                 |
| `scripts/staff-bootstrap.ts`                                                                                   | Tạo OWNER đầu tiên, chạy lại nhiều lần vô hại.                                                                         |
| `apps/staff/src/lib/auth.ts`                                                                                   | Init `supertokens-web-js`, wrapper đăng nhập/đăng ký/đăng xuất.                                                        |
| `apps/staff/src/lib/me.ts`                                                                                     | Query `/staff/me` dùng chung cho guard và UI.                                                                          |
| `apps/staff/src/router.tsx` (sửa)                                                                              | Hai nhánh route: công khai và được bảo vệ.                                                                             |
| `apps/staff/src/pages/dang-nhap.tsx` · `dang-ky.tsx` · `quen-mat-khau.tsx` · `cho-duyet.tsx` · `nhan-vien.tsx` | Màn hình.                                                                                                              |
| `eslint.config.js` (sửa)                                                                                       | Cho `api-plugins` → `api-services`; vẫn cấm `api-plugins` → `db`.                                                      |

---

## Task 1: Nhánh làm việc

- [ ] **Step 1: Tạo nhánh**

```bash
git checkout -b feat/staff-auth
git status
```

Expected: `On branch feat/staff-auth`, nothing to commit.

---

## Task 2: Domain thuần — luật ai làm gì được ai

TDD nghiêm, đây là `packages/shared`. Test trước, luôn luôn.

**Files:**

- Create: `packages/shared/src/domain/staff.ts`
- Test: `packages/shared/src/domain/staff.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json`

- [ ] **Step 1: Viết test trước**

Create `packages/shared/src/domain/staff.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { canApprove, canChangeRole, canDisable, type StaffActor } from "./staff";

const owner: StaffActor = { id: "u-owner", role: "OWNER", status: "ACTIVE" };
const owner2: StaffActor = { id: "u-owner-2", role: "OWNER", status: "ACTIVE" };
const staff: StaffActor = { id: "u-staff", role: "STAFF", status: "ACTIVE" };
const pending: StaffActor = { id: "u-pending", role: "STAFF", status: "PENDING" };

describe("canApprove", () => {
  it("OWNER duyệt được người đang chờ", () => {
    expect(canApprove(owner, pending)).toEqual({ ok: true });
  });

  it("STAFF không duyệt được ai", () => {
    expect(canApprove(staff, pending)).toEqual({ ok: false, reason: "KHONG_PHAI_OWNER" });
  });

  it("không tự duyệt chính mình", () => {
    const selfPending: StaffActor = { id: owner.id, role: "OWNER", status: "PENDING" };
    expect(canApprove(owner, selfPending)).toEqual({ ok: false, reason: "TU_DUYET_MINH" });
  });

  it("người đã ACTIVE thì không duyệt lại", () => {
    expect(canApprove(owner, staff)).toEqual({ ok: false, reason: "KHONG_CHO_DUYET" });
  });
});

describe("canChangeRole", () => {
  it("OWNER đổi role của nhân viên khác", () => {
    expect(canChangeRole(owner, staff, "SALES", 1)).toEqual({ ok: true });
  });

  it("không hạ role của OWNER cuối cùng — kể cả chính mình", () => {
    expect(canChangeRole(owner, owner, "STAFF", 1)).toEqual({
      ok: false,
      reason: "OWNER_CUOI_CUNG",
    });
  });

  it("còn OWNER khác thì hạ role được", () => {
    expect(canChangeRole(owner, owner2, "STAFF", 2)).toEqual({ ok: true });
  });

  it("STAFF không đổi role của ai", () => {
    expect(canChangeRole(staff, pending, "OWNER", 1)).toEqual({
      ok: false,
      reason: "KHONG_PHAI_OWNER",
    });
  });
});

describe("canDisable", () => {
  it("OWNER khoá được nhân viên", () => {
    expect(canDisable(owner, staff, 1)).toEqual({ ok: true });
  });

  it("không tự khoá mình", () => {
    expect(canDisable(owner, owner, 2)).toEqual({ ok: false, reason: "TU_KHOA_MINH" });
  });

  it("không khoá OWNER cuối cùng", () => {
    expect(canDisable(owner, owner2, 1)).toEqual({ ok: false, reason: "OWNER_CUOI_CUNG" });
  });

  it("STAFF không khoá được ai", () => {
    expect(canDisable(staff, pending, 1)).toEqual({ ok: false, reason: "KHONG_PHAI_OWNER" });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó đỏ**

Run: `bun test packages/shared/src/domain/staff.test.ts`
Expected: FAIL — `Cannot find module './staff'`.

- [ ] **Step 3: Implement tối thiểu**

Create `packages/shared/src/domain/staff.ts`:

```ts
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
  "KHONG_PHAI_OWNER" | "TU_DUYET_MINH" | "KHONG_CHO_DUYET" | "TU_KHOA_MINH" | "OWNER_CUOI_CUNG";

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
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `bun test packages/shared/src/domain/staff.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Phơi ra khỏi package**

Modify `packages/shared/package.json` — thêm vào `exports`:

```json
    "./domain/money": "./src/domain/money.ts",
    "./domain/staff": "./src/domain/staff.ts"
```

Modify `packages/shared/src/index.ts` — thêm dòng:

```ts
export {
  canApprove,
  canChangeRole,
  canDisable,
  type Permission,
  type StaffActor,
  type StaffDenyReason,
  type StaffRole,
  type StaffStatus,
} from "./domain/staff";
```

- [ ] **Step 6: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: exit 0. (Cảnh báo `'mode' is deprecated` của boundaries là đã biết, không phải lỗi mới.)

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/domain/staff.ts packages/shared/src/domain/staff.test.ts \
        packages/shared/src/index.ts packages/shared/package.json
git commit -m "feat(shared): luật quyền nhân viên — và OWNER cuối cùng không tự khoá mình được"
```

---

## Task 3: Schema `staff_users` + `password_reset_codes`

**Files:**

- Create: `packages/db/src/schema/staff.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create (sinh ra): `packages/db/migrations/0005_*.sql`

- [ ] **Step 1: Viết schema Drizzle**

Create `packages/db/src/schema/staff.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Danh tính NGHIỆP VỤ của nhân viên. SuperTokens giữ mật khẩu và session; role,
 * trạng thái duyệt và hồ sơ nằm ở đây, nơi migration làm chủ.
 * Lý do (bốn điểm) ở §2 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * `id` là `text` chứ KHÔNG phải `uuid`: id do SuperTokens sinh, và họ có cơ chế
 * user-id-mapping cho phép id ngoài. Khai `uuid` là đặt cược vào chi tiết triển
 * khai của hệ khác — đổi sang `uuid` sau này là một migration rẻ, chọn sai chiều
 * kia thì hỏng lúc chạy.
 *
 * Dùng `text` + CHECK thay cho `pgEnum`, theo đúng quy ước của `vehicles`: luật
 * thuộc về DB, và thêm giá trị mới không phải chạy ALTER TYPE.
 */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: text("id").primaryKey(),
    /** Bản sao từ SuperTokens. Nguồn sự thật vẫn ở đó — đổi email phải đồng bộ hai nơi. */
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    role: text("role").notNull().default("STAFF"),
    status: text("status").notNull().default("PENDING"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /**
     * FK tự trỏ về chính bảng này. `ON DELETE SET NULL` chứ không phải mặc định:
     * không có action thì xoá một nhân viên từng duyệt người khác sẽ bị chặn, và
     * đó chính là thứ các test dọn dữ liệu `ztest-%` làm. Toàn vẹn tham chiếu giữ
     * được, việc dọn dẹp không thành lỗi.
     */
    approvedBy: text("approved_by").references((): AnyPgColumn => staffUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("staff_users_role_valid", sql`${t.role} IN ('OWNER', 'STAFF', 'SALES')`),
    check("staff_users_status_valid", sql`${t.status} IN ('PENDING', 'ACTIVE', 'DISABLED')`),
    // Partial index: màn duyệt LUÔN lọc đúng tập này, và tập này gần như luôn rỗng.
    // Cùng lý lẽ với partial index của `vehicles`.
    index("staff_users_pending")
      .on(t.createdAt)
      .where(sql`${t.status} = 'PENDING'`),
  ],
);

/**
 * Mã 6 số cho luồng quên mật khẩu. KHÔNG lưu token của SuperTokens ở đây —
 * token chỉ được sinh ở bước xác nhận và dùng xong ngay trong cùng lời gọi, nên
 * trong DB của ta không có chuỗi nào tự nó mở được tài khoản (§5.1 design doc).
 */
export const passwordResetCodes = pgTable(
  "password_reset_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    /** Bun.password.hash — mã thô KHÔNG bao giờ chạm đĩa. */
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("prc_attempts_nonneg", sql`${t.attempts} >= 0`),
    index("prc_active")
      .on(t.staffUserId)
      .where(sql`${t.usedAt} IS NULL`),
  ],
);
```

- [ ] **Step 2: Export**

Modify `packages/db/src/schema/index.ts` — thêm dòng dưới export hiện có:

```ts
export { passwordResetCodes, staffUsers } from "./staff";
```

- [ ] **Step 3: Sinh migration**

Run: `bun run db:generate`
Expected: in ra tên file mới, ví dụ `0005_<tên-ngẫu-nhiên>.sql`.

- [ ] **Step 4: Đọc SQL sinh ra trước khi apply**

Run: `cat packages/db/migrations/0005_*.sql`
Expected: có `CREATE TABLE "staff_users"`, `CREATE TABLE "password_reset_codes"`, hai `CONSTRAINT ... CHECK`, hai partial index có mệnh đề `WHERE`, và hai foreign key:
`password_reset_codes_staff_user_id_staff_users_id_fk` (ON DELETE cascade) và
`staff_users_approved_by_staff_users_id_fk` (ON DELETE set null, tự trỏ về `staff_users`).

Nếu **thiếu mệnh đề `WHERE`** trong index thì partial index đã bị mất — dừng lại, sửa schema, sinh lại. Index không partial vẫn chạy nhưng đó không phải thứ đã thiết kế.

- [ ] **Step 5: Apply**

Run: `bun run db:migrate`
Expected: log áp migration mới, exit 0.

- [ ] **Step 6: Kiểm bằng Postgres, không bằng niềm tin**

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c "\d staff_users"
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "INSERT INTO staff_users (id, email, full_name, role) VALUES ('x','x@x.vn','X','KING');"
```

Expected: lệnh đầu in cấu trúc bảng; lệnh sau **phải** lỗi
`new row for relation "staff_users" violates check constraint "staff_users_role_valid"`.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/staff.ts packages/db/src/schema/index.ts packages/db/migrations/
git commit -m "feat(db): staff_users + password_reset_codes, role và status khoá bằng CHECK"
```

---

## Task 4: `env.ts` — `999999` và hàng rào chống nó lọt ra prod

**Files:**

- Modify: `apps/api/src/env.ts`
- Create: `apps/api/src/env.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Viết test trước**

Create `apps/api/src/env.test.ts`:

```ts
import { describe, expect, it } from "bun:test";

/**
 * env.ts đọc process.env lúc import, nên không test được bằng cách import lại
 * trong cùng tiến trình (module cache). Spawn tiến trình con là cách duy nhất
 * quan sát được hành vi fail-fast thật.
 */
async function bootWith(extra: Record<string, string>) {
  const proc = Bun.spawn(
    ["bun", "-e", 'import("./src/env.ts").then(() => console.log("BOOT_OK"))'],
    {
      cwd: import.meta.dir + "/..",
      env: { ...process.env, ...extra },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { out, err, code: proc.exitCode };
}

describe("env", () => {
  it("dev không cần AUTH_DEV_OTP vẫn khởi động được", async () => {
    const { out } = await bootWith({ NODE_ENV: "development" });
    expect(out).toContain("BOOT_OK");
  });

  it("production + AUTH_DEV_OTP = KHÔNG khởi động", async () => {
    const { err, code } = await bootWith({ NODE_ENV: "production", AUTH_DEV_OTP: "123456" });
    expect(code).not.toBe(0);
    expect(err).toContain("AUTH_DEV_OTP");
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận test thứ hai đỏ**

Run: `bun test apps/api/src/env.test.ts`
Expected: test 1 PASS, test 2 FAIL (app vẫn khởi động vì chưa có hàng rào).

- [ ] **Step 3: Thêm hàng rào vào `env.ts`**

Modify `apps/api/src/env.ts` — thêm trước `export const env`:

```ts
const isProduction = process.env.NODE_ENV === "production";

/**
 * ⚠️ Mã đặt lại mật khẩu cố định chỉ tồn tại ngoài production, và điều kiện là
 * NODE_ENV — KHÔNG phải "SMTP chưa cấu hình". Thiếu config là trạng thái mặc
 * định của một prod mới dựng; nếu thiếu config bật được mã cố định thì cả shop
 * mở bằng sáu con số. §5.2 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * Ném ở đây chứ không cảnh báo: một dòng comment trong .env.example không ép
 * được gì, còn app không khởi động thì ép được.
 */
if (isProduction && process.env.AUTH_DEV_OTP) {
  throw new Error(
    "AUTH_DEV_OTP có mặt ở NODE_ENV=production. Đây là cấu hình chỉ dành cho dev — gỡ nó ra.",
  );
}
```

và thêm vào object `env` (trước dấu `} as const;`):

```ts
  isProduction,
  /** Chỉ dùng khi !isProduction. Mặc định 999999, đổi được để test nhiều mã. */
  devOtp: process.env.AUTH_DEV_OTP ?? "999999",
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        user: required("SMTP_USER"),
        password: required("SMTP_PASSWORD"),
        from: required("SMTP_FROM"),
      }
    : null,
```

- [ ] **Step 4: Chạy test, xác nhận cả hai xanh**

Run: `bun test apps/api/src/env.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Ghi biến mới vào `.env.example`**

Modify `.env.example` — thêm khối dưới khối SuperTokens:

```bash
# ── Email (gửi mã đặt lại mật khẩu cho nhân viên) ──────────────────────
# THIẾU khối này thì API vẫn chạy: /staff/password-reset/request trả 503 và
# nhân viên phải nhờ OWNER phát mã. Không phải thứ chặn deploy.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=V9 Motor Rental <no-reply@example.com>

# Mã đặt lại mật khẩu ở môi trường KHÔNG PHẢI production luôn là 999999.
# Biến dưới đây chỉ để ĐỔI GIÁ TRỊ đó khi cần test nhiều mã — nó KHÔNG phải
# công tắc bật/tắt. ⚠️ Có mặt nó ở NODE_ENV=production thì API KHÔNG KHỞI ĐỘNG.
# AUTH_DEV_OTP=999999

# Email của chủ shop, dùng cho `bun run staff:bootstrap` (xem Task 12).
STAFF_OWNER_EMAIL=chu-shop@example.com
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/env.ts apps/api/src/env.test.ts .env.example
git commit -m "feat(api): mã dev 999999 gắn vào NODE_ENV, và prod không khởi động nếu AUTH_DEV_OTP lọt vào"
```

---

## Task 5: Tắt luồng reset cũ của SuperTokens

Đây là cái bẫy §4.1 của design doc: `/auth/*` là catch-all nên `POST /auth/user/password/reset/token` **đang sống** và sẽ gửi mail từ `noreply@supertokens.io`.

**Files:**

- Modify: `apps/api/src/plugins/auth.ts`

- [ ] **Step 1: Xác nhận endpoint đó đang thật sự sống**

```bash
bun --env-file=.env run --filter @v9/api dev &   # để chạy nền, hoặc dùng terminal khác
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3001/auth/user/password/reset/token \
  -H 'content-type: application/json' -d '{}'
```

Expected: **400** (SuperTokens nhận request và than thiếu `formFields`) — tức endpoint đang sống. Nếu ra 404 thì nó đã tắt sẵn và bước sau không cần thiết; ghi lại phát hiện đó vào design doc trước khi đi tiếp.

- [ ] **Step 2: Thêm override vào `supertokens.init`**

Modify `apps/api/src/plugins/auth.ts` — thay `EmailPassword.init()` trong `recipeList` bằng:

```ts
    EmailPassword.init({
      signUpFeature: {
        // Hai field thêm vào form đăng ký. SuperTokens tự validate "có mặt";
        // ràng buộc nội dung nằm ở service khi ghi staff_users.
        formFields: [{ id: "hoTen" }, { id: "soDienThoai", optional: true }],
      },
      override: {
        apis: (original) => ({
          ...original,
          // ⚠️ TẮT luồng đặt lại mật khẩu dựng sẵn. Không tắt thì hệ thống có HAI
          // luồng reset song song và một trong hai gửi mail từ noreply@supertokens.io
          // bằng dịch vụ hosted mặc định — không ai biết là có.
          // Luồng thật của ta là mã 6 số ở /staff/password-reset/*.
          // §4.1 docs/plans/2026-08-10-staff-auth-design.md.
          generatePasswordResetTokenPOST: undefined,
          passwordResetPOST: undefined,
        }),
      },
    }),
```

- [ ] **Step 3: Kiểm hai endpoint đã chết, và signup vẫn sống**

```bash
# PHẢI 404 — luồng cũ đã tắt
curl -s -o /dev/null -w 'reset/token: %{http_code}\n' -X POST \
  localhost:3001/auth/user/password/reset/token -H 'content-type: application/json' -d '{}'
# PHẢI 400 kèm "Missing input param: formFields" — signup còn sống, request tới được core
curl -s -X POST localhost:3001/auth/signup -H 'content-type: application/json' -d '{}'
```

Expected: `reset/token: 404`, và signup trả `{"message":"Missing input param: formFields"}`.

Hai kết quả khác nhau là bằng chứng 404 đến từ **override**, không phải từ việc cả `/auth/*` chết.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/plugins/auth.ts
git commit -m "fix(api): tắt luồng reset dựng sẵn của SuperTokens — nó đang gửi mail sau lưng"
```

---

## Task 6: Service `staff.ts`

**Files:**

- Create: `apps/api/src/services/staff.ts`
- Test: `apps/api/src/services/staff.test.ts`

- [ ] **Step 1: Viết test trước**

Create `apps/api/src/services/staff.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import {
  approveStaff,
  changeStaffRole,
  createPendingStaff,
  disableStaff,
  listStaff,
  loadStaff,
} from "./staff";

// Cùng quy ước với vehicles.test.ts: tiền tố riêng, dọn ở CẢ beforeAll lẫn afterAll.
// afterAll không chạy khi lần trước bị Ctrl-C, và hàng sót lại làm assertion sai lệch.
const P = "ztest-";
const clean = () => db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));

beforeAll(async () => {
  await clean();
  await db.insert(schema.staffUsers).values({
    id: `${P}owner`,
    email: `${P}owner@v9.vn`,
    fullName: "Chủ shop",
    role: "OWNER",
    status: "ACTIVE",
  });
});

afterAll(clean);

describe("createPendingStaff", () => {
  it("người mới luôn ra PENDING và role STAFF, không nhận role từ input", async () => {
    await createPendingStaff({
      id: `${P}new`,
      email: `${P}new@v9.vn`,
      fullName: "Nhân viên mới",
      phone: "0900000000",
    });
    const row = await loadStaff(`${P}new`);
    expect(row).toMatchObject({ status: "PENDING", role: "STAFF", fullName: "Nhân viên mới" });
  });
});

describe("approveStaff", () => {
  it("OWNER duyệt thì thành ACTIVE và ghi lại ai duyệt", async () => {
    const res = await approveStaff(`${P}owner`, `${P}new`, "STAFF");
    expect(res.ok).toBe(true);
    const row = await loadStaff(`${P}new`);
    expect(row).toMatchObject({ status: "ACTIVE", approvedBy: `${P}owner` });
  });

  it("người không phải OWNER bị từ chối", async () => {
    const res = await approveStaff(`${P}new`, `${P}owner`, "STAFF");
    expect(res).toEqual({ ok: false, reason: "KHONG_PHAI_OWNER" });
  });
});

describe("changeStaffRole", () => {
  it("không hạ được OWNER cuối cùng", async () => {
    const res = await changeStaffRole(`${P}owner`, `${P}owner`, "STAFF");
    expect(res).toEqual({ ok: false, reason: "OWNER_CUOI_CUNG" });
  });
});

describe("disableStaff", () => {
  it("OWNER khoá được nhân viên", async () => {
    const res = await disableStaff(`${P}owner`, `${P}new`);
    expect(res.ok).toBe(true);
    expect(await loadStaff(`${P}new`)).toMatchObject({ status: "DISABLED" });
  });

  it("không tự khoá mình", async () => {
    const res = await disableStaff(`${P}owner`, `${P}owner`);
    expect(res).toEqual({ ok: false, reason: "TU_KHOA_MINH" });
  });
});

describe("listStaff", () => {
  it("lọc theo trạng thái", async () => {
    const disabled = await listStaff("DISABLED");
    expect(disabled.some((s) => s.id === `${P}new`)).toBe(true);
    expect(disabled.some((s) => s.id === `${P}owner`)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `bun test apps/api/src/services/staff.test.ts`
Expected: FAIL — `Cannot find module './staff'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/services/staff.ts`:

```ts
import { and, asc, count, eq } from "drizzle-orm";
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
import Session from "supertokens-node/recipe/session";
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
 * CHECK ở tầng DB đã giới hạn giá trị, nhưng Drizzle khai cột là `text` nên TS
 * vẫn thấy `string`. Ép ở đúng một chỗ thay vì rải `as` khắp nơi.
 */
function toStaffUser(row: Record<string, unknown>): StaffUser {
  return row as unknown as StaffUser;
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
    .orderBy(asc(schema.staffUsers.createdAt), asc(schema.staffUsers.id));
  return rows.map(toStaffUser);
}

/**
 * Gọi từ override signUpPOST. `role` và `status` KHÔNG nhận từ input — người tự
 * đăng ký không được tự chọn quyền của mình, và không nhận tham số thì không có
 * đường nào truyền vào.
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

async function actorAndTarget(actorId: string, targetId: string) {
  const [actor, target] = await Promise.all([loadStaff(actorId), loadStaff(targetId)]);
  if (!actor || !target) return null;
  const asActor = (s: StaffUser): StaffActor => ({ id: s.id, role: s.role, status: s.status });
  return { actor, target, actorRef: asActor(actor), targetRef: asActor(target) };
}

async function activeOwnerCount(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.staffUsers)
    .where(and(eq(schema.staffUsers.role, "OWNER"), eq(schema.staffUsers.status, "ACTIVE")));
  return row?.n ?? 0;
}

export type StaffMutationResult = Permission | { ok: false; reason: "KHONG_TIM_THAY" };

export async function approveStaff(
  actorId: string,
  targetId: string,
  role: StaffRole,
): Promise<StaffMutationResult> {
  const ctx = await actorAndTarget(actorId, targetId);
  if (!ctx) return { ok: false, reason: "KHONG_TIM_THAY" };

  const allowed = canApprove(ctx.actorRef, ctx.targetRef);
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
 * Đếm OWNER và UPDATE nằm trong CÙNG một transaction. Tách ra thì hai OWNER cùng
 * tự hạ role một lúc sẽ cùng đọc được count = 2 và cùng đi qua — hệ thống mất
 * OWNER cuối cùng mà không luật nào bị vi phạm theo từng lời gọi riêng lẻ.
 */
export async function changeStaffRole(
  actorId: string,
  targetId: string,
  newRole: StaffRole,
): Promise<StaffMutationResult> {
  const ctx = await actorAndTarget(actorId, targetId);
  if (!ctx) return { ok: false, reason: "KHONG_TIM_THAY" };

  return db.transaction(async () => {
    const allowed = canChangeRole(ctx.actorRef, ctx.targetRef, newRole, await activeOwnerCount());
    if (!allowed.ok) return allowed;
    await db
      .update(schema.staffUsers)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(schema.staffUsers.id, targetId));
    return { ok: true };
  });
}

/**
 * Khoá là phải có hiệu lực NGAY: thu hồi mọi session của người đó chứ không đợi
 * access token hết hạn. Đây là lý do chính chọn "role trong DB" thay vì "role
 * trong claim" (§2 design doc) — bỏ dòng revoke đi là vứt luôn lý do đó.
 */
export async function disableStaff(
  actorId: string,
  targetId: string,
): Promise<StaffMutationResult> {
  const ctx = await actorAndTarget(actorId, targetId);
  if (!ctx) return { ok: false, reason: "KHONG_TIM_THAY" };

  const result = await db.transaction(async () => {
    const allowed = canDisable(ctx.actorRef, ctx.targetRef, await activeOwnerCount());
    if (!allowed.ok) return allowed;
    await db
      .update(schema.staffUsers)
      .set({ status: "DISABLED", updatedAt: new Date() })
      .where(eq(schema.staffUsers.id, targetId));
    return { ok: true } as const;
  });

  if (result.ok) await Session.revokeAllSessionsForUser(targetId);
  return result;
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `bun test apps/api/src/services/staff.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/staff.ts apps/api/src/services/staff.test.ts
git commit -m "feat(api): service staff_users — khoá tài khoản thu hồi session ngay, không đợi token"
```

---

## Task 7: Hàng rào — sửa `eslint.config.js` rồi chạy lại bộ probe

Guard plugin cần gọi `services/staff.ts`, nhưng policy hiện tại cho `api-plugins` đi tới `api-plugins | api-infra | shared-domain`. Task này mở đúng một cạnh và **không** mở cạnh `api-plugins → db`.

**Files:**

- Modify: `eslint.config.js:217-226`

- [ ] **Step 1: Sửa policy**

Modify `eslint.config.js` — thay khối policy `from: { element: { type: "api-plugins" } }`:

```js
            {
              from: { element: { type: "api-plugins" } },
              allow: {
                to: {
                  element: {
                    // `api-services` thêm 2026-08-10 cho plugins/staff-guard.ts: luật "mặc
                    // định chặn" phải chạy như một hook toàn cục (tức là plugin), nhưng nó
                    // cần đọc staff_users — và đọc DB là việc của services, y hệt routes.
                    // Cạnh này song song với `api-routes → api-services` đã có.
                    //
                    // ⚠️ CỐ Ý không thêm "db": plugin phải đi qua service, không được tự
                    // viết Drizzle. Probe ④ dưới đây khoá điều đó lại.
                    types: { anyOf: ["api-plugins", "api-services", "api-infra", "shared-domain"] },
                  },
                },
              },
            },
```

- [ ] **Step 2: Chạy probe ① — `api-root` → `db` phải bị chặn**

```bash
cp apps/api/src/index.ts /tmp/idx.bak
sed -i '1i import { schema } from "@v9/db";' apps/api/src/index.ts
bun x eslint apps/api/src/index.ts
cp /tmp/idx.bak apps/api/src/index.ts
```

Expected: nổ với **`boundaries/dependencies`** và thông điệp `no policy allowing dependencies from elements of type "api-root" to elements of type "db"`. Đọc **tên luật**, không nhìn exit code.

- [ ] **Step 3: Chạy probe ② — file không thuộc element nào phải bị chặn**

```bash
mkdir -p apps/api/src/nowhere && echo 'export const x = 1;' > apps/api/src/nowhere/x.ts
bun x eslint apps/api/src/nowhere/x.ts
rm -rf apps/api/src/nowhere
```

Expected: nổ với **`boundaries/no-unknown-files`**.

- [ ] **Step 4: Chạy probe ③ — mẫu Eden hợp lệ phải im**

```bash
bun x eslint apps/web/lib/api.ts apps/staff/src/lib/api.ts
```

Expected: không có lỗi boundaries.

- [ ] **Step 5: Chạy probe ④ (MỚI) — `api-plugins` → `db` vẫn phải bị chặn**

```bash
cp apps/api/src/plugins/timing.ts /tmp/timing.bak
sed -i '1i import { schema } from "@v9/db";' apps/api/src/plugins/timing.ts
bun x eslint apps/api/src/plugins/timing.ts
cp /tmp/timing.bak apps/api/src/plugins/timing.ts
```

Expected: nổ với **`boundaries/dependencies`**, `... from elements of type "api-plugins" to elements of type "db"`.

Probe này là thứ giữ cho cạnh vừa mở không âm thầm rộng ra thành "plugin làm gì cũng được". Nếu nó **không** nổ thì việc sửa ở Step 1 đã mở quá tay — dừng lại và sửa.

- [ ] **Step 6: Ghi probe ④ vào CLAUDE.md**

Modify `CLAUDE.md` — trong mục "⚠️ Hàng rào phải được probe", thêm probe ④ vào khối lệnh, kèm câu giải thích ở trên (một dòng): _"Probe ④ khoá cạnh `api-plugins → api-services` vừa mở ở đợt auth: plugin được gọi service, nhưng vẫn KHÔNG được tự viết Drizzle."_

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js CLAUDE.md
git commit -m "chore(lint): api-plugins gọi được api-services, và probe thứ tư khoá cạnh tới db"
```

---

## Task 8: Guard "mặc định chặn"

**Files:**

- Modify: `apps/api/src/plugins/auth.ts` (export helper dựng `PreParsedRequest`)
- Create: `apps/api/src/plugins/staff-guard.ts`
- Test: `apps/api/src/plugins/staff-guard.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Tách helper trong `auth.ts` để dùng lại**

Modify `apps/api/src/plugins/auth.ts` — đổi hàm dựng request thành export (nội dung giữ nguyên, chỉ đổi chỗ và thêm `export`):

```ts
/** Dùng chung với staff-guard.ts — hai chỗ dựng khác nhau là hai chỗ lệch nhau. */
export function toPreParsedRequest(request: Request): PreParsedRequest {
  return new PreParsedRequest({
    url: request.url,
    method: request.method.toLowerCase() as HTTPMethod,
    headers: request.headers,
    cookies: parseCookies(request.headers.get("cookie")),
    query: parseQuery(request.url),
    getJSONBody: () => request.json(),
    getFormBody: () => request.formData(),
  });
}
```

và trong route `/auth/*`, thay phần dựng inline bằng `const preParsedRequest = toPreParsedRequest(request);`.

- [ ] **Step 2: Viết test trước**

Create `apps/api/src/plugins/staff-guard.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { staffGuard } from "./staff-guard";

/**
 * Fixture route đăng ký SAU guard. Đây là hàng rào "mặc định chặn": route này
 * không nằm trong danh sách công khai nên phải bị chặn mà KHÔNG cần ai nhớ bật
 * gì cho nó. Test này xanh khi guard tắt là không chấp nhận được — nó phải đỏ.
 */
const app = new Elysia()
  .use(staffGuard)
  .get("/khong-khai-bao", () => ({ ok: true }))
  .get("/health", () => ({ status: "ok" }));

const call = (path: string) => app.handle(new Request(`http://localhost${path}`));

describe("staffGuard", () => {
  it("route không khai công khai → 401 khi không có session", async () => {
    expect((await call("/khong-khai-bao")).status).toBe(401);
  });

  it("/health nằm trong danh sách công khai → đi qua", async () => {
    expect((await call("/health")).status).toBe(200);
  });

  it("GET /vehicles công khai — apps/web SSG cần", async () => {
    expect((await call("/vehicles")).status).not.toBe(401);
  });

  it("/auth/* công khai", async () => {
    expect((await call("/auth/signin")).status).not.toBe(401);
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận đỏ**

Run: `bun test apps/api/src/plugins/staff-guard.test.ts`
Expected: FAIL — `Cannot find module './staff-guard'`.

- [ ] **Step 4: Implement guard**

Create `apps/api/src/plugins/staff-guard.ts`:

```ts
import { Elysia } from "elysia";
import Session from "supertokens-node/recipe/session";
import { CollectingResponse } from "supertokens-node/framework/custom";
import type { StaffRole } from "@v9/shared/domain/staff";
import { loadStaff } from "../services/staff";
import { toPreParsedRequest } from "./auth";

/**
 * MẶC ĐỊNH CHẶN. Route nào không khớp danh sách dưới đây thì đòi session hợp lệ
 * và hồ sơ ACTIVE. Gõ sai một mục thì route đó BỊ CHẶN, không phải lọt — sai
 * theo chiều an toàn. §4 docs/plans/2026-08-10-staff-auth-design.md.
 */
const CONG_KHAI: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "*", pattern: /^\/auth\// },
  { method: "GET", pattern: /^\/health/ },
  { method: "GET", pattern: /^\/vehicles(\/|$)/ }, // apps/web SSG cần
  { method: "POST", pattern: /^\/staff\/password-reset\/(request|confirm)$/ },
];

/**
 * Cần session, nhưng KHÔNG đòi ACTIVE. Đúng một mục, và phải đúng một mục: màn
 * "chờ duyệt" phải đọc được chính trạng thái của mình, nếu không người dùng chỉ
 * thấy màn hình trắng không giải thích được vì sao họ vào không được.
 */
const CAN_SESSION_KHONG_CAN_ACTIVE: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/staff\/me$/ },
];

const khop = (
  list: ReadonlyArray<{ method: string; pattern: RegExp }>,
  method: string,
  path: string,
) => list.some((r) => (r.method === "*" || r.method === method) && r.pattern.test(path));

/**
 * ⚠️ KHÔNG dùng `.state()` cho danh tính người gọi. `store` của Elysia là MỘT
 * object dùng chung cho cả tiến trình, không phải per-request — hai request đồng
 * thời sẽ ghi đè lên nhau và request này đọc ra nhân viên của request kia. Đó là
 * lỗ hổng phân quyền, và nó chỉ lộ ra khi có tải.
 *
 * `resolve` mới là thứ chạy per-request và bơm được vào context của handler.
 * Vòng đời Elysia: transform → derive/resolve → beforeHandle, nên `staff` đã sẵn
 * sàng khi hook chặn chạy, và cả hai dùng chung đúng một lần đọc DB.
 */
export const staffGuard = new Elysia({ name: "staff-guard" })
  .resolve({ as: "global" }, async ({ request, path }) => {
    // Thoát sớm cho route công khai: KHÔNG chạm DB. `/health` có perf budget
    // p95 < 5ms và không được phép mọc thêm một query vì đợt này.
    if (khop(CONG_KHAI, request.method.toUpperCase(), path)) return { staff: null };

    // sessionRequired: false → không ném khi thiếu session, ta tự quyết mã lỗi.
    // CollectingResponse hứng header refresh của SuperTokens; ta không trả nó về
    // vì 401 đã đủ tín hiệu cho interceptor của supertokens-web-js đi refresh.
    const session = await Session.getSession(
      toPreParsedRequest(request),
      new CollectingResponse(),
      {
        sessionRequired: false,
      },
    );
    if (!session) return { staff: null };
    return { staff: await loadStaff(session.getUserId()), userId: session.getUserId() };
  })
  .onBeforeHandle({ as: "global" }, ({ request, path, staff, userId, status }) => {
    const method = request.method.toUpperCase();
    if (khop(CONG_KHAI, method, path)) return;

    if (!userId) return status(401, { message: "Chưa đăng nhập", code: "CHUA_DANG_NHAP" });

    // Có session nhưng thiếu hàng = lớp bù trừ của signUpPOST đã hỏng (§2.1 design
    // doc). Trả 403 có mã riêng thay vì crash — người dùng thấy được lý do, OWNER
    // tìm ra được dấu vết.
    if (!staff) return status(403, { message: "Tài khoản chưa có hồ sơ", code: "CHUA_CO_HO_SO" });
    if (staff.status === "DISABLED") {
      return status(403, { message: "Tài khoản đã bị khoá", code: "DA_KHOA" });
    }

    if (khop(CAN_SESSION_KHONG_CAN_ACTIVE, method, path)) return;
    if (staff.status === "PENDING") {
      return status(403, { message: "Tài khoản đang chờ duyệt", code: "CHO_DUYET" });
    }
  });

/** Dùng trong route cần role cụ thể. Trả `null` khi đủ quyền. */
export function requireRole(staff: { role: StaffRole } | null, role: StaffRole) {
  if (!staff || staff.role !== role)
    return { message: "Không đủ quyền", code: "THIEU_QUYEN" as const };
  return null;
}
```

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `bun test apps/api/src/plugins/staff-guard.test.ts`
Expected: PASS, 4 tests.

Nếu test 1 trả **404** thay vì 401 thì hook `as: "global"` chưa áp lên route đăng ký sau — đó là lỗi thật, không phải chuyện của fixture. Sửa cho tới khi ra 401.

- [ ] **Step 6: Cắm vào app, ĐÚNG thứ tự**

Modify `apps/api/src/index.ts`:

```ts
import { staffGuard } from "./plugins/staff-guard";

const app = new Elysia()
  .use(cors())
  .use(timing)
  .use(auth)
  // ⚠️ PHẢI đứng trước mọi route nghiệp vụ. Đặt sau thì route đăng ký trước nó
  // không được bảo vệ, và không có gì báo lỗi.
  .use(staffGuard)
  .use(health)
  .use(vehicles)
  .listen({ port: env.port, hostname: env.host });
```

- [ ] **Step 7: Kiểm end-to-end bằng curl**

```bash
curl -s -o /dev/null -w 'health: %{http_code}\n'   localhost:3001/health
curl -s -o /dev/null -w 'vehicles: %{http_code}\n' localhost:3001/vehicles
curl -s -o /dev/null -w 'me: %{http_code}\n'       localhost:3001/staff/me
```

Expected: `health: 200`, `vehicles: 200`, `me: 401`.
`vehicles` mà ra 401 là đã làm vỡ trang công khai — sửa danh sách trước khi đi tiếp.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/plugins/staff-guard.ts apps/api/src/plugins/staff-guard.test.ts \
        apps/api/src/plugins/auth.ts apps/api/src/index.ts
git commit -m "feat(api): mặc định chặn — route không khai công khai thì đòi session"
```

---

## Task 9: `signUpPOST` ghi `staff_users`, kèm lớp bù trừ

**Files:**

- Modify: `apps/api/src/plugins/auth.ts`

- [ ] **Step 1: Bọc `signUpPOST`**

Modify `apps/api/src/plugins/auth.ts` — thêm vào object `override.apis` (cạnh hai dòng `undefined` của Task 5):

```ts
          signUpPOST: original.signUpPOST
            ? async (input) => {
                const response = await original.signUpPOST!(input);
                if (response.status !== "OK") return response;

                const field = (id: string) =>
                  input.formFields.find((f) => f.id === id)?.value as string | undefined;

                try {
                  await createPendingStaff({
                    id: response.user.id,
                    email: response.user.emails[0] ?? "",
                    fullName: field("hoTen")?.trim() || "(chưa đặt tên)",
                    phone: field("soDienThoai")?.trim() || undefined,
                  });
                } catch (e) {
                  // Hai ghi KHÔNG nguyên tử: SuperTokens ghi vào schema của nó, ta ghi
                  // vào public — không có transaction chung. Hỏng ở đây mà bỏ qua thì
                  // còn lại một user đăng nhập được nhưng không có hồ sơ.
                  // Lớp bù trừ: xoá user vừa tạo. Lớp thứ hai (staff-guard trả
                  // CHUA_CO_HO_SO) tồn tại vì chính lớp này cũng hỏng được.
                  // §2.1 docs/plans/2026-08-10-staff-auth-design.md.
                  console.error("Tạo staff_users thất bại, đang xoá user SuperTokens:", e);
                  await supertokens.deleteUser(response.user.id);
                  throw e;
                }
                return response;
              }
            : undefined,
```

và thêm import ở đầu file:

```ts
import { createPendingStaff } from "../services/staff";
```

- [ ] **Step 2: Đăng ký thật và kiểm hàng trong DB**

```bash
curl -s -X POST localhost:3001/auth/signup -H 'content-type: application/json' -d '{
  "formFields":[
    {"id":"email","value":"ztest-nv@v9.vn"},
    {"id":"password","value":"MatKhau123!"},
    {"id":"hoTen","value":"Nguyễn Văn Test"},
    {"id":"soDienThoai","value":"0901234567"}
  ]}' | head -c 200
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SELECT id, email, full_name, role, status FROM staff_users WHERE email='ztest-nv@v9.vn';"
```

Expected: response `{"status":"OK",...}`, và hàng trong DB có `role = STAFF`, `status = PENDING`.

- [ ] **Step 3: Kiểm PENDING bị chặn đúng chỗ**

```bash
# Đăng nhập, giữ cookie
curl -s -c /tmp/v9.cookie -X POST localhost:3001/auth/signin -H 'content-type: application/json' \
  -d '{"formFields":[{"id":"email","value":"ztest-nv@v9.vn"},{"id":"password","value":"MatKhau123!"}]}' > /dev/null
# /staff/me PHẢI đi qua (200) — màn chờ duyệt cần đọc được trạng thái của mình
curl -s -b /tmp/v9.cookie -o /dev/null -w 'me: %{http_code}\n' localhost:3001/staff/me
# route khác PHẢI 403 CHO_DUYET
curl -s -b /tmp/v9.cookie localhost:3001/staff/users
```

Expected: `me: 401` **ở bước này** (route `/staff/me` chưa tồn tại, sẽ có ở Task 11) — chấp nhận được;
`/staff/users` trả `403` với `"code":"CHO_DUYET"`. Chạy lại cả hai sau Task 11 và lúc đó `me` phải là `200`.

- [ ] **Step 4: Dọn user test**

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -tAc \
  "SELECT id FROM staff_users WHERE email='ztest-nv@v9.vn';"
# dùng id in ra ở trên:
curl -s -X POST http://localhost:3567/user/remove -H "api-key: $SUPERTOKENS_API_KEY" \
  -H 'cdi-version: 5.1' -H 'content-type: application/json' -d '{"userId":"<id>"}'
```

`ON DELETE CASCADE` không giúp chiều này (ta xoá phía SuperTokens), nên xoá hàng `staff_users` bằng tay nếu còn sót.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/auth.ts
git commit -m "feat(api): đăng ký ghi staff_users ở trạng thái PENDING, hỏng thì xoá user bù trừ"
```

---

## Task 10: Service quên mật khẩu bằng mã 6 số

**Files:**

- Create: `apps/api/src/services/email.ts`
- Create: `apps/api/src/services/password-reset.ts`
- Test: `apps/api/src/services/password-reset.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Khai `nodemailer` trực tiếp**

```bash
bun add --cwd apps/api nodemailer
bun add --cwd apps/api -d @types/nodemailer
```

Nó đang có sẵn như dependency bắc cầu của `supertokens-node`. Xài ké dep bắc cầu là vỡ ở một lần nâng version nào đó mà không ai đoán được.

- [ ] **Step 2: Service email**

Create `apps/api/src/services/email.ts`:

```ts
import { createTransport } from "nodemailer";
import { env } from "../env";

/** Chỗ DUY NHẤT trong repo biết SMTP là gì. */
const transport = env.smtp
  ? createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.password },
    })
  : null;

export const emailDaCauHinh = transport !== null;

export async function guiMaDatLaiMatKhau(to: string, ma: string): Promise<void> {
  if (!transport || !env.smtp) throw new Error("SMTP chưa cấu hình");
  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject: "Mã đặt lại mật khẩu — V9 Motor Rental",
    text: [
      `Mã đặt lại mật khẩu của bạn là: ${ma}`,
      "",
      "Mã có hiệu lực trong 10 phút và chỉ dùng được một lần.",
      "Nếu bạn không yêu cầu đặt lại mật khẩu, bỏ qua email này.",
    ].join("\n"),
  });
}
```

- [ ] **Step 3: Viết test trước cho service reset**

Create `apps/api/src/services/password-reset.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { and, eq, isNull, like } from "drizzle-orm";
import { db } from "../db";
import { kiemTraMa, taoMaDatLaiMatKhau } from "./password-reset";

const P = "ztest-prc-";
const ID = `${P}user`;

const clean = async () => {
  await db.delete(schema.passwordResetCodes).where(eq(schema.passwordResetCodes.staffUserId, ID));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
};

beforeAll(async () => {
  await clean();
  await db.insert(schema.staffUsers).values({
    id: ID,
    email: `${P}u@v9.vn`,
    fullName: "Người quên mật khẩu",
    status: "ACTIVE",
  });
});

afterAll(clean);

describe("taoMaDatLaiMatKhau", () => {
  it("ngoài production luôn sinh đúng 999999", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    expect(ma).toBe("999999");
  });

  it("xin mã mới thì mã cũ chết", async () => {
    await taoMaDatLaiMatKhau(ID);
    const rows = await db
      .select()
      .from(schema.passwordResetCodes)
      .where(eq(schema.passwordResetCodes.staffUserId, ID));
    expect(rows.filter((r) => r.usedAt === null)).toHaveLength(1);
  });
});

describe("kiemTraMa", () => {
  it("mã đúng thì hợp lệ", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    expect(await kiemTraMa(ID, ma)).toEqual({ ok: true });
  });

  it("mã sai thì tăng số lần thử", async () => {
    await taoMaDatLaiMatKhau(ID);
    expect(await kiemTraMa(ID, "000000")).toEqual({ ok: false, reason: "MA_SAI" });
    const [row] = await db
      .select()
      .from(schema.passwordResetCodes)
      .where(
        and(
          eq(schema.passwordResetCodes.staffUserId, ID),
          isNull(schema.passwordResetCodes.usedAt),
        ),
      );
    // Khoá đúng con số, không chỉ "hàng có tồn tại": bộ đếm không tăng thì giới
    // hạn 5 lần là trang trí, và test "sai 5 lần thì mã chết" bên dưới sẽ xanh
    // vì lý do sai.
    expect(row?.attempts).toBe(1);
  });

  it("sai 5 lần thì mã chết kể cả sau đó nhập đúng", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    for (let i = 0; i < 5; i++) await kiemTraMa(ID, "000000");
    expect(await kiemTraMa(ID, ma)).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
  });

  it("mã hết hạn thì không dùng được", async () => {
    const ma = await taoMaDatLaiMatKhau(ID);
    await db
      .update(schema.passwordResetCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.passwordResetCodes.staffUserId, ID));
    expect(await kiemTraMa(ID, ma)).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
  });

  it("không có mã nào thì báo hết hiệu lực, không phải crash", async () => {
    await db.delete(schema.passwordResetCodes).where(eq(schema.passwordResetCodes.staffUserId, ID));
    expect(await kiemTraMa(ID, "999999")).toEqual({ ok: false, reason: "MA_HET_HIEU_LUC" });
  });
});
```

- [ ] **Step 4: Chạy test, xác nhận đỏ**

Run: `bun test apps/api/src/services/password-reset.test.ts`
Expected: FAIL — `Cannot find module './password-reset'`.

- [ ] **Step 5: Implement**

Create `apps/api/src/services/password-reset.ts`:

```ts
import { and, desc, eq, isNull } from "drizzle-orm";
import { schema } from "@v9/db";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";
import { db } from "../db";
import { env } from "../env";

const HAN_DUNG_MS = 10 * 60 * 1000;
const SO_LAN_TOI_DA = 5;

/**
 * Chỉ MỘT thứ khác nhau giữa dev và prod. Toàn bộ phần còn lại — băm, hết hạn,
 * đếm lần sai, đổi mã lấy mật khẩu mới — chạy y hệt nhau ở cả hai môi trường.
 * Cố ý KHÔNG làm nhánh `if (ma === "999999") cho qua`: một cửa sau riêng nghĩa là
 * luồng chạy ở prod không phải luồng được test nhiều nhất.
 * §5.2 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * crypto.getRandomValues chứ KHÔNG phải Math.random — Math.random không hứa hẹn
 * gì về việc đoán được hay không, và mã đoán được là mã không bảo vệ gì.
 */
function sinhMa(): string {
  if (!env.isProduction) return env.devOtp;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String((buf[0] ?? 0) % 1_000_000).padStart(6, "0");
}

/** Trả về mã thô. Người gọi quyết định gửi nó đi đâu: email, hay màn hình OWNER. */
export async function taoMaDatLaiMatKhau(staffUserId: string): Promise<string> {
  const ma = sinhMa();
  await db.transaction(async (tx) => {
    // Xin mã mới thì mã cũ chết ngay — không để hai mã cùng sống.
    await tx
      .update(schema.passwordResetCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.passwordResetCodes.staffUserId, staffUserId),
          isNull(schema.passwordResetCodes.usedAt),
        ),
      );
    await tx.insert(schema.passwordResetCodes).values({
      staffUserId,
      codeHash: await Bun.password.hash(ma),
      expiresAt: new Date(Date.now() + HAN_DUNG_MS),
    });
  });
  return ma;
}

export type KetQuaKiemTra = { ok: true } | { ok: false; reason: "MA_SAI" | "MA_HET_HIEU_LUC" };

export async function kiemTraMa(staffUserId: string, ma: string): Promise<KetQuaKiemTra> {
  const [row] = await db
    .select()
    .from(schema.passwordResetCodes)
    .where(
      and(
        eq(schema.passwordResetCodes.staffUserId, staffUserId),
        isNull(schema.passwordResetCodes.usedAt),
      ),
    )
    .orderBy(desc(schema.passwordResetCodes.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: "MA_HET_HIEU_LUC" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "MA_HET_HIEU_LUC" };
  if (row.attempts >= SO_LAN_TOI_DA) return { ok: false, reason: "MA_HET_HIEU_LUC" };

  if (!(await Bun.password.verify(ma, row.codeHash))) {
    await db
      .update(schema.passwordResetCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(schema.passwordResetCodes.id, row.id));
    return { ok: false, reason: "MA_SAI" };
  }

  await db
    .update(schema.passwordResetCodes)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetCodes.id, row.id));
  return { ok: true };
}

export type KetQuaDoiMatKhau =
  | { ok: true }
  | { ok: false; reason: "MA_SAI" | "MA_HET_HIEU_LUC" | "KHONG_TIM_THAY" | "MAT_KHAU_YEU" };

/**
 * Token của SuperTokens được sinh Ở ĐÂY và dùng xong ngay trong cùng lời gọi —
 * không bao giờ chạm đĩa. Nghĩa là trong DB của ta không có chuỗi nào tự nó mở
 * được tài khoản. §5.1 design doc.
 */
export async function doiMatKhauBangMa(
  email: string,
  ma: string,
  matKhauMoi: string,
): Promise<KetQuaDoiMatKhau> {
  const staff = await timStaffTheoEmail(email);
  if (!staff) return { ok: false, reason: "KHONG_TIM_THAY" };

  const check = await kiemTraMa(staff.id, ma);
  if (!check.ok) return check;

  const token = await EmailPassword.createResetPasswordToken("public", staff.id, email);
  if (token.status !== "OK") return { ok: false, reason: "KHONG_TIM_THAY" };

  const reset = await EmailPassword.resetPasswordUsingToken("public", token.token, matKhauMoi);
  if (reset.status !== "OK") return { ok: false, reason: "MAT_KHAU_YEU" };

  // Đổi mật khẩu là lúc thu hồi mọi phiên cũ — kể cả phiên trên máy kẻ đã chiếm.
  await Session.revokeAllSessionsForUser(staff.id);
  return { ok: true };
}

export async function timStaffTheoEmail(email: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: schema.staffUsers.id, status: schema.staffUsers.status })
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.email, email));
  if (!row) return null;
  // Người bị khoá không được tự mở lại bằng luồng quên mật khẩu.
  if (row.status === "DISABLED") return null;
  return { id: row.id };
}
```

- [ ] **Step 6: Chạy test, xác nhận xanh**

Run: `bun test apps/api/src/services/password-reset.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/password-reset.ts apps/api/src/services/password-reset.test.ts \
        apps/api/src/services/email.ts apps/api/package.json bun.lock
git commit -m "feat(api): quên mật khẩu bằng mã 6 số — token SuperTokens không bao giờ chạm đĩa"
```

---

## Task 11: Route `/staff/*`

**Files:**

- Create: `apps/api/src/routes/staff.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Viết route**

Create `apps/api/src/routes/staff.ts`:

```ts
import { Elysia, t } from "elysia";
import { requireRole, staffGuard } from "../plugins/staff-guard";
import {
  approveStaff,
  changeStaffRole,
  disableStaff,
  listStaff,
  loadStaff,
} from "../services/staff";
import { emailDaCauHinh, guiMaDatLaiMatKhau } from "../services/email";
import {
  doiMatKhauBangMa,
  taoMaDatLaiMatKhau,
  timStaffTheoEmail,
} from "../services/password-reset";

const roleSchema = t.Union([t.Literal("OWNER"), t.Literal("STAFF"), t.Literal("SALES")]);
const statusSchema = t.Union([t.Literal("PENDING"), t.Literal("ACTIVE"), t.Literal("DISABLED")]);

const staffSchema = t.Object({
  id: t.String(),
  email: t.String(),
  fullName: t.String(),
  phone: t.Nullable(t.String()),
  role: roleSchema,
  status: statusSchema,
});

const loiSchema = t.Object({ message: t.String(), code: t.String() });

/** Dịch reason của domain sang HTTP. Route dịch, domain không biết HTTP là gì. */
const loi = (reason: string) => ({ message: thongDiep(reason), code: reason });

function thongDiep(reason: string): string {
  switch (reason) {
    case "KHONG_PHAI_OWNER":
      return "Chỉ chủ shop mới làm được việc này";
    case "TU_DUYET_MINH":
      return "Không tự duyệt tài khoản của chính mình";
    case "KHONG_CHO_DUYET":
      return "Tài khoản này không ở trạng thái chờ duyệt";
    case "TU_KHOA_MINH":
      return "Không tự khoá tài khoản của chính mình";
    case "OWNER_CUOI_CUNG":
      return "Đây là chủ shop cuối cùng — không hạ quyền hoặc khoá được";
    case "KHONG_TIM_THAY":
      return "Không tìm thấy nhân viên";
    default:
      return "Yêu cầu không hợp lệ";
  }
}

export const staff = new Elysia({ name: "staff" })
  .use(staffGuard)

  // `staff` tới từ `resolve` của staffGuard — per-request, không phải store dùng chung.
  .get(
    "/staff/me",
    ({ staff, status }) => {
      if (!staff) return status(404, loi("KHONG_TIM_THAY"));
      return status(200, staff);
    },
    { response: { 200: staffSchema, 404: loiSchema } },
  )

  .get(
    "/staff/users",
    async ({ query, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);
      return status(200, await listStaff(query.status));
    },
    {
      query: t.Object({ status: t.Optional(statusSchema) }),
      response: { 200: t.Array(staffSchema), 403: loiSchema },
    },
  )

  .post(
    "/staff/users/:id/approve",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);
      const res = await approveStaff(staff!.id, params.id, body.role);
      if (!res.ok) return status(409, loi(res.reason));
      return status(200, { ok: true as const });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ role: roleSchema }),
      response: { 200: t.Object({ ok: t.Boolean() }), 403: loiSchema, 409: loiSchema },
    },
  )

  .post(
    "/staff/users/:id/role",
    async ({ params, body, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);
      const res = await changeStaffRole(staff!.id, params.id, body.role);
      if (!res.ok) return status(409, loi(res.reason));
      return status(200, { ok: true as const });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ role: roleSchema }),
      response: { 200: t.Object({ ok: t.Boolean() }), 403: loiSchema, 409: loiSchema },
    },
  )

  .post(
    "/staff/users/:id/disable",
    async ({ params, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);
      const res = await disableStaff(staff!.id, params.id);
      if (!res.ok) return status(409, loi(res.reason));
      return status(200, { ok: true as const });
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: t.Object({ ok: t.Boolean() }), 403: loiSchema, 409: loiSchema },
    },
  )

  /** Đường cứu: OWNER phát mã, đọc qua Zalo. KHÔNG cần email. */
  .post(
    "/staff/users/:id/reset-code",
    async ({ params, staff, status }) => {
      const denied = requireRole(staff, "OWNER");
      if (denied) return status(403, denied);
      const target = await loadStaff(params.id);
      if (!target) return status(404, loi("KHONG_TIM_THAY"));
      return status(200, { code: await taoMaDatLaiMatKhau(target.id) });
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: t.Object({ code: t.String() }), 403: loiSchema, 404: loiSchema },
    },
  )

  .post(
    "/staff/password-reset/request",
    async ({ body, status }) => {
      if (!emailDaCauHinh) {
        return status(503, {
          message: "Hệ thống chưa cấu hình email — liên hệ chủ shop để lấy mã",
          code: "CHUA_CAU_HINH_EMAIL",
        });
      }
      const found = await timStaffTheoEmail(body.email);
      if (found) {
        const ma = await taoMaDatLaiMatKhau(found.id);
        await guiMaDatLaiMatKhau(body.email, ma);
      }
      // LUÔN 200, kể cả email không tồn tại: không để ai dò xem shop có những
      // email nào. §5.1 design doc.
      return status(200, { ok: true as const });
    },
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
      response: { 200: t.Object({ ok: t.Boolean() }), 503: loiSchema },
    },
  )

  .post(
    "/staff/password-reset/confirm",
    async ({ body, status }) => {
      const res = await doiMatKhauBangMa(body.email, body.code, body.matKhauMoi);
      if (!res.ok) return status(400, loi(res.reason));
      return status(200, { ok: true as const });
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        code: t.String({ minLength: 6, maxLength: 6 }),
        matKhauMoi: t.String({ minLength: 8 }),
      }),
      response: { 200: t.Object({ ok: t.Boolean() }), 400: loiSchema },
    },
  );
```

- [ ] **Step 2: Cắm vào app**

Modify `apps/api/src/index.ts` — thêm `.use(staff)` sau `.use(vehicles)` và import tương ứng.

- [ ] **Step 3: Kiểm bằng curl**

```bash
curl -s -o /dev/null -w 'me không cookie: %{http_code}\n' localhost:3001/staff/me
curl -s -X POST localhost:3001/staff/password-reset/request -H 'content-type: application/json' \
  -d '{"email":"khong-ton-tai@v9.vn"}'
```

Expected: `me không cookie: 401`. Request reset: `503` nếu chưa cấu hình SMTP, hoặc `{"ok":true}` nếu đã cấu hình — **cả hai đều đúng**, nhưng không bao giờ được lộ ra email đó có tồn tại hay không.

- [ ] **Step 4: Typecheck + lint + test toàn bộ**

Run: `bun run typecheck && bun run lint && bun test`
Expected: exit 0 cả ba.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/staff.ts apps/api/src/index.ts
git commit -m "feat(api): route /staff/* — duyệt, đổi role, khoá, và phát mã đặt lại mật khẩu"
```

---

## Task 12: Script tạo OWNER đầu tiên

**Files:**

- Create: `scripts/staff-bootstrap.ts`
- Modify: `package.json`

- [ ] **Step 1: Viết script**

Create `scripts/staff-bootstrap.ts`:

```ts
/**
 * Tạo chủ shop đầu tiên. Không có script này thì hệ thống tự khoá chính nó lúc
 * mới dựng: ai đăng ký cũng ra PENDING, mà chỉ OWNER mới duyệt được.
 *
 * Chạy lại nhiều lần vô hại — cùng khuôn với scripts/directus-setup.ts.
 *
 *   STAFF_OWNER_EMAIL=chu@shop.vn bun run staff:bootstrap
 */
import { SQL } from "bun";
import supertokens from "supertokens-node";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";

const email = process.env.STAFF_OWNER_EMAIL;
if (!email) throw new Error("Thiếu STAFF_OWNER_EMAIL — xem .env.example");

const matKhau = process.env.STAFF_OWNER_PASSWORD ?? "DoiMatKhauNgay!1";
const hoTen = process.env.STAFF_OWNER_NAME ?? "Chủ shop";

supertokens.init({
  framework: "custom",
  supertokens: {
    connectionURI: process.env.SUPERTOKENS_CONNECTION_URI ?? "http://localhost:3567",
    apiKey: process.env.SUPERTOKENS_API_KEY,
  },
  appInfo: {
    appName: "V9 Motor Rental",
    apiDomain: process.env.API_DOMAIN ?? "http://localhost:3001",
    websiteDomain: process.env.STAFF_APP_URL ?? "http://localhost:3003",
    apiBasePath: "/auth",
    websiteBasePath: "/auth",
  },
  recipeList: [EmailPassword.init(), Session.init()],
});

const users = await supertokens.listUsersByAccountInfo("public", { email });
let userId = users[0]?.id;

if (userId) {
  console.warn(`User SuperTokens đã tồn tại: ${userId}`);
} else {
  const created = await EmailPassword.signUp("public", email, matKhau);
  if (created.status !== "OK") throw new Error(`Tạo user thất bại: ${created.status}`);
  userId = created.user.id;
  console.warn(`Đã tạo user SuperTokens: ${userId}`);
  console.warn(`Mật khẩu tạm: ${matKhau} — ĐỔI NGAY sau lần đăng nhập đầu.`);
}

const sql = new SQL(process.env.DATABASE_URL!);
await sql`
  INSERT INTO staff_users (id, email, full_name, role, status, approved_at)
  VALUES (${userId}, ${email}, ${hoTen}, 'OWNER', 'ACTIVE', now())
  ON CONFLICT (id) DO UPDATE
    SET role = 'OWNER', status = 'ACTIVE', updated_at = now()
`;
await sql.end();

console.warn(`OWNER sẵn sàng: ${email}`);
```

- [ ] **Step 2: Khai script ở root, KÈM `--env-file`**

Modify `package.json` — thêm vào `scripts`:

```json
    "staff:bootstrap": "bun --env-file=.env scripts/staff-bootstrap.ts",
```

Thiếu `--env-file` thì script chạy với env rỗng và `DATABASE_URL` là `undefined` — xem luật ở `CLAUDE.md`.

- [ ] **Step 3: Chạy, rồi chạy lại lần nữa**

```bash
bun run staff:bootstrap
bun run staff:bootstrap     # lần hai PHẢI không lỗi
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SELECT email, role, status FROM staff_users WHERE role='OWNER';"
```

Expected: lần một tạo user, lần hai in "User SuperTokens đã tồn tại", DB có đúng một hàng OWNER/ACTIVE.

- [ ] **Step 4: Kiểm script nằm trong tầm typecheck**

Run: `bun run typecheck`
Expected: exit 0. `scripts/tsconfig.json` có `"include": ["**/*.ts"]` nên file mới tự được phủ — nhưng phải chạy để biết chắc, không phải đọc config rồi tin.

- [ ] **Step 5: Commit**

```bash
git add scripts/staff-bootstrap.ts package.json
git commit -m "feat(scripts): staff:bootstrap tạo OWNER đầu tiên, chạy lại nhiều lần vô hại"
```

---

## Task 13: Siết CORS

**Files:**

- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Xác nhận `apps/web` không gọi API từ trình duyệt**

```bash
grep -rn "use client" apps/web --include=*.tsx -l | xargs -r grep -ln "api\." || echo "KHÔNG có client component nào gọi api"
```

Expected: in ra `KHÔNG có client component nào gọi api`. Nếu có file nào hiện ra, **dừng lại** và thêm origin của web vào danh sách ở bước sau — siết mù sẽ làm vỡ trang công khai.

- [ ] **Step 2: Sửa cấu hình**

Modify `apps/api/src/index.ts`:

```ts
const app = new Elysia()
  // ⚠️ cors() gọi không tham số có mặc định origin: true + credentials: true —
  // tức PHẢN CHIẾU mọi Origin kèm cookie. Vô hại khi chưa có session; từ đợt này
  // trở đi thì bất kỳ trang nào cũng gọi được API bằng cookie của nhân viên và
  // đọc được response. §7 docs/plans/2026-08-10-staff-auth-design.md.
  .use(
    cors({
      origin: [env.staffAppUrl],
      credentials: true,
      allowedHeaders: ["content-type", ...supertokens.getAllCORSHeaders()],
    }),
  );
```

kèm `import supertokens from "supertokens-node";`.

- [ ] **Step 3: Kiểm cả hai chiều**

```bash
curl -s -D- -o /dev/null -H 'Origin: http://localhost:3003' localhost:3001/health | grep -i 'access-control-allow-origin'
curl -s -D- -o /dev/null -H 'Origin: https://ke-la.com'     localhost:3001/health | grep -i 'access-control-allow-origin'
```

Expected: lệnh đầu in `access-control-allow-origin: http://localhost:3003`; lệnh sau **không in gì**.

Chỉ kiểm một chiều là không kiểm gì: một cấu hình chặn tất cũng làm lệnh sau im.

- [ ] **Step 4: `cookieDomain` cho prod**

Modify `apps/api/src/plugins/auth.ts` — đổi `Session.init()` trong `recipeList`:

```ts
    Session.init({
      // Prod tách subdomain: staff.$ROOT_DOMAIN gọi api.$ROOT_DOMAIN. Đặt cookie ở
      // domain cha để cookie đi được giữa hai subdomain. Ở dev cả hai cùng
      // `localhost` (cổng không tính vào "site") nên KHÔNG đặt — đặt "localhost"
      // làm cookieDomain là cách làm hỏng dev mà không lỗi ở đâu cả.
      //
      // ⚠️ Vế này KHÔNG verify được ở localhost. Tiêu chí #13 của design doc chỉ
      // đóng lại bằng một lần đăng nhập thật trên stack đã deploy.
      ...(process.env.ROOT_DOMAIN ? { cookieDomain: `.${process.env.ROOT_DOMAIN}` } : {}),
    }),
```

Run: `bun test && curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/health`
Expected: test xanh, `/health` trả 200 — tức dev **không** bị đặt `cookieDomain` và không có gì vỡ.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/plugins/auth.ts
git commit -m "fix(api): CORS chỉ nhận origin của staff — không phản chiếu mọi Origin kèm cookie"
```

---

## Task 14: `apps/staff` — nối SuperTokens

**Files:**

- Modify: `apps/staff/package.json`
- Create: `apps/staff/src/lib/auth.ts`, `apps/staff/src/lib/me.ts`
- Modify: `apps/staff/src/main.tsx`

- [ ] **Step 1: Cài SDK**

```bash
bun add --cwd apps/staff supertokens-web-js
```

- [ ] **Step 2: Lớp auth**

Create `apps/staff/src/lib/auth.ts`:

```ts
import SuperTokens from "supertokens-web-js";
import EmailPassword from "supertokens-web-js/recipe/emailpassword";
import Session from "supertokens-web-js/recipe/session";

const apiDomain = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * Session.init() vá window.fetch để tự gọi /auth/session/refresh khi access token
 * hết hạn rồi chạy lại request. Eden Treaty gọi qua globalThis.fetch nên
 * src/lib/api.ts ăn theo mà không phải bọc gì — đó là lý do chọn web-js thay vì
 * tự fetch thẳng /auth/*. §6 docs/plans/2026-08-10-staff-auth-design.md.
 */
export function initAuth() {
  SuperTokens.init({
    appInfo: { appName: "V9 Motor Rental", apiDomain, apiBasePath: "/auth" },
    recipeList: [EmailPassword.init(), Session.init()],
  });
}

export async function dangNhap(email: string, matKhau: string) {
  const res = await EmailPassword.signIn({
    formFields: [
      { id: "email", value: email },
      { id: "password", value: matKhau },
    ],
  });
  if (res.status === "OK") return { ok: true as const };
  if (res.status === "WRONG_CREDENTIALS_ERROR") {
    return { ok: false as const, message: "Email hoặc mật khẩu không đúng" };
  }
  return { ok: false as const, message: "Không đăng nhập được, thử lại sau" };
}

export async function dangKy(input: {
  email: string;
  matKhau: string;
  hoTen: string;
  soDienThoai: string;
}) {
  const res = await EmailPassword.signUp({
    formFields: [
      { id: "email", value: input.email },
      { id: "password", value: input.matKhau },
      { id: "hoTen", value: input.hoTen },
      { id: "soDienThoai", value: input.soDienThoai },
    ],
  });
  if (res.status === "OK") return { ok: true as const };
  if (res.status === "FIELD_ERROR") {
    return { ok: false as const, message: res.formFields.map((f) => f.error).join(" · ") };
  }
  return { ok: false as const, message: "Không đăng ký được, thử lại sau" };
}

export const dangXuat = () => Session.signOut();
export const coSession = () => Session.doesSessionExist();
```

- [ ] **Step 3: Query `/staff/me` dùng chung**

Create `apps/staff/src/lib/me.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface Me {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: "OWNER" | "STAFF" | "SALES";
  status: "PENDING" | "ACTIVE" | "DISABLED";
}

/**
 * Một nguồn duy nhất cho "tôi là ai": guard của router và UI đọc cùng cache.
 * Hai chỗ gọi riêng là hai chỗ lệch nhau sau lần đầu tiên ai đó thêm điều kiện.
 */
export const meQuery = {
  queryKey: ["me"] as const,
  queryFn: async (): Promise<Me | null> => {
    const res = await api.staff.me.get();
    if (res.error) return null;
    return res.data as Me;
  },
};

export const layMe = (qc: QueryClient) => qc.ensureQueryData(meQuery);
```

- [ ] **Step 4: Gọi `initAuth()` trước khi render**

Modify `apps/staff/src/main.tsx` — thêm import và gọi ngay trước `createRoot`:

```ts
import { initAuth } from "./lib/auth";

initAuth();
```

- [ ] **Step 5: Build thử**

Run: `bun run --filter @v9/staff build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/staff/package.json apps/staff/src/lib/auth.ts apps/staff/src/lib/me.ts \
        apps/staff/src/main.tsx bun.lock
git commit -m "feat(staff): nối supertokens-web-js, Eden ăn theo interceptor refresh"
```

---

## Task 15: Router hai nhánh + guard

**Files:**

- Modify: `apps/staff/src/router.tsx`, `apps/staff/src/main.tsx`

- [ ] **Step 1: Viết lại router**

Modify `apps/staff/src/router.tsx`:

```tsx
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { HealthPage } from "./pages/health";
import { DangNhapPage } from "./pages/dang-nhap";
import { DangKyPage } from "./pages/dang-ky";
import { QuenMatKhauPage } from "./pages/quen-mat-khau";
import { ChoDuyetPage } from "./pages/cho-duyet";
import { NhanVienPage } from "./pages/nhan-vien";
import { coSession, dangXuat } from "./lib/auth";
import { layMe } from "./lib/me";

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
});

const congKhai = createRoute({
  getParentRoute: () => rootRoute,
  id: "cong-khai",
  component: Outlet,
});

/**
 * Guard. Trang `/` (health) nằm dưới nhánh này CÓ CHỦ Ý: nó là bằng chứng
 * end-to-end rằng guard chạy, thay vì một trang test rỗng không ai mở.
 */
const duocBaoVe = createRoute({
  getParentRoute: () => rootRoute,
  id: "duoc-bao-ve",
  component: Outlet,
  beforeLoad: async ({ context }) => {
    if (!(await coSession())) throw redirect({ to: "/dang-nhap" });
    const me = await layMe(context.queryClient);
    if (!me) throw redirect({ to: "/dang-nhap" });
    if (me.status === "PENDING") throw redirect({ to: "/cho-duyet" });
    if (me.status === "DISABLED") {
      await dangXuat();
      throw redirect({ to: "/dang-nhap", search: { ly_do: "da-khoa" } });
    }
    return { me };
  },
});

const route = (
  parent: typeof congKhai | typeof duocBaoVe,
  path: string,
  component: React.ComponentType,
) => createRoute({ getParentRoute: () => parent, path, component });

const routeTree = rootRoute.addChildren([
  congKhai.addChildren([
    route(congKhai, "/dang-nhap", DangNhapPage),
    route(congKhai, "/dang-ky", DangKyPage),
    route(congKhai, "/quen-mat-khau", QuenMatKhauPage),
    route(congKhai, "/cho-duyet", ChoDuyetPage),
  ]),
  duocBaoVe.addChildren([
    route(duocBaoVe, "/", HealthPage),
    route(duocBaoVe, "/nhan-vien", NhanVienPage),
  ]),
]);

export const createAppRouter = (queryClient: QueryClient) =>
  createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
```

- [ ] **Step 2: Truyền `queryClient` vào router**

Modify `apps/staff/src/main.tsx` — thay `import { router }` bằng:

```tsx
const queryClient = new QueryClient();
const router = createAppRouter(queryClient);
```

- [ ] **Step 3: Build (sẽ đỏ vì chưa có 5 trang)**

Run: `bun run --filter @v9/staff build`
Expected: FAIL — không tìm thấy `./pages/dang-nhap` v.v. Task 16 tạo chúng.

---

## Task 16: Năm màn hình

**Files:**

- Create: `apps/staff/src/pages/dang-nhap.tsx`, `dang-ky.tsx`, `quen-mat-khau.tsx`, `cho-duyet.tsx`, `nhan-vien.tsx`

- [ ] **Step 1: Đăng nhập**

Create `apps/staff/src/pages/dang-nhap.tsx`:

```tsx
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { dangNhap } from "../lib/auth";

export function DangNhapPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { ly_do?: string };
  const [email, setEmail] = useState("");
  const [matKhau, setMatKhau] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDangGui(true);
    setLoi(null);
    const res = await dangNhap(email, matKhau);
    setDangGui(false);
    if (res.ok) await navigate({ to: "/" });
    else setLoi(res.message);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Đăng nhập</h1>
      {search.ly_do === "da-khoa" && (
        <p className="mt-3 rounded bg-amber-100 p-3 text-sm">
          Tài khoản của bạn đã bị khoá. Liên hệ chủ shop.
        </p>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mật khẩu
          <input
            type="password"
            required
            value={matKhau}
            onChange={(e) => setMatKhau(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        {loi && <p className="text-sm text-red-600">{loi}</p>}
        <button
          type="submit"
          disabled={dangGui}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {dangGui ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/dang-ky" className="underline">
          Tạo tài khoản
        </Link>
        <Link to="/quen-mat-khau" className="underline">
          Quên mật khẩu
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Đăng ký**

Create `apps/staff/src/pages/dang-ky.tsx`:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { dangKy } from "../lib/auth";

export function DangKyPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ hoTen: "", soDienThoai: "", email: "", matKhau: "" });
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDangGui(true);
    setLoi(null);
    const res = await dangKy(form);
    setDangGui(false);
    // Đăng ký xong SuperTokens đã tạo session, nhưng tài khoản ở trạng thái chờ
    // duyệt — nên đi thẳng tới màn giải thích, không phải trang chủ.
    if (res.ok) await navigate({ to: "/cho-duyet" });
    else setLoi(res.message);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Tạo tài khoản nhân viên</h1>
      <p className="mt-2 text-sm text-gray-600">
        Tài khoản cần chủ shop duyệt trước khi dùng được.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        {(
          [
            ["hoTen", "Họ và tên", "text"],
            ["soDienThoai", "Số điện thoại", "tel"],
            ["email", "Email", "email"],
            ["matKhau", "Mật khẩu (ít nhất 8 ký tự)", "password"],
          ] as const
        ).map(([key, nhan, type]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            {nhan}
            <input
              type={type}
              required={key !== "soDienThoai"}
              value={form[key]}
              onChange={set(key)}
              className="rounded border px-3 py-2"
            />
          </label>
        ))}
        {loi && <p className="text-sm text-red-600">{loi}</p>}
        <button
          type="submit"
          disabled={dangGui}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {dangGui ? "Đang gửi…" : "Đăng ký"}
        </button>
      </form>
      <Link to="/dang-nhap" className="mt-4 inline-block text-sm underline">
        Đã có tài khoản
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Quên mật khẩu (hai bước, một route)**

Create `apps/staff/src/pages/quen-mat-khau.tsx`:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";

export function QuenMatKhauPage() {
  const navigate = useNavigate();
  const [buoc, setBuoc] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [matKhauMoi, setMatKhauMoi] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState<string | null>(null);

  async function guiYeuCau(e: React.FormEvent) {
    e.preventDefault();
    setLoi(null);
    const res = await api.staff["password-reset"].request.post({ email });
    if (res.error) {
      // 503 = chưa cấu hình email. Nói thẳng đường cứu thay vì để người dùng đoán.
      setLoi("Hệ thống chưa gửi được email — nhắn chủ shop để lấy mã.");
      setBuoc(2);
      return;
    }
    setGhiChu("Nếu email tồn tại, mã 6 số đã được gửi. Mã sống 10 phút.");
    setBuoc(2);
  }

  async function xacNhan(e: React.FormEvent) {
    e.preventDefault();
    setLoi(null);
    const res = await api.staff["password-reset"].confirm.post({ email, code, matKhauMoi });
    if (res.error) {
      setLoi("Mã không đúng hoặc đã hết hiệu lực.");
      return;
    }
    await navigate({ to: "/dang-nhap" });
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Quên mật khẩu</h1>
      {buoc === 1 ? (
        <form onSubmit={guiYeuCau} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Gửi mã
          </button>
        </form>
      ) : (
        <form onSubmit={xacNhan} className="mt-4 flex flex-col gap-3">
          {ghiChu && <p className="text-sm text-gray-600">{ghiChu}</p>}
          {import.meta.env.DEV && (
            <p className="rounded bg-gray-100 p-2 text-sm">Môi trường dev: mã luôn là 999999</p>
          )}
          <label className="flex flex-col gap-1 text-sm">
            Mã 6 số
            <input
              inputMode="numeric"
              required
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded border px-3 py-2 tracking-widest"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Mật khẩu mới (ít nhất 8 ký tự)
            <input
              type="password"
              required
              minLength={8}
              value={matKhauMoi}
              onChange={(e) => setMatKhauMoi(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </label>
          {loi && <p className="text-sm text-red-600">{loi}</p>}
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Đặt mật khẩu mới
          </button>
        </form>
      )}
      <Link to="/dang-nhap" className="mt-4 inline-block text-sm underline">
        Quay lại đăng nhập
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Chờ duyệt**

Create `apps/staff/src/pages/cho-duyet.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { dangXuat } from "../lib/auth";
import { meQuery } from "../lib/me";

export function ChoDuyetPage() {
  const navigate = useNavigate();
  // Poll: OWNER duyệt ở máy khác, nhân viên không phải tự tải lại trang.
  const { data } = useQuery({ ...meQuery, refetchInterval: 15_000 });

  if (data?.status === "ACTIVE") void navigate({ to: "/" });

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Đang chờ duyệt</h1>
      <p className="mt-3 text-sm text-gray-700">
        Tài khoản <strong>{data?.email}</strong> đã tạo xong và đang chờ chủ shop duyệt. Trang này
        tự cập nhật khi được duyệt.
      </p>
      <button
        onClick={async () => {
          await dangXuat();
          await navigate({ to: "/dang-nhap" });
        }}
        className="mt-4 rounded border px-3 py-2 text-sm"
      >
        Đăng xuất
      </button>
    </main>
  );
}
```

- [ ] **Step 5: Quản lý nhân viên (OWNER)**

Create `apps/staff/src/pages/nhan-vien.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { meQuery, type Me } from "../lib/me";

export function NhanVienPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const [ma, setMa] = useState<{ id: string; code: string } | null>(null);

  const { data: dsNhanVien } = useQuery({
    queryKey: ["staff-users"],
    queryFn: async () => {
      const res = await api.staff.users.get({ query: {} });
      if (res.error) throw new Error("Không tải được danh sách");
      return res.data as Me[];
    },
    enabled: me?.role === "OWNER",
  });

  const lamMoi = () => qc.invalidateQueries({ queryKey: ["staff-users"] });

  const duyet = useMutation({
    mutationFn: (id: string) => api.staff.users({ id }).approve.post({ role: "STAFF" }),
    onSuccess: lamMoi,
  });
  const khoa = useMutation({
    mutationFn: (id: string) => api.staff.users({ id }).disable.post(),
    onSuccess: lamMoi,
  });
  const phatMa = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.staff.users({ id })["reset-code"].post();
      if (res.error) throw new Error("Không phát được mã");
      return { id, code: (res.data as { code: string }).code };
    },
    onSuccess: setMa,
  });

  if (me?.role !== "OWNER") return <main className="p-6">Trang này chỉ dành cho chủ shop.</main>;

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">Nhân viên</h1>
      {ma && (
        <p className="mt-3 rounded bg-gray-100 p-3 text-sm">
          Mã đặt lại mật khẩu: <strong className="tracking-widest">{ma.code}</strong> — đọc cho nhân
          viên qua Zalo. Mã sống 10 phút.
        </p>
      )}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Họ tên</th>
            <th>Email</th>
            <th>Điện thoại</th>
            <th>Vai trò</th>
            <th>Trạng thái</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {dsNhanVien?.map((nv) => (
            <tr key={nv.id} className="border-b">
              <td className="py-2">{nv.fullName}</td>
              <td>{nv.email}</td>
              <td>{nv.phone ?? "—"}</td>
              <td>{nv.role}</td>
              <td>{nv.status}</td>
              <td className="flex gap-2 py-2">
                {nv.status === "PENDING" && (
                  <button onClick={() => duyet.mutate(nv.id)} className="rounded border px-2 py-1">
                    Duyệt
                  </button>
                )}
                {nv.status === "ACTIVE" && nv.id !== me.id && (
                  <button onClick={() => khoa.mutate(nv.id)} className="rounded border px-2 py-1">
                    Khoá
                  </button>
                )}
                <button onClick={() => phatMa.mutate(nv.id)} className="rounded border px-2 py-1">
                  Phát mã
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 6: Build**

Run: `bun run --filter @v9/staff build`
Expected: exit 0.

Nếu Eden báo lỗi type ở `api.staff...`, nguyên nhân gần như luôn là route thiếu `response` schema ở Task 11 — Eden suy `unknown` khi không có schema. Sửa ở route, đừng ép kiểu ở frontend.

- [ ] **Step 7: Commit**

```bash
git add apps/staff/src/pages apps/staff/src/router.tsx apps/staff/src/main.tsx
git commit -m "feat(staff): đăng nhập, đăng ký, quên mật khẩu, chờ duyệt, quản lý nhân viên"
```

---

## Task 17: PWA không được cache `/auth` và `/staff`

**Files:**

- Modify: `apps/staff/vite.config.ts`

- [ ] **Step 1: Thêm denylist**

Modify `apps/staff/vite.config.ts` — thêm vào object truyền cho `VitePWA`, cạnh `registerType`:

```ts
      workbox: {
        // Service worker KHÔNG được trả app shell cho đường dẫn API. Không loại
        // trừ thì có ngày app hiện màn hình đã-đăng-nhập lấy từ cache trong khi
        // session đã chết. §6 docs/plans/2026-08-10-staff-auth-design.md.
        navigateFallbackDenylist: [/^\/auth\//, /^\/staff\//],
      },
```

- [ ] **Step 2: Kiểm trên BẢN BUILD, không phải dev**

```bash
bun run --filter @v9/staff build
grep -o 'navigateFallbackDenylist' apps/staff/dist/sw.js || \
  grep -rn 'denylist' apps/staff/dist/*.js | head -3
```

Expected: tìm thấy dấu vết denylist trong service worker đã build. `vite-plugin-pwa` không chạy ở `vite dev` — kiểm ở dev rồi kết luận là kết luận sai.

- [ ] **Step 3: Commit**

```bash
git add apps/staff/vite.config.ts
git commit -m "fix(staff): service worker không cache /auth và /staff"
```

---

## Task 18: Cập nhật tài liệu

Bốn file đang **nói sai** sau đợt này. Tài liệu là deliverable ngang hàng với code trong repo này.

**Files:**

- Modify: `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/staff/CLAUDE.md`, `PRODUCT.md`

- [ ] **Step 1: `CLAUDE.md` gốc**

Sửa mục "Xác thực: SuperTokens cho `apps/staff`, không có gì cho `apps/web`":

- Bỏ câu "**Hiện chưa route nào enforce auth và chưa có màn hình đăng nhập**".
- Thêm: luật mặc định chặn nằm ở `apps/api/src/plugins/staff-guard.ts`, hai danh sách công khai, và mã dev `999999` gắn vào `NODE_ENV` chứ không vào việc thiếu SMTP.

Sửa mục "Việc còn để lại":

- Bỏ `enforce auth trên route thật (SuperTokens đã nối, chưa route nào dùng)`.
- Thêm vào phần nghiệp vụ: `rentals` phải FK tới `staff_users` cho "ai bàn giao xe".

- [ ] **Step 2: `apps/api/CLAUDE.md`**

Sửa mục "Seam auth":

- "**Chưa có:** không route nghiệp vụ nào enforce auth" → mô tả mặc định chặn.
- Thêm cảnh báo: `POST /auth/user/password/reset/token` **đã tắt bằng override** và phải trả 404; nếu một ngày nó trả 400 trở lại thì override đã mất và hệ thống có hai luồng reset song song.

- [ ] **Step 3: `apps/staff/CLAUDE.md`**

Sửa mục "Xác thực: SuperTokens — đã nối ở API, **chưa có màn hình đăng nhập ở đây**": mô tả 5 route mới và guard ở `beforeLoad`.

- [ ] **Step 4: `PRODUCT.md`**

Thêm vào phần nhân sự: nhân viên tự đăng ký, chủ shop duyệt; chủ shop phát mã đặt lại mật khẩu qua Zalo khi nhân viên không vào được email.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md apps/api/CLAUDE.md apps/staff/CLAUDE.md PRODUCT.md
git commit -m "docs: bốn file nói sai sau khi apps/staff có đăng nhập"
```

---

## Task 19: Verify toàn bộ, đọc output chứ không suy luận

Bước này không phải hình thức. Trong repo này mọi lỗi nghiêm trọng đều lộ ra ở bước verify, không ở bước đọc code.

- [ ] **Step 1: Bộ ba lệnh của repo**

```bash
bun test && bun run typecheck && bun run lint
```

Expected: exit 0 cả ba.

- [ ] **Step 2: Ba tiêu chí quan trọng nhất**

```bash
# ① Luồng reset cũ của SuperTokens đã chết
curl -s -o /dev/null -w '① reset/token (phải 404): %{http_code}\n' -X POST \
  localhost:3001/auth/user/password/reset/token -H 'content-type: application/json' -d '{}'
# ② Mặc định chặn
bun test apps/api/src/plugins/staff-guard.test.ts
# ③ Cấu hình dev không lọt vào prod
bun test apps/api/src/env.test.ts
```

Expected: `404`; hai test file PASS.

- [ ] **Step 3: Luồng người dùng thật, đầu tới cuối**

```bash
bun run staff:bootstrap                       # OWNER
bun run dev                                    # api + web + staff
```

Rồi trong trình duyệt: mở `http://localhost:3003` → bị đẩy về `/dang-nhap` → đăng ký một tài khoản mới → thấy màn "chờ duyệt" → đăng nhập bằng OWNER ở cửa sổ ẩn danh → `/nhan-vien` → bấm Duyệt → cửa sổ kia tự vào được trang chủ trong vòng 15 giây.

- [ ] **Step 4: Khoá tài khoản có hiệu lực NGAY**

Với nhân viên vừa duyệt đang đăng nhập ở cửa sổ kia: OWNER bấm **Khoá**, rồi ở cửa sổ nhân viên tải lại trang.

Expected: bị đẩy về `/dang-nhap` với thông báo đã khoá — **không** phải đợi token hết hạn. Nếu vẫn vào được thì `revokeAllSessionsForUser` chưa chạy, và lý do chính của cả kiến trúc §2 đã mất.

- [ ] **Step 5: Quên mật khẩu bằng 999999**

Đăng xuất, `/quen-mat-khau`, nhập email nhân viên, nhập `999999` + mật khẩu mới, rồi đăng nhập bằng mật khẩu mới.

Expected: vào được. Nếu SMTP chưa cấu hình, bước một hiện thông báo "nhắn chủ shop" nhưng **vẫn cho nhập mã** — đó là đường cứu, đúng thiết kế.

- [ ] **Step 6: CORS**

```bash
curl -s -D- -o /dev/null -H 'Origin: https://ke-la.com' localhost:3001/health | grep -ci 'access-control-allow-origin'
```

Expected: `0`.

- [ ] **Step 7: Ba probe boundaries + probe thứ tư**

Chạy lại cả bốn probe ở Task 7. **Đọc tên luật**, không nhìn exit code.

- [ ] **Step 8: Perf budget chưa vỡ**

```bash
bun run bench
```

Expected: exit 0. `/health` nằm trong danh sách công khai nên guard thoát sớm, không chạm DB — nếu p95 vỡ thì việc thoát sớm đã không xảy ra.

- [ ] **Step 9: Dọn dữ liệu test**

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "DELETE FROM staff_users WHERE id LIKE 'ztest-%';"
```

- [ ] **Step 10: Commit cuối và mở PR**

```bash
git add -A && git commit -m "chore: verify đợt auth cho apps/staff" || echo "không có gì để commit"
git push -u origin feat/staff-auth
```

---

## Những gì đợt này KHÔNG làm

Xác minh email · 2FA/TOTP · định nghĩa role `SALES` · OIDC hợp nhất với Directus · đổi email nhân viên · audit log · **rate limit theo IP cho đăng ký** (bot spam được hàng `PENDING`; hậu quả giới hạn ở rác trong danh sách chờ, không ai vào được hệ thống).

Tiêu chí **#13 của design doc — cookie chạy được giữa `staff.$ROOT_DOMAIN` và `api.$ROOT_DOMAIN` — không verify được ở localhost** và vẫn mở sau plan này. Phải kiểm bằng một lần đăng nhập thật trên stack đã deploy, cùng lúc đặt `Session.init({ cookieDomain: ".$ROOT_DOMAIN" })`.
