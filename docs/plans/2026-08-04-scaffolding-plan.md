# V9 Motor Rental — Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng monorepo bun workspaces chạy được đầu-cuối cho V9 Motor Rental — API health có type xuyên suốt tới hai frontend, Postgres + MinIO qua Docker, CI/CD GitHub, và bộ CLAUDE.md để các phiên AI sau không phải đoán. Không một business feature nào.

**Architecture:** Functional core + imperative shell. `packages/shared` là core thuần không dependency (trừ `@elysiajs/eden` bị nhốt trong subpath `/client`), bắt buộc TDD. `apps/api` là shell mỏng `route → service → drizzle`. Frontend lấy type của API qua Eden Treaty generic, nên `shared` không bao giờ import `api` và đồ thị phụ thuộc không có chu trình. ESLint `boundaries` ép đồ thị đó bằng máy.

**Tech Stack:** Bun 1.3.10 · TypeScript 6.0.3 (pin `<7`) · Elysia 1.4.29 + TypeBox · Eden 1.4.9 · Drizzle 0.45.2 trên `bun-sql` · Postgres 17 · MinIO · Next 16.3 + React 19.2 · ESLint 10.8 + typescript-eslint 8.66 + `eslint-plugin-boundaries` 7.1 · Prettier 3.9.6 · Docker Compose · Caddy · GitHub Actions → GHCR.

**Spec:** `docs/plans/2026-08-04-scaffolding-design.md`

---

## Trạng thái đã có

Repo đã `git init` (branch `main`), remote `origin` = `git@github.com:VIethoangnguyenle/v9-motor-rental.git`, đã push. `.gitignore` đã có. `docs/plans/` đã có design doc. Mọi task dưới đây bắt đầu từ đó.

## File structure

| File | Trách nhiệm |
|---|---|
| `package.json` | workspaces + canonical scripts, không chứa dependency của app |
| `tsconfig.base.json` | compiler options dùng chung, mọi package `extends` nó |
| `.env.example` | **nguồn sự thật duy nhất** cho tên biến env |
| `eslint.config.js` | flat config + đồ thị boundaries |
| `packages/shared/src/domain/money.ts` | type `Vnd`, format, quy ước làm tròn |
| `packages/shared/src/domain/interval.ts` | `overlaps()` nửa khoảng `[start, end)` |
| `packages/shared/src/client.ts` | `createApiClient<T>()` — chỗ duy nhất `shared` chạm HTTP |
| `packages/db/drizzle.config.ts` | cấu hình drizzle-kit |
| `packages/db/migrations/0000_btree_gist.sql` | bật extension, không có business schema |
| `apps/api/src/env.ts` | đọc + validate env, fail fast |
| `apps/api/src/db.ts` | **chỗ duy nhất** biết driver là `bun-sql` |
| `apps/api/src/plugins/auth.ts` | SEAM JWT |
| `apps/api/src/plugins/timing.ts` | đo latency |
| `apps/api/src/routes/health.ts` | `/health` và `/health/deep` |
| `apps/api/src/index.ts` | compose app, `export type App` |
| `apps/{admin,web}/lib/api.ts` | gắn `App` vào `createApiClient` |
| `CLAUDE.md` | luật cho mọi phiên AI sau |

---

## Task 1: Root workspace

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.env.example`, `bunfig.toml`

- [ ] **Step 1: Tạo `package.json` ở root**

```json
{
  "name": "v9-motor-rental",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "bun": ">=1.3.10" },
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "build": "bun run --filter '*' build",
    "test": "bun test",
    "typecheck": "bun run --filter '*' typecheck",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:generate": "bun run --filter @v9/db generate",
    "db:custom": "bun run --filter @v9/db custom",
    "db:migrate": "bun run --filter @v9/db migrate",
    "bench": "bun run apps/api/scripts/bench.ts"
  },
  "devDependencies": {
    "@types/bun": "1.3.10",
    "eslint": "10.8.0",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-boundaries": "7.1.0",
    "prettier": "3.9.6",
    "typescript": "6.0.3",
    "typescript-eslint": "8.66.0"
  }
}
```

- [ ] **Step 2: Tạo `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowJs": false,
    "noEmit": true,
    "isolatedModules": true
  }
}
```

`noUncheckedIndexedAccess` và `exactOptionalPropertyTypes` bật vì đây là codebase agent sửa — hai cờ này bắt đúng loại lỗi mà agent hay tạo ra khi không đọc hết context.

- [ ] **Step 3: Tạo `bunfig.toml`**

```toml
[install]
exact = true

[test]
coverage = false
```

`exact = true` để mọi version được pin, đúng yêu cầu spec.

- [ ] **Step 4: Tạo `.env.example`**

```bash
# ── Postgres ───────────────────────────────────────────────────────────
POSTGRES_USER=v9
POSTGRES_PASSWORD=change_me_in_env
POSTGRES_DB=v9_rental
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
DATABASE_URL=postgres://v9:change_me_in_env@localhost:5432/v9_rental

# ── MinIO (S3-compatible) ──────────────────────────────────────────────
MINIO_ROOT_USER=v9admin
MINIO_ROOT_PASSWORD=change_me_in_env
MINIO_ENDPOINT=http://localhost:9000
MINIO_BUCKET_VEHICLES=vehicles
MINIO_BUCKET_CHECKINS=checkins

# ── API ────────────────────────────────────────────────────────────────
API_PORT=3001
API_HOST=0.0.0.0

# ── Frontends ──────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_DEFAULT_LOCALE=vi
ADMIN_PORT=3002
WEB_PORT=3000

# ── Caddy (prod) ───────────────────────────────────────────────────────
# web → v9.$ROOT_DOMAIN, admin → admin.$ROOT_DOMAIN, api → api.$ROOT_DOMAIN
ROOT_DOMAIN=example.com
CADDY_EMAIL=you@example.com

# ── SEAM: JWT auth — CHƯA DÙNG ở phiên scaffold ────────────────────────
JWT_SECRET=unused_until_auth_is_implemented
```

- [ ] **Step 5: Cài và verify workspace resolve**

Run: `bun install`
Expected: tạo `bun.lock`, `node_modules/`, không lỗi.

Run: `bun pm ls 2>&1 | head -20`
Expected: liệt kê các devDependency ở root. (Workspace con chưa tồn tại — sẽ verify lại ở Task 12.)

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json bunfig.toml .env.example bun.lock
git commit -m "chore: root bun workspace, tsconfig base, env template"
```

---

## Task 2: ESLint + Prettier + boundaries

**Files:**
- Create: `eslint.config.js`, `.prettierrc`, `.prettierignore`, `cspell.json`

- [ ] **Step 1: Tạo `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

- [ ] **Step 2: Tạo `.prettierignore`**

```
node_modules/
.next/
dist/
build/
bun.lock
packages/db/migrations/
```

Migration SQL không format — nội dung của chúng là bản ghi lịch sử, sửa định dạng sau khi đã apply là gây nhiễu diff vô ích.

- [ ] **Step 3: Tạo `cspell.json`**

```json
{
  "version": "0.2",
  "language": "en,vi",
  "words": [
    "elysia",
    "elysiajs",
    "drizzle",
    "tstzrange",
    "gist",
    "btree",
    "minio",
    "caddy",
    "ghcr",
    "treaty",
    "typebox",
    "bunfig",
    "impeccable"
  ],
  "ignorePaths": ["node_modules/**", "bun.lock", ".next/**", "dist/**"]
}
```

Không có cái này thì cSpell báo đỏ mọi từ tiếng Việt trong toàn bộ docs, và tiếng ồn đó sẽ che mất cảnh báo thật.

- [ ] **Step 4: Tạo `eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/build/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // ── Đồ thị phụ thuộc: xem §6 của design doc ──────────────────────────
  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["apps/**/*", "packages/**/*"],
      "boundaries/elements": [
        { type: "shared-domain", pattern: "packages/shared/src/domain/**" },
        { type: "shared-client", pattern: "packages/shared/src/client.ts" },
        { type: "db", pattern: "packages/db/**" },
        { type: "api-routes", pattern: "apps/api/src/routes/**" },
        { type: "api-services", pattern: "apps/api/src/services/**" },
        { type: "api-infra", pattern: "apps/api/src/{db,env}.ts" },
        { type: "api-plugins", pattern: "apps/api/src/plugins/**" },
        { type: "frontend", pattern: "apps/{web,admin}/**" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // Domain thuần: không được import gì ngoài chính nó.
            { from: "shared-domain", allow: ["shared-domain"] },
            { from: "shared-client", allow: [] },
            { from: "db", allow: ["db"] },
            // Trong api: route → service → db. Không có mũi tên ngược.
            { from: "api-routes", allow: ["api-routes", "api-services", "api-plugins", "shared-domain"] },
            { from: "api-services", allow: ["api-services", "api-infra", "db", "shared-domain"] },
            { from: "api-infra", allow: ["api-infra"] },
            { from: "api-plugins", allow: ["api-plugins", "api-infra", "shared-domain"] },
            { from: "frontend", allow: ["frontend", "shared-domain", "shared-client"] },
          ],
        },
      ],
    },
  },

  // Cấm chọc vào ruột package khác — chỉ đi qua entrypoint đã export.
  {
    files: ["apps/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@v9/*/src/*"],
              message: "Import qua entrypoint của package, không chọc vào src/.",
            },
          ],
        },
      ],
    },
  },

  prettier,
);
```

- [ ] **Step 5: Cài dependency còn thiếu**

Run: `bun add -D @eslint/js@10.0.1`
Expected: thêm vào `devDependencies`.

`@eslint/js` **không** đi cùng số hiệu với `eslint`. `eslint` đang ở 10.8.0 nhưng `@eslint/js` mới nhất chỉ là 10.0.1 — hai package đã tách version. Đừng "sửa" cho khớp nhau.

- [ ] **Step 6: Verify lint chạy được**

Run: `bun run lint`
Expected: exit 0, không file nào để lint (chưa có source). Nếu báo lỗi config, sửa trước khi đi tiếp — config sai ở đây sẽ làm mọi task sau mất tác dụng bảo vệ.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js .prettierrc .prettierignore cspell.json package.json bun.lock
git commit -m "chore: eslint flat config với boundaries, prettier, cspell vi"
```

### Kết quả thực tế — bản draft ở Step 4 **chưa đủ**

Config đã commit (`eefa2c6` + `300c2a9`) là bản có thẩm quyền; đừng chép lại draft ở trên. Sáu thay đổi bắt buộc, tất cả đều phát hiện bằng cách chạy thật:

1. **`@eslint/js@10.0.1`**, không phải `10.8.0` — package đó không tồn tại (đã sửa ở Step 5).
2. **`import/resolver` thêm `.ts`/`.tsx`.** Thiếu nó, `eslint-import-resolver-node` không resolve được import không đuôi file, plugin phân loại đích là unknown và **im lặng bỏ qua** — toàn bộ luật boundaries thành no-op mà lint vẫn exit 0.
3. **`mode: "full"` cho ba element một-file** (`shared-root`, `api-root`, `shared-client`, `api-infra`). Bản thay thế theo tài liệu `partialMatch: false` **hỏng** ở plugin 7.1.0 — nó vẫn nối hậu tố thư mục con nên không bao giờ khớp chính file đó. Đổi lấy một cảnh báo deprecated để có enforcement đúng.
4. **Thêm element `shared-root` và `api-root`.** File không khớp element nào **không phải bị kiểm tra lỏng — mà được miễn hoàn toàn**: plugin không đăng ký visitor nào cho file nó không phân loại được, nên import *từ* file đó không bao giờ bị soi. `apps/api/src/index.ts` và `packages/shared/src/index.ts` đều rơi vào lỗ này. `api-root` **không được** với thẳng tới `db`.
5. **Bật `boundaries/no-unknown-files: "error"`** để lần sau có file top-level không khớp gì thì nó đỏ ngay, thay vì lặng lẽ chui khỏi hàng rào.
6. **Đổi tên rule `boundaries/element-types` → `boundaries/dependencies`** (cùng factory, cùng schema, không đổi hành vi) và **`boundaries/ignore: ["apps/api/scripts/**"]`** cho `bench.ts` — bench là công cụ vận hành, không phải một tầng kiến trúc; cho nó element type với allow rộng sẽ tạo lỗ hình cửa hậu ngay trong đồ thị.

---

## Task 3: `packages/shared` — money (TDD)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Test: `packages/shared/src/domain/money.test.ts`
- Create: `packages/shared/src/domain/money.ts`

- [ ] **Step 1: Tạo `packages/shared/package.json`**

```json
{
  "name": "@v9/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@elysiajs/eden": "1.4.9"
  }
}
```

`@elysiajs/eden` là dependency **duy nhất** của package này, và nó chỉ được dùng trong `src/client.ts`.

- [ ] **Step 2: Tạo `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Viết test thất bại — `packages/shared/src/domain/money.test.ts`**

```ts
import { describe, expect, it } from "bun:test";
import { formatVnd, roundVnd } from "./money";

describe("formatVnd", () => {
  it("định dạng theo kiểu Việt Nam, dấu chấm ngăn nhóm nghìn", () => {
    expect(formatVnd(1_200_000)).toBe("1.200.000 ₫");
  });

  it("số 0 vẫn ra chuỗi hợp lệ", () => {
    expect(formatVnd(0)).toBe("0 ₫");
  });

  it("số âm giữ dấu trừ, dùng cho hoàn cọc", () => {
    expect(formatVnd(-500_000)).toBe("-500.000 ₫");
  });

  it("ném lỗi khi nhận số không nguyên — VND không có đơn vị phụ", () => {
    expect(() => formatVnd(1000.5)).toThrow("VND phải là số nguyên");
  });
});

describe("roundVnd", () => {
  it("làm tròn nửa lên", () => {
    expect(roundVnd(1000.5)).toBe(1001);
  });

  it("làm tròn nửa lên kể cả với số âm", () => {
    expect(roundVnd(-1000.5)).toBe(-1000);
  });

  it("số đã nguyên thì giữ nguyên", () => {
    expect(roundVnd(1000)).toBe(1000);
  });
});
```

- [ ] **Step 4: Chạy test để chắc chắn nó FAIL**

Run: `bun test packages/shared/src/domain/money.test.ts`
Expected: FAIL — `Cannot find module './money'`.

- [ ] **Step 5: Viết implementation tối thiểu — `packages/shared/src/domain/money.ts`**

```ts
/**
 * Tiền trong hệ này luôn là VND, luôn là số nguyên đồng.
 * VND không có đơn vị phụ, nên không có khái niệm "xu" ở bất kỳ tầng nào.
 * Xem §4.4 của docs/plans/2026-08-04-scaffolding-design.md.
 */
export type Vnd = number;

const formatter = new Intl.NumberFormat("vi-VN");

/**
 * Làm tròn về số nguyên đồng. Mọi phép chia trong domain PHẢI đi qua đây —
 * không được để số lẻ rò ra ngoài dưới dạng Vnd.
 * Quy ước: nửa lên (half-up), khớp với cách người Việt tính tiền mặt.
 */
export function roundVnd(amount: number): Vnd {
  return Math.round(amount);
}

export function formatVnd(amount: Vnd): string {
  if (!Number.isInteger(amount)) {
    throw new Error(`VND phải là số nguyên, nhận được ${amount}`);
  }
  return `${formatter.format(amount)} ₫`;
}
```

`Math.round(-1000.5)` trả `-1000` trong JavaScript — đó chính là half-up, và test đã khoá hành vi đó lại để phiên sau không ai đổi sang `Math.trunc` mà không thấy test đỏ.

- [ ] **Step 6: Chạy test để xác nhận PASS**

Run: `bun test packages/shared/src/domain/money.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): Vnd, roundVnd, formatVnd với test"
```

---

## Task 4: `packages/shared` — interval (TDD)

**Files:**
- Test: `packages/shared/src/domain/interval.test.ts`
- Create: `packages/shared/src/domain/interval.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Viết test thất bại — `packages/shared/src/domain/interval.test.ts`**

```ts
import { describe, expect, it } from "bun:test";
import { overlaps, type Interval } from "./interval";

const iv = (start: string, end: string): Interval => ({
  start: new Date(start),
  end: new Date(end),
});

describe("overlaps — nửa khoảng [start, end)", () => {
  it("hai khoảng rời nhau thì không chồng", () => {
    expect(overlaps(iv("2026-01-01", "2026-01-05"), iv("2026-01-10", "2026-01-15"))).toBe(false);
  });

  it("chồng một phần thì có", () => {
    expect(overlaps(iv("2026-01-01", "2026-01-10"), iv("2026-01-05", "2026-01-15"))).toBe(true);
  });

  it("khoảng này nằm trọn trong khoảng kia thì có", () => {
    expect(overlaps(iv("2026-01-01", "2026-01-31"), iv("2026-01-10", "2026-01-12"))).toBe(true);
  });

  it("chạm đầu-đuôi thì KHÔNG chồng — biên phải là mở", () => {
    expect(overlaps(iv("2026-01-01", "2026-01-05"), iv("2026-01-05", "2026-01-10"))).toBe(false);
  });

  it("đối xứng: đổi thứ tự tham số cho cùng kết quả", () => {
    const a = iv("2026-01-01", "2026-01-10");
    const b = iv("2026-01-05", "2026-01-15");
    expect(overlaps(a, b)).toBe(overlaps(b, a));
  });

  it("khoảng rỗng không chồng với bất cứ gì", () => {
    expect(overlaps(iv("2026-01-05", "2026-01-05"), iv("2026-01-01", "2026-01-10"))).toBe(false);
  });

  it("ném lỗi khi end đứng trước start", () => {
    expect(() => overlaps(iv("2026-01-10", "2026-01-01"), iv("2026-01-01", "2026-01-05"))).toThrow(
      "end phải >= start",
    );
  });
});
```

Test "chạm đầu-đuôi thì KHÔNG chồng" là test quan trọng nhất file này: nó khoá biên nửa khoảng cho khớp với `tstzrange` mặc định của Postgres. Lệch biên giữa TS và DB là nguồn bug booking kinh điển — trả xe 10:00 và thuê tiếp 10:00 phải hợp lệ.

- [ ] **Step 2: Chạy test để chắc chắn nó FAIL**

Run: `bun test packages/shared/src/domain/interval.test.ts`
Expected: FAIL — `Cannot find module './interval'`.

- [ ] **Step 3: Viết implementation — `packages/shared/src/domain/interval.ts`**

```ts
/**
 * Khoảng thời gian nửa mở: [start, end).
 * Biên này CỐ Ý khớp với tstzrange mặc định của Postgres, vì exclusion constraint
 * chống double-booking dùng đúng ngữ nghĩa đó. Đổi biên ở đây mà không đổi ở DB
 * sẽ sinh ra lỗi booking chỉ lộ ra lúc chạy thật.
 * Xem §4.1 và §8.2 của docs/plans/2026-08-04-scaffolding-design.md.
 */
export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

function assertValid(i: Interval): void {
  if (i.end.getTime() < i.start.getTime()) {
    throw new Error(
      `end phải >= start, nhận được start=${i.start.toISOString()} end=${i.end.toISOString()}`,
    );
  }
}

function isEmpty(i: Interval): boolean {
  return i.start.getTime() === i.end.getTime();
}

export function overlaps(a: Interval, b: Interval): boolean {
  assertValid(a);
  assertValid(b);
  if (isEmpty(a) || isEmpty(b)) return false;
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `bun test packages/shared/src/domain/interval.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Tạo entrypoint `packages/shared/src/index.ts`**

```ts
export { formatVnd, roundVnd, type Vnd } from "./domain/money";
export { overlaps, type Interval } from "./domain/interval";
```

- [ ] **Step 6: Chạy toàn bộ test của shared**

Run: `bun test packages/shared`
Expected: PASS, 14 test tổng cộng.

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): overlaps nửa khoảng [start,end) khớp tstzrange, + entrypoint"
```

---

## Task 5: `packages/shared/client.ts` — Eden factory

**Files:**
- Create: `packages/shared/src/client.ts`

- [ ] **Step 1: Viết `packages/shared/src/client.ts`**

```ts
import { treaty } from "@elysiajs/eden";

/**
 * Factory tạo Eden client có type.
 *
 * QUAN TRỌNG: file này CỐ Ý generic trên T và KHÔNG import gì từ apps/api.
 * Nếu nó import App type trực tiếp, ta có chu trình shared → api → shared,
 * vì apps/api import domain logic từ chính package này.
 * Frontend là nơi ghép hai đầu lại:
 *
 *   import type { App } from "@v9/api";
 *   import { createApiClient } from "@v9/shared/client";
 *   export const api = createApiClient<App>(url);
 *
 * Xem §4.1 của docs/plans/2026-08-04-scaffolding-design.md.
 */
export function createApiClient<T>(baseUrl: string) {
  if (!baseUrl) {
    throw new Error("createApiClient cần baseUrl — kiểm tra NEXT_PUBLIC_API_URL");
  }
  return treaty<T>(baseUrl);
}
```

- [ ] **Step 2: Verify typecheck của package**

Run: `cd packages/shared && bun run typecheck; cd ../..`
Expected: exit 0, không lỗi.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/client.ts
git commit -m "feat(shared): createApiClient generic, không tạo chu trình với api"
```

---

## Task 6: `packages/db` — drizzle + migration `btree_gist`

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`
- Create: `packages/db/migrations/0000_btree_gist.sql`, `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Tạo `packages/db/package.json`**

```json
{
  "name": "@v9/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "generate": "drizzle-kit generate",
    "custom": "drizzle-kit generate --custom",
    "migrate": "drizzle-kit migrate",
    "studio": "drizzle-kit studio",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "0.45.2"
  },
  "devDependencies": {
    "drizzle-kit": "0.31.10"
  }
}
```

- [ ] **Step 2: Tạo `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Tạo `packages/db/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa được set — copy .env.example thành .env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 4: Tạo schema rỗng — `packages/db/src/schema/index.ts`**

```ts
/**
 * Business schema (vehicles, customers, rentals) CỐ Ý chưa tồn tại.
 * Phiên scaffold không tạo bảng nghiệp vụ nào — xem §2 của design doc.
 *
 * Khi bảng `rentals` ra đời, migration của nó phải kèm:
 *
 *   ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap
 *     EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);
 *
 * với `period` kiểu tstzrange dùng biên [start, end) — khớp overlaps() trong @v9/shared.
 * Extension btree_gist đã được bật sẵn ở migration 0000 để dòng trên chạy được.
 */
export {};
```

- [ ] **Step 5: Tạo `packages/db/src/index.ts`**

```ts
export * as schema from "./schema/index";
```

- [ ] **Step 6: Tạo migration — `packages/db/migrations/0000_btree_gist.sql`**

```sql
-- Bật btree_gist để exclusion constraint có thể so sánh cột vô hướng (vehicle_id)
-- bằng toán tử `=` cùng lúc với cột range (period) bằng `&&`.
-- Không có extension này, `EXCLUDE USING gist (vehicle_id WITH =, ...)` sẽ báo lỗi
-- "data type uuid has no default operator class for access method gist".
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

- [ ] **Step 7: Tạo journal — `packages/db/migrations/meta/_journal.json`**

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": 1785859200000,
      "tag": "0000_btree_gist",
      "breakpoints": true
    }
  ]
}
```

- [ ] **Step 8: Cài dependency**

Run: `bun install`
Expected: `drizzle-orm` và `drizzle-kit` xuất hiện trong `node_modules`.

- [ ] **Step 9: Commit** (chưa migrate được — chưa có Postgres, đó là Task 7)

```bash
git add packages/db package.json bun.lock
git commit -m "feat(db): drizzle config + migration 0000 bật btree_gist"
```

---

## Task 7: `compose.yaml` (dev) + chạy migration thật

**Files:**
- Create: `compose.yaml`
- Test: `packages/db/src/btree-gist.test.ts`

- [ ] **Step 1: Tạo `compose.yaml`**

```yaml
name: v9-rental-dev

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "${POSTGRES_PORT}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

  # One-shot: tạo bucket rồi thoát. Không restart.
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD} &&
      mc mb --ignore-existing local/${MINIO_BUCKET_VEHICLES} &&
      mc mb --ignore-existing local/${MINIO_BUCKET_CHECKINS} &&
      echo 'buckets sẵn sàng'
      "

volumes:
  postgres-data:
  minio-data:
```

- [ ] **Step 2: Tạo `.env` từ template và khởi động**

```bash
cp .env.example .env
docker compose up -d
```

Expected: `postgres`, `minio` chạy; `minio-init` exit code 0.

- [ ] **Step 3: Verify hai service healthy**

Run: `docker compose ps`
Expected: `postgres` và `minio` trạng thái `healthy`; `minio-init` trạng thái `exited (0)`.

- [ ] **Step 4: Chạy migration**

Run: `bun run db:migrate`
Expected: drizzle-kit apply `0000_btree_gist`, không lỗi.

- [ ] **Step 5: Verify extension có thật trong DB**

Run: `docker compose exec -T postgres psql -U v9 -d v9_rental -c "\dx btree_gist"`
Expected: bảng kết quả có một dòng `btree_gist`.

- [ ] **Step 6: Viết test chứng minh extension DÙNG ĐƯỢC — `packages/db/src/btree-gist.test.ts`**

```ts
import { afterAll, describe, expect, it } from "bun:test";
import { SQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa set — cần .env và `docker compose up -d`");

const sql = new SQL(url);
afterAll(async () => {
  await sql.close();
});

describe("btree_gist", () => {
  it("cho phép exclusion constraint chặn tstzrange chồng lấn trên cùng một xe", async () => {
    // Toàn bộ chạy trong transaction rồi ROLLBACK: chứng minh extension dùng được
    // mà KHÔNG commit một dòng business schema nào (§2 design doc cấm việc đó).
    await sql.begin(async (tx) => {
      await tx`
        CREATE TEMP TABLE probe_rentals (
          id          bigserial PRIMARY KEY,
          vehicle_id  uuid NOT NULL,
          period      tstzrange NOT NULL,
          CONSTRAINT probe_no_overlap
            EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)
        ) ON COMMIT DROP
      `;

      const vehicle = "11111111-1111-1111-1111-111111111111";

      await tx`
        INSERT INTO probe_rentals (vehicle_id, period)
        VALUES (${vehicle}::uuid, tstzrange('2026-01-01', '2026-01-05', '[)'))
      `;

      // Chồng lấn trên CÙNG xe → phải bị chặn bằng SQLSTATE 23P01.
      let code: string | undefined;
      try {
        await tx`
          INSERT INTO probe_rentals (vehicle_id, period)
          VALUES (${vehicle}::uuid, tstzrange('2026-01-03', '2026-01-08', '[)'))
        `;
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      expect(code).toBe("23P01");

      // Chạm đầu-đuôi trên cùng xe → PHẢI được chấp nhận, khớp overlaps() của @v9/shared.
      await tx`
        INSERT INTO probe_rentals (vehicle_id, period)
        VALUES (${vehicle}::uuid, tstzrange('2026-01-05', '2026-01-09', '[)'))
      `;

      const rows = await tx`SELECT count(*)::int AS n FROM probe_rentals`;
      expect(rows[0].n).toBe(2);

      throw new Error("rollback-on-purpose");
    }).catch((e: Error) => {
      if (e.message !== "rollback-on-purpose") throw e;
    });
  });
});
```

Test này làm hai việc cùng lúc: chứng minh `btree_gist` dùng được thật, và khoá luôn ngữ nghĩa biên `[)` cho khớp `overlaps()` ở Task 4. Nếu ai đó sau này đổi biên ở một bên, test đỏ.

- [ ] **Step 7: Chạy test**

Run: `bun test packages/db`
Expected: PASS, 1 test.

- [ ] **Step 8: Commit**

```bash
git add compose.yaml packages/db/src/btree-gist.test.ts
git commit -m "feat(infra): compose dev postgres+minio+bucket init; test chứng minh btree_gist dùng được"
```

---

## Task 8: `apps/api` — env, db, health

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Create: `apps/api/src/env.ts`, `apps/api/src/db.ts`
- Create: `apps/api/src/plugins/timing.ts`, `apps/api/src/plugins/auth.ts`
- Create: `apps/api/src/routes/health.ts`, `apps/api/src/index.ts`

- [ ] **Step 1: Tạo `apps/api/package.json`**

```json
{
  "name": "@v9/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "start": "bun src/index.ts",
    "build": "bun build src/index.ts --target bun --outdir dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@elysiajs/cors": "1.4.2",
    "@v9/db": "workspace:*",
    "@v9/shared": "workspace:*",
    "drizzle-orm": "0.45.2",
    "elysia": "1.4.29"
  }
}
```

- [ ] **Step 2: Tạo `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "scripts/**/*"]
}
```

- [ ] **Step 3: Tạo `apps/api/src/env.ts`**

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường bắt buộc: ${name} — xem .env.example`);
  return v;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.API_PORT ?? 3001),
  host: process.env.API_HOST ?? "0.0.0.0",
  minio: {
    endpoint: required("MINIO_ENDPOINT"),
    bucketVehicles: required("MINIO_BUCKET_VEHICLES"),
    bucketCheckins: required("MINIO_BUCKET_CHECKINS"),
  },
} as const;
```

Fail fast lúc khởi động thay vì lỗi mơ hồ ở request đầu tiên.

- [ ] **Step 4: Tạo `apps/api/src/db.ts`**

```ts
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "./env";

/**
 * ĐÂY LÀ CHỖ DUY NHẤT trong repo biết driver Postgres là gì.
 *
 * Đang dùng Bun.SQL native qua drizzle-orm/bun-sql vì lý do throughput (§4.8 design doc).
 * Adapter này trẻ hơn postgres-js; nếu gặp vấn đề transaction hoặc pool, đường lùi là
 * đổi ĐÚNG file này sang:
 *
 *   import postgres from "postgres";
 *   import { drizzle } from "drizzle-orm/postgres-js";
 *   export const db = drizzle(postgres(env.databaseUrl), { schema });
 *
 * Không service nào phải đổi theo — chúng chỉ import `db`.
 */
export const client = new SQL(env.databaseUrl);
export const db = drizzle({ client });
```

- [ ] **Step 5: Tạo `apps/api/src/plugins/timing.ts`**

```ts
import { Elysia } from "elysia";

/**
 * Ghi latency có cấu trúc để so với perf budget trong CLAUDE.md.
 * `name` là bắt buộc — thiếu nó Elysia sẽ chạy lại plugin mỗi lần `.use()`.
 */
export const timing = new Elysia({ name: "timing" })
  .onRequest(({ store }) => {
    (store as { startedAt?: number }).startedAt = performance.now();
  })
  .onAfterResponse(({ store, request, set }) => {
    const startedAt = (store as { startedAt?: number }).startedAt;
    if (startedAt === undefined) return;
    const ms = Math.round((performance.now() - startedAt) * 100) / 100;
    console.warn(
      JSON.stringify({
        route: new URL(request.url).pathname,
        method: request.method,
        status: set.status ?? 200,
        ms,
      }),
    );
  })
  .as("global");
```

- [ ] **Step 6: Tạo seam auth — `apps/api/src/plugins/auth.ts`**

```ts
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

export const auth = new Elysia({ name: "auth" })
  .derive({ as: "global" }, ({ headers }): { auth: AuthContext | null } => {
    const header = headers.authorization;
    if (!header?.startsWith("Bearer ")) return { auth: null };
    // SEAM: JWT auth — verify token ở đây, trả AuthContext.
    return { auth: null };
  })
  .macro({
    requireRole: (roles: readonly Role[]) => ({
      beforeHandle({ auth: ctx, status }) {
        if (ctx === null) {
          return status(501, {
            error: "auth_not_implemented",
            message: "JWT auth chưa được implement — xem SEAM trong apps/api/src/plugins/auth.ts",
            requiredRoles: roles,
          });
        }
        if (!roles.includes(ctx.role)) return status(403, { error: "forbidden" });
      },
    }),
  });
```

- [ ] **Step 7: Tạo `apps/api/src/routes/health.ts`**

```ts
import { Elysia, t } from "elysia";
import { client } from "../db";
import { env } from "../env";

/**
 * /health là liveness — phải rẻ. Caddy và Docker healthcheck gọi nó liên tục,
 * nên nó KHÔNG được chạm database.
 * /health/deep là readiness — kiểm tra thật cả Postgres lẫn MinIO.
 */
export const health = new Elysia({ name: "health" })
  .get("/health", () => ({ status: "ok" as const }), {
    response: t.Object({ status: t.Literal("ok") }),
  })
  .get(
    "/health/deep",
    async ({ status }) => {
      const [postgres, minio] = await Promise.all([checkPostgres(), checkMinio()]);
      const ok = postgres.ok && minio.ok;
      return status(ok ? 200 : 503, { status: ok ? ("ok" as const) : ("degraded" as const), postgres, minio });
    },
    {
      response: {
        200: t.Object({
          status: t.Literal("ok"),
          postgres: t.Object({ ok: t.Boolean(), detail: t.String() }),
          minio: t.Object({ ok: t.Boolean(), detail: t.String() }),
        }),
        503: t.Object({
          status: t.Literal("degraded"),
          postgres: t.Object({ ok: t.Boolean(), detail: t.String() }),
          minio: t.Object({ ok: t.Boolean(), detail: t.String() }),
        }),
      },
    },
  );

async function checkPostgres(): Promise<{ ok: boolean; detail: string }> {
  try {
    const rows = await client`SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`;
    return rows.length === 1
      ? { ok: true, detail: "connected, btree_gist enabled" }
      : { ok: false, detail: "connected nhưng thiếu btree_gist — chạy bun run db:migrate" };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function checkMinio(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${env.minio.endpoint}/minio/health/live`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok
      ? { ok: true, detail: `reachable at ${env.minio.endpoint}` }
      : { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
```

- [ ] **Step 8: Tạo `apps/api/src/index.ts`**

```ts
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./env";
import { auth } from "./plugins/auth";
import { timing } from "./plugins/timing";
import { health } from "./routes/health";

const app = new Elysia()
  .use(cors())
  .use(timing)
  .use(auth)
  .use(health)
  .listen({ port: env.port, hostname: env.host });

console.warn(`api đang chạy tại http://${env.host}:${env.port}`);

/** Eden Treaty ở frontend lấy type từ đây. */
export type App = typeof app;
export { app };
```

- [ ] **Step 9: Cài và khởi động**

```bash
bun install
bun run --filter @v9/api dev
```

Expected: in ra `api đang chạy tại http://0.0.0.0:3001`.

- [ ] **Step 10: Verify `/health`**

Run: `curl -s localhost:3001/health`
Expected chính xác: `{"status":"ok"}`

- [ ] **Step 11: Verify `/health/deep` — chứng minh api nối được CẢ Postgres lẫn MinIO**

Run: `curl -s localhost:3001/health/deep | python3 -m json.tool`
Expected: `status: "ok"`, `postgres.ok: true` với detail `connected, btree_gist enabled`, `minio.ok: true`.

Đây là bằng chứng cho tiêu chí #2 và cho quyết định driver `bun-sql` ở §4.8 — adapter chạy thật, không phải tin README.

- [ ] **Step 12: Commit**

```bash
git add apps/api package.json bun.lock
git commit -m "feat(api): elysia app, bun-sql driver, /health + /health/deep, seam auth, timing"
```

---

## Task 9: `apps/admin` — Next + Eden client

**Files:**
- Create: `apps/admin/package.json`, `apps/admin/tsconfig.json`, `apps/admin/next.config.ts`
- Create: `apps/admin/lib/api.ts`, `apps/admin/app/layout.tsx`, `apps/admin/app/page.tsx`

- [ ] **Step 1: Tạo `apps/admin/package.json`**

```json
{
  "name": "@v9/admin",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port ${ADMIN_PORT:-3002}",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@v9/shared": "workspace:*",
    "next": "16.3.0",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.18",
    "@v9/api": "workspace:*"
  }
}
```

`@v9/api` nằm ở `devDependencies` có chủ ý: frontend chỉ dùng nó cho `import type`, không có code runtime nào của API đi vào bundle.

- [ ] **Step 2: Tạo `apps/admin/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] },
    "exactOptionalPropertyTypes": false
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`exactOptionalPropertyTypes` bị tắt **chỉ ở tầng app React**, có chủ ý. Nó vẫn bật ở `packages/shared` và `packages/db` — nơi phân biệt "thiếu key" với "key = undefined" thật sự có giá trị cho domain logic. Nhưng trong JSX, mẫu `prop={cond ? value : undefined}` là phổ biến nhất, trong khi type của React và hầu hết thư viện khai `prop?: T` chứ không phải `prop?: T | undefined` — bật cờ này ở app sẽ tạo ra một loạt lỗi type không phản ánh bug nào. Đây là kết luận từ code review Task 1, không phải phỏng đoán.

- [ ] **Step 3: Tạo `apps/admin/next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: `${import.meta.dirname}/../..`,
};

export default config;
```

`outputFileTracingRoot` trỏ về root monorepo — thiếu nó, standalone build sẽ không gói được symlink của bun workspace và container sẽ chết lúc khởi động vì thiếu module.

- [ ] **Step 4: Tạo `apps/admin/lib/api.ts` — chỗ ghép Eden**

```ts
import type { App } from "@v9/api";
import { createApiClient } from "@v9/shared/client";

export const api = createApiClient<App>(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
```

- [ ] **Step 5: Tạo `apps/admin/app/layout.tsx`**

```tsx
import type { ReactNode } from "react";

export const metadata = {
  title: "V9 Motor Rental — Quản trị",
  description: "Hệ quản lý nội bộ cho V9 Motor Rental",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "vi"}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Tạo `apps/admin/app/page.tsx`**

```tsx
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { data, error } = await api.health.get();

  return (
    <main style={{ fontFamily: "monospace", padding: 24 }}>
      <h1>V9 Admin — scaffold</h1>
      <p>
        API health:{" "}
        <strong>{error ? `lỗi: ${String(error.value)}` : data.status}</strong>
      </p>
      <p>Chưa có chức năng nghiệp vụ nào. Xem CLAUDE.md.</p>
    </main>
  );
}
```

`data.status` có type `"ok"` do Eden suy ra từ response schema TypeBox của `apps/api` — không khai báo type thủ công ở đâu cả. Đó chính là thứ tiêu chí #4 đòi.

- [ ] **Step 7: Cài và verify**

```bash
bun install
bun run --filter @v9/admin dev
```

Run: `curl -s localhost:3002 | grep -o "API health:.*ok" | head -1`
Expected: chuỗi chứa `ok`.

- [ ] **Step 8: Commit**

```bash
git add apps/admin package.json bun.lock
git commit -m "feat(admin): next standalone + trang placeholder gọi /health qua Eden typed"
```

---

## Task 10: `apps/web` — Next + ISR

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`
- Create: `apps/web/lib/api.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`
- Create: `apps/web/messages/vi.json`

- [ ] **Step 1: Tạo `apps/web/package.json`**

```json
{
  "name": "@v9/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port ${WEB_PORT:-3000}",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@v9/shared": "workspace:*",
    "next": "16.3.0",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.18",
    "@v9/api": "workspace:*"
  }
}
```

- [ ] **Step 2: Tạo `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] },
    "exactOptionalPropertyTypes": false
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Lý do tắt `exactOptionalPropertyTypes` ở tầng app: xem Task 9 Step 2. Cờ này vẫn bật ở `packages/shared` và `packages/db`.

- [ ] **Step 3: Tạo `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: `${import.meta.dirname}/../..`,
};

export default config;
```

- [ ] **Step 4: Tạo `apps/web/lib/api.ts`**

```ts
import type { App } from "@v9/api";
import { createApiClient } from "@v9/shared/client";

export const api = createApiClient<App>(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
```

- [ ] **Step 5: Tạo seam i18n — `apps/web/messages/vi.json`**

```json
{
  "site": {
    "title": "V9 Motor Rental",
    "tagline": "Thuê mô tô phân khối lớn tại TP.HCM"
  },
  "scaffold": {
    "notice": "Trang tạm. Chưa có nội dung nghiệp vụ.",
    "apiHealth": "Trạng thái API"
  }
}
```

Seam i18n dừng ở đây có chủ ý: một file messages và một biến locale. Chưa cài next-intl vì mới có đúng một ngôn ngữ — dựng bộ máy routing đa ngôn ngữ lúc này là chi phí không có người trả (§8.4 design doc).

- [ ] **Step 6: Tạo `apps/web/app/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import messages from "@/messages/vi.json";

export const metadata = {
  title: messages.site.title,
  description: messages.site.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "vi"}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Tạo `apps/web/app/page.tsx` — ISR**

```tsx
import messages from "@/messages/vi.json";
import { api } from "@/lib/api";

// SEO quan trọng với site công khai → ISR thay vì force-dynamic.
export const revalidate = 60;

export default async function Page() {
  const { data, error } = await api.health.get();

  return (
    <main style={{ fontFamily: "monospace", padding: 24 }}>
      <h1>{messages.site.title}</h1>
      <p>{messages.site.tagline}</p>
      <p>
        {messages.scaffold.apiHealth}:{" "}
        <strong>{error ? `lỗi: ${String(error.value)}` : data.status}</strong>
      </p>
      <p>{messages.scaffold.notice}</p>
    </main>
  );
}
```

- [ ] **Step 8: Cài và verify**

```bash
bun install
bun run --filter @v9/web dev
```

Run: `curl -s localhost:3000 | grep -c "V9 Motor Rental"`
Expected: ≥ 1.

- [ ] **Step 9: Verify build production ra standalone thật**

Run: `bun run --filter @v9/web build`
Expected: build thành công; `ls apps/web/.next/standalone/` có `server.js`.

- [ ] **Step 10: Commit**

```bash
git add apps/web package.json bun.lock
git commit -m "feat(web): next standalone + ISR, seam i18n vi, trang placeholder gọi /health"
```

---

## Task 11: Typecheck + lint toàn workspace

**Files:**
- Modify: các file bị lint/typecheck bắt lỗi

- [ ] **Step 1: Trước hết, chứng minh `typecheck` không im lặng bỏ sót workspace nào**

`bun run --filter '*' <script>` **bỏ qua không báo lỗi** những workspace không khai script đó, rồi vẫn exit 0. Nghĩa là `bun run typecheck` có thể "xanh" trong khi chưa hề kiểm tra một package nào. Không có bước này thì tiêu chí #11 là xanh giả.

Run:
```bash
for f in apps/*/package.json packages/*/package.json; do
  name=$(bun -e "console.log(require('./$f').name)")
  has=$(bun -e "console.log(Boolean(require('./$f').scripts?.typecheck))")
  echo "$name typecheck=$has"
done
```
Expected: **5 dòng**, mỗi dòng `typecheck=true` — `@v9/api`, `@v9/admin`, `@v9/web`, `@v9/db`, `@v9/shared`. Bất kỳ dòng nào `false` hoặc thiếu dòng nào đều phải sửa `package.json` của workspace đó trước khi đi tiếp.

- [ ] **Step 2: Chạy typecheck toàn workspace**

Run: `bun run typecheck`
Expected: exit 0, và trong output thấy đủ 5 tên workspace chạy qua.

Nếu `apps/admin` hoặc `apps/web` báo thiếu type của Next, chạy `bun run --filter @v9/web build` một lần để Next sinh `.next/types`, rồi chạy lại.

- [ ] **Step 3: Chạy lint toàn repo, và dọn deprecation của `eslint-plugin-boundaries`**

Run: `bun run lint`
Expected: exit 0.

Tới bước này đã có file thật nên plugin sẽ phun **3 cảnh báo deprecation**, không phải 1 như lúc cây thư mục còn rỗng:

```
[boundaries][warning]: The 'mode' option in element descriptors is deprecated...
[boundaries/dependencies] The 'rules' option is deprecated. Please use 'policies' instead.
[boundaries/dependencies] Detected legacy selector syntax in 10 rule(s) at indices: 0..9.
```

Cảnh báo `mode` là **không bỏ được** (xem Task 2 — `partialMatch: false` hỏng ở 7.1.0). Hai cảnh báo còn lại thì bỏ được và **phải bỏ**: `rules:` → `policies:` cùng cú pháp selector mới. Lý do không để lại: ba cảnh báo mỗi lần lint sẽ dạy người ta lướt qua output của lint, và `rules:` nhiều khả năng bị gỡ ở major kế tiếp của plugin.

Sau khi đổi, **bắt buộc chạy lại probe** ở Step 4 để chứng minh enforcement không mất — đổi schema mà không verify là đúng cách biến hàng rào thành trang trí.

Expected sau khi sửa: exit 0, còn đúng **1** cảnh báo (`mode`).

- [ ] **Step 4: Cố tình vi phạm boundary để chứng minh luật có hiệu lực**

```bash
echo 'import { db } from "../../../../apps/api/src/db";' >> packages/shared/src/domain/money.ts
bun run lint
```

Expected: **FAIL** với lỗi `boundaries/element-types` — `shared-domain` không được import gì ngoài `shared-domain`.

Bước này bắt buộc. Một linter được cấu hình nhưng không thực sự chặn còn nguy hiểm hơn không có linter, vì nó tạo cảm giác an toàn giả.

- [ ] **Step 5: Hoàn tác vi phạm và xác nhận lint xanh lại**

```bash
git checkout packages/shared/src/domain/money.ts
bun run lint
```

Expected: exit 0.

- [ ] **Step 6: Chạy toàn bộ test**

Run: `bun test`
Expected: PASS — 14 test của `shared`, 1 test của `db`.

- [ ] **Step 7: Format và commit**

```bash
bun run format
git add -A
git commit -m "chore: typecheck + lint xanh toàn workspace, xác nhận boundaries chặn thật"
```

---

## Task 12: Bench + perf budget

**Files:**
- Create: `apps/api/scripts/bench.ts`

- [ ] **Step 1: Tạo `apps/api/scripts/bench.ts`**

```ts
/**
 * Đo p50/p95/p99 của /health để so với perf budget trong CLAUDE.md.
 * Cố ý không dùng công cụ ngoài: một file, không dependency, chạy ở mọi máy.
 */
const url = process.env.BENCH_URL ?? "http://localhost:3001/health";
const total = Number(process.env.BENCH_N ?? 2000);
const concurrency = Number(process.env.BENCH_C ?? 50);

async function worker(n: number, out: number[]): Promise<void> {
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const res = await fetch(url);
    await res.text();
    out.push(performance.now() - t0);
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round((sorted[idx] ?? 0) * 100) / 100;
}

const samples: number[] = [];
// Warm-up: bỏ qua, chỉ để JIT và pool ổn định.
await worker(50, []);

const started = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, () => worker(Math.ceil(total / concurrency), samples)),
);
const elapsed = (performance.now() - started) / 1000;

samples.sort((a, b) => a - b);
console.warn(
  JSON.stringify(
    {
      url,
      requests: samples.length,
      rps: Math.round(samples.length / elapsed),
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
      budget_p95: 5,
    },
    null,
    2,
  ),
);

if (percentile(samples, 95) > 5) {
  console.error("VƯỢT PERF BUDGET: /health p95 > 5ms — xem CLAUDE.md §Perf budget");
  process.exit(1);
}
```

Script exit code 1 khi vượt budget — đúng tinh thần "vượt budget là coi như test fail, không phải góp ý" (§4.8).

- [ ] **Step 2: Chạy bench với api đang chạy**

Run: `bun run bench`
Expected: JSON có `p95` và exit 0.

Nếu p95 > 5ms trên máy dev có Docker đang chạy, ghi lại con số thật vào CLAUDE.md làm baseline thay vì hạ chuẩn ngầm — baseline sai còn tệ hơn không có baseline.

- [ ] **Step 3: Commit**

```bash
git add apps/api/scripts/bench.ts
git commit -m "feat(api): bench script, fail khi vượt perf budget p95"
```

---

## Task 13: Dockerfile + compose prod + Caddy

**Files:**
- Create: `apps/api/Dockerfile`, `apps/admin/Dockerfile`, `apps/web/Dockerfile`
- Create: `compose.prod.yaml`, `Caddyfile`, `.dockerignore`

- [ ] **Step 1: Tạo `.dockerignore`**

```
node_modules
**/node_modules
.next
**/.next
dist
**/dist
.git
docs
*.md
.env
```

- [ ] **Step 2: Tạo `apps/api/Dockerfile`**

```dockerfile
FROM oven/bun:1.3.10-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM base AS runtime
COPY --from=deps /app/node_modules node_modules
COPY package.json bunfig.toml ./
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/shared packages/shared
ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "apps/api/src/index.ts"]
```

API chạy trên Bun vì driver `bun-sql` đòi vậy (§4.8).

- [ ] **Step 3: Tạo `apps/web/Dockerfile`**

```dockerfile
FROM oven/bun:1.3.10-alpine AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run --filter @v9/web build

# Runtime là Node vì output:"standalone" của Next sinh server.js nhắm Node.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 4: Tạo `apps/admin/Dockerfile`**

```dockerfile
FROM oven/bun:1.3.10-alpine AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run --filter @v9/admin build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
EXPOSE 3002
CMD ["node", "apps/admin/server.js"]
```

`apps/admin` không có `public/` nên không COPY — thêm dòng đó sẽ làm build fail.

- [ ] **Step 5: Tạo `Caddyfile`**

```caddyfile
{
	email {$CADDY_EMAIL}
}

v9.{$ROOT_DOMAIN} {
	reverse_proxy web:3000
}

admin.{$ROOT_DOMAIN} {
	reverse_proxy admin:3002
}

api.{$ROOT_DOMAIN} {
	reverse_proxy api:3001
}
```

- [ ] **Step 6: Tạo `compose.prod.yaml`**

```yaml
name: v9-rental-prod

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    image: ghcr.io/viethoangnguyenle/v9-motor-rental-api:latest
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      minio: { condition: service_healthy }
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      MINIO_ENDPOINT: http://minio:9000
      MINIO_BUCKET_VEHICLES: ${MINIO_BUCKET_VEHICLES}
      MINIO_BUCKET_CHECKINS: ${MINIO_BUCKET_CHECKINS}
      API_PORT: "3001"
    healthcheck:
      test: ["CMD", "bun", "-e", "await fetch('http://localhost:3001/health')"]
      interval: 10s
      timeout: 3s
      retries: 5

  admin:
    image: ghcr.io/viethoangnguyenle/v9-motor-rental-admin:latest
    restart: unless-stopped
    depends_on:
      api: { condition: service_healthy }
    environment:
      NEXT_PUBLIC_API_URL: https://api.${ROOT_DOMAIN}
      NEXT_PUBLIC_DEFAULT_LOCALE: ${NEXT_PUBLIC_DEFAULT_LOCALE}
      PORT: "3002"

  web:
    image: ghcr.io/viethoangnguyenle/v9-motor-rental-web:latest
    restart: unless-stopped
    depends_on:
      api: { condition: service_healthy }
    environment:
      NEXT_PUBLIC_API_URL: https://api.${ROOT_DOMAIN}
      NEXT_PUBLIC_DEFAULT_LOCALE: ${NEXT_PUBLIC_DEFAULT_LOCALE}
      PORT: "3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on: [web, admin, api]
    ports:
      - "80:80"
      - "443:443"
    environment:
      ROOT_DOMAIN: ${ROOT_DOMAIN}
      CADDY_EMAIL: ${CADDY_EMAIL}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  postgres-data:
  minio-data:
  caddy-data:
  caddy-config:
```

- [ ] **Step 7: Verify build ba image ở local**

```bash
docker build -f apps/api/Dockerfile -t v9-api:test .
docker build -f apps/web/Dockerfile -t v9-web:test .
docker build -f apps/admin/Dockerfile -t v9-admin:test .
```

Expected: cả ba build thành công.

- [ ] **Step 8: Verify config prod parse được**

Run: `docker compose -f compose.prod.yaml config > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 9: Commit**

```bash
git add apps/*/Dockerfile compose.prod.yaml Caddyfile .dockerignore
git commit -m "feat(infra): dockerfile 3 app, compose prod + caddy auto-https"
```

---

## Task 14: GitHub Actions — CI + deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

- [ ] **Step 1: Tạo `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: v9
          POSTGRES_PASSWORD: ci_password
          POSTGRES_DB: v9_rental
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U v9 -d v9_rental"
          --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      DATABASE_URL: postgres://v9:ci_password@localhost:5432/v9_rental
      MINIO_ENDPOINT: http://localhost:9000
      MINIO_BUCKET_VEHICLES: vehicles
      MINIO_BUCKET_CHECKINS: checkins
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.10
      - run: bun install --frozen-lockfile
      - run: bun run db:migrate
      - run: bun run lint
      - run: bun run typecheck
      - run: bun test
```

CI chạy `db:migrate` trước `test` vì test `btree_gist` cần extension đã bật. MinIO không cần service ở CI — không test nào chạm nó (`/health/deep` chỉ được gọi thủ công).

- [ ] **Step 2: Tạo `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        app: [api, admin, web]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ matrix.app }}/Dockerfile
          push: true
          tags: |
            ghcr.io/viethoangnguyenle/v9-motor-rental-${{ matrix.app }}:latest
            ghcr.io/viethoangnguyenle/v9-motor-rental-${{ matrix.app }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd ~/v9-motor-rental
            docker compose -f compose.prod.yaml pull
            docker compose -f compose.prod.yaml up -d
            docker compose -f compose.prod.yaml exec -T api bun run db:migrate
```

`concurrency` với `cancel-in-progress: false` là bắt buộc: hai lần deploy chạy chồng nhau có thể đẩy hai bản migration cùng lúc lên một DB.

Deploy **không** gọi `ci.yml` lại — GitHub chạy song song hai workflow trên cùng một push. Nếu muốn deploy chỉ khi CI xanh, đổi trigger của `deploy.yml` thành `workflow_run`. Ghi lại đánh đổi này trong CLAUDE.md để phiên sau biết đây là lựa chọn, không phải thiếu sót.

- [ ] **Step 3: Commit và push, xem CI có xanh không**

```bash
git add .github
git commit -m "ci: workflow verify (lint+typecheck+test) và deploy GHCR→SSH"
git push
```

- [ ] **Step 4: Verify CI xanh trên GitHub**

Run: `gh run watch --exit-status`
Expected: workflow `CI` kết thúc `success`.

`Deploy` sẽ **fail ở job `deploy`** vì `SSH_HOST`/`SSH_USER`/`SSH_KEY` chưa được set — đó là kết quả đúng ở thời điểm này, không phải lỗi. Job `build` phải xanh. Ghi lại điều này khi báo cáo, đừng để nó bị hiểu nhầm là hỏng.

---

## Task 15: CLAUDE.md — root + từng app

**Files:**
- Create: `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/admin/CLAUDE.md`, `apps/web/CLAUDE.md`, `packages/shared/CLAUDE.md`, `packages/db/CLAUDE.md`

- [ ] **Step 1: Viết `CLAUDE.md` ở root**

Nội dung bắt buộc có, theo §11 design doc:

1. **Repo map** — bảng 5 workspace, một dòng trách nhiệm mỗi cái.
2. **Canonical commands** — `bun install`, `docker compose up -d`, `bun run dev`, `bun test`, `bun run typecheck`, `bun run lint`, `bun run db:generate|custom|migrate`, `bun run bench`.
3. **Luật domain-chỉ-ở-shared** — mọi phép tính pricing / deposit / availability nằm trong `packages/shared/src/domain/`. Frontend và `apps/api` **không được** implement lại. Vi phạm bị ESLint `boundaries` chặn.
4. **Bảng luật per-tool** — copy nguyên bảng §11.2 của design doc (superpowers / Serena / Agent Memory / rtk / impeccable, mỗi tool có cột *dùng khi nào* và *không dùng khi nào*).
5. **Standard session workflow (a)–(g)** — copy nguyên §11.3.
6. **Perf budget** — bảng p95, cộng câu "vượt budget là fail, không phải góp ý".
7. **Luật pin TypeScript** — đang ở 6.0.3; **không nâng lên 7** cho tới khi `typescript-eslint` nới peer `<6.1.0`; nâng sớm sẽ giết type-aware lint.
8. **Cấm `drizzle-kit push`** — schema chỉ đi qua migration file.
9. **Bốn design pattern backend** — copy §4.6: plugin có `name`, deps là tham số, domain trả discriminated union, transaction thuộc service + bắt `23P01` → 409.
10. **Đánh đổi CI/deploy chạy song song** — ghi lại từ Task 14 Step 2.
11. **Cạm bẫy `bun run --filter '*'`** — nó **im lặng bỏ qua** workspace không khai script tương ứng rồi vẫn exit 0. Hệ quả: `bun run typecheck` và `bun run test` ở root có thể xanh mà chưa hề kiểm tra một package nào. **Luật: mọi workspace mới bắt buộc phải khai `typecheck` trong `package.json` ngay khi được tạo.** Cách kiểm tra nằm ở Task 11 Step 1 của plan.
12. **`exactOptionalPropertyTypes` bật ở `packages/*`, tắt ở `apps/{web,admin}`** — không phải quên, mà vì cờ này đánh nhau với mẫu JSX `prop={cond ? value : undefined}`. Đừng "sửa" bằng cách bật lại ở app hay tắt luôn ở base.

- [ ] **Step 2: Viết `apps/api/CLAUDE.md`**

Ngắn, trỏ về root. Phải có: luồng `route → service → db` và cấm mũi tên ngược · `src/db.ts` là chỗ duy nhất biết driver, đổi driver chỉ sửa file đó · bắt buộc bắt `23P01` → 409 khi có bảng `rentals` · mọi route phải khai `response` schema TypeBox (Elysia dùng nó cho đường serialize nhanh) · mọi plugin phải có `name` · perf budget · seam auth tìm bằng `grep -rn "SEAM: JWT auth"`.

- [ ] **Step 3: Viết `apps/web/CLAUDE.md`**

Ngắn, trỏ về root. Phải có: **UI phải tôn trọng `DESIGN.md` và `PRODUCT.md` ở root** (link tương đối) · SEO quan trọng → ưu tiên SSG/ISR, tránh `force-dynamic` trừ khi có lý do viết ra · i18n hiện là seam một file `messages/vi.json`, thêm next-intl chỉ khi thật sự có ngôn ngữ thứ hai · `impeccable` áp dụng cho app này.

- [ ] **Step 4: Viết `apps/admin/CLAUDE.md`**

Ngắn, trỏ về root. Phải có: **ưu tiên chức năng, không polish pass trừ khi được yêu cầu** · role `OWNER`/`STAFF`, `SALES` để dành · `impeccable` chỉ audit nhẹ ở đây, không dùng để làm đẹp.

- [ ] **Step 5: Viết `packages/shared/CLAUDE.md`**

Phải có: **TDD nghiêm bắt buộc** — test trước, luôn luôn, cho mọi thứ trong `src/domain/` · `src/domain/` không được import bất cứ gì · `@elysiajs/eden` là dependency duy nhất và chỉ dùng trong `src/client.ts` · `client.ts` phải giữ generic, không bao giờ import `@v9/api` (nếu không sẽ tạo chu trình) · tiền là `Vnd` = số nguyên đồng, mọi phép chia phải qua `roundVnd`.

- [ ] **Step 6: Viết `packages/db/CLAUDE.md`**

Phải có: cấm `drizzle-kit push` · bảng thường → `bun run db:generate`; DDL Postgres thuần → `bun run db:custom` · khi tạo bảng `rentals`, migration phải kèm exclusion constraint `EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)` với `period` biên `[)` khớp `overlaps()` của `@v9/shared` · `btree_gist` đã bật ở migration 0000.

- [ ] **Step 7: Verify mọi CLAUDE.md tồn tại và có link đúng**

```bash
ls CLAUDE.md apps/*/CLAUDE.md packages/*/CLAUDE.md
grep -l "DESIGN.md" apps/web/CLAUDE.md
```

Expected: 6 file; `apps/web/CLAUDE.md` có tham chiếu `DESIGN.md`.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md apps/*/CLAUDE.md packages/*/CLAUDE.md
git commit -m "docs: CLAUDE.md root + per-workspace, luật per-tool và session workflow"
```

---

## Task 16: `/impeccable init` — PRODUCT.md + DESIGN.md

**Files:**
- Create: `PRODUCT.md`, `DESIGN.md`

- [ ] **Step 1: Chạy `/impeccable init`**

Đây là interview nhiều vòng, cần người trả lời. Context phải đưa vào:

- Khán giả: dân chơi mô tô phân khối lớn người Việt ở TP.HCM, **cộng** khách du lịch nước ngoài thuê xe ngắn ngày.
- Vibe: **moto-garage** — tối, nhiều ảnh, typography đậm.
- **Cấm rõ**: thẩm mỹ SaaS generic — gradient tím, Inter ở mọi nơi, card lồng card.
- Phạm vi: `apps/web` là chính. `apps/admin` ưu tiên chức năng, chỉ audit nhẹ.

- [ ] **Step 2: Verify hai file ra đời và được tham chiếu**

```bash
ls PRODUCT.md DESIGN.md
grep -c "DESIGN.md" apps/web/CLAUDE.md
```

Expected: cả hai file tồn tại; đếm ≥ 1.

- [ ] **Step 3: Commit**

```bash
git add PRODUCT.md DESIGN.md
git commit -m "docs: PRODUCT.md + DESIGN.md từ impeccable init"
```

---

## Task 17: Ghi ADR vào Agent Memory + verify 12 tiêu chí

**Files:** không tạo file — ghi vào Agent Memory MCP.

- [ ] **Step 1: Ghi từng quyết định vào memory**

Dùng `memory_save`. Mỗi bản ghi là **quyết định + lý do**, không phải code. Bốn bản ghi bắt buộc:

1. **Monorepo layout** — bun workspaces `apps/{api,admin,web}` + `packages/{db,shared}`; `packages/shared` giữ toàn bộ domain logic và là nơi duy nhất được phép chứa phép tính pricing/availability; lý do: ép ranh giới bằng workspace thay vì bằng quy ước.
2. **Eden Treaty wiring** — `createApiClient<T>()` sống trong `@v9/shared/client`, generic trên `App`; `shared` **không bao giờ** import `apps/api`; lý do: import trực tiếp tạo chu trình `shared → api → shared` vì `apps/api` dùng domain logic của `shared`.
3. **Migration workflow** — `drizzle-kit generate` cho bảng thường, `--custom` cho DDL Postgres thuần; `drizzle-kit push` bị cấm; migration đầu chỉ bật `btree_gist`, exclusion constraint đi cùng migration tạo bảng `rentals` ở phiên nghiệp vụ; lý do: một journal duy nhất giữ trạng thái, và schema phải review được trong diff.
4. **Chống double-booking bằng exclusion constraint ở tầng DB** — biên `[start, end)` phải khớp giữa `tstzrange` và `overlaps()` của `@v9/shared`; service **bắt buộc** bắt SQLSTATE `23P01` và dịch thành 409; lý do: không bắt thì va chạm booking rơi ra ngoài dưới dạng 500.

Nên ghi thêm: pin TypeScript 6.0.3 kèm điều kiện gỡ; chọn driver `bun-sql` kèm đường lùi `postgres-js` nằm ở `apps/api/src/db.ts`; tiền là số nguyên đồng.

- [ ] **Step 2: Verify đọc lại được**

Dùng `memory_recall` với query `"eden treaty wiring v9"`.
Expected: trả về bản ghi số 2.

- [ ] **Step 3: Chạy toàn bộ ma trận verify §12 của design doc**

```bash
bun install
docker compose up -d && docker compose ps
bun run db:migrate
bun test
bun run typecheck
bun run lint
curl -s localhost:3001/health
curl -s localhost:3001/health/deep
ls CLAUDE.md apps/*/CLAUDE.md packages/*/CLAUDE.md PRODUCT.md DESIGN.md
ls docs/plans/
git log --oneline | head -20
```

Đối chiếu từng dòng với bảng §12. **Không tuyên bố tiêu chí nào đạt nếu chưa đọc output của nó.**

- [ ] **Step 4: Verify không có secret bị commit**

```bash
git log -p | grep -nE "(password|secret|key)\s*[:=]\s*[^ ]" | grep -v "change_me_in_env\|unused_until\|ci_password" || echo "sạch"
```

Expected: `sạch`.

- [ ] **Step 5: Commit cuối và push**

```bash
git add -A
git commit -m "chore: hoàn tất scaffold, verify đủ 12 tiêu chí"
git push
```

---

## Self-review của plan này

**Spec coverage** — đối chiếu 12 tiêu chí "setup done" với task:

| Tiêu chí | Task |
|---|---|
| 1. `bun install` + workspace resolve | 1, 11 |
| 2. compose lên postgres+minio, api nối được cả hai | 7, 8 (Step 11) |
| 3. `/health` qua Elysia+TypeBox, export type Eden | 8 |
| 4. admin + web render placeholder, gọi `/health` typed | 9, 10 |
| 5. drizzle config + migration `btree_gist`, `db:migrate` chạy | 6, 7 |
| 6. shared có pure function + test, `bun test` pass | 3, 4, 11 |
| 7. CLAUDE.md root đủ nội dung + per-app | 15 |
| 8. PRODUCT.md + DESIGN.md, web CLAUDE.md tham chiếu | 16 |
| 9. `docs/plans/` có design doc + plan | đã xong trước Task 1 |
| 10. `.env.example` phủ hết, không commit secret | 1, 17 (Step 4) |
| 11. `typecheck` pass toàn workspace | 11 |
| 12. ghi quyết định vào Agent Memory | 17 |
| *(mở rộng)* `lint` pass + boundaries chặn thật | 2, 11 |
| *(mở rộng)* `bun-sql` nối Postgres thật | 8 (Step 11) |
| *(mở rộng)* `ci.yml` xanh | 14 |

**Type consistency** — `Vnd` (Task 3) dùng lại ở Task 15 Step 5 · `Interval`/`overlaps` (Task 4) dùng lại ở Task 7 Step 6 và Task 15 Step 6 · `createApiClient<T>` (Task 5) dùng ở Task 9 Step 4 và Task 10 Step 4 với cùng chữ ký · `App` export ở Task 8 Step 8, import ở Task 9/10 · `Role`/`AuthContext` chỉ khai ở Task 8 Step 6, không task nào dùng lại (đúng — nó là seam).

**Placeholder scan** — không có "TBD"/"tương tự Task N"/"thêm error handling phù hợp". Task 15 mô tả nội dung CLAUDE.md bằng danh sách yêu cầu bắt buộc thay vì prose có sẵn, vì nội dung đó phải copy từ §11.2 và §11.3 của design doc — nguồn đã tồn tại và đã được duyệt, chép lại vào đây sẽ tạo hai bản dễ lệch nhau.
