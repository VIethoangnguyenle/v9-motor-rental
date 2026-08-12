# Sửa auth `apps/staff` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa ba lỗi trong luồng đăng nhập/đăng xuất/quên mật khẩu của `apps/staff`, thêm màn đổi mật khẩu tự phục vụ, và chuyển toàn bộ định danh sang tiếng Anh kèm tách component.

**Architecture:** Quyết định điều hướng của guard rút thành hàm thuần test được (`decideEntry`); cặp thu hồi session gộp thành một hàm không tách được (`revokeAndStamp`); frontend chia hai tầng component (`ui/` không biết domain, `auth/`+`staff/` biết). Bug fix land trước, rename land sau — hai loại thay đổi không trộn vào một diff.

**Tech Stack:** Bun · Elysia + TypeBox · Eden Treaty · React 19 + TanStack Router/Query · SuperTokens (`supertokens-node` 24.0.3 / `supertokens-web-js`) · Drizzle · Tailwind v4

Design doc: [`2026-08-13-staff-auth-fix-design.md`](2026-08-13-staff-auth-fix-design.md). ADR: skill `v9-auth`.

---

## Luật áp cho mọi task trong plan này

**Code MỚI viết từ Task 1 trở đi dùng tên tiếng Anh.** Tên CŨ giữ nguyên tới Task 10–16 rồi đổi một
lượt. Nghĩa là Task 2 tạo `MeResult`/`decideEntry` (Anh) nhưng vẫn gọi `dangXuat`, vẫn so
`"DA_KHOA"`, vẫn trỏ `/dang-nhap` — vì những thứ đó lúc ấy còn tên cũ. Trộn ngược lại sẽ ra một task
không biên dịch được.

**Comment tiếng Việt.** Repo này viết comment giải thích _vì sao_; giữ đúng giọng đó. Chuỗi hiển thị
cho người dùng cũng tiếng Việt.

**Đổi tên bằng Serena, không bằng find-and-replace.** `CLAUDE.md` gốc bắt buộc
`find_referencing_symbols` trước khi đổi tên exported symbol.

**Sau mỗi task: commit.** Không gộp nhiều task vào một commit.

---

## File Structure

| File                                           | Trách nhiệm                                                              | Task       |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| `apps/staff/src/lib/me.ts`                     | `Me`, `MeResult`, `meQuery`, `ensureMe` — nguồn duy nhất cho "tôi là ai" | 2, 10      |
| `apps/staff/src/lib/guard-decision.ts`         | **mới** — hàm thuần quyết định vào/chuyển hướng                          | 2          |
| `apps/staff/src/lib/guard-decision.test.ts`    | **mới** — test 7 ca của `decideEntry`                                    | 2          |
| `apps/staff/src/lib/auth.ts`                   | bọc `supertokens-web-js`; `signOut` dọn cache                            | 4, 10      |
| `apps/staff/src/lib/errors.ts`                 | đọc thân lỗi API (đổi tên từ `loi.ts`)                                   | 10, 15     |
| `apps/staff/src/hooks/use-me.ts`               | **mới** — hook đọc `Me` cho component                                    | 3          |
| `apps/staff/src/components/ui/*`               | primitive không biết domain                                              | 5          |
| `apps/staff/src/components/layout/app-nav.tsx` | **mới** — nav dùng chung                                                 | 6          |
| `apps/staff/src/components/auth/*`             | form đăng nhập/đăng ký/quên+đổi mật khẩu                                 | 7, 8, 20   |
| `apps/staff/src/components/staff/*`            | bảng nhân viên + hành động dòng                                          | 9          |
| `apps/staff/src/router.tsx`                    | cây route + guard dịch `EntryDecision` sang `redirect`                   | 3, 12, 20  |
| `apps/api/src/services/staff.ts`               | `revokeAndStamp` — cặp thu hồi không tách được                           | 14, 17     |
| `apps/api/src/services/password-reset.ts`      | `changePassword` + đổi tên                                               | 14, 18     |
| `apps/api/src/routes/staff.ts`                 | route mới `POST /staff/password/change`                                  | 13, 14, 19 |
| `apps/api/src/plugins/staff-guard.ts`          | **không đổi hành vi**, chỉ đổi tên định danh                             | 14         |
| `packages/shared/src/domain/staff.ts`          | `StaffDenyReason` sang tiếng Anh                                         | 13         |
| `scripts/staff-bootstrap.ts`                   | chặn prod thiếu `STAFF_OWNER_PASSWORD`                                   | 21         |

---

# PHA 1 — Chốt luật (1 task)

### Task 1: Viết luật đặt tên và cấu trúc component vào tài liệu

**Files:**

- Modify: `CLAUDE.md` (mục "Luật kiến trúc")
- Modify: `apps/staff/CLAUDE.md` (thêm mục mới trước mục "Xác thực")

- [ ] **Step 1: Thêm mục vào `CLAUDE.md` gốc**

Chèn sau mục "### Tiền là số nguyên đồng":

```markdown
### Định danh tiếng Anh, nội dung tiếng Việt

Component · tên file · hàm · biến · type · hằng · URL route · mã lỗi trong hợp đồng API: **tiếng
Anh**. Comment · tài liệu · chuỗi hiển thị cho người dùng: **tiếng Việt**.

Ranh giới đó không tuỳ hứng: thứ máy đọc thì tiếng Anh, thứ người đọc thì tiếng Việt. Repo có ~2000
dòng comment giải thích _vì sao_ — dịch chúng là phá đúng thứ có giá trị nhất.

⚠️ **Luật này KHÔNG ép được bằng máy.** Không linter nào kiểm được "tên phải là tiếng Anh". Đây là
quy ước trong tài liệu, không phải hàng rào — xem mục "ranh giới repo ép vs cấu hình local".
```

- [ ] **Step 2: Thêm mục vào `apps/staff/CLAUDE.md`**

Chèn ngay trước dòng `## Xác thực: năm màn hình, và **một** hàng rào ở `beforeLoad``:

````markdown
## Cấu trúc component: hai tầng, ranh giới là "có biết domain không"

```
components/ui/      không biết domain — không import lib/api, không biết Me hay StaffRole là gì
components/auth/    form đăng nhập · đăng ký · quên mật khẩu · đổi mật khẩu
components/staff/   bảng nhân viên và hành động trên dòng
components/layout/  nav dùng chung
hooks/              use-me.ts
pages/              lắp component lại, không tự dựng form
```

`ui/` không biết domain **là điều kiện để dùng lại được** ở bốn màn hình nghiệp vụ sắp làm (lịch ·
thống kê · bàn giao · khách hàng). Một `TextField` biết `StaffRole` là một `TextField` chỉ dùng được
ở màn hình nhân viên.

**Form dùng `useMutation`, không cuộn tay `isSubmitting`/`error`.** Đó là pattern đã có trong app
(`staff-list-page.tsx`), không phải pattern thứ hai.
````

- [ ] **Step 3: Format và kiểm**

```bash
bun run format
git diff --stat
```

Expected: đúng 2 file đổi, không file nào khác.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md apps/staff/CLAUDE.md
git commit -m "docs: chốt luật đặt tên tiếng Anh và cấu trúc component hai tầng"
```

---

# PHA 2 — Sửa lỗi (3 task, đổi hành vi)

### Task 2: `MeResult` + `decideEntry` (TDD)

**Files:**

- Modify: `apps/staff/src/lib/me.ts`
- Create: `apps/staff/src/lib/guard-decision.ts`
- Test: `apps/staff/src/lib/guard-decision.test.ts`

- [ ] **Step 1: Viết test TRƯỚC**

Tạo `apps/staff/src/lib/guard-decision.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { decideEntry } from "./guard-decision";
import type { Me } from "./me";

/**
 * `Me` suy ra từ response schema của `GET /staff/me` — sáu field, không hơn.
 * Dựng bằng literal thay vì mock: hàm đang test là hàm thuần, không cần gì khác.
 */
const me = (status: Me["status"]): Me => ({
  id: "u1",
  email: "a@v9.vn",
  fullName: "Nguyễn A",
  phone: null,
  role: "STAFF",
  status,
});

describe("decideEntry", () => {
  it("ca 1: không có session → về đăng nhập, không kèm lý do", () => {
    expect(decideEntry(false, null)).toEqual({ type: "redirect", to: "/dang-nhap" });
  });

  it("ca 2: 403 DA_KHOA → đăng xuất TRƯỚC rồi mới chuyển, kèm lý do", () => {
    expect(decideEntry(true, { ok: false, code: "DA_KHOA" })).toEqual({
      type: "signOutThenRedirect",
      to: "/dang-nhap",
      reason: "disabled",
    });
  });

  it("ca 3: 403 CHUA_CO_HO_SO → cũng đăng xuất, lý do riêng", () => {
    expect(decideEntry(true, { ok: false, code: "CHUA_CO_HO_SO" })).toEqual({
      type: "signOutThenRedirect",
      to: "/dang-nhap",
      reason: "no-profile",
    });
  });

  /**
   * Ca quan trọng nhất của file này. `code === null` gộp cả "mạng chết" — huỷ một
   * session còn hợp lệ vì wifi chớp một cái là hỏng theo chiều sai. Chỉ đăng xuất
   * khi server NÓI RÕ tài khoản không dùng được nữa.
   */
  it("ca 4: lỗi không rõ hoặc mạng chết → chuyển hướng nhưng KHÔNG đăng xuất", () => {
    expect(decideEntry(true, { ok: false, code: null })).toEqual({
      type: "redirect",
      to: "/dang-nhap",
    });
    expect(decideEntry(true, { ok: false, code: "CHUA_DANG_NHAP" })).toEqual({
      type: "redirect",
      to: "/dang-nhap",
    });
  });

  it("ca 5: PENDING → màn chờ duyệt", () => {
    expect(decideEntry(true, { ok: true, me: me("PENDING") })).toEqual({
      type: "redirect",
      to: "/cho-duyet",
    });
  });

  /**
   * Hôm nay API KHÔNG trả được nhánh này: `staff-guard.ts` chặn DISABLED trước cả
   * ngoại lệ `/staff/me`, nên người bị khoá luôn ra 403 DA_KHOA (ca 2). Giữ ca này
   * để nếu ngoại lệ đó đổi thì đây là chỗ đúng — và để tính không-tới-được của nó
   * là một tính chất ĐƯỢC TEST, không phải một lỗi im lặng.
   */
  it("ca 6: hồ sơ nói DISABLED → đăng xuất rồi chuyển (phòng thủ)", () => {
    expect(decideEntry(true, { ok: true, me: me("DISABLED") })).toEqual({
      type: "signOutThenRedirect",
      to: "/dang-nhap",
      reason: "disabled",
    });
  });

  it("ca 7: ACTIVE → cho vào, kèm hồ sơ", () => {
    const hoSo = me("ACTIVE");
    expect(decideEntry(true, { ok: true, me: hoSo })).toEqual({ type: "allow", me: hoSo });
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó HỎNG**

```bash
bun test apps/staff/src/lib/guard-decision.test.ts
```

Expected: FAIL — `Cannot find module './guard-decision'`.

- [ ] **Step 3: Sửa `me.ts` để giữ lại mã lỗi**

Thay toàn bộ nội dung từ dòng 17 tới hết `apps/staff/src/lib/me.ts`:

```ts
/**
 * Kết quả đọc hồ sơ. Trước đây hàm này trả `Me | null` và **nuốt mã lỗi** — đó
 * đúng là lỗi làm nhánh DISABLED của router thành code chết: API trả
 * `403 DA_KHOA` có chủ ý, frontend vứt đi, guard chỉ còn thấy `null`.
 * §1.1 docs/plans/2026-08-13-staff-auth-fix-design.md.
 */
export type MeResult = { ok: true; me: Me } | { ok: false; code: string | null };

/**
 * Một nguồn duy nhất cho "tôi là ai": guard của router và UI đọc CÙNG cache của
 * TanStack Query. Hai chỗ gọi riêng là hai chỗ lệch nhau kể từ lần đầu tiên ai
 * đó thêm một điều kiện vào một trong hai.
 */
export const meQuery = {
  queryKey: ["me"] as const,
  queryFn: async (): Promise<MeResult> => {
    const res = await api.staff.me.get();
    if (res.error) return { ok: false, code: maLoi(res.error.value) };
    return { ok: true, me: res.data };
  },
};

export const layMe = (qc: QueryClient) => qc.ensureQueryData(meQuery);
```

Thêm import ở đầu file: `import { maLoi } from "./loi";`

- [ ] **Step 4: Viết `guard-decision.ts`**

```ts
/**
 * Quyết định "được vào hay bị đá đi đâu" — hàm THUẦN, tách khỏi router có chủ ý.
 *
 * Lỗi cũ (§1.1 design doc) là lỗi THỨ TỰ NHÁNH: `if (!me)` đứng trước nhánh
 * DISABLED nên nhánh đó không bao giờ chạy, và không có gì báo vì `apps/staff`
 * không có một test nào. Rút ra đây thì thứ tự đó test được bằng 7 ca.
 *
 * ⚠️ File này CHỈ được `import type`, không import giá trị. Import `./me` ở dạng
 * giá trị sẽ kéo theo Eden client và `@v9/api` vào lúc chạy, và test thuần sẽ
 * phải dựng cả hợp đồng API để chạy một hàm không chạm mạng. Cùng lý lẽ với luật
 * "`src/domain/**` không được import bất cứ gì" của `packages/shared`.
 */
import type { Me, MeResult } from "./me";

export type LoginReason = "disabled" | "no-profile" | "password-changed";

/**
 * Union literal chứ không phải `string`: `redirect({ to })` của TanStack Router
 * nhận đường dẫn đã biết kiểu, truyền một `string` tuỳ ý vào là lỗi biên dịch.
 */
export type RedirectTarget = "/dang-nhap" | "/cho-duyet";

export type EntryDecision =
  | { type: "allow"; me: Me }
  | { type: "redirect"; to: RedirectTarget }
  | { type: "signOutThenRedirect"; to: "/dang-nhap"; reason: LoginReason };

const DANG_NHAP = "/dang-nhap" as const;

export function decideEntry(hasSession: boolean, result: MeResult | null): EntryDecision {
  if (!hasSession || !result) return { type: "redirect", to: DANG_NHAP };

  if (!result.ok) {
    // Chỉ đăng xuất khi server NÓI RÕ tài khoản không dùng được nữa. `code === null`
    // gộp cả mạng chết — huỷ session hợp lệ vì wifi chớp là hỏng theo chiều sai.
    if (result.code === "DA_KHOA") {
      return { type: "signOutThenRedirect", to: DANG_NHAP, reason: "disabled" };
    }
    if (result.code === "CHUA_CO_HO_SO") {
      return { type: "signOutThenRedirect", to: DANG_NHAP, reason: "no-profile" };
    }
    return { type: "redirect", to: DANG_NHAP };
  }

  if (result.me.status === "PENDING") return { type: "redirect", to: "/cho-duyet" };
  if (result.me.status === "DISABLED") {
    return { type: "signOutThenRedirect", to: DANG_NHAP, reason: "disabled" };
  }
  return { type: "allow", me: result.me };
}
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

```bash
bun test apps/staff/src/lib/guard-decision.test.ts
```

Expected: `7 pass, 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add apps/staff/src/lib/me.ts apps/staff/src/lib/guard-decision.ts apps/staff/src/lib/guard-decision.test.ts
git commit -m "fix(staff): giữ lại mã lỗi của /staff/me và rút quyết định guard thành hàm thuần

meQuery nuốt mọi res.error thành null, nên nhánh DISABLED ở router không bao
giờ chạy được — người bị khoá bị đá về màn đăng nhập không một lời giải thích.
decideEntry giữ 7 ca đó ở một chỗ test được."
```

---

### Task 3: Nối `decideEntry` vào router và thêm hook `useMe`

**Files:**

- Modify: `apps/staff/src/router.tsx:55-76`
- Create: `apps/staff/src/hooks/use-me.ts`
- Modify: `apps/staff/src/pages/health.tsx`, `apps/staff/src/pages/cho-duyet.tsx`, `apps/staff/src/pages/nhan-vien.tsx`

- [ ] **Step 1: Tạo hook `use-me.ts`**

```ts
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { type Me, meQuery, type MeResult } from "../lib/me";

/**
 * Component đọc `Me | null`, KHÔNG đọc `MeResult`. Mã lỗi chỉ có ích cho guard —
 * bắt mọi màn hình phân nhánh trên nó là bắt chúng nhân bản một luật đã có ở
 * `decideEntry`.
 *
 * Nhận `options` để trang chờ duyệt truyền được `refetchInterval` — nó poll 15s
 * cho ca OWNER bấm duyệt ở máy khác. Hook không nhận option sẽ giết tính năng đó.
 */
export function useMe(options?: Partial<UseQueryOptions<MeResult>>) {
  const query = useQuery({ ...meQuery, ...options });
  const me: Me | null = query.data?.ok ? query.data.me : null;
  return { ...query, me };
}
```

- [ ] **Step 2: Sửa `beforeLoad` của `duocBaoVe` trong `router.tsx`**

Thay thân `beforeLoad` (dòng 59–75) bằng:

```tsx
  beforeLoad: async ({ context }) => {
    // KHÔNG gọi `layMe` khi chưa có session: nó sẽ bắn một request `/staff/me`
    // chắc chắn 401 trên mọi lần mở app lúc chưa đăng nhập.
    const hasSession = await coSession();
    const result = hasSession ? await layMe(context.queryClient) : null;
    const decision = decideEntry(hasSession, result);

    if (decision.type === "allow") return { me: decision.me };

    // Đăng xuất TRƯỚC khi chuyển trang: để nguyên session của người bị khoá thì
    // họ quay lại `/` và guard chạy lại đúng vòng này mãi mãi.
    if (decision.type === "signOutThenRedirect") {
      await dangXuat(context.queryClient);
      throw redirect({ to: decision.to, search: { ly_do: decision.reason } });
    }

    // Hai nhánh tường minh chứ không truyền `decision.to` động: `redirect({ to })`
    // của TanStack nhận đường dẫn đã biết kiểu, và `/cho-duyet` không khai
    // `validateSearch` nên hai đích không dùng chung được một lời gọi.
    if (decision.to === "/cho-duyet") throw redirect({ to: "/cho-duyet" });
    throw redirect({ to: "/dang-nhap" });
  },
```

Thêm import: `import { decideEntry } from "./lib/guard-decision";`

- [ ] **Step 3: Mở rộng `validateSearch` của route đăng nhập**

Thay dòng 83–84:

```tsx
  // Chỉ nhận giá trị trong danh sách trắng. Query string là dữ liệu người dùng gõ
  // được — để lọt chuỗi tuỳ ý vào đây là để lọt nó vào JSX của trang đăng nhập.
  validateSearch: (search: Record<string, unknown>): { ly_do?: LoginReason } => {
    const v = search["ly_do"];
    return v === "disabled" || v === "no-profile" || v === "password-changed"
      ? { ly_do: v }
      : {};
  },
```

Thêm import: `import type { LoginReason } from "./lib/guard-decision";`

- [ ] **Step 4: Sửa banner ở `pages/dang-nhap.tsx`**

Thay khối `{search.ly_do === "da-khoa" && ...}` (dòng 30–34):

```tsx
{
  search.ly_do === "disabled" && (
    <p className="mt-3 rounded bg-amber-100 p-3 text-sm">
      Tài khoản của bạn đã bị khoá. Liên hệ chủ shop.
    </p>
  );
}
{
  search.ly_do === "no-profile" && (
    <p className="mt-3 rounded bg-amber-100 p-3 text-sm">
      Tài khoản chưa có hồ sơ nhân viên. Liên hệ chủ shop để được tạo hồ sơ.
    </p>
  );
}
```

- [ ] **Step 5: Đổi ba trang sang `useMe`**

Trong `pages/health.tsx` và `pages/nhan-vien.tsx`, thay:

```tsx
const { data: me } = useQuery(meQuery);
```

bằng:

```tsx
const { me } = useMe();
```

Trong `pages/cho-duyet.tsx`, thay:

```tsx
const { data: me, isPending } = useQuery({ ...meQuery, refetchInterval: 15_000 });
```

bằng:

```tsx
const { me, isPending } = useMe({ refetchInterval: 15_000 });
```

Sửa import tương ứng ở cả ba file (`import { useMe } from "../hooks/use-me";`, bỏ `meQuery`).

- [ ] **Step 6: Kiểm biên dịch**

```bash
bun run --filter @v9/staff typecheck
```

Expected: không lỗi. Nếu `dangXuat(context.queryClient)` báo "Expected 0 arguments" — đúng, Task 4 mới đổi chữ ký; tạm gọi `dangXuat()` không tham số ở Step 2 rồi Task 4 thêm vào.

- [ ] **Step 7: Commit**

```bash
git add apps/staff/src
git commit -m "fix(staff): guard dùng decideEntry — người bị khoá lại thấy được lý do

Banner 'tài khoản đã bị khoá' và validateSearch trước đây là UI chết: không có
đường nào tới được chúng. Thêm ca no-profile, cùng lỗ đã nuốt CHUA_CO_HO_SO."
```

---

### Task 4: Đăng xuất dọn cache TanStack Query

**Files:**

- Modify: `apps/staff/src/lib/auth.ts:87`
- Modify: `apps/staff/src/router.tsx`, `apps/staff/src/pages/health.tsx`, `apps/staff/src/pages/cho-duyet.tsx`

- [ ] **Step 1: Đổi chữ ký `dangXuat`**

Thay dòng cuối `lib/auth.ts`:

```ts
/**
 * Nhận `QueryClient` qua tham số chứ không import singleton — cùng lý lẽ với
 * `createAppRouter`: hai `QueryClient` là hai cache, và dọn nhầm cache thì không
 * có lỗi nào ở đâu.
 *
 * `qc.clear()` không phải chi tiết nhỏ: `Session.signOut()` chỉ xoá session, còn
 * `["me"]` và `["staff-users"]` nằm lại trong memory — người kế tiếp đăng nhập
 * trên cùng tab đọc được dữ liệu của người trước cho tới lần refetch.
 *
 * Đổi CHỮ KÝ thay vì dặn dò: bốn chỗ gọi buộc phải truyền, do compiler ép.
 */
export const dangXuat = async (qc: QueryClient) => {
  await Session.signOut();
  qc.clear();
};
```

Thêm import: `import type { QueryClient } from "@tanstack/react-query";`

- [ ] **Step 2: Cập nhật chỗ gọi trong `pages/health.tsx`**

```tsx
const qc = useQueryClient();

async function thoat() {
  await dangXuat(qc);
  await navigate({ to: "/dang-nhap" });
}
```

Thêm `useQueryClient` vào import từ `@tanstack/react-query`.

- [ ] **Step 3: Cập nhật chỗ gọi trong `pages/cho-duyet.tsx`**

Giống hệt Step 2: thêm `const qc = useQueryClient();` và đổi `await dangXuat()` → `await dangXuat(qc)`.

- [ ] **Step 4: Cập nhật `router.tsx`**

Đảm bảo nhánh `signOutThenRedirect` gọi `await dangXuat(context.queryClient);`.

- [ ] **Step 5: Kiểm**

```bash
bun run --filter @v9/staff typecheck && bun test && bun run lint
```

Expected: typecheck sạch, test pass, lint sạch.

- [ ] **Step 6: Commit**

```bash
git add apps/staff/src
git commit -m "fix(staff): đăng xuất dọn cache query — dữ liệu người trước không ở lại tab"
```

---

# PHA 3 — Tách component (5 task, refactor thuần)

> Không task nào trong pha này được đổi hành vi. Sau mỗi task, app phải chạy y hệt trước đó.

### Task 5: Primitive `ui/`

**Files:**

- Create: `apps/staff/src/components/ui/text-field.tsx`, `submit-button.tsx`, `alert.tsx`, `page-shell.tsx`

- [ ] **Step 1: `text-field.tsx`**

```tsx
/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Đó là điều kiện để dùng lại ở bốn màn hình nghiệp vụ sắp làm.
 */
interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
}

export function TextField({ label, ...input }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input {...input} className="rounded border px-3 py-2" />
    </label>
  );
}
```

- [ ] **Step 2: `submit-button.tsx`**

```tsx
interface SubmitButtonProps {
  readonly pending: boolean;
  readonly children: React.ReactNode;
  readonly pendingLabel: string;
}

export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
```

- [ ] **Step 3: `alert.tsx`**

```tsx
/** Ba mức, ba nền — dùng lại đúng ba class đang rải rác trong các trang hiện tại. */
type AlertTone = "error" | "warning" | "info";

const TONE: Record<AlertTone, string> = {
  error: "bg-red-100 text-red-800",
  warning: "bg-amber-100",
  info: "bg-gray-100",
};

export function Alert({
  tone,
  children,
}: {
  readonly tone: AlertTone;
  readonly children: React.ReactNode;
}) {
  return <p className={`rounded p-3 text-sm ${TONE[tone]}`}>{children}</p>;
}
```

- [ ] **Step 4: `page-shell.tsx`**

```tsx
/** Khung trang hẹp dùng cho mọi màn xác thực (`max-w-sm`). */
export function PageShell({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </main>
  );
}
```

- [ ] **Step 5: Kiểm và commit**

```bash
bun run --filter @v9/staff typecheck && bun run lint
git add apps/staff/src/components/ui
git commit -m "refactor(staff): primitive ui/ — TextField, SubmitButton, Alert, PageShell"
```

---

### Task 6: Tách `AppNav` khỏi trang health

**Files:**

- Create: `apps/staff/src/components/layout/app-nav.tsx`
- Modify: `apps/staff/src/pages/health.tsx:29-45`

- [ ] **Step 1: Tạo `app-nav.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import type { Me } from "../../lib/me";

/**
 * Nav dùng chung. Trước đây chôn trong trang health, nên `/nhan-vien` phải tự chế
 * một link "← Trang chủ" và không có đường đăng xuất.
 *
 * Link `/nhan-vien` chỉ hiện với OWNER — đây là hàng rào của TRẢI NGHIỆM, không
 * phải của dữ liệu: `beforeLoad` của route đó và `/staff/users*` ở server mới là
 * hàng rào thật.
 */
export function AppNav({
  me,
  onSignOut,
}: {
  readonly me: Me | null;
  readonly onSignOut: () => void;
}) {
  return (
    <nav className="flex items-center gap-4 border-b pb-3 text-sm">
      <strong>{me?.fullName}</strong>
      <span className="text-gray-600">{me?.role}</span>
      {me?.role === "OWNER" && (
        <Link to="/nhan-vien" className="underline">
          Nhân viên
        </Link>
      )}
      <button onClick={onSignOut} className="ml-auto underline">
        Đăng xuất
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Dùng nó trong `pages/health.tsx`**

Thay khối `<nav>...</nav>` bằng `<AppNav me={me} onSignOut={() => void thoat()} />`.

- [ ] **Step 3: Kiểm và commit**

```bash
bun run --filter @v9/staff typecheck && bun run lint
git add apps/staff/src
git commit -m "refactor(staff): tách AppNav khỏi trang health"
```

---

### Task 7: Tách form đăng nhập và đăng ký

**Files:**

- Create: `apps/staff/src/components/auth/login-form.tsx`, `signup-form.tsx`
- Modify: `apps/staff/src/pages/dang-nhap.tsx`, `apps/staff/src/pages/dang-ky.tsx`

- [ ] **Step 1: `login-form.tsx` — dùng `useMutation`, bỏ state cuộn tay**

```tsx
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { dangNhap } from "../../lib/auth";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

export function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /**
   * `useMutation` thay cho cặp `dangGui`/`loi` cuộn tay — pattern đã có trong app
   * (trang nhân viên), không phải pattern thứ hai.
   *
   * Không tự lo PENDING/DISABLED ở đây: guard của `/` đọc `/staff/me` rồi đẩy đi
   * đúng chỗ. Một bản sao của luật đó ở đây là bản sao sẽ lệch.
   */
  const login = useMutation({
    mutationFn: async () => {
      const res = await dangNhap(email, password);
      if (!res.ok) throw new Error(res.message);
    },
    onSuccess: () => navigate({ to: "/" }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      <TextField
        label="Email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Mật khẩu"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {login.error && <p className="text-sm text-red-600">{login.error.message}</p>}
      <SubmitButton pending={login.isPending} pendingLabel="Đang đăng nhập…">
        Đăng nhập
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 2: `signup-form.tsx`**

```tsx
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { dangKy } from "../../lib/auth";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

/**
 * `soDienThoai` là field optional ở backend (`plugins/auth.ts` khai
 * `{ id: "soDienThoai", optional: true }`) nên form cũng không bắt buộc — hai bên
 * lệch nhau thì người dùng bị chặn ở client vì một luật server không có.
 */
const FIELDS = [
  { key: "hoTen", label: "Họ và tên", type: "text", required: true, autoComplete: "name" },
  { key: "soDienThoai", label: "Số điện thoại", type: "tel", required: false, autoComplete: "tel" },
  { key: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  {
    key: "matKhau",
    label: "Mật khẩu (ít nhất 8 ký tự)",
    type: "password",
    required: true,
    autoComplete: "new-password",
  },
] as const;

export function SignupForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ hoTen: "", soDienThoai: "", email: "", matKhau: "" });

  const signup = useMutation({
    mutationFn: async () => {
      const res = await dangKy(form);
      if (!res.ok) throw new Error(res.message);
    },
    // Đăng ký xong SuperTokens đã tạo session, nhưng tài khoản ở trạng thái chờ
    // duyệt — đi thẳng tới màn giải thích, trang chủ sẽ đá về đây thôi.
    onSuccess: () => navigate({ to: "/cho-duyet" }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        signup.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      {FIELDS.map(({ key, label, type, required, autoComplete }) => (
        <TextField
          key={key}
          label={label}
          type={type}
          required={required}
          minLength={key === "matKhau" ? 8 : undefined}
          autoComplete={autoComplete}
          value={form[key]}
          onChange={(e) => setForm((truoc) => ({ ...truoc, [key]: e.target.value }))}
        />
      ))}
      {signup.error && <p className="text-sm text-red-600">{signup.error.message}</p>}
      <SubmitButton pending={signup.isPending} pendingLabel="Đang gửi…">
        Đăng ký
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 3: Rút gọn hai trang**

`pages/dang-nhap.tsx`:

```tsx
import { Link, useSearch } from "@tanstack/react-router";
import { LoginForm } from "../components/auth/login-form";
import { Alert } from "../components/ui/alert";
import { PageShell } from "../components/ui/page-shell";

export function DangNhapPage() {
  // `strict: false` để trang không phải import ngược `router.tsx` (chu trình module).
  const search = useSearch({ strict: false });

  return (
    <PageShell title="Đăng nhập">
      {search.ly_do === "disabled" && (
        <Alert tone="warning">Tài khoản của bạn đã bị khoá. Liên hệ chủ shop.</Alert>
      )}
      {search.ly_do === "no-profile" && (
        <Alert tone="warning">
          Tài khoản chưa có hồ sơ nhân viên. Liên hệ chủ shop để được tạo hồ sơ.
        </Alert>
      )}
      <LoginForm />
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/dang-ky" className="underline">
          Tạo tài khoản
        </Link>
        <Link to="/quen-mat-khau" className="underline">
          Quên mật khẩu
        </Link>
      </div>
    </PageShell>
  );
}
```

`pages/dang-ky.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { SignupForm } from "../components/auth/signup-form";
import { PageShell } from "../components/ui/page-shell";

export function DangKyPage() {
  return (
    <PageShell title="Tạo tài khoản nhân viên">
      <p className="mt-2 text-sm text-gray-600">
        Tài khoản cần chủ shop duyệt trước khi dùng được.
      </p>
      <SignupForm />
      <Link to="/dang-nhap" className="mt-4 inline-block text-sm underline">
        Đã có tài khoản
      </Link>
    </PageShell>
  );
}
```

- [ ] **Step 4: Kiểm bằng mắt trên app đang chạy**

```bash
bun run dev
```

Mở `http://localhost:3003/dang-nhap`: đăng nhập sai mật khẩu → thấy "Email hoặc mật khẩu không đúng"; đăng nhập đúng → vào `/`.

- [ ] **Step 5: Commit**

```bash
git add apps/staff/src
git commit -m "refactor(staff): tách LoginForm/SignupForm, bỏ state submit cuộn tay"
```

---

### Task 8: Tách hai bước của màn quên mật khẩu

**Files:**

- Create: `apps/staff/src/components/auth/request-code-form.tsx`, `reset-password-form.tsx`
- Modify: `apps/staff/src/pages/quen-mat-khau.tsx`

- [ ] **Step 1: `request-code-form.tsx`**

```tsx
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { maLoi, thongDiepLoi } from "../../lib/loi";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

/**
 * LUÔN đi tiếp sang bước 2, kể cả khi request hỏng — thiết kế, không phải nuốt lỗi:
 *
 *   • 200: backend cố ý trả 200 cho cả email không tồn tại (§5.1 design doc cũ) —
 *     phân biệt được hai ca là biến endpoint này thành máy dò danh sách nhân viên.
 *   • 503 CHUA_CAU_HINH_EMAIL: chưa có SMTP — trạng thái mặc định của prod mới dựng.
 *     Mã vẫn phát được bằng nút "Phát mã" của chủ shop, nên đường đi tiếp CÓ THẬT.
 *
 * Chặn người dùng ở bước 1 trong ca 503 là chặn đúng đường cứu duy nhất họ có.
 */
export function RequestCodeForm({
  email,
  onEmailChange,
  onDone,
}: {
  readonly email: string;
  readonly onEmailChange: (v: string) => void;
  readonly onDone: (message: { tone: "info" | "warning"; text: string }) => void;
}) {
  const request = useMutation({
    mutationFn: () => api.staff["password-reset"].request.post({ email }),
    onSuccess: (res) => {
      if (res.error) {
        const khac = thongDiepLoi(res.error.value, "Không gửi được yêu cầu");
        onDone({
          tone: "warning",
          text:
            maLoi(res.error.value) === "CHUA_CAU_HINH_EMAIL"
              ? "Hệ thống chưa gửi được email — nhắn chủ shop để lấy mã, rồi gõ vào đây."
              : `${khac} — nếu không nhận được mã, nhắn chủ shop để lấy mã.`,
        });
      } else {
        onDone({ tone: "info", text: "Nếu email tồn tại, mã 6 số đã được gửi. Mã sống 10 phút." });
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        request.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      <TextField
        label="Email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
      />
      <SubmitButton pending={request.isPending} pendingLabel="Đang gửi…">
        Gửi mã
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 2: `reset-password-form.tsx`**

```tsx
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../lib/api";
import { thongDiepLoi } from "../../lib/loi";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

export function ResetPasswordForm({
  email,
  onBack,
}: {
  readonly email: string;
  readonly onBack: () => void;
}) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const confirm = useMutation({
    mutationFn: async () => {
      const res = await api.staff["password-reset"].confirm.post({
        email,
        code,
        matKhauMoi: newPassword,
      });
      // Thông điệp của backend phân biệt được mã sai · mã hết hạn · mật khẩu yếu.
      // Gộp cả ba thành "mã không đúng" làm người dùng gõ lại mã đúng mãi mãi.
      if (res.error)
        throw new Error(thongDiepLoi(res.error.value, "Không đổi được mật khẩu, thử lại sau"));
    },
    onSuccess: () => navigate({ to: "/dang-nhap" }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        confirm.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      {import.meta.env.DEV && (
        <p className="rounded bg-gray-100 p-2 text-sm">Môi trường dev: mã luôn là 999999</p>
      )}
      <TextField
        label="Mã 6 số"
        inputMode="numeric"
        required
        minLength={6}
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <TextField
        label="Mật khẩu mới (ít nhất 8 ký tự)"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      {confirm.error && <p className="text-sm text-red-600">{confirm.error.message}</p>}
      <SubmitButton pending={confirm.isPending} pendingLabel="Đang đổi…">
        Đặt mật khẩu mới
      </SubmitButton>
      <button type="button" onClick={onBack} className="text-sm underline">
        Đổi email khác
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Rút gọn `pages/quen-mat-khau.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RequestCodeForm } from "../components/auth/request-code-form";
import { ResetPasswordForm } from "../components/auth/reset-password-form";
import { Alert } from "../components/ui/alert";
import { PageShell } from "../components/ui/page-shell";

export function QuenMatKhauPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<{ tone: "info" | "warning"; text: string } | null>(null);

  return (
    <PageShell title="Quên mật khẩu">
      {step === 1 ? (
        <RequestCodeForm
          email={email}
          onEmailChange={setEmail}
          onDone={(message) => {
            setNotice(message);
            setStep(2);
          }}
        />
      ) : (
        <>
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <ResetPasswordForm
            email={email}
            onBack={() => {
              setStep(1);
              setNotice(null);
            }}
          />
        </>
      )}
      <Link to="/dang-nhap" className="mt-4 inline-block text-sm underline">
        Quay lại đăng nhập
      </Link>
    </PageShell>
  );
}
```

- [ ] **Step 4: Kiểm trên app đang chạy**

Mở `/quen-mat-khau`, gõ email bất kỳ → sang bước 2 → gõ `999999` + mật khẩu mới ≥8 ký tự → về `/dang-nhap`.

- [ ] **Step 5: Commit**

```bash
git add apps/staff/src
git commit -m "refactor(staff): tách hai bước quên mật khẩu thành RequestCodeForm/ResetPasswordForm"
```

---

### Task 9: Tách bảng nhân viên

**Files:**

- Create: `apps/staff/src/components/staff/staff-table.tsx`, `staff-row-actions.tsx`, `reset-code-notice.tsx`
- Modify: `apps/staff/src/pages/nhan-vien.tsx`

- [ ] **Step 1: `reset-code-notice.tsx`**

```tsx
import { Alert } from "../ui/alert";

/**
 * Giữ cả TÊN chứ không chỉ mã: chủ shop đọc mã qua Zalo cho một CON NGƯỜI, nên
 * màn hình phải nói mã này của ai. UUID không giúp được việc đó.
 */
export function ResetCodeNotice({ name, code }: { readonly name: string; readonly code: string }) {
  return (
    <Alert tone="info">
      Mã đặt lại mật khẩu cho <strong>{name}</strong>:{" "}
      <strong className="tracking-widest">{code}</strong> — đọc cho nhân viên qua Zalo. Mã sống 10
      phút và chỉ dùng được một lần.
    </Alert>
  );
}
```

- [ ] **Step 2: `staff-row-actions.tsx`**

```tsx
import type { Me } from "../../lib/me";

export function StaffRowActions({
  row,
  currentUserId,
  busy,
  onApprove,
  onDisable,
  onIssueCode,
}: {
  readonly row: Me;
  readonly currentUserId: string | undefined;
  readonly busy: boolean;
  readonly onApprove: () => void;
  readonly onDisable: () => void;
  readonly onIssueCode: () => void;
}) {
  const btn = "rounded border px-2 py-1 disabled:opacity-50";
  return (
    <td className="flex flex-wrap gap-2 py-2">
      {row.status === "PENDING" && (
        <button onClick={onApprove} disabled={busy} className={btn}>
          Duyệt
        </button>
      )}
      {/* Tự khoá mình bị backend chặn (`TU_KHOA_MINH`); ẩn nút để không mời người
          ta bấm vào một lỗi đã biết trước. */}
      {row.status === "ACTIVE" && row.id !== currentUserId && (
        <button onClick={onDisable} disabled={busy} className={btn}>
          Khoá
        </button>
      )}
      <button onClick={onIssueCode} disabled={busy} className={btn}>
        Phát mã
      </button>
    </td>
  );
}
```

- [ ] **Step 3: `staff-table.tsx`**

```tsx
import type { Me } from "../../lib/me";
import { StaffRowActions } from "./staff-row-actions";

export function StaffTable({
  rows,
  currentUserId,
  busy,
  onApprove,
  onDisable,
  onIssueCode,
}: {
  readonly rows: readonly Me[];
  readonly currentUserId: string | undefined;
  readonly busy: boolean;
  readonly onApprove: (id: string) => void;
  readonly onDisable: (id: string) => void;
  readonly onIssueCode: (row: { id: string; name: string }) => void;
}) {
  return (
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
        {rows.map((row) => (
          <tr key={row.id} className="border-b align-top">
            <td className="py-2">{row.fullName}</td>
            <td>{row.email}</td>
            <td>{row.phone ?? "—"}</td>
            <td>{row.role}</td>
            <td>{row.status}</td>
            <StaffRowActions
              row={row}
              currentUserId={currentUserId}
              busy={busy}
              onApprove={() => onApprove(row.id)}
              onDisable={() => onDisable(row.id)}
              onIssueCode={() => onIssueCode({ id: row.id, name: row.fullName })}
            />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Rút gọn `pages/nhan-vien.tsx`**

Giữ nguyên toàn bộ bốn khối `useQuery`/`useMutation` hiện có. Thay **toàn bộ phần `return`** bằng:

```tsx
return (
  <main className="p-6">
    <Link to="/" className="text-sm underline">
      ← Trang chủ
    </Link>
    <h1 className="mt-2 text-xl font-bold">Nhân viên</h1>

    {ma && <ResetCodeNotice name={ma.ten} code={ma.code} />}
    {loi && <Alert tone="error">{loi}</Alert>}

    <StaffTable
      rows={dsNhanVien.data ?? []}
      currentUserId={me?.id}
      busy={dangChay}
      onApprove={(id) => duyet.mutate(id)}
      onDisable={(id) => khoa.mutate(id)}
      onIssueCode={(row) => phatMa.mutate({ id: row.id, ten: row.name })}
    />

    {dsNhanVien.isPending && <p className="mt-3 text-sm text-gray-600">Đang tải…</p>}
    {dsNhanVien.data?.length === 0 && (
      <p className="mt-3 text-sm text-gray-600">Chưa có nhân viên nào.</p>
    )}
  </main>
);
```

Thêm import: `StaffTable`, `ResetCodeNotice`, `Alert`. Đổi `const { data: me } = useQuery(meQuery)`
→ `const { me } = useMe()` nếu Task 3 chưa làm.

- [ ] **Step 5: Kiểm và commit**

```bash
bun run --filter @v9/staff typecheck && bun run lint && bun test
git add apps/staff/src
git commit -m "refactor(staff): tách StaffTable/StaffRowActions/ResetCodeNotice"
```

---

# PHA 4 — Đổi tên `apps/staff` (3 task, rename thuần)

### Task 10: Đổi tên định danh trong `lib/`

**Files:** `apps/staff/src/lib/*`, mọi chỗ import chúng.

- [ ] **Step 1: Kiểm reference TRƯỚC khi đổi (bắt buộc theo `CLAUDE.md`)**

Với mỗi symbol dưới đây, chạy `mcp__serena__find_referencing_symbols` (`relative_path` là file khai nó) và ghi lại số chỗ:

`dangNhap` · `dangKy` · `dangXuat` · `coSession` · `layMe` · `thongDiepLoi` · `maLoi` · `docLoi` · `LoiApi`

- [ ] **Step 2: Đổi tên bằng `mcp__serena__rename_symbol`**

| File khai     | Cũ             | Mới             |
| ------------- | -------------- | --------------- |
| `lib/auth.ts` | `dangNhap`     | `signIn`        |
| `lib/auth.ts` | `dangKy`       | `signUp`        |
| `lib/auth.ts` | `dangXuat`     | `signOut`       |
| `lib/auth.ts` | `coSession`    | `hasSession`    |
| `lib/me.ts`   | `layMe`        | `ensureMe`      |
| `lib/loi.ts`  | `LoiApi`       | `ApiError`      |
| `lib/loi.ts`  | `docLoi`       | `parseApiError` |
| `lib/loi.ts`  | `thongDiepLoi` | `errorMessage`  |
| `lib/loi.ts`  | `maLoi`        | `errorCode`     |

⚠️ `signOut` sẽ trùng tên với `Session.signOut` được import trong chính `lib/auth.ts`. Sau khi đổi,
sửa import thành `import Session from "supertokens-web-js/recipe/session";` và gọi `Session.signOut()`
— vốn đã là dạng đó, nên chỉ cần kiểm lại không có shadow.

- [ ] **Step 3: Đổi tên file `loi.ts` → `errors.ts`**

```bash
git mv apps/staff/src/lib/loi.ts apps/staff/src/lib/errors.ts
```

Rồi sửa mọi import `from "../lib/loi"` / `from "./loi"` → `errors`.

- [ ] **Step 4: Đổi biến cục bộ trong component**

`loi`→`error` · `dangGui`→(đã bỏ, dùng `mutation.isPending`) · `buoc`→`step` · `matKhauMoi`→`newPassword` ·
`ghiChu`→`notice` · `thoat`→`handleSignOut` · `ma`→`issuedCode` · `ten`→`name` · `dsNhanVien`→`staffQuery` ·
`lamMoi`→`invalidateStaff` · `dangChay`→`isMutating` · `duyet`→`approveMutation` · `khoa`→`disableMutation` ·
`phatMa`→`issueCodeMutation` · `ROLE_KHI_DUYET`→`ROLE_ON_APPROVE`.

- [ ] **Step 5: Kiểm và commit**

```bash
bun run --filter @v9/staff typecheck && bun run lint && bun test
git add -A apps/staff
git commit -m "refactor(staff): đổi tên định danh lib/ sang tiếng Anh, loi.ts -> errors.ts"
```

---

### Task 11: Đổi tên page component và file

**Files:** `apps/staff/src/pages/*`, `apps/staff/src/router.tsx`

- [ ] **Step 1: `git mv` sáu file**

```bash
cd apps/staff/src/pages
git mv dang-nhap.tsx      login-page.tsx
git mv dang-ky.tsx        signup-page.tsx
git mv quen-mat-khau.tsx  forgot-password-page.tsx
git mv cho-duyet.tsx      pending-approval-page.tsx
git mv nhan-vien.tsx      staff-list-page.tsx
git mv health.tsx         health-page.tsx
```

- [ ] **Step 2: Đổi tên component bằng `mcp__serena__rename_symbol`**

`DangNhapPage`→`LoginPage` · `DangKyPage`→`SignupPage` · `QuenMatKhauPage`→`ForgotPasswordPage` ·
`ChoDuyetPage`→`PendingApprovalPage` · `NhanVienPage`→`StaffListPage` · `HealthPage` (giữ nguyên).

Mỗi component có đúng **1 caller** (`router.tsx`) — đã đo bằng CodeGraph 2026-08-13.

- [ ] **Step 3: Sửa import trong `router.tsx`** cho khớp đường dẫn file mới.

- [ ] **Step 4: Kiểm và commit**

```bash
bun run --filter @v9/staff typecheck && bun run lint
git add -A apps/staff
git commit -m "refactor(staff): đổi tên page component và file sang tiếng Anh"
```

---

### Task 12: Đổi URL route

**Files:** `apps/staff/src/router.tsx`, mọi `<Link to>` và `navigate({ to })`, `apps/staff/src/lib/guard-decision.ts` (+ test)

- [ ] **Step 1: Đổi `path` và tên biến route trong `router.tsx`**

| Biến cũ            | Biến mới               | `path` cũ          | `path` mới          |
| ------------------ | ---------------------- | ------------------ | ------------------- |
| `congKhai`         | `publicLayoutRoute`    | id `"cong-khai"`   | id `"public"`       |
| `duocBaoVe`        | `protectedLayoutRoute` | id `"duoc-bao-ve"` | id `"protected"`    |
| `dangNhapRoute`    | `loginRoute`           | `/dang-nhap`       | `/login`            |
| `dangKyRoute`      | `signupRoute`          | `/dang-ky`         | `/signup`           |
| `quenMatKhauRoute` | `forgotPasswordRoute`  | `/quen-mat-khau`   | `/forgot-password`  |
| `choDuyetRoute`    | `pendingApprovalRoute` | `/cho-duyet`       | `/pending-approval` |
| `trangChuRoute`    | `homeRoute`            | `/`                | `/`                 |
| `nhanVienRoute`    | `staffListRoute`       | `/nhan-vien`       | `/staff`            |

- [ ] **Step 2: Đổi `RedirectTarget` trong `guard-decision.ts`**

```ts
export type RedirectTarget = "/login" | "/pending-approval";
```

và `const DANG_NHAP = "/login" as const;` (đổi tên biến thành `LOGIN`), `"/cho-duyet"` → `"/pending-approval"`.

- [ ] **Step 3: Đổi search param `ly_do` → `reason`**

Trong `validateSearch`, trong `redirect({ search: { ly_do } })`, và trong `useSearch` của trang đăng nhập.

- [ ] **Step 4: Cập nhật test**

Trong `guard-decision.test.ts`, đổi mọi `to: "/dang-nhap"` → `"/login"` và `to: "/cho-duyet"` → `"/pending-approval"`.

- [ ] **Step 5: Chạy test và kiểm thật**

```bash
bun test apps/staff/src/lib/guard-decision.test.ts
bun run --filter @v9/staff typecheck && bun run lint
```

Expected: 7 pass, typecheck sạch. TanStack Router sinh kiểu từ cây route nên `<Link to="/dang-nhap">` sót lại sẽ là **lỗi biên dịch** — đó là cái bắt sót cho task này.

- [ ] **Step 6: Commit**

```bash
git add -A apps/staff
git commit -m "refactor(staff): URL route sang tiếng Anh, ly_do -> reason"
```

---

# PHA 5 — Đổi tên `apps/api` và `packages/shared` (4 task)

### Task 13: Đổi mã lỗi sang tiếng Anh

**Files:** `packages/shared/src/domain/staff.ts` (+ test), `apps/api/src/routes/staff.ts`, `apps/api/src/services/password-reset.ts` (+ test), `apps/api/src/plugins/staff-guard.ts` (+ 2 test), `apps/staff/src/lib/guard-decision.ts` (+ test), `apps/staff/src/components/auth/request-code-form.tsx`

- [ ] **Step 1: Đổi trong `packages/shared/src/domain/staff.ts`**

```ts
export type StaffDenyReason =
  "NOT_OWNER" | "CANNOT_APPROVE_SELF" | "NOT_PENDING" | "CANNOT_DISABLE_SELF" | "LAST_OWNER";
```

Đổi mọi `deny("KHONG_PHAI_OWNER")` → `deny("NOT_OWNER")`, v.v.

- [ ] **Step 2: Chạy test domain — nó phải hỏng rồi sửa**

```bash
bun test packages/shared/src/domain/staff.test.ts
```

Expected: FAIL. Sửa các literal trong test theo bảng dưới, chạy lại → PASS.

- [ ] **Step 3: Đổi bảng đầy đủ ở `apps/api`**

| Cũ                   | Mới                 |     | Cũ                    | Mới                    |
| -------------------- | ------------------- | --- | --------------------- | ---------------------- |
| `CHUA_DANG_NHAP`     | `NOT_AUTHENTICATED` |     | `KHONG_PHAI_OWNER`    | `NOT_OWNER`            |
| `PHIEN_HET_HIEU_LUC` | `SESSION_EXPIRED`   |     | `TU_DUYET_MINH`       | `CANNOT_APPROVE_SELF`  |
| `DA_KHOA`            | `ACCOUNT_DISABLED`  |     | `KHONG_CHO_DUYET`     | `NOT_PENDING`          |
| `CHUA_CO_HO_SO`      | `NO_PROFILE`        |     | `TU_KHOA_MINH`        | `CANNOT_DISABLE_SELF`  |
| `CHO_DUYET`          | `PENDING_APPROVAL`  |     | `OWNER_CUOI_CUNG`     | `LAST_OWNER`           |
| `THIEU_QUYEN`        | `FORBIDDEN`         |     | `MA_SAI`              | `WRONG_CODE`           |
| `KHONG_TIM_THAY`     | `NOT_FOUND`         |     | `MA_HET_HIEU_LUC`     | `CODE_EXPIRED`         |
| `MAT_KHAU_YEU`       | `WEAK_PASSWORD`     |     | `CHUA_CAU_HINH_EMAIL` | `EMAIL_NOT_CONFIGURED` |

`satisfies Record<LyDo, string>` trong `routes/staff.ts` sẽ nổ nếu sót — đó là cái bắt sót.

- [ ] **Step 4: Đổi phía frontend**

`guard-decision.ts`: `"DA_KHOA"` → `"ACCOUNT_DISABLED"`, `"CHUA_CO_HO_SO"` → `"NO_PROFILE"`, `"CHUA_DANG_NHAP"` → `"NOT_AUTHENTICATED"` (trong test).
`request-code-form.tsx`: `"CHUA_CAU_HINH_EMAIL"` → `"EMAIL_NOT_CONFIGURED"`.

⚠️ Hai chỗ này là **chuỗi so trần**, compiler KHÔNG bắt. Task 15 khoá lại bằng kiểu.

- [ ] **Step 5: Chạy toàn bộ test**

```bash
bun test && bun run typecheck
```

Expected: tất cả pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: mã lỗi hợp đồng API sang tiếng Anh"
```

---

### Task 14: Đổi tên định danh trong `apps/api`

**Files:** `apps/api/src/services/*`, `apps/api/src/plugins/staff-guard.ts`, `apps/api/src/routes/staff.ts`

- [ ] **Step 1: `find_referencing_symbols` cho mọi symbol exported sắp đổi**

`taoMaDatLaiMatKhau` · `kiemTraMa` · `doiMatKhauBangMa` · `timStaffTheoEmail` · `sinhMaNgauNhien` ·
`dongDauThuHoiSession` · `emailDaCauHinh` · `guiMaDatLaiMatKhau` · `tokenDaBiThuHoi`

- [ ] **Step 2: Đổi tên theo bảng**

| File                         | Cũ → Mới                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/password-reset.ts` | `HAN_DUNG_MS`→`CODE_TTL_MS` · `SO_LAN_TOI_DA`→`MAX_ATTEMPTS` · `sinhMaNgauNhien`→`generateRandomCode` · `sinhMa`→`generateCode` · `taoMaDatLaiMatKhau`→`createResetCode` · `KetQuaKiemTra`→`VerifyCodeResult` · `kiemTraMa`→`verifyCode` · `timStaffTheoEmail`→`findStaffByEmail` · `KetQuaDoiMatKhau`→`ResetPasswordResult` · `doiMatKhauBangMa`→`resetPasswordWithCode` |
| `PasswordResetDeps`          | `taoTokenDatLai`→`createResetToken` · `doiMatKhauBangToken`→`resetPasswordWithToken`                                                                                                                                                                                                                                                                                      |
| `services/staff.ts`          | `dongDauThuHoiSession`→`stampSessionRevocation`                                                                                                                                                                                                                                                                                                                           |
| `services/email.ts`          | `emailDaCauHinh`→`isEmailConfigured` · `guiMaDatLaiMatKhau`→`sendResetCodeEmail`                                                                                                                                                                                                                                                                                          |
| `plugins/staff-guard.ts`     | `CONG_KHAI`→`PUBLIC_ROUTES` · `CAN_SESSION_KHONG_CAN_ACTIVE`→`SESSION_ONLY_ROUTES` · `khop`→`matchesRoute` · `Phien`→`SessionInfo` · `docIat`→`readIat` · `docSession`→`readSession` · `tokenDaBiThuHoi`→`isTokenRevoked` · `iatGiay`→`iatSeconds` · `mocThuHoi`→`revokedAt`                                                                                              |
| `routes/staff.ts`            | `loiSchema`→`errorSchema` · `hoSoCongKhai`→`toPublicProfile` · `THONG_DIEP`→`MESSAGES` · `MA_HTTP`→`HTTP_STATUS` · `LyDo`→`Reason` · `LyDoQuyen`→`PermissionReason` · `LyDoMatKhau`→`PasswordReason` · `loi()`→`toError()` · `responseQuanTri`→`adminResponses` · `THIEU_QUYEN`→`FORBIDDEN_BODY`                                                                          |

- [ ] **Step 3: Kiểm và commit**

```bash
bun test && bun run typecheck && bun run lint
git add -A
git commit -m "refactor(api): đổi tên định danh services/plugins/routes sang tiếng Anh"
```

---

### Task 15: Khoá chỗ so mã lỗi bằng kiểu

**Files:** `apps/api/src/routes/staff.ts`, `apps/staff/src/lib/errors.ts`, `apps/staff/src/lib/guard-decision.ts`, `apps/staff/src/components/auth/request-code-form.tsx`

- [ ] **Step 1: Export union mã lỗi từ `apps/api`**

Thêm vào cuối `apps/api/src/routes/staff.ts`:

```ts
/**
 * Union mã lỗi cho frontend so theo KIỂU, không so chuỗi tự do.
 *
 * Lý do tồn tại: `errorCode(...) === "EMAIL_NOT_CONFIGURED"` ở `apps/staff` là một
 * so sánh chuỗi mà compiler không kiểm. Đổi mã ở đây mà quên chỗ đó thì điều kiện
 * thành KHÔNG BAO GIỜ ĐÚNG, người dùng mất câu hướng dẫn đúng lúc cần nhất, và
 * không có lỗi ở đâu cả. Với union này, gõ sai là lỗi biên dịch.
 */
export type ApiErrorCode =
  | Reason
  | "NOT_AUTHENTICATED"
  | "SESSION_EXPIRED"
  | "ACCOUNT_DISABLED"
  | "NO_PROFILE"
  | "PENDING_APPROVAL"
  | "EMAIL_NOT_CONFIGURED";
```

- [ ] **Step 2: Dùng nó ở `apps/staff/src/lib/errors.ts`**

```ts
import type { ApiErrorCode } from "@v9/api/routes/staff";

/** Mã máy đọc được, để phân nhánh. `null` khi thân lỗi không mang mã. */
export const errorCode = (value: unknown): ApiErrorCode | null =>
  (parseApiError(value)?.code as ApiErrorCode | undefined) ?? null;
```

Nếu `@v9/api` không export đường dẫn con này, thêm vào `apps/api/src/index.ts`:
`export type { ApiErrorCode } from "./routes/staff";` rồi import từ `@v9/api`.

- [ ] **Step 3: Kiểm rằng nó thật sự bắt lỗi**

Đổi tạm một chỗ so sánh thành `"EMAIL_NOT_CONFIGURE"` (thiếu chữ D) rồi chạy:

```bash
bun run typecheck
```

Expected: **FAIL**. Đây là bằng chứng hàng rào có thật — trả lại chuỗi đúng rồi chạy lại → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: mã lỗi so theo kiểu, không so chuỗi trần"
```

---

### Task 16: Đổi formField id `hoTen`/`soDienThoai`

**Files:** `apps/api/src/plugins/auth.ts:49,113-114`, `apps/staff/src/lib/auth.ts:63-64`, `apps/staff/src/components/auth/signup-form.tsx`

- [ ] **Step 1: Đọc cảnh báo trước khi làm**

⚠️ Đây là **contract wire khớp bằng chuỗi lúc chạy**, không có compile check nào. Đổi lệch một đầu
thì đăng ký **vẫn trả 200** nhưng `fullName` rơi về `"(chưa đặt tên)"`. Ba chỗ phải đổi trong **cùng
một commit**.

- [ ] **Step 2: `apps/api/src/plugins/auth.ts`**

```ts
formFields: [{ id: "fullName" }, { id: "phone", optional: true }],
```

và

```ts
fullName: field("fullName")?.trim() || "(chưa đặt tên)",
phone: field("phone")?.trim() || undefined,
```

- [ ] **Step 3: `apps/staff/src/lib/auth.ts`**

```ts
export async function signUp(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}) {
  const res = await EmailPassword.signUp({
    formFields: [
      { id: "email", value: input.email },
      { id: "password", value: input.password },
      { id: "fullName", value: input.fullName },
      { id: "phone", value: input.phone },
    ],
  });

  if (res.status === "OK") return { ok: true as const };
  if (res.status === "FIELD_ERROR") {
    // Thông điệp của SuperTokens (mật khẩu yếu, email sai định dạng, email đã
    // dùng) — hiện nguyên văn thay vì nuốt thành "thử lại sau".
    return { ok: false as const, message: res.formFields.map((f) => f.error).join(" · ") };
  }
  return { ok: false as const, message: "Không đăng ký được, thử lại sau" };
}
```

Chỗ gọi `signUp` ở `signup-form.tsx` truyền thẳng `form`, mà `form` sau Step 4 đã có đúng bốn khoá
`fullName`/`phone`/`email`/`password` — nên không cần map lại tên ở giữa.

- [ ] **Step 4: `signup-form.tsx`** — đổi `FIELDS` key và state:

```tsx
const FIELDS = [
  { key: "fullName", label: "Họ và tên", type: "text", required: true, autoComplete: "name" },
  { key: "phone", label: "Số điện thoại", type: "tel", required: false, autoComplete: "tel" },
  { key: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  {
    key: "password",
    label: "Mật khẩu (ít nhất 8 ký tự)",
    type: "password",
    required: true,
    autoComplete: "new-password",
  },
] as const;
```

và `useState({ fullName: "", phone: "", email: "", password: "" })`.

- [ ] **Step 5: VERIFY BẰNG ĐĂNG KÝ THẬT — không được bỏ qua**

```bash
docker compose up -d && bun run dev
```

Đăng ký một tài khoản mới ở `http://localhost:3003/signup` với họ tên "Kiểm Tra Tên", rồi:

```bash
docker exec v9-rental-dev-postgres-1 psql -U postgres -d v9 \
  -c "SELECT full_name, phone FROM staff_users ORDER BY created_at DESC LIMIT 1;"
```

Expected: `Kiểm Tra Tên`, **không phải** `(chưa đặt tên)`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: formField id hoTen/soDienThoai -> fullName/phone (3 chỗ, cùng commit)"
```

---

# PHA 6 — Đổi mật khẩu tự phục vụ (7 task)

### Task 17: `revokeAndStamp` — gộp cặp thu hồi

**Files:** `apps/api/src/services/staff.ts`, `apps/api/src/services/password-reset.ts`

- [ ] **Step 1: Thêm `revokeAndStamp`, bỏ export của `stampSessionRevocation`**

Trong `services/staff.ts`, đổi `export async function stampSessionRevocation` thành
`async function stampSessionRevocation` (bỏ `export`) và thêm ngay dưới nó:

```ts
export interface SessionRevokeDeps {
  readonly revokeSessions: (userId: string) => Promise<unknown>;
}

/**
 * Cặp thu hồi, gộp làm MỘT — và đó là toàn bộ điểm của hàm này.
 *
 * Bất biến của repo: **hễ thu hồi thì đóng dấu**. Trước đây nó là một lời dặn
 * trong comment, và skill `v9-auth` phải cảnh báo "thêm chỗ thứ ba mà quên đóng
 * dấu là thủng lại y như cũ, và không có gì báo". Route đổi mật khẩu là chỗ thứ
 * ba đó. Gộp hai lời gọi vào một hàm và bỏ export của nửa sau khiến việc gọi nửa
 * này mà quên nửa kia là chuyện **không viết ra được nữa**.
 *
 * Thứ tự (revoke trước, đóng dấu sau) giữ nguyên và là có chủ đích: chết giữa hai
 * lời gọi theo thứ tự này để lại "refresh chết, access sống ≤1 giờ"; thứ tự ngược
 * lại để lại "access chết, refresh sống" — refresh một lần là có token cấp SAU mốc,
 * tức sống mãi.
 */
export async function revokeAndStamp(
  deps: SessionRevokeDeps,
  userId: string,
): Promise<Date | null> {
  await deps.revokeSessions(userId);
  return stampSessionRevocation(userId);
}
```

- [ ] **Step 2: Dùng nó trong `disableStaff`**

```ts
if (result.ok) {
  await revokeAndStamp(deps, targetId);
}
return result;
```

- [ ] **Step 3: Dùng nó trong `resetPasswordWithCode`** (`password-reset.ts`)

Thay hai dòng cuối:

```ts
await revokeAndStamp(deps, staff.id);
return { ok: true };
```

Sửa import: `import { revokeAndStamp } from "./staff";` (bỏ `stampSessionRevocation`).

- [ ] **Step 4: Chạy test — chúng PHẢI vẫn xanh**

```bash
bun test apps/api/src/services/password-reset.test.ts apps/api/src/plugins/staff-guard-thu-hoi.test.ts
```

Expected: tất cả pass. Test `"mã đúng: sinh token → đổi mật khẩu → thu hồi session, đúng thứ tự"`
vẫn phải thấy `revokeSessions` trong `nhatKy` và `sessionsInvalidBefore` là `Date` — đó là bằng
chứng gộp hàm không làm rơi vế nào.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services
git commit -m "refactor(api): gộp revokeSessions + đóng dấu thành revokeAndStamp

Bất biến 'hễ thu hồi thì đóng dấu' trước đây là lời dặn trong comment. Bỏ export
của nửa sau khiến gọi nửa này mà quên nửa kia không viết ra được nữa."
```

---

### Task 18: Service `changePassword` (TDD)

**Files:** `apps/api/src/services/password-reset.ts`, `apps/api/src/services/password-reset.test.ts`

- [ ] **Step 1: Thêm dep `verifyPassword` vào `PasswordResetDeps`**

```ts
  /** Ở prod: `EmailPassword.verifyCredentials("public", email, password)`. */
  readonly verifyPassword: (email: string, password: string) => Promise<{ status: string }>;
```

- [ ] **Step 2: Viết test TRƯỚC**

Trước hết mở rộng `spyDeps()` đã có trong `password-reset.test.ts` để nó ghi nhận cả
`verifyPassword`. Thêm tham số ghi đè và một mục vào `deps`:

```ts
/**
 * `nhatKy` ghi ĐÚNG THỨ TỰ gọi, không chỉ ghi "có gọi hay không" — thứ tự chính là
 * thứ các test dưới đây khoá lại (xác minh trước khi sinh token, thu hồi sau cùng).
 */
function spyDeps(ghiDe?: { verifyPassword?: { status: string } }) {
  const token = "token-gia-lap";
  const nhatKy: { ten: string; args: unknown[] }[] = [];
  const deps: PasswordResetDeps = {
    verifyPassword: async (...args) => {
      nhatKy.push({ ten: "verifyPassword", args });
      return ghiDe?.verifyPassword ?? { status: "OK" };
    },
    createResetToken: async (...args) => {
      nhatKy.push({ ten: "createResetToken", args });
      return { status: "OK", token };
    },
    resetPasswordWithToken: async (...args) => {
      nhatKy.push({ ten: "resetPasswordWithToken", args });
      return { status: "OK" };
    },
    revokeSessions: async (...args) => {
      nhatKy.push({ ten: "revokeSessions", args });
      return undefined;
    },
  };
  return { deps, nhatKy, token };
}
```

⚠️ Nếu `spyDeps()` hiện tại trong file có hình dạng khác, **giữ hình dạng đó** và chỉ thêm mục
`verifyPassword` — các test `resetPasswordWithCode` đang xanh dựa vào nó.

Rồi thêm khối test:

```ts
describe("changePassword", () => {
  it("mật khẩu mới trùng mật khẩu cũ: từ chối và KHÔNG gọi dep nào", async () => {
    const { deps, nhatKy } = spyDeps();
    expect(
      await changePassword(deps, { id: ID, email: EMAIL }, "same-pass-1", "same-pass-1"),
    ).toEqual({
      ok: false,
      reason: "SAME_PASSWORD",
    });
    // Kiểm TRƯỚC argon2 (~115ms) và trước mọi thu hồi: đổi sang chính nó rồi đá
    // người dùng ra là một trải nghiệm khó hiểu, không phải một thay đổi.
    expect(nhatKy).toEqual([]);
  });

  it("sai mật khẩu cũ: KHÔNG sinh token đặt lại", async () => {
    const { deps, nhatKy } = spyDeps({ verifyPassword: { status: "WRONG_CREDENTIALS_ERROR" } });
    expect(
      await changePassword(deps, { id: ID, email: EMAIL }, "sai-mat-khau", "mat-khau-moi-dai"),
    ).toEqual({
      ok: false,
      reason: "WRONG_CURRENT_PASSWORD",
    });
    // Sinh token trước khi xác minh là phát một credential đặt lại mật khẩu cho
    // kẻ đang đoán — cùng lý lẽ với test "mã sai thì không gọi deps nào".
    expect(nhatKy).toEqual([{ ten: "verifyPassword", args: [EMAIL, "sai-mat-khau"] }]);
  });

  it("đúng mật khẩu cũ: xác minh → sinh token → đổi → thu hồi, đúng thứ tự", async () => {
    const { deps, nhatKy, token } = spyDeps();
    expect(
      await changePassword(deps, { id: ID, email: EMAIL }, "mat-khau-cu", "mat-khau-moi-dai"),
    ).toEqual({
      ok: true,
    });
    expect(nhatKy).toEqual([
      { ten: "verifyPassword", args: [EMAIL, "mat-khau-cu"] },
      { ten: "createResetToken", args: [ID, EMAIL] },
      { ten: "resetPasswordWithToken", args: [token, "mat-khau-moi-dai"] },
      { ten: "revokeSessions", args: [ID] },
    ]);
    // Vế thứ hai của thu hồi — thiếu nó thì access token cũ sống tới 1 giờ.
    expect((await loadStaff(ID))?.sessionsInvalidBefore).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 3: Chạy test để chắc chắn nó HỎNG**

```bash
bun test apps/api/src/services/password-reset.test.ts -t changePassword
```

Expected: FAIL — `changePassword is not a function`.

- [ ] **Step 4: Viết `changePassword`**

```ts
export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      reason: "SAME_PASSWORD" | "WRONG_CURRENT_PASSWORD" | "NOT_FOUND" | "WEAK_PASSWORD";
    };

/**
 * Đổi mật khẩu khi ĐANG đăng nhập. Khác `resetPasswordWithCode` ở chỗ credential
 * là mật khẩu cũ chứ không phải mã 6 số — nhưng dùng chung đúng đường đặt mật khẩu
 * mới, nên chính sách mật khẩu vẫn nằm đúng một chỗ ở SuperTokens.
 *
 * ⚠️ `staff.email` là BẢN SAO (ADR ① của skill v9-auth) — nguồn sự thật ở
 * SuperTokens. Hai bên lệch nhau thì `verifyPassword` trả WRONG_CREDENTIALS_ERROR
 * và người dùng bị chặn đổi mật khẩu. Hỏng theo chiều đóng, nhưng phải biết trước
 * để không đi debug nhầm chỗ.
 */
export async function changePassword(
  deps: PasswordResetDeps,
  staff: { id: string; email: string },
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  // Trước mọi thứ khác: rẻ hơn argon2 (~115ms) và tránh thu hồi session cho một
  // thay đổi không có thật.
  if (currentPassword === newPassword) return { ok: false, reason: "SAME_PASSWORD" };

  const verified = await deps.verifyPassword(staff.email, currentPassword);
  if (verified.status !== "OK") return { ok: false, reason: "WRONG_CURRENT_PASSWORD" };

  const token = await deps.createResetToken(staff.id, staff.email);
  if (token.status !== "OK" || !token.token) return { ok: false, reason: "NOT_FOUND" };

  const reset = await deps.resetPasswordWithToken(token.token, newPassword);
  if (reset.status !== "OK") return { ok: false, reason: "WEAK_PASSWORD" };

  await revokeAndStamp(deps, staff.id);
  return { ok: true };
}
```

- [ ] **Step 5: Chạy test → PASS**

```bash
bun test apps/api/src/services/password-reset.test.ts
```

Expected: tất cả pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services
git commit -m "feat(api): service changePassword — xác minh mật khẩu cũ rồi thu hồi session"
```

---

### Task 19: Route `POST /staff/password/change`

**Files:** `apps/api/src/routes/staff.ts`

- [ ] **Step 1: Thêm dep thật vào `resetDeps`**

```ts
const resetDeps: PasswordResetDeps = {
  createResetToken: (userId, email) =>
    EmailPassword.createResetPasswordToken("public", userId, email),
  resetPasswordWithToken: (token, newPassword) =>
    EmailPassword.resetPasswordUsingToken("public", token, newPassword),
  // `verifyCredentials` chứ KHÔNG phải `signIn`: nó không tạo session và không kéo
  // theo các overload account-linking — đúng nghĩa "chỉ kiểm mật khẩu".
  verifyPassword: (email, password) => EmailPassword.verifyCredentials("public", email, password),
  revokeSessions,
};
```

- [ ] **Step 2: Mở rộng `Reason` rồi mới thêm `MESSAGES`**

⚠️ Thứ tự quan trọng. `Reason` hiện là `PermissionReason | PasswordReason`, suy từ kiểu trả về của
hai service cũ. `changePassword` là service **thứ ba**, và reason của nó không nằm trong union đó —
nên nếu chỉ thêm dòng vào `MESSAGES` mà quên mở rộng `Reason`, `satisfies Record<Reason, string>`
vẫn xanh và **hai mã mới không được ép dịch**. Đúng loại hỏng-im-lặng mà `satisfies` sinh ra để chặn.

Thêm cạnh hai type kia:

```ts
type ChangePasswordReason = Extract<ChangePasswordResult, { ok: false }>["reason"];
type Reason = PermissionReason | PasswordReason | ChangePasswordReason;
```

Rồi thêm vào `MESSAGES`:

```ts
  WRONG_CURRENT_PASSWORD: "Mật khẩu hiện tại không đúng",
  SAME_PASSWORD: "Mật khẩu mới phải khác mật khẩu hiện tại",
```

`NOT_FOUND` và `WEAK_PASSWORD` đã có sẵn từ Task 13 — `ChangePasswordReason` dùng lại chúng, không
thêm dòng trùng.

Thêm `type ChangePasswordResult` vào import từ `../services/password-reset`.

- [ ] **Step 2b: Kiểm rằng `satisfies` thật sự ép**

Xoá tạm dòng `SAME_PASSWORD` khỏi `MESSAGES` rồi chạy `bun run --filter @v9/api typecheck`.
Expected: **FAIL**, báo thiếu key `SAME_PASSWORD`. Trả lại rồi chạy lại → sạch. Không thấy nó nổ
nghĩa là `Reason` chưa được mở rộng ở Step 2 — quay lại sửa.

- [ ] **Step 3: Thêm route**

```ts
  /**
   * Đổi mật khẩu khi đang đăng nhập. KHÔNG đụng gì vào `staff-guard.ts`: route này
   * không nằm trong danh sách công khai nên mặc-định-chặn đã phủ, và không nằm
   * trong `SESSION_ONLY_ROUTES` nên tự động đòi ACTIVE. Đó chính là điều plugin đó
   * sinh ra để làm.
   *
   * Đổi xong người dùng BỊ ĐĂNG XUẤT — hệ quả bắt buộc của `revokeAndStamp`, không
   * phải một lựa chọn UX. Frontend nói thẳng điều đó.
   */
  .post(
    "/staff/password/change",
    async ({ body, staff, status }) => {
      if (!staff) return status(404, toError("NOT_FOUND"));

      const res = await changePassword(
        resetDeps,
        { id: staff.id, email: staff.email },
        body.currentPassword,
        body.newPassword,
      );
      if (!res.ok) return status(400, toError(res.reason));
      return status(200, { ok: true });
    },
    {
      body: t.Object({
        // 8 ký tự chỉ để chặn thân request rỗng — chính sách mật khẩu thật do
        // SuperTokens giữ (`WEAK_PASSWORD`), đừng nhân bản luật sang tầng này.
        currentPassword: t.String({ minLength: 8 }),
        newPassword: t.String({ minLength: 8 }),
      }),
      response: { 200: okSchema, 400: errorSchema, 404: errorSchema },
    },
  )
```

Thêm `changePassword` vào import từ `../services/password-reset`.

- [ ] **Step 4: Kiểm bằng curl trên stack thật**

```bash
bun run dev   # ở terminal khác
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3001/staff/password/change \
  -H 'content-type: application/json' -H 'st-auth-mode: cookie' \
  -d '{"currentPassword":"khong-quan-trong","newPassword":"cung-khong-quan-trong"}'
```

Expected: **401**. Nếu ra 404 thì route chưa đăng ký (Elysia trả 404 trước `onBeforeHandle`) — chỉ
401 mới chứng minh cả hai vế.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/staff.ts
git commit -m "feat(api): POST /staff/password/change"
```

---

### Task 20: Trang `/change-password`

**Files:** Create `apps/staff/src/components/auth/change-password-form.tsx`, `apps/staff/src/pages/change-password-page.tsx`; Modify `router.tsx`, `components/layout/app-nav.tsx`, `pages/login-page.tsx`

- [ ] **Step 1: `change-password-form.tsx`**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../lib/api";
import { signOut } from "../../lib/auth";
import { errorMessage } from "../../lib/errors";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

export function ChangePasswordForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const change = useMutation({
    mutationFn: async () => {
      const res = await api.staff.password.change.post({ currentPassword, newPassword });
      if (res.error) throw new Error(errorMessage(res.error.value, "Không đổi được mật khẩu"));
    },
    /**
     * Đổi xong BỊ ĐĂNG XUẤT — `revokeAndStamp` ở server đã giết mọi session, kể cả
     * session đang mở này. Gọi `signOut` ở đây để trình duyệt dọn cookie chết thay
     * vì để người dùng gặp một lỗi 401 khó hiểu ở màn hình kế tiếp.
     */
    onSuccess: async () => {
      await signOut(qc);
      await navigate({ to: "/login", search: { reason: "password-changed" } });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate();
      }}
      className="mt-4 flex flex-col gap-3"
    >
      <TextField
        label="Mật khẩu hiện tại"
        type="password"
        required
        minLength={8}
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <TextField
        label="Mật khẩu mới (ít nhất 8 ký tự)"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      {change.error && <p className="text-sm text-red-600">{change.error.message}</p>}
      <SubmitButton pending={change.isPending} pendingLabel="Đang đổi…">
        Đổi mật khẩu
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 2: `change-password-page.tsx`**

```tsx
import { ChangePasswordForm } from "../components/auth/change-password-form";
import { PageShell } from "../components/ui/page-shell";

export function ChangePasswordPage() {
  return (
    <PageShell title="Đổi mật khẩu">
      <p className="mt-2 text-sm text-gray-600">
        Đổi xong bạn sẽ được đăng xuất khỏi mọi thiết bị và cần đăng nhập lại.
      </p>
      <ChangePasswordForm />
    </PageShell>
  );
}
```

- [ ] **Step 3: Treo route dưới nhánh ĐƯỢC BẢO VỆ**

```tsx
const changePasswordRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/change-password",
  component: ChangePasswordPage,
});
```

và thêm vào `protectedLayoutRoute.addChildren([homeRoute, staffListRoute, changePasswordRoute])`.

⚠️ Treo dưới `publicLayoutRoute` là mở toang một trang chỉ người đã đăng nhập được vào.

- [ ] **Step 4: Thêm link vào `AppNav` và banner vào trang đăng nhập**

`app-nav.tsx`, trước nút đăng xuất:

```tsx
<Link to="/change-password" className="underline">
  Đổi mật khẩu
</Link>
```

`login-page.tsx`:

```tsx
{
  search.reason === "password-changed" && (
    <Alert tone="info">Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.</Alert>
  );
}
```

- [ ] **Step 5: Kiểm end-to-end trên stack thật**

Đăng nhập → `/change-password` → đổi mật khẩu → bị đá về `/login` kèm banner → đăng nhập bằng mật
khẩu **mới** → vào được. Đăng nhập bằng mật khẩu **cũ** → "Email hoặc mật khẩu không đúng".

- [ ] **Step 6: Commit**

```bash
git add apps/staff/src
git commit -m "feat(staff): trang /change-password"
```

---

### Task 21: Chặn bootstrap prod thiếu mật khẩu

**Files:** `scripts/staff-bootstrap.ts:35`, `.env.example:87`

- [ ] **Step 1: Thêm chặn vào script**

Thay dòng `const matKhau = process.env.STAFF_OWNER_PASSWORD ?? "DoiMatKhauNgay!1";`:

```ts
/**
 * Mặc định `DoiMatKhauNgay!1` NẰM TRONG GIT — ai đọc repo cũng biết. Ở dev thì
 * chấp nhận được; ở prod thì đó là một tài khoản OWNER với mật khẩu công khai,
 * trên một hệ chưa có rate limit (xem docs/DEBT.md).
 *
 * Ném lúc khởi động thay vì cảnh báo, theo đúng tiền lệ `AUTH_DEV_OTP` ở
 * `apps/api/src/env.ts`: cấu hình không an toàn thì không chạy, chứ không phải
 * một dòng comment dặn dò.
 */
const matKhauMoiTao = process.env.STAFF_OWNER_PASSWORD;
if (process.env.NODE_ENV === "production" && !matKhauMoiTao) {
  throw new Error(
    "Thiếu STAFF_OWNER_PASSWORD ở NODE_ENV=production. Mật khẩu mặc định nằm trong git — " +
      "đặt một mật khẩu thật rồi chạy lại.",
  );
}
const matKhau = matKhauMoiTao ?? "DoiMatKhauNgay!1";
```

- [ ] **Step 2: Bổ sung `.env.example`**

Thay dòng 86–87:

```bash
# Chủ shop đầu tiên, dùng cho `bun run staff:bootstrap`.
# ⚠️ STAFF_OWNER_PASSWORD BẮT BUỘC ở NODE_ENV=production — thiếu thì script NÉM.
# Bỏ trống ở dev thì dùng mặc định "DoiMatKhauNgay!1" (nằm trong git, đừng dùng ở prod).
STAFF_OWNER_EMAIL=chu-shop@example.com
# STAFF_OWNER_PASSWORD=
# STAFF_OWNER_NAME=Chủ shop
```

- [ ] **Step 3: Kiểm cả hai nhánh**

```bash
NODE_ENV=production STAFF_OWNER_EMAIL=x@y.vn DATABASE_URL=postgres://x bun scripts/staff-bootstrap.ts
```

Expected: ném "Thiếu STAFF_OWNER_PASSWORD…", không chạm DB.

```bash
bun run staff:bootstrap
```

Expected: chạy bình thường ở dev.

- [ ] **Step 4: Commit**

```bash
git add scripts/staff-bootstrap.ts .env.example
git commit -m "fix(scripts): bootstrap ném ở prod khi thiếu STAFF_OWNER_PASSWORD"
```

---

### Task 22: Cập nhật tài liệu

**Files:** `apps/staff/CLAUDE.md`, `apps/api/CLAUDE.md`, `.claude/skills/v9-auth/SKILL.md`, `docs/DEBT.md`, `docs/plans/2026-08-10-staff-auth-{design,plan}.md`

- [ ] **Step 1: `apps/staff/CLAUDE.md`**

Mục "Xác thực": đổi "năm màn hình" → "sáu màn hình"; cập nhật bảng URL sang tên tiếng Anh; sửa dòng
mô tả nhánh `DISABLED` (dòng ~107) thành mô tả `decideEntry` thật sự làm gì, và thêm câu:

> Nhánh DISABLED từng là code chết — `/staff/me` trả `403 ACCOUNT_DISABLED` nên `me` luôn là lỗi,
> và `if (!me)` bắn trước. Giờ `decideEntry` giữ bảy ca đó ở một chỗ có test.

- [ ] **Step 2: `apps/api/CLAUDE.md`**

Cập nhật bảng mã lỗi sang tên tiếng Anh; thêm dòng cho `POST /staff/password/change`; đổi mọi tên
hàm đã rename.

- [ ] **Step 3: `.claude/skills/v9-auth/SKILL.md`**

Mục "Bất biến dễ vỡ nhất" — viết lại:

```markdown
**Hễ thu hồi session thì phải đóng dấu `sessions_invalid_before`.** Không còn là lời dặn:
`revokeAndStamp` trong `services/staff.ts` gộp cả hai, và `stampSessionRevocation` **không export**.
Gọi nửa này mà quên nửa kia không viết ra được nữa. Ba chỗ dùng: `disableStaff`,
`resetPasswordWithCode`, `changePassword`.
```

Cập nhật lệnh curl (`/staff/me` → `NOT_AUTHENTICATED`).

- [ ] **Step 4: `docs/DEBT.md`** — xoá dòng "Tên hàm tiếng Việt/Anh lẫn lộn", thêm một dòng ghi nó
      đã đóng bởi luật đặt tên trong `CLAUDE.md`.

- [ ] **Step 5: Hai design doc cũ — chỉ thêm một dòng, KHÔNG sửa nội dung**

Thêm ngay dưới tiêu đề của mỗi file:

```markdown
> Bản ghi lịch sử của đợt auth 2026-08-10. Một số tên và URL trong doc này đã đổi ở đợt
> 2026-08-13 — xem [`2026-08-13-staff-auth-fix-design.md`](2026-08-13-staff-auth-fix-design.md).
```

- [ ] **Step 6: Commit**

```bash
bun run format
git add -A
git commit -m "docs: cập nhật 5 tài liệu sau đợt sửa auth"
```

---

### Task 23: Verify toàn bộ theo tiêu chí xong

**Files:** không sửa file nào — đây là task kiểm.

- [ ] **Step 1: Bộ lệnh xanh**

```bash
bun test
bun run typecheck
bun run lint
```

Expected: cả ba sạch. ⚠️ `typecheck` là **hai lệnh nối bằng `&&`** — đọc output tới hết, đừng dừng ở nửa đầu.

- [ ] **Step 2: Bốn probe hàng rào kiến trúc**

Chạy bốn probe của skill `v9-fences` và **đọc tên luật trong thông báo lỗi**, không nhìn exit code.
Đợt này thêm hai thư mục mới (`components/`, `hooks/`) vào `apps/staff` — đúng dịp
`eslint-plugin-boundaries` từng suy thoái im lặng.

- [ ] **Step 3: Guard còn phủ**

```bash
curl -s localhost:3001/staff/me -H 'st-auth-mode: cookie'          # 401 NOT_AUTHENTICATED
curl -s localhost:3001/health                                       # 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/khong-ton-tai  # 404 — đối chứng
```

- [ ] **Step 4: Người bị khoá thấy lý do (tiêu chí #2 của design doc)**

Đăng nhập bằng OWNER → `/staff` → Khoá một tài khoản → đăng nhập bằng tài khoản đó
→ Expected: về `/login` **kèm banner "Tài khoản của bạn đã bị khoá"**, không phải màn đăng nhập trống.

- [ ] **Step 5: Đổi mật khẩu giết token cũ (tiêu chí #5 — quan trọng nhất về an toàn)**

Đăng nhập, lưu cookie lại, đổi mật khẩu, rồi gọi bằng **cookie cũ**:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/staff/me \
  -H 'st-auth-mode: cookie' -b 'sAccessToken=<cookie cũ>'
```

Expected: **401**. Nếu ra 200 thì `revokeAndStamp` rơi mất vế đóng dấu — đã đo 2026-08-11 rằng
`revokeSessions` một mình để lại access token sống tới 1 giờ.

- [ ] **Step 6: Đăng xuất dọn cache**

OWNER đăng xuất → nhân viên khác đăng nhập cùng tab → Expected: không thấy tên hay danh sách của
người trước, dù chỉ một khoảnh khắc.

- [ ] **Step 7: Đăng ký vẫn đúng tên (bẫy §6.5b)**

```bash
docker exec v9-rental-dev-postgres-1 psql -U postgres -d v9 \
  -c "SELECT full_name FROM staff_users ORDER BY created_at DESC LIMIT 1;"
```

Expected: tên đã gõ, **không phải** `(chưa đặt tên)`.

- [ ] **Step 8: Commit cuối nếu có gì phải sửa; nếu không, không commit.**

---

## Ghi chú cho người thực thi

**Nếu một task hỏng ở bước verify, DỪNG.** Đừng đi tiếp rồi sửa sau — pha 4 và 5 là rename hàng loạt,
và một lỗi tồn đọng từ pha 2 sẽ bị chôn dưới 60 định danh đổi tên.

**Ba chỗ compiler KHÔNG bảo vệ bạn**, mỗi chỗ có bước verify riêng, đừng bỏ:
Task 15 (mã lỗi so chuỗi) · Task 16 (formField id) · Task 19 (route mới có thể ra 404 thay vì 401
nếu quên đăng ký).

**Không làm trong plan này:** ép đổi mật khẩu lần đầu (`must_change_password` — chạm ADR và schema,
cần brainstorm riêng) · hạ tầng test frontend · `filename-case` trong ESLint · năm món nợ ở
[`../DEBT.md`](../DEBT.md).
