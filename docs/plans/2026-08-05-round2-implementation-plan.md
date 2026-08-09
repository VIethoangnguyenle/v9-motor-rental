# V9 Motor Rental — Đợt 2: Implementation Plan

> ## ✅ ĐÃ THỰC THI XONG — 2026-08-05
>
> **8/8 task hoàn thành**, đã lên `main`. Checkbox bên dưới **cố ý không tick**, cùng lý do như
> plan đợt 1: nguồn sự thật về code là repo, file này là bản ghi _ý định_.
>
> **Ma trận verify cuối đợt** (chạy lại được bất cứ lúc nào):
>
> | Tiêu chí                                                | Kết quả                                            |
> | ------------------------------------------------------- | -------------------------------------------------- |
> | `apps/admin` biến mất                                   | ✅                                                 |
> | Bảng theo schema: `directus` / `supertokens` / `public` | 29 / 55 / **0**                                    |
> | `directus_app` và `supertokens_app` đổi schema `public` | ✅ `ERROR: permission denied for schema public`    |
> | `bun run typecheck`                                     | ✅ 5/5 workspace                                   |
> | `bun run lint`                                          | ✅ exit 0                                          |
> | `bun test`                                              | ✅ 15 pass                                         |
> | 3 probe boundaries                                      | ✅ nổ đúng luật, im đúng chỗ                       |
> | `POST /auth/signup` tới được SuperTokens core           | ✅ `{"message":"Missing input param: formFields"}` |
>
> **Còn gác lại sau đợt này:** deploy lên VPS (người dùng gác) · `DESIGN.md` (cần màn hình thật
> và asset logo) · icon placeholder của `apps/staff` · enforce auth trên route nghiệp vụ (chưa có
> route nào để bảo vệ).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps dùng checkbox (`- [ ]`).

**Goal:** Thay `apps/admin` tự viết bằng Directus (chỉ dữ liệu gốc), thu hẹp `apps/web` về xem xe + tạo request, dựng khung `apps/staff` PWA, và cắm SuperTokens vào seam auth đã có. Không business feature nào.

**Design doc:** [`2026-08-05-round2-directus-staff-design.md`](2026-08-05-round2-directus-staff-design.md) — đọc trước, đặc biệt §3.2 và §4.

**Nguyên tắc xuyên suốt đợt này:** ranh giới quyền phải được **Postgres** ép, không phải cấu hình của tool. Mọi tiêu chí "không cho phép" đều verify bằng cách **thử làm rồi xác nhận bị chặn**, không bằng cách đọc lại config.

---

## Trạng thái đầu vào

Đợt 1 xong, `main` ở `f900d54`. 5 workspace, `bun test` 15 pass, `typecheck` 5/5, `lint` exit 0 (một cảnh báo `mode` không gỡ được), CI xanh. `docker compose up -d` cho Postgres 17 + MinIO.

## Bản đồ thay đổi

| File/thư mục                        | Thao tác                                              |
| ----------------------------------- | ----------------------------------------------------- |
| `apps/admin/**`                     | xoá                                                   |
| `compose.yaml`, `compose.prod.yaml` | bỏ service `admin`; thêm `directus`, `supertokens`    |
| `Caddyfile`                         | bỏ route admin; thêm route Directus                   |
| `.github/workflows/deploy.yml`      | bỏ `admin` khỏi matrix                                |
| `eslint.config.js`                  | bỏ `admin` khỏi element `frontend`; thêm `apps/staff` |
| `packages/db/migrations/0001_*.sql` | role + schema cho Directus và SuperTokens             |
| `apps/web/**`                       | thu hẹp copy và luồng                                 |
| `apps/staff/**`                     | tạo mới                                               |
| `apps/api/src/plugins/auth.ts`      | thay seam bằng SuperTokens thật                       |
| `PRODUCT.md`, `CLAUDE.md`           | cập nhật                                              |

---

## Task 1: Cập nhật `PRODUCT.md`

**Files:** Modify `PRODUCT.md`

- [ ] **Step 1: Sửa mục `## Product Purpose`**

Thay đoạn nói web nhận đặt xe online đầy đủ bằng:

```markdown
Site công khai cho khách **xem mẫu xe và gửi yêu cầu thuê**. Khách không tự chốt đơn — yêu cầu đi
vào hệ thống, nhân viên tiếp nhận và chốt thành đơn thuê thật trong `apps/staff`.

Thành công nghĩa là khách gửi được yêu cầu ngoài giờ làm việc và không bị bỏ sót, thay vì phải nhắn
Zalo rồi chờ.
```

- [ ] **Step 2: Sửa mục `## Capabilities and Constraints`**

Đoạn nói khách cuối chạm trực tiếp vào exclusion constraint **không còn đúng**. Thay bằng:

```markdown
Vì `apps/web` chỉ tạo _yêu cầu_, **nhân viên mới là người chạm vào ràng buộc này** khi chốt đơn
trong `apps/staff` — không phải khách cuối. Va chạm vẫn xảy ra (hai yêu cầu cùng xe cùng ngày), chỉ
là nó lộ ra với nhân viên chứ không với khách. Luật `23P01` → 409 vẫn bắt buộc.
```

- [ ] **Step 3: Thêm vào `## Operating Context`**

```markdown
**Phân vai công cụ nội bộ:**

- **Directus** — chỉ dữ liệu gốc: danh mục xe, ảnh, bảng giá. Không làm vận hành.
- **`apps/staff`** — vận hành hằng ngày: lịch đặt xe, thống kê, lên đơn và bàn giao xe (chụp ảnh
  giấy tờ, ký hợp đồng), quản lý khách hàng, tiếp nhận yêu cầu từ web.
- Xác thực cho `apps/staff` dùng **SuperTokens** self-host. Khách trên `apps/web` không cần tài khoản.
```

- [ ] **Step 4: Commit**

```bash
git add PRODUCT.md
git commit -m "docs(product): web tạo request thay vì chốt đơn; thêm Directus, apps/staff, SuperTokens"
```

---

## Task 2: Xoá `apps/admin`

**Files:** Delete `apps/admin/**`; modify `compose.prod.yaml`, `Caddyfile`, `.github/workflows/deploy.yml`, `eslint.config.js`, `CLAUDE.md`

- [ ] **Step 1: Tìm hết tham chiếu trước khi xoá**

Run: `grep -rn "admin" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yaml" --include="*.yml" --include="*.js" --include="*.md" --include="Dockerfile" --include="Caddyfile" . | grep -v node_modules | grep -v "^./docs/plans/"`

Ghi lại danh sách. Đừng xoá mù — dùng danh sách này làm checklist, và cuối task chạy lại để xác nhận không còn tham chiếu sống.

- [ ] **Step 2: Xoá thư mục**

```bash
git rm -r apps/admin
```

- [ ] **Step 3: `compose.prod.yaml`** — xoá nguyên service `admin` và mọi `depends_on` trỏ tới nó.

- [ ] **Step 4: `Caddyfile`** — xoá khối `admin.{$ROOT_DOMAIN}`.

- [ ] **Step 5: `.github/workflows/deploy.yml`** — bỏ `admin` khỏi `strategy.matrix.app`, còn `[api, web]`.

- [ ] **Step 6: `eslint.config.js`** — đổi element `frontend`:

```js
{ type: "frontend", pattern: "apps/{web,staff}/**" },
```

**Không** đụng `import/resolver`, `mode: "full"`, hay các element khác — chúng là load-bearing, có comment giải thích trong file.

- [ ] **Step 7: `CLAUDE.md`** — xoá dòng `apps/admin` khỏi bảng repo map; sửa mọi chỗ nói "hai frontend dùng hai framework" cho khớp thực tế mới (`apps/web` Next, `apps/staff` Vite).

- [ ] **Step 8: Verify sạch**

```bash
bun install
bun run typecheck
bun run lint
bun test
```

Rồi chạy lại lệnh grep ở Step 1. Expected: chỉ còn tham chiếu trong `docs/plans/` (là bản ghi lịch sử, giữ nguyên) và `PRODUCT.md`/`CLAUDE.md` nếu có nhắc tới Directus thay thế nó.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: xoá apps/admin, Directus thay vai trò quản trị"
```

---

## Task 3: Role và schema cho Directus + SuperTokens

**Files:** Create `packages/db/migrations/0001_service_roles.sql` + journal entry

- [ ] **Step 1: Sinh migration trống**

```bash
cd packages/db && DATABASE_URL="$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2-)" bun x drizzle-kit generate --custom; cd ../..
```

Đổi tên file sinh ra thành `0001_service_roles.sql` **và sửa `tag` trong `meta/_journal.json` cho khớp** — drizzle-orm resolve file theo `tag`, không theo tên file. (Đợt 1 đã làm y hệt ở migration 0000, xem `packages/db/CLAUDE.md`.)

- [ ] **Step 2: Nội dung migration**

```sql
-- Hai service ngoài (Directus, SuperTokens) dùng chung Postgres này nhưng KHÔNG được
-- đổi schema nghiệp vụ. Chặn ở tầng database chứ không bằng cấu hình của từng tool:
-- toggle trong UI là thứ người sau bật lại được và không để lại dấu vết trong repo.
-- Xem §3.2 và §4.2 của docs/plans/2026-08-05-round2-directus-staff-design.md.

-- ── Directus ──────────────────────────────────────────────────────────────
CREATE ROLE directus_app LOGIN PASSWORD 'directus_change_me';
CREATE SCHEMA IF NOT EXISTS directus AUTHORIZATION directus_app;

GRANT USAGE ON SCHEMA public TO directus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO directus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO directus_app;
REVOKE CREATE ON SCHEMA public FROM directus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO directus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO directus_app;

-- ── SuperTokens ───────────────────────────────────────────────────────────
CREATE ROLE supertokens_app LOGIN PASSWORD 'supertokens_change_me';
CREATE SCHEMA IF NOT EXISTS supertokens AUTHORIZATION supertokens_app;

-- SuperTokens KHÔNG cần đọc bảng nghiệp vụ. Không cấp gì trên public.
REVOKE CREATE ON SCHEMA public FROM supertokens_app;
REVOKE ALL ON SCHEMA public FROM supertokens_app;
```

Mật khẩu ở đây là placeholder cho môi trường dev. **Prod phải đổi** — thêm `DIRECTUS_DB_PASSWORD` và `SUPERTOKENS_DB_PASSWORD` vào `.env.example`, và ghi rõ trong migration comment rằng đây là giá trị dev.

- [ ] **Step 3: Apply và verify quyền THẬT SỰ bị chặn**

```bash
bun run db:migrate
```

Rồi thử phá — đây mới là phần quan trọng:

```bash
# directus_app KHÔNG được tạo bảng trong public
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; CREATE TABLE public.should_fail (id int);"
```

Expected: **lỗi** `permission denied for schema public`.

```bash
# nhưng ĐƯỢC toàn quyền trong schema của nó
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; CREATE TABLE directus.ok_here (id int); DROP TABLE directus.ok_here;"
```

Expected: thành công.

```bash
# supertokens_app cũng bị chặn trên public
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE supertokens_app; CREATE TABLE public.should_fail (id int);"
```

Expected: **lỗi**.

Nếu bất kỳ lệnh "phải lỗi" nào lại thành công → migration sai, sửa trước khi đi tiếp. Đây là tiêu chí #3 và #11 của design doc.

- [ ] **Step 4: Commit**

```bash
git add packages/db .env.example
git commit -m "feat(db): role + schema riêng cho Directus và SuperTokens, chặn DDL lên public"
```

---

## Task 4: Directus vào compose

**Files:** Modify `compose.yaml`, `compose.prod.yaml`, `Caddyfile`, `.env.example`

- [ ] **Step 1: Thêm biến vào `.env.example`**

```bash
# ── Directus ───────────────────────────────────────────────────────────
DIRECTUS_DB_PASSWORD=directus_change_me
DIRECTUS_KEY=thay_bang_chuoi_ngau_nhien_32_ky_tu
DIRECTUS_SECRET=thay_bang_chuoi_ngau_nhien_32_ky_tu
DIRECTUS_ADMIN_EMAIL=admin@example.com
DIRECTUS_ADMIN_PASSWORD=change_me_in_env
DIRECTUS_PORT=8055
```

- [ ] **Step 2: Service trong `compose.yaml` (dev)**

```yaml
directus:
  image: directus/directus:11
  restart: unless-stopped
  depends_on:
    postgres:
      condition: service_healthy
  environment:
    KEY: ${DIRECTUS_KEY}
    SECRET: ${DIRECTUS_SECRET}
    DB_CLIENT: pg
    DB_HOST: postgres
    DB_PORT: "5432"
    DB_DATABASE: ${POSTGRES_DB}
    DB_USER: directus_app
    DB_PASSWORD: ${DIRECTUS_DB_PASSWORD}
    # Bảng hệ thống của Directus nằm ở schema riêng; public chỉ đọc-ghi dữ liệu.
    DB_SEARCH_PATH: directus,public
    ADMIN_EMAIL: ${DIRECTUS_ADMIN_EMAIL}
    ADMIN_PASSWORD: ${DIRECTUS_ADMIN_PASSWORD}
    WEBSOCKETS_ENABLED: "false"
  ports:
    - "${DIRECTUS_PORT}:8055"
```

**Phải kiểm chứng, không được giả định:** `DB_SEARCH_PATH` có thật sự khiến Directus đặt bảng `directus_*` vào schema `directus` hay không, và nó có còn thấy bảng ở `public` để import collection hay không. Đọc tài liệu của bản `directus/directus:11` đang dùng và **xác nhận bằng cách chạy rồi query `pg_tables`**. Nếu cơ chế khác với giả định trên, sửa cho đúng và **báo cáo rõ đã sửa gì** — đừng lặng lẽ đổi sang cho Directus toàn quyền `public`, vì đó là phá bỏ chính điều Task 3 vừa dựng.

- [ ] **Step 3: Khởi động và verify bảng nằm đúng chỗ**

```bash
docker compose up -d directus
sleep 20
docker compose logs directus | tail -20
```

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -tAc \
  "SELECT schemaname, count(*) FROM pg_tables WHERE tablename LIKE 'directus%' GROUP BY schemaname;"
```

Expected: mọi bảng `directus_*` ở schema `directus`, **0 bảng ở `public`**.

- [ ] **Step 4: Verify Directus KHÔNG đổi được schema nghiệp vụ**

Đây là tiêu chí quan trọng nhất của cả đợt.

Mở `http://localhost:8055`, đăng nhập bằng `DIRECTUS_ADMIN_EMAIL`. Vào Settings → Data Model, thử thêm một field vào một bảng trong `public`.

Expected: **Directus báo lỗi quyền.** Chụp lại thông báo lỗi và dán vào báo cáo.

Nếu chưa có bảng nghiệp vụ nào trong `public` để thử (đợt này chưa tạo bảng nghiệp vụ), tạo tạm một bảng bằng role `v9` để làm bia:

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -c "CREATE TABLE public.probe_target (id int primary key);"
# ... thử thêm field từ UI Directus, xác nhận bị từ chối ...
docker compose exec -T postgres psql -U v9 -d v9_rental -c "DROP TABLE public.probe_target;"
```

- [ ] **Step 5: `compose.prod.yaml` + route Caddy**

Thêm service `directus` tương tự (không publish port ra host), và vào `Caddyfile`:

```caddyfile
data.{$ROOT_DOMAIN} {
	reverse_proxy directus:8055
}
```

Dùng `data.` thay vì `admin.` có chủ ý: `admin.` gợi ý đây là app quản trị chính, mà nó không phải — vận hành nằm ở `apps/staff`.

- [ ] **Step 6: Commit**

```bash
git add compose.yaml compose.prod.yaml Caddyfile .env.example
git commit -m "feat(infra): Directus cho dữ liệu gốc, schema riêng, không đổi được schema nghiệp vụ"
```

---

## Task 5: SuperTokens core + ghép vào `apps/api`

**Files:** Modify `compose.yaml`, `compose.prod.yaml`, `.env.example`, `apps/api/package.json`, `apps/api/src/plugins/auth.ts`

- [ ] **Step 1: `.env.example`**

```bash
# ── SuperTokens ────────────────────────────────────────────────────────
SUPERTOKENS_DB_PASSWORD=supertokens_change_me
SUPERTOKENS_CONNECTION_URI=http://localhost:3567
SUPERTOKENS_API_KEY=thay_bang_chuoi_ngau_nhien
STAFF_APP_URL=http://localhost:3003
```

- [ ] **Step 2: Service trong `compose.yaml`**

```yaml
supertokens:
  image: registry.supertokens.io/supertokens/supertokens-postgresql:latest
  restart: unless-stopped
  depends_on:
    postgres:
      condition: service_healthy
  environment:
    POSTGRESQL_CONNECTION_URI: postgres://supertokens_app:${SUPERTOKENS_DB_PASSWORD}@postgres:5432/${POSTGRES_DB}
    POSTGRESQL_TABLE_SCHEMA: supertokens
    API_KEYS: ${SUPERTOKENS_API_KEY}
  ports:
    - "3567:3567"
  healthcheck:
    test:
      [
        "CMD",
        "bash",
        "-c",
        "exec 3<>/dev/tcp/127.0.0.1/3567 && echo -e 'GET /hello HTTP/1.1\\r\\nhost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && cat <&3 | grep 'Hello'",
      ]
    interval: 10s
    timeout: 5s
    retries: 10
```

Verify `POSTGRESQL_TABLE_SCHEMA` thật sự đặt bảng vào schema `supertokens`:

```bash
docker compose exec -T postgres psql -U v9 -d v9_rental -tAc \
  "SELECT schemaname, count(*) FROM pg_tables WHERE schemaname='supertokens' GROUP BY schemaname;"
```

Expected: có bảng ở schema `supertokens`, **0 bảng SuperTokens ở `public`**.

- [ ] **Step 3: Cài SDK**

```bash
bun add --cwd apps/api supertokens-node@24.0.3
```

- [ ] **Step 4: Thay seam bằng SuperTokens thật — `apps/api/src/plugins/auth.ts`**

```ts
import { Elysia } from "elysia";
import supertokens from "supertokens-node";
import Session from "supertokens-node/recipe/session";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import { middleware } from "supertokens-node/framework/custom";
import { env } from "../env";

export type Role = "OWNER" | "STAFF" | "SALES";

export interface AuthContext {
  readonly userId: string;
  readonly role: Role;
}

supertokens.init({
  framework: "custom",
  supertokens: { connectionURI: env.supertokens.connectionUri, apiKey: env.supertokens.apiKey },
  appInfo: {
    appName: "V9 Motor Rental",
    apiDomain: env.apiDomain,
    websiteDomain: env.staffAppUrl,
    apiBasePath: "/auth",
    websiteBasePath: "/auth",
  },
  recipeList: [EmailPassword.init(), Session.init()],
});

const stHandler = middleware();

/**
 * SuperTokens tự phục vụ các route /auth/* (đăng nhập, đăng xuất, refresh).
 * Framework "custom" làm việc trên Request/Response chuẩn Web — cùng thứ Elysia dùng —
 * nên không cần lớp chuyển đổi nào. Đã kiểm chứng chạy dưới Bun trước khi chọn.
 */
export const auth = new Elysia({ name: "auth" }).all("/auth/*", async ({ request }) => {
  return await stHandler(request, new Response());
});
```

**Chữ ký thật của `middleware()` phải được xác nhận từ `.d.ts` đã cài** (`node_modules/supertokens-node/lib/build/framework/custom/index.d.ts`) trước khi viết — nó nhận `(request, response, next?)` với kiểu do `wrapRequest`/`wrapResponse` quyết định. Đoạn trên là hình dạng dự kiến; nếu thực tế cần `PreParsedRequest`/`CollectingResponse` thì dùng chúng và **báo cáo đã đổi gì**.

Bỏ `.derive()` cũ: chưa route nào cần `AuthContext` ở đợt này. Giữ lại `type Role` và `type AuthContext` vì `apps/staff` và các route tương lai sẽ dùng.

- [ ] **Step 5: Thêm env vào `apps/api/src/env.ts`**

```ts
  apiDomain: process.env.API_DOMAIN ?? "http://localhost:3001",
  staffAppUrl: process.env.STAFF_APP_URL ?? "http://localhost:3003",
  supertokens: {
    connectionUri: required("SUPERTOKENS_CONNECTION_URI"),
    apiKey: required("SUPERTOKENS_API_KEY"),
  },
```

- [ ] **Step 6: Verify seam gọi được SuperTokens thật**

```bash
docker compose up -d
bun --env-file=.env run --filter @v9/api dev &
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/auth/signup
```

Expected: **không phải 404**. SuperTokens trả về mã lỗi của nó (thường 400 vì thiếu body) — điều đó chứng minh request đã tới SuperTokens chứ không rơi vào hư vô. Dán mã và body thật vào báo cáo.

```bash
curl -s localhost:3001/health   # {"status":"ok"} — không được vỡ
```

- [ ] **Step 7: Commit**

```bash
git add compose.yaml compose.prod.yaml .env.example apps/api package.json bun.lock
git commit -m "feat(api): SuperTokens core + ghép middleware vào seam auth"
```

---

## Task 6: Thu hẹp `apps/web`

**Files:** Modify `apps/web/messages/vi.json`, `apps/web/app/page.tsx`, `apps/web/AGENTS.md`

- [ ] **Step 1: `messages/vi.json`** — đổi copy cho khớp vai trò mới

```json
{
  "site": {
    "title": "V9 Motor Rental",
    "tagline": "Thuê mô tô phân khối lớn tại TP.HCM"
  },
  "scaffold": {
    "notice": "Trang tạm. Danh sách xe và form gửi yêu cầu chưa làm.",
    "apiHealth": "Trạng thái API"
  },
  "booking": {
    "cta": "Gửi yêu cầu thuê",
    "afterSubmit": "Đã nhận yêu cầu. Shop sẽ liên hệ với bạn để xác nhận xe và thời gian."
  }
}
```

Câu `afterSubmit` quan trọng: nó **không hứa** xe còn trống. Đó là sự thật của luồng request — hứa sai ở đây là tạo ra khách bực bội mà không ai phát hiện cho tới lúc gọi điện.

- [ ] **Step 2: `app/page.tsx`** — sửa dòng notice cho khớp; giữ nguyên phần gọi `/health` và `revalidate = 60`.

- [ ] **Step 3: `apps/web/AGENTS.md`** — sửa phần mô tả vai trò

Viết **ngoài** cặp marker `nextjs-agent-rules` (Next ghi lại khối bên trong mỗi lần `next dev`). Nội dung phải nói rõ:

- Web **không chốt đơn**, chỉ tạo yêu cầu. Không đọc availability thời gian thực.
- Vì vậy trang xe tĩnh hoàn toàn được — đúng lý do Next được chọn.
- Copy **không được hứa** xe còn trống.
- `apps/admin` không còn tồn tại; app còn lại là `apps/staff` (Vite PWA).

- [ ] **Step 4: Verify + commit**

```bash
bun run --filter @v9/web build
bun run lint && bun run typecheck
git add apps/web
git commit -m "refactor(web): thu hẹp về xem xe + gửi yêu cầu, không hứa chốt đơn"
```

---

## Task 7: Dựng khung `apps/staff` PWA

**Files:** Create `apps/staff/**`

- [ ] **Step 1: `apps/staff/package.json`**

```json
{
  "name": "@v9/staff",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port ${STAFF_PORT:-3003}",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port ${STAFF_PORT:-3003}",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "5.101.4",
    "@tanstack/react-router": "1.170.18",
    "@v9/shared": "workspace:*",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "@v9/api": "workspace:*",
    "@vitejs/plugin-react": "6.0.5",
    "vite": "8.2.0",
    "vite-plugin-pwa": "1.3.0"
  }
}
```

`@types/react-dom` là **19.2.4** — 19.2.18 không tồn tại trên registry (phát hiện ở đợt 1). `vite-plugin-pwa` 1.3.0 đã **kiểm registry**: peer nhận `vite ^8.0.0` nên khớp. (Bản nháp đầu của plan ghi 1.0.3 — sai, sửa sau khi kiểm.)

- [ ] **Step 2: `apps/staff/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client", "vite-plugin-pwa/client"],
    "exactOptionalPropertyTypes": false,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*", "vite.config.ts"]
}
```

- [ ] **Step 3: `apps/staff/vite.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "V9 Motor Rental — Nhân viên",
        short_name: "V9 Staff",
        description: "Lịch, bàn giao xe, khách hàng",
        lang: "vi",
        display: "standalone",
        background_color: "#111111",
        theme_color: "#111111",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
```

Cần hai file icon thật ở `apps/staff/public/`. **Không có icon thì trình duyệt không cho cài** — đây là lỗi im lặng kinh điển của PWA. Nếu chưa có asset thương hiệu, sinh hai PNG đặc màu `#111111` làm chỗ giữ và **ghi rõ trong báo cáo là placeholder cần thay**.

- [ ] **Step 4: `index.html`, `src/lib/api.ts`, `src/pages/health.tsx`, `src/router.tsx`, `src/main.tsx`**

Cấu trúc giống hệt `apps/admin` cũ (xem git history: `git show 64689ea`), đổi `VITE_API_URL` giữ nguyên tên biến, đổi tiêu đề thành "V9 Motor Rental — Nhân viên".

`data.status` phải suy ra literal `"ok"` qua Eden. **Kiểm bằng negative control**: thêm tạm `// @ts-expect-error` với literal sai, xác nhận `tsc` **không** báo "unused @ts-expect-error", rồi xoá. Compile được thôi chưa chứng minh type không phải `any`.

- [ ] **Step 5: ESLint element**

`eslint.config.js` đã đổi ở Task 2 Step 6 thành `apps/{web,staff}/**`. Xác nhận `boundaries/no-unknown-files` không nổ trên file mới nào.

- [ ] **Step 6: Verify cài được như app**

```bash
bun install
bun run --filter @v9/staff build
ls apps/staff/dist/            # index.html, assets/, sw.js, manifest.webmanifest
```

Rồi chạy `bun run --filter @v9/staff preview` và mở bằng `/browse`: kiểm tra manifest tải được, service worker đăng ký được, và không có lỗi console. Báo cáo chính xác đã verify tới đâu — nếu không xác nhận được nút "cài app" thì nói thẳng là chưa xác nhận được.

- [ ] **Step 7: Commit**

```bash
git add apps/staff package.json bun.lock eslint.config.js
git commit -m "feat(staff): khung PWA Vite + TanStack, gọi /health qua Eden typed"
```

---

## Task 8: Docker, CI, CLAUDE.md, ADR, verify cuối

- [ ] **Step 1: `apps/staff/Dockerfile` + `Caddyfile`**

Copy nguyên mẫu từ `apps/admin` cũ (`git show 80218d3 -- apps/admin/Dockerfile apps/admin/Caddyfile`), đổi tên app. Nhớ ba bài học đợt 1:

- **không** dùng stage `deps` tách rời — bun isolated linker không hoist, phải copy source rồi mới `bun install`;
- copy `package.json` của **mọi** workspace, vì `--frozen-lockfile` xác thực cả đồ thị;
- `try_files {path} /index.html` bắt buộc, nếu không mọi route sâu 404 khi F5.

- [ ] **Step 2: `compose.prod.yaml` + `deploy.yml`** — thêm `staff` (image `...-staff`), thêm route `staff.{$ROOT_DOMAIN}` vào `Caddyfile`, thêm `staff` vào matrix.

- [ ] **Step 3: Build thật cả bốn image và CHẠY chúng**

```bash
docker build -f apps/api/Dockerfile -t v9-api:t .
docker build -f apps/web/Dockerfile -t v9-web:t .
docker build -f apps/staff/Dockerfile --build-arg VITE_API_URL=http://localhost:3001 -t v9-staff:t .
```

Với `staff`: `docker run --rm -p 3103:3002 v9-staff:t` rồi
`curl -s -o /dev/null -w '%{http_code}' localhost:3103/duong/dan/sau` → phải là **200**, không phải 404.

- [ ] **Step 4: `CLAUDE.md`**

Cập nhật repo map (bỏ `admin`, thêm `staff`, thêm Directus và SuperTokens). Thêm mục mới:

> **Directus và SuperTokens dùng chung Postgres nhưng KHÔNG được đổi schema.** Ép bằng role
> Postgres, không bằng cấu hình của tool. `public` do migration làm chủ; `directus` và `supertokens`
> mỗi service tự quản. Cách kiểm: `SET ROLE directus_app; CREATE TABLE public.x (id int);` → phải
> bị từ chối. Chạy lại sau mỗi lần nâng version Directus hoặc SuperTokens.

- [ ] **Step 5: Chạy lại bộ probe boundaries**

`eslint.config.js` đã bị sửa ở Task 2 → **bắt buộc** chạy lại bộ probe trong `CLAUDE.md`. Vi phạm phải nổ, `import type` hợp lệ phải im.

- [ ] **Step 6: Ghi ADR**

`memory_save` cho: phân vai Directus vs `apps/staff` · chặn schema drift bằng role Postgres (kèm SQL) · SuperTokens chọn vì gì và đã kiểm chứng chạy dưới Bun ra sao · đảo chiều web từ chốt đơn sang tạo request.

- [ ] **Step 7: Verify toàn bộ + push**

```bash
docker compose up -d && docker compose ps
bun run db:migrate && bun test && bun run typecheck && bun run lint
curl -s localhost:3001/health
git push
gh run watch --exit-status
```

Đối chiếu với bảng 12 tiêu chí §7 của design doc. **Không tuyên bố tiêu chí nào đạt nếu chưa đọc output của nó.**

---

## Self-review của plan

**Spec coverage** — 7 hạng mục §6 design doc → Task 1–8 (Task 8 gộp hạ tầng + tài liệu + verify). 12 tiêu chí §7: #1→T2, #2/#3/#4→T4, #5→T6, #6/#7→T7, #8→T8, #9→T8 Step 5, #10/#11→T5, #12→T8 Step 6.

**Chỗ plan CỐ Ý không khẳng định** (phải kiểm chứng lúc làm, đã ghi rõ trong từng bước): cơ chế `DB_SEARCH_PATH` của Directus 11 · `POSTGRESQL_TABLE_SCHEMA` của SuperTokens · chữ ký thật của `middleware()` custom. Ba chỗ này là giả định, không phải sự thật đã verify. (Chỗ thứ tư — version `vite-plugin-pwa` — đã kiểm và bản nháp ghi sai: 1.0.3 → 1.3.0.) — đợt 1 cho thấy giả định chưa kiểm là nơi mọi lỗi đắt tiền trú ngụ.

**Type consistency** — `Role`/`AuthContext` giữ nguyên tên từ đợt 1 · `createApiClient<App>` dùng y hệt ở `apps/staff` như `apps/web` · `VITE_API_URL` giữ nguyên tên biến.

**Placeholder scan** — không có "TBD"/"tương tự Task N"/"thêm xử lý lỗi phù hợp".
