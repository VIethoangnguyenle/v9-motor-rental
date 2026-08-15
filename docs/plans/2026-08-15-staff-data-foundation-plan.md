# Plan A — Nền dữ liệu: `customers`, `rentals`, và API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng bảng `customers` + `rentals` với hàng rào chống đặt trùng ở tầng Postgres, và bốn nhóm endpoint (`/fleet`, `/rentals`, `/customers`, `/stats/summary`) mà `apps/staff` sẽ dùng ở Plan C.

**Architecture:** Logic thuần (trạng thái đơn, chuẩn hoá số điện thoại) nằm ở `packages/shared/src/domain/` và không import gì ngoài `packages/shared`. Bảng nằm ở `packages/db` với `CHECK` và `EXCLUDE` ép ở tầng DB chứ không ở service. `apps/api` đi theo `routes → services → infra` như đã có; route chỉ có HTTP và schema.

**Tech Stack:** Bun · Elysia + TypeBox · Drizzle ORM 0.45.2 trên `drizzle-orm/bun-sql` · Postgres (btree_gist đã bật từ migration `0000`) · `bun test`.

**Spec:** [`2026-08-15-staff-home-stats-calendar-design.md`](2026-08-15-staff-home-stats-calendar-design.md) — Plan này phủ §3, §4, §5.

---

## Trước khi bắt đầu

```bash
docker compose up -d          # Postgres + MinIO. Nhiều task ở đây CẦN Postgres thật.
bun install
bun run db:migrate            # đưa DB về trạng thái hiện tại (tới 0008)
bun test                      # phải xanh TRƯỚC khi sửa gì
```

Nếu `bun test` đã đỏ từ đầu thì dừng lại và báo — plan này giả định cây sạch.

---

## Cấu trúc file

| File                                            | Trách nhiệm                                                    |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `packages/shared/src/domain/rental.ts`          | Trạng thái đơn, chuyển trạng thái, quá hạn, mốc ghi nhận doanh thu |
| `packages/shared/src/domain/rental.test.ts`     | Test cho trên — **viết trước**                                  |
| `packages/shared/src/domain/phone.ts`           | Chuẩn hoá số điện thoại Việt Nam                                |
| `packages/shared/src/domain/phone.test.ts`      | Test cho trên — **viết trước**                                  |
| `packages/db/src/schema/rentals.ts`             | Bảng `customers` + `rentals`                                    |
| `packages/db/src/schema/rentals-schema.test.ts` | Chứng minh `CHECK` và `EXCLUDE` thật sự chặn                    |
| `packages/db/migrations/0009_*.sql`             | Bảng, do `drizzle-kit generate` sinh                            |
| `packages/db/migrations/0010_*.sql`             | Cột sinh `period` + exclusion constraint — **viết tay**         |
| `apps/api/src/services/customers.ts`            | Tìm / tạo khách                                                 |
| `apps/api/src/services/rentals.ts`              | Tạo đơn, đọc đơn theo khoảng, đổi trạng thái                    |
| `apps/api/src/services/fleet.ts`                | Danh sách xe nội bộ (kèm biển số)                               |
| `apps/api/src/services/stats.ts`                | Sáu số doanh thu + ba số cần chú ý                              |
| `apps/api/src/routes/rentals.ts`                | HTTP cho rentals + customers                                    |
| `apps/api/src/routes/fleet.ts`                  | HTTP cho `/fleet`                                               |
| `apps/api/src/routes/stats.ts`                  | HTTP cho `/stats/summary`                                       |

**Không cần khai gì trong `staff-guard`.** `PUBLIC_ROUTES` là danh sách trắng và mặc định là **chặn** — comment trong `apps/api/src/plugins/staff-guard.ts` nói thẳng điều này và gọi tên đúng hai route sắp có: "Route nghiệp vụ của đợt sau (`rentals`, `customers`) quên khai ở đây là bị chặn." Đó là hành vi mong muốn. Đừng thêm mục nào vào `PUBLIC_ROUTES`.

---

## Task 1: `transition()` — chuyển trạng thái đơn thuê

**Files:**
- Create: `packages/shared/src/domain/rental.test.ts`
- Create: `packages/shared/src/domain/rental.ts`

TDD nghiêm là luật của repo cho `packages/shared/src/domain/`. Test trước, luôn luôn.

- [ ] **Step 1: Viết test thất bại**

Tạo `packages/shared/src/domain/rental.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { transition, type RentalStatus } from "./rental";

describe("transition", () => {
  it("cho phép BOOKED → ONGOING (giao xe)", () => {
    expect(transition("BOOKED", "ONGOING")).toEqual({ ok: true });
  });

  it("cho phép BOOKED → CANCELLED (huỷ trước khi giao)", () => {
    expect(transition("BOOKED", "CANCELLED")).toEqual({ ok: true });
  });

  it("cho phép ONGOING → COMPLETED (trả xe)", () => {
    expect(transition("ONGOING", "COMPLETED")).toEqual({ ok: true });
  });

  // Đây KHÔNG phải một ca biên ngẫu nhiên. Cấm đường này là thứ bảo đảm đơn
  // CANCELLED không bao giờ có `handed_over_at`, và nhờ đó truy vấn doanh thu
  // chỉ cần lọc `handed_over_at IS NOT NULL` mà không phải kiểm trạng thái.
  it("CẤM ONGOING → CANCELLED — xe đã ra khỏi cửa hàng thì không 'chưa từng xảy ra'", () => {
    expect(transition("ONGOING", "CANCELLED")).toEqual({
      ok: false,
      reason: "INVALID_TRANSITION",
    });
  });

  it("trạng thái kết thúc không đi đâu được nữa", () => {
    const terminal: RentalStatus[] = ["COMPLETED", "CANCELLED"];
    const all: RentalStatus[] = ["BOOKED", "ONGOING", "COMPLETED", "CANCELLED"];
    for (const from of terminal) {
      for (const to of all) {
        expect(transition(from, to)).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
      }
    }
  });

  it("không cho phép tự chuyển về chính nó", () => {
    expect(transition("BOOKED", "BOOKED")).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    expect(transition("ONGOING", "ONGOING")).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó ĐỎ**

```bash
bun test packages/shared/src/domain/rental.test.ts
```

Kỳ vọng: FAIL — `Cannot find module './rental'`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `packages/shared/src/domain/rental.ts`:

```ts
/**
 * Vòng đời một đơn thuê. Xem §4 của
 * docs/plans/2026-08-15-staff-home-stats-calendar-design.md.
 *
 * File này KHÔNG import gì ngoài `packages/shared/src/domain/` — đó là điều kiện
 * để nó test được không cần DB, và là lý do TDD nghiêm khả thi ở đây.
 */
export type RentalStatus = "BOOKED" | "ONGOING" | "COMPLETED" | "CANCELLED";

export type TransitionResult = { ok: true } | { ok: false; reason: "INVALID_TRANSITION" };

/**
 * Đúng ba đường. Mọi đường khác bị từ chối, kể cả tự chuyển về chính nó.
 *
 * `ONGOING → CANCELLED` bị cấm CÓ CHỦ Ý, và đó không phải khắt khe vô cớ: xe đã
 * ra khỏi cửa hàng thì không có chuyện "chưa từng xảy ra" (khách trả sớm vẫn là
 * COMPLETED). Hệ quả ở tầng dữ liệu là thứ ta thực sự mua: đơn CANCELLED không
 * bao giờ có `handed_over_at`, nên truy vấn doanh thu lọc đúng một điều kiện
 * `handed_over_at IS NOT NULL` mà không thể vô tình đếm hay bỏ sót tiền đã thu.
 */
const ALLOWED: ReadonlyArray<readonly [RentalStatus, RentalStatus]> = [
  ["BOOKED", "ONGOING"],
  ["BOOKED", "CANCELLED"],
  ["ONGOING", "COMPLETED"],
];

/** Trả discriminated union, KHÔNG throw — pattern 3 của repo. Route dịch sang HTTP. */
export function transition(from: RentalStatus, to: RentalStatus): TransitionResult {
  const allowed = ALLOWED.some(([f, t]) => f === from && t === to);
  return allowed ? { ok: true } : { ok: false, reason: "INVALID_TRANSITION" };
}
```

- [ ] **Step 4: Chạy test, xác nhận nó XANH**

```bash
bun test packages/shared/src/domain/rental.test.ts
```

Kỳ vọng: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain/rental.ts packages/shared/src/domain/rental.test.ts
git commit -m "feat(shared): transition() cho vòng đời đơn thuê"
```

---

## Task 2: `isOverdue`, `toInterval`, `revenueAt`, `SHOP_TIMEZONE`

**Files:**
- Modify: `packages/shared/src/domain/rental.test.ts`
- Modify: `packages/shared/src/domain/rental.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `packages/shared/src/domain/rental.test.ts`:

```ts
import { isOverdue, revenueAt, toInterval, SHOP_TIMEZONE } from "./rental";
import { overlaps } from "./interval";

const T = (iso: string) => new Date(iso);

describe("isOverdue", () => {
  it("ONGOING và đã qua hạn → quá hạn", () => {
    expect(isOverdue({ status: "ONGOING", endsAt: T("2026-08-14T10:00:00Z") }, T("2026-08-15T03:00:00Z"))).toBe(true);
  });

  it("ONGOING nhưng chưa tới hạn → chưa quá hạn", () => {
    expect(isOverdue({ status: "ONGOING", endsAt: T("2026-08-16T10:00:00Z") }, T("2026-08-15T03:00:00Z"))).toBe(false);
  });

  it("đúng thời điểm hết hạn thì CHƯA quá hạn", () => {
    const t = T("2026-08-15T03:00:00Z");
    expect(isOverdue({ status: "ONGOING", endsAt: t }, t)).toBe(false);
  });

  // Đơn chưa giao mà quá ngày hẹn là chuyện khác hẳn — khách không tới lấy xe,
  // không phải xe đang nằm ngoài đường. Không được gộp hai thứ vào một nhãn đỏ.
  it("BOOKED quá ngày hẹn KHÔNG phải quá hạn", () => {
    expect(isOverdue({ status: "BOOKED", endsAt: T("2026-08-14T10:00:00Z") }, T("2026-08-15T03:00:00Z"))).toBe(false);
  });

  it("COMPLETED và CANCELLED không bao giờ quá hạn", () => {
    const past = { endsAt: T("2026-08-01T00:00:00Z") };
    const now = T("2026-08-15T03:00:00Z");
    expect(isOverdue({ status: "COMPLETED", ...past }, now)).toBe(false);
    expect(isOverdue({ status: "CANCELLED", ...past }, now)).toBe(false);
  });
});

describe("toInterval", () => {
  it("cắm thẳng được vào overlaps() đã có", () => {
    const a = toInterval({ startsAt: T("2026-08-12T00:00:00Z"), endsAt: T("2026-08-17T00:00:00Z") });
    const b = toInterval({ startsAt: T("2026-08-16T00:00:00Z"), endsAt: T("2026-08-20T00:00:00Z") });
    expect(overlaps(a, b)).toBe(true);
  });

  // Biên [start, end): đơn kết thúc đúng lúc đơn sau bắt đầu thì KHÔNG chồng nhau.
  // Đây chính là ngữ nghĩa mà tstzrange '[)' của DB dùng — hai bên phải khớp.
  it("chạm biên thì không chồng nhau", () => {
    const a = toInterval({ startsAt: T("2026-08-12T00:00:00Z"), endsAt: T("2026-08-17T00:00:00Z") });
    const b = toInterval({ startsAt: T("2026-08-17T00:00:00Z"), endsAt: T("2026-08-20T00:00:00Z") });
    expect(overlaps(a, b)).toBe(false);
  });
});

describe("revenueAt", () => {
  it("đơn đã giao tính vào thời điểm giao xe", () => {
    const handedOverAt = T("2026-08-15T02:00:00Z");
    expect(revenueAt({ status: "ONGOING", handedOverAt })).toEqual(handedOverAt);
    expect(revenueAt({ status: "COMPLETED", handedOverAt })).toEqual(handedOverAt);
  });

  it("đơn chưa giao chưa tính vào đâu cả", () => {
    expect(revenueAt({ status: "BOOKED", handedOverAt: null })).toBeNull();
  });

  it("đơn huỷ không tính, kể cả khi dữ liệu có dấu giao xe", () => {
    expect(revenueAt({ status: "CANCELLED", handedOverAt: T("2026-08-15T02:00:00Z") })).toBeNull();
  });
});

describe("SHOP_TIMEZONE", () => {
  it("là múi giờ của shop, không phải UTC", () => {
    expect(SHOP_TIMEZONE).toBe("Asia/Ho_Chi_Minh");
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó ĐỎ**

```bash
bun test packages/shared/src/domain/rental.test.ts
```

Kỳ vọng: FAIL — `isOverdue is not a function` (hoặc lỗi import tương đương).

- [ ] **Step 3: Viết implementation**

Thêm vào cuối `packages/shared/src/domain/rental.ts`:

```ts
import type { Interval } from "./interval";

/**
 * "Quá hạn" KHÔNG phải một trạng thái trong DB — nó suy ra lúc đọc. Nếu là trạng
 * thái thì phải có một job đi đổi nó, và trong khoảng job chưa chạy thì database
 * đang nói dối.
 *
 * `now` là THAM SỐ, không gọi `Date.now()` bên trong: đó là điều kiện để test
 * không phải đóng băng đồng hồ, và để frontend tô màu lịch bằng đúng hàm này.
 */
export function isOverdue(r: { status: RentalStatus; endsAt: Date }, now: Date): boolean {
  return r.status === "ONGOING" && r.endsAt.getTime() < now.getTime();
}

/** Đưa về `Interval` để dùng lại `overlaps()` — biên [start, end), khớp tstzrange '[)'. */
export function toInterval(r: { startsAt: Date; endsAt: Date }): Interval {
  return { start: r.startsAt, end: r.endsAt };
}

/**
 * Đơn này tính vào doanh thu của thời điểm nào. `null` = chưa tính.
 *
 * ĐỊNH NGHĨA DUY NHẤT — API dùng nó, frontend dùng nó. Hai định nghĩa là hai con
 * số khác nhau cho cùng một tháng, và không ai biết cái nào đúng.
 *
 * Nhánh CANCELLED hôm nay là bất khả thi (`transition` cấm ONGOING → CANCELLED,
 * nên đơn huỷ không thể có `handedOverAt`). Giữ lại vì đây là chỗ DUY NHẤT còn
 * đúng nếu một ngày nào đó luật chuyển trạng thái được nới, hoặc một hàng được
 * sửa tay trong DB.
 */
export function revenueAt(r: { status: RentalStatus; handedOverAt: Date | null }): Date | null {
  if (r.status === "CANCELLED") return null;
  return r.handedOverAt;
}

/**
 * Múi giờ vận hành của shop. "Hôm nay" của một shop ở TP.HCM là ngày theo giờ
 * Việt Nam, không phải UTC — xem §5.5 design doc để biết vì sao nhầm chỗ này làm
 * doanh thu sai mỗi sáng rồi TỰ ĐÚNG LẠI lúc 7h.
 *
 * Export từ đây để SQL của `apps/api` và phần định dạng của frontend không mỗi
 * bên giữ một bản.
 */
export const SHOP_TIMEZONE = "Asia/Ho_Chi_Minh";
```

Gộp `import type { Interval }` lên đầu file cùng các import khác (hiện chưa có import nào, nên đặt nó thành dòng đầu tiên của file).

- [ ] **Step 4: Chạy test, xác nhận nó XANH**

```bash
bun test packages/shared/src/domain/rental.test.ts
```

Kỳ vọng: PASS, **17 test** trong file này — 6 của Task 1 cộng 11 mới.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain/rental.ts packages/shared/src/domain/rental.test.ts
git commit -m "feat(shared): isOverdue, toInterval, revenueAt, SHOP_TIMEZONE"
```

---

## Task 3: `normalizePhone()` — chuẩn hoá số điện thoại

**Files:**
- Create: `packages/shared/src/domain/phone.test.ts`
- Create: `packages/shared/src/domain/phone.ts`

`DEBT.md` đã ghi một lỗi cùng lớp: email so sánh phân biệt hoa thường, khiến nhân viên gõ khác hoa thường thì không bao giờ nhận được mã và **không có gì để chẩn đoán**. Số điện thoại là đúng cái bẫy đó ở bảng `customers`.

- [ ] **Step 1: Viết test thất bại**

Tạo `packages/shared/src/domain/phone.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("bỏ khoảng trắng, dấu chấm, dấu gạch", () => {
    expect(normalizePhone("0912 345 678")).toBe("0912345678");
    expect(normalizePhone("0912.345.678")).toBe("0912345678");
    expect(normalizePhone("0912-345-678")).toBe("0912345678");
  });

  // Cùng một người, ba cách gõ. Không chuẩn hoá thì UNIQUE(phone) không chặn
  // được gì và danh sách khách bẩn dần theo tháng — không có lỗi ở đâu cả.
  it("quy +84 và 84 về dạng 0", () => {
    expect(normalizePhone("+84912345678")).toBe("0912345678");
    expect(normalizePhone("84912345678")).toBe("0912345678");
    expect(normalizePhone("+84 912 345 678")).toBe("0912345678");
  });

  it("giữ nguyên số đã đúng dạng", () => {
    expect(normalizePhone("0912345678")).toBe("0912345678");
  });

  it("trả null cho thứ không phải số điện thoại dùng được", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();       // quá ngắn
    expect(normalizePhone("091234567890123")).toBeNull(); // quá dài
    expect(normalizePhone("1912345678")).toBeNull();   // không bắt đầu bằng 0
  });

  // Hàm này ép đúng cái CHECK ở tầng DB. Lệch nhau thì service ghi được thứ
  // Postgres từ chối, và lỗi nổ ở chỗ không ai đọc được.
  it("mọi kết quả không-null đều khớp CHECK của bảng customers", () => {
    const pattern = /^0[0-9]{8,10}$/;
    for (const raw of ["0912 345 678", "+84912345678", "0281234567", "84987654321"]) {
      const n = normalizePhone(raw);
      expect(n).not.toBeNull();
      expect(n as string).toMatch(pattern);
    }
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó ĐỎ**

```bash
bun test packages/shared/src/domain/phone.test.ts
```

Kỳ vọng: FAIL — `Cannot find module './phone'`.

- [ ] **Step 3: Viết implementation**

Tạo `packages/shared/src/domain/phone.ts`:

```ts
/**
 * Chuẩn hoá số điện thoại Việt Nam về đúng một dạng: chỉ chữ số, bắt đầu bằng `0`.
 *
 * Dùng ở CẢ đường ghi lẫn đường đọc. Chỉ chuẩn hoá một đường là tạo ra hàng không
 * bao giờ tìm thấy — đúng lớp lỗi đã ghi ở docs/DEBT.md cho email phân biệt hoa
 * thường: không exception, không log, chỉ một danh sách bẩn dần.
 *
 * Trả `null` khi chuỗi không dùng được, thay vì throw hay trả về rác: gọi ở tầng
 * service rồi dịch thành lỗi HTTP.
 */
export function normalizePhone(raw: string): string | null {
  // Bỏ mọi thứ không phải chữ số, trừ dấu `+` ở đầu (đã xử lý ngay dưới).
  const digits = raw.trim().replace(/[^\d+]/g, "");

  let local = digits;
  if (local.startsWith("+84")) local = `0${local.slice(3)}`;
  else if (local.startsWith("84") && !local.startsWith("840")) local = `0${local.slice(2)}`;

  local = local.replace(/\D/g, "");

  // Cùng biểu thức với CHECK `customers_phone_normalized` ở packages/db.
  // Hai chỗ phải khớp; test ở file này khoá điều đó lại.
  return /^0[0-9]{8,10}$/.test(local) ? local : null;
}
```

- [ ] **Step 4: Chạy test, xác nhận nó XANH**

```bash
bun test packages/shared/src/domain/phone.test.ts
```

Kỳ vọng: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain/phone.ts packages/shared/src/domain/phone.test.ts
git commit -m "feat(shared): normalizePhone — chuẩn hoá số điện thoại hai đường"
```

---

## Task 4: Phơi hai module mới ra ngoài `@v9/shared`

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/index.ts`

`packages/shared/package.json` khai `exports` **tường minh** — chỉ `.`, `./client`, `./domain/money`, `./domain/staff`. Không thêm vào đây thì `apps/api` import `@v9/shared/domain/rental` sẽ hỏng lúc chạy dù `tsc` có thể vẫn xanh.

- [ ] **Step 1: Thêm subpath export**

Trong `packages/shared/package.json`, sửa khối `exports` thành:

```json
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./domain/money": "./src/domain/money.ts",
    "./domain/staff": "./src/domain/staff.ts",
    "./domain/rental": "./src/domain/rental.ts",
    "./domain/phone": "./src/domain/phone.ts"
  },
```

- [ ] **Step 2: Re-export từ entrypoint chính**

Thêm vào cuối `packages/shared/src/index.ts`:

```ts
export {
  SHOP_TIMEZONE,
  isOverdue,
  revenueAt,
  toInterval,
  transition,
  type RentalStatus,
  type TransitionResult,
} from "./domain/rental";
export { normalizePhone } from "./domain/phone";
```

- [ ] **Step 3: Xác minh cả hai đường import đều chạy**

⚠️ Phải chạy từ một file **nằm trong workspace**, không dùng `bun -e`: eval ở thư mục gốc
không phân giải được dependency kiểu `workspace:*`, nên `bun -e` báo
`Cannot find module '@v9/shared'` **kể cả khi exports hoàn toàn đúng** — một âm tính giả tốn thời
gian đi sửa thứ không hỏng.

```bash
cat > apps/api/__export_probe.ts <<'EOF'
import { transition, normalizePhone, SHOP_TIMEZONE } from "@v9/shared";
import { normalizePhone as viaSubpath } from "@v9/shared/domain/phone";
console.log(JSON.stringify(transition("BOOKED", "ONGOING")), normalizePhone("+84912345678"), SHOP_TIMEZONE, viaSubpath("0912 345 678"));
EOF
bun apps/api/__export_probe.ts
rm -f apps/api/__export_probe.ts
```

Kỳ vọng in ra: `{"ok":true} 0912345678 Asia/Ho_Chi_Minh 0912345678`

Nhớ xoá file probe — `rm` ở trên là một phần của bước, không phải dọn dẹp tuỳ chọn.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Kỳ vọng: xanh, không lỗi.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/package.json packages/shared/src/index.ts
git commit -m "chore(shared): phơi domain/rental và domain/phone qua exports"
```

---

## Task 5: Drizzle schema `customers` + `rentals`

**Files:**
- Create: `packages/db/src/schema/rentals.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Viết schema**

Tạo `packages/db/src/schema/rentals.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { staffUsers } from "./staff";
import { vehicles } from "./vehicles";

/**
 * Khách thuê xe. Quyết định + lý do ở §3.1 của
 * docs/plans/2026-08-15-staff-home-stats-calendar-design.md.
 *
 * `phone` là danh tính thực tế của khách ở một shop cho thuê xe — không phải
 * email. Nó lưu ĐÃ CHUẨN HOÁ (chỉ chữ số, bắt đầu bằng 0) và `CHECK` dưới đây ép
 * điều đó ở tầng DB, để một hàng chưa chuẩn hoá không lọt vào được bằng bất cứ
 * đường nào — kể cả một câu INSERT viết tay.
 *
 * Không có CHECK này thì `UNIQUE(phone)` không chặn được gì: "+84912345678" và
 * "0912 345 678" là hai chuỗi khác nhau với cùng một người. Đúng lớp lỗi mà
 * docs/DEBT.md đã ghi cho email phân biệt hoa thường.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull().unique(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Cùng biểu thức với `normalizePhone` ở @v9/shared. Test của hàm đó khoá
    // sự khớp nhau lại.
    check("customers_phone_normalized", sql`${t.phone} ~ '^0[0-9]{8,10}$'`),
  ],
);

/**
 * Một đơn thuê. §3.2 design doc.
 *
 * ⚠️ Cột `period` (tstzrange) và constraint `rentals_no_overlap` KHÔNG khai ở đây
 * — chúng nằm trong migration viết tay `0010`, vì drizzle-kit không sinh được cột
 * GENERATED kiểu range lẫn EXCLUDE constraint. Đừng thêm chúng vào file này: làm
 * vậy thì lần `db:generate` sau sẽ sinh ra một migration cố tạo lại thứ đã có.
 *
 * Tiền là `integer` chứ không `bigint`, cùng lý do đã ghi ở `vehicles`.
 *
 * `created_by` là `text` chứ không `uuid` vì `staff_users.id` là `text` (id do
 * SuperTokens sinh). Đây là FK mà docs/ROADMAP.md đòi: ai chốt đơn.
 */
export const rentals = pgTable(
  "rentals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    /** KẾ HOẠCH. Doanh thu KHÔNG dùng cột này — xem `handedOverAt`. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("BOOKED"),
    /** THỰC TẾ. Mốc ghi nhận doanh thu. */
    handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    totalAmount: integer("total_amount").notNull(),
    depositAmount: integer("deposit_amount").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("rentals_period_valid", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "rentals_status_valid",
      sql`${t.status} IN ('BOOKED', 'ONGOING', 'COMPLETED', 'CANCELLED')`,
    ),
    check("rentals_money_nonneg", sql`${t.totalAmount} >= 0 AND ${t.depositAmount} >= 0`),
    // Hai CHECK dưới đây KHÔNG phải phòng thủ thừa. Doanh thu tính bằng
    // `SUM(total_amount) WHERE handed_over_at ...`, nên một hàng ONGOING mà
    // `handed_over_at IS NULL` sẽ BIẾN MẤT khỏi báo cáo thay vì gây lỗi. Ép ở
    // DB thì hàng đó không tồn tại được.
    check(
      "rentals_ongoing_has_handover",
      sql`${t.status} <> 'ONGOING' OR ${t.handedOverAt} IS NOT NULL`,
    ),
    check(
      "rentals_completed_has_return",
      sql`${t.status} <> 'COMPLETED' OR (${t.handedOverAt} IS NOT NULL AND ${t.returnedAt} IS NOT NULL)`,
    ),
    // Chiều NGƯỢC LẠI của hai CHECK ngay trên, và chiều này nguy hiểm hơn.
    // Truy vấn doanh thu lọc đúng `handed_over_at IS NOT NULL` và KHÔNG kiểm
    // trạng thái, nên một hàng BOOKED hoặc CANCELLED mang dấu giao xe sẽ được
    // ĐẾM VÀO tiền — sai theo hướng thổi phồng doanh thu, và im lặng.
    //
    // `transition()` cấm ONGOING → CANCELLED, nhưng đó là luật của ỨNG DỤNG đi
    // bảo vệ một truy vấn ở tầng DATABASE: nó không đứng trước một câu UPDATE
    // sửa tay. Cộng với hai CHECK trên, hai cái này làm quan hệ thành HAI CHIỀU.
    check(
      "rentals_handover_only_when_out",
      sql`${t.handedOverAt} IS NULL OR ${t.status} IN ('ONGOING', 'COMPLETED')`,
    ),
    check(
      "rentals_return_only_when_completed",
      sql`${t.returnedAt} IS NULL OR ${t.status} = 'COMPLETED'`,
    ),
    // Trả xe không xảy ra trước khi giao xe.
    check(
      "rentals_return_after_handover",
      sql`${t.returnedAt} IS NULL OR ${t.handedOverAt} IS NULL OR ${t.returnedAt} >= ${t.handedOverAt}`,
    ),
    // Partial index cho truy vấn doanh thu: đơn chưa giao không bao giờ được đếm,
    // nên chúng không cần nằm trong index.
    index("rentals_revenue_idx")
      .on(t.handedOverAt)
      .where(sql`${t.handedOverAt} IS NOT NULL`),
  ],
);
```

- [ ] **Step 2: Export từ schema index**

Trong `packages/db/src/schema/index.ts`, **xoá** khối comment `customers và rentals CỐ Ý chưa tồn tại …` (nó đã hết đúng) và thay bằng:

```ts
/**
 * `rentals.period` (tstzrange) và constraint `rentals_no_overlap` sống trong
 * migration viết tay `0010`, không trong file schema — drizzle-kit không sinh
 * được cột GENERATED kiểu range lẫn EXCLUDE constraint. Extension `btree_gist`
 * đã bật từ migration `0000` chính là để câu đó chạy được.
 *
 * Biên của `period` là `[start, end)`, khớp `overlaps()` trong @v9/shared. Đổi
 * biên ở một bên mà quên bên kia sinh ra lỗi booking chỉ lộ lúc chạy thật.
 */
export { vehiclePhotos, vehicles } from "./vehicles";
export { passwordResetCodes, staffUsers } from "./staff";
export { customers, rentals } from "./rentals";
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Kỳ vọng: xanh.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/rentals.ts packages/db/src/schema/index.ts
git commit -m "feat(db): schema customers + rentals"
```

---

## Task 6: Migration `0009` (sinh) và `0010` (viết tay)

**Files:**
- Create: `packages/db/migrations/0009_*.sql` — do drizzle-kit đặt tên
- Create: `packages/db/migrations/0010_*.sql` — do drizzle-kit đặt tên, nội dung viết tay

`drizzle-kit push` bị **cấm** trong repo này. Schema chỉ đi qua migration file.

- [ ] **Step 1: Sinh migration cho hai bảng**

```bash
bun run db:generate
```

Kỳ vọng: sinh ra `packages/db/migrations/0009_<tên-ngẫu-nhiên>.sql` chứa `CREATE TABLE "customers"`, `CREATE TABLE "rentals"`, các `CHECK`, FK, và `CREATE INDEX "rentals_revenue_idx"`.

- [ ] **Step 2: Đọc lại file vừa sinh**

```bash
cat packages/db/migrations/0009_*.sql
```

Xác nhận có đủ: hai `CREATE TABLE`, năm `CHECK` của `rentals`, một `CHECK` của `customers`, ba khoá ngoại, và partial index. Nếu thiếu bất kỳ `CHECK` nào thì dừng lại — schema ở Task 5 chưa đúng.

- [ ] **Step 3: Tạo migration trống cho phần viết tay**

```bash
bun run db:custom
```

Kỳ vọng: sinh ra `packages/db/migrations/0010_<tên-ngẫu-nhiên>.sql` rỗng.

- [ ] **Step 4: Viết SQL vào migration `0010`**

Mở file `0010_*.sql` vừa tạo và điền:

```sql
-- `period` là cột SINH, không ghi tay được. Nếu ghi tay được thì nó lệch được với
-- starts_at/ends_at, và khi đó exclusion constraint dưới đây đang bảo vệ MỘT
-- KHOẢNG THỜI GIAN KHÁC với khoảng người dùng nhìn thấy — hàng rào vẫn đứng đó,
-- vẫn chạy, và bảo vệ nhầm thứ.
--
-- Biên '[)' khớp `overlaps()` của @v9/shared: đơn kết thúc đúng lúc đơn sau bắt
-- đầu thì KHÔNG chồng nhau.
ALTER TABLE "rentals"
  ADD COLUMN "period" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

-- Hàng rào chống đặt trùng THẬT. Không phải một câu SELECT kiểm trước khi INSERT
-- — câu đó luôn thua race condition, còn cái này thì không.
--
-- Extension btree_gist bật từ migration 0000 chính là để `vehicle_id WITH =` đứng
-- cạnh `period WITH &&` trong cùng một index GiST.
--
-- Mệnh đề WHERE: đơn đã huỷ không chặn chỗ. `transition()` ở @v9/shared cấm
-- ONGOING -> CANCELLED, nên một đơn CANCELLED không bao giờ là đơn đã giao xe.
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_no_overlap"
  EXCLUDE USING gist ("vehicle_id" WITH =, "period" WITH &&)
  WHERE (status <> 'CANCELLED');
```

- [ ] **Step 5: Chạy migration**

```bash
bun run db:migrate
```

Kỳ vọng: cả `0009` và `0010` apply thành công, không lỗi.

- [ ] **Step 6: Xác minh constraint có thật trong DB**

```bash
docker compose exec -T postgres psql -U postgres -d v9 -c "\d rentals" | grep -E "period|rentals_no_overlap"
```

Kỳ vọng: thấy cả dòng `period | tstzrange | ... generated always as ... stored` và dòng `rentals_no_overlap EXCLUDE USING gist`.

> Nếu tên database/user khác, lấy từ `DATABASE_URL` trong `.env`.

- [ ] **Step 7: Commit**

```bash
git add packages/db/migrations/
git commit -m "feat(db): migration 0009 + 0010 — bảng rentals và hàng rào chống đặt trùng"
```

---

## Task 7: Chứng minh hàng rào chống đặt trùng thật sự chặn

**Files:**
- Create: `packages/db/src/schema/rentals-schema.test.ts`

Đây là test quan trọng nhất của Plan A. Nó **phải** chạm Postgres thật: exclusion constraint không tồn tại ở tầng nào khác, nên không unit test nào thay thế được.

- [ ] **Step 1: Viết test**

Tạo `packages/db/src/schema/rentals-schema.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "bun:test";
import { setupDb } from "../test-support";

const { sql, inRollback } = setupDb();

// Dùng lại đúng mẫu của btree-gist.test.ts và vehicles-schema.test.ts: mọi thứ
// chạy trong transaction rồi ROLLBACK, nên không hàng nào commit vào DB dev.
// ⚠️ Trong callback chỉ được dùng `tx`. Chạm `sql` là ghi NGOÀI transaction.

let vehicleId: string;
let customerId: string;
let staffId: string;

/** Dựng dữ liệu phụ thuộc bên trong một transaction đã cho. */
async function seed(tx: Parameters<Parameters<typeof inRollback>[0]>[0]) {
  const [v] = await tx`
    INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit)
    VALUES (${`ztest-rental-${crypto.randomUUID()}`}, 'Honda', 'CB500X', 471, 500000, 5000000)
    RETURNING id`;
  const [c] = await tx`
    INSERT INTO customers (full_name, phone)
    VALUES ('Khách test', ${`0${Math.floor(900000000 + Math.random() * 99999999)}`})
    RETURNING id`;
  const [s] = await tx`
    INSERT INTO staff_users (id, email, full_name, role, status)
    VALUES (${`ztest-${crypto.randomUUID()}`}, ${`ztest-${crypto.randomUUID()}@example.com`}, 'NV test', 'OWNER', 'ACTIVE')
    RETURNING id`;
  vehicleId = v.id as string;
  customerId = c.id as string;
  staffId = s.id as string;
}

const AUG = (d: number, h = 0) => `2026-08-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00+07:00`;

describe("rentals — hàng rào chống đặt trùng", () => {
  it("chèn được đơn đầu tiên", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      const [r] = await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})
        RETURNING id, status`;
      expect(r.status).toBe("BOOKED");
    });
  });

  // ĐÂY là lý do test này tồn tại. Không có Postgres thật thì không gì chứng minh
  // được điều dưới đây, và mọi tầng phía trên đang tin vào nó.
  it("TỪ CHỐI đơn thứ hai chồng thời gian trên cùng một xe, với SQLSTATE 23P01", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})`;

      let caught: unknown = null;
      // Bọc trong savepoint: lỗi trong transaction làm hỏng CẢ transaction, nên
      // không có nó thì `inRollback` không kết thúc sạch được.
      await tx.savepoint(async (sp) => {
        try {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
            VALUES (${vehicleId}, ${customerId}, ${AUG(15)}, ${AUG(20)}, 2500000, ${staffId})`;
        } catch (e) {
          caught = e;
        }
      });

      expect(caught).not.toBeNull();
      // ⚠️ SQLSTATE nằm ở `.errno`, KHÔNG phải `.code` — `.code` luôn là
      // "ERR_POSTGRES_SERVER_ERROR". Assertion này là thứ khoá luật đó lại cho
      // `services/rentals.ts` ở Task 9.
      expect((caught as { errno?: string }).errno).toBe("23P01");
      expect((caught as { code?: string }).code).toBe("ERR_POSTGRES_SERVER_ERROR");
    });
  });

  it("CHO PHÉP đơn chạm biên — kết thúc đúng lúc đơn sau bắt đầu", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})`;
      const [r] = await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(17)}, ${AUG(20)}, 1500000, ${staffId})
        RETURNING id`;
      expect(r.id).toBeDefined();
    });
  });

  it("đơn ĐÃ HUỶ không chặn chỗ", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'CANCELLED')`;
      const [r] = await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})
        RETURNING id`;
      expect(r.id).toBeDefined();
    });
  });

  it("hai XE KHÁC NHAU thuê cùng lúc thì không sao", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      const [v2] = await tx`
        INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit)
        VALUES (${`ztest-rental-${crypto.randomUUID()}`}, 'Kawasaki', 'Z900', 948, 900000, 10000000)
        RETURNING id`;
      await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})`;
      const [r] = await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${v2.id}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 4500000, ${staffId})
        RETURNING id`;
      expect(r.id).toBeDefined();
    });
  });
});

describe("rentals — CHECK constraint", () => {
  it("từ chối ends_at <= starts_at", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: unknown = null;
      await tx.savepoint(async (sp) => {
        try {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
            VALUES (${vehicleId}, ${customerId}, ${AUG(17)}, ${AUG(12)}, 2500000, ${staffId})`;
        } catch (e) {
          caught = e;
        }
      });
      expect((caught as { errno?: string }).errno).toBe("23514");
    });
  });

  // Hàng này mà lọt được thì nó BIẾN MẤT khỏi báo cáo doanh thu thay vì gây lỗi.
  it("từ chối ONGOING mà không có handed_over_at", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: unknown = null;
      await tx.savepoint(async (sp) => {
        try {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'ONGOING')`;
        } catch (e) {
          caught = e;
        }
      });
      expect((caught as { errno?: string }).errno).toBe("23514");
    });
  });

  it("từ chối trạng thái không có trong danh sách", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: unknown = null;
      await tx.savepoint(async (sp) => {
        try {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'AVAILABLE')`;
        } catch (e) {
          caught = e;
        }
      });
      expect((caught as { errno?: string }).errno).toBe("23514");
    });
  });

  // Chiều nguy hiểm hơn: hàng này KHÔNG biến mất khỏi báo cáo, nó được ĐẾM VÀO
  // doanh thu — vì truy vấn thống kê lọc `handed_over_at IS NOT NULL` mà không
  // kiểm trạng thái.
  it("từ chối đơn CANCELLED mang dấu giao xe", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: unknown = null;
      await tx.savepoint(async (sp) => {
        try {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status, handed_over_at)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'CANCELLED', ${AUG(12, 9)})`;
        } catch (e) {
          caught = e;
        }
      });
      expect((caught as { errno?: string }).errno).toBe("23514");
    });
  });

  it("từ chối trả xe trước khi giao xe", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: unknown = null;
      await tx.savepoint(async (sp) => {
        try {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status, handed_over_at, returned_at)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'COMPLETED', ${AUG(15, 9)}, ${AUG(13, 9)})`;
        } catch (e) {
          caught = e;
        }
      });
      expect((caught as { errno?: string }).errno).toBe("23514");
    });
  });
});

describe("customers — CHECK số điện thoại", () => {
  it("từ chối số chưa chuẩn hoá", async () => {
    await inRollback(async (tx) => {
      let caught: unknown = null;
      await tx.savepoint(async (sp) => {
        try {
          await sp`INSERT INTO customers (full_name, phone) VALUES ('X', '+84912345678')`;
        } catch (e) {
          caught = e;
        }
      });
      expect((caught as { errno?: string }).errno).toBe("23514");
    });
  });

  /**
   * HÀNG RÀO THẬT cho hợp đồng ngầm giữa `packages/shared` và `packages/db`.
   *
   * `phone.test.ts` KHÔNG làm được việc này: nó chỉ so `normalizePhone` với một
   * bản sao regex thứ ba nằm trong chính file đó, và nó không được phép import
   * `packages/db` (luật `src/domain/**` không import gì). Comment ở hai bên chỉ
   * làm hợp đồng DỄ TÌM; test này mới làm nó ĐỎ khi lệch.
   *
   * Chạy `normalizePhone` thật rồi hỏi Postgres thật — sửa regex một bên mà quên
   * bên kia thì ca tương ứng đổ ngay.
   */
  it("mọi thứ normalizePhone chấp nhận thì Postgres cũng chấp nhận, và ngược lại", async () => {
    const SAMPLES = [
      "0912 345 678",
      "+84912345678",
      "84987654321",
      "0281234567",
      "0912345678",
      "abc",
      "",
      "12345",
      "1912345678",
      "091234567890123",
    ];

    await inRollback(async (tx) => {
      for (const raw of SAMPLES) {
        const normalized = normalizePhone(raw);
        // Khi hàm từ chối, vẫn thử ghi chuỗi THÔ: đó đúng là thứ lọt vào DB nếu
        // ai đó quên gọi normalizePhone ở tầng service.
        const candidate = normalized ?? raw;

        let dbAccepted = false;
        await tx.savepoint(async (sp) => {
          try {
            await sp`INSERT INTO customers (full_name, phone) VALUES ('parity', ${candidate})`;
            dbAccepted = true;
            // Xoá ngay: nhiều mẫu chuẩn hoá về cùng một số, và UNIQUE(phone) sẽ
            // làm ca sau trượt vì lý do KHÔNG liên quan tới regex.
            await sp`DELETE FROM customers WHERE phone = ${candidate}`;
          } catch {
            dbAccepted = false;
          }
        });

        expect({ raw, dbAccepted }).toEqual({ raw, dbAccepted: normalized !== null });
      }
    });
  });
});
```

Thêm `import { normalizePhone } from "@v9/shared/domain/phone";` vào đầu file test.

⚠️ `packages/db/package.json` chưa khai `@v9/shared` là dependency. Thêm `"@v9/shared": "workspace:*"` vào `dependencies` của nó, nếu không import trên không phân giải được. Đây là **chiều phụ thuộc mới** `db → shared` và nó hợp lệ: `shared/domain` không import gì, nên không có vòng.

- [ ] **Step 2: Chạy test**

```bash
bun test packages/db/src/schema/rentals-schema.test.ts
```

Kỳ vọng: PASS, **12 test** — 5 ca hàng rào chống trùng · 5 ca CHECK của `rentals` · 2 ca của `customers` (1 từ chối + 1 parity). Cần `docker compose up -d` đang chạy.

> Nếu test "TỪ CHỐI đơn thứ hai chồng thời gian" **xanh mà không nên xanh**, hãy kiểm lại migration `0010` đã apply chưa (`bun run db:migrate`). Một constraint chưa tồn tại làm test này đỏ chứ không xanh — nhưng nếu `period` chưa tồn tại thì INSERT sẽ hỏng ở chỗ khác và thông báo sẽ khác.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/rentals-schema.test.ts
git commit -m "test(db): chứng minh exclusion constraint và CHECK của rentals"
```

---

## Task 8: `services/customers.ts` — tìm và tạo khách

**Files:**
- Create: `apps/api/src/services/customers.ts`
- Create: `apps/api/src/services/customers.test.ts`

- [ ] **Step 1: Viết service**

Tạo `apps/api/src/services/customers.ts`:

```ts
import { schema } from "@v9/db";
import { normalizePhone } from "@v9/shared/domain/phone";
import { asc, eq, or, like } from "drizzle-orm";
import { db } from "../db";

export interface Customer {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly note: string | null;
}

export type CreateCustomerResult =
  | { ok: true; customer: Customer }
  | { ok: false; reason: "INVALID_PHONE" }
  /** Trả kèm `existing` để form dùng lại hồ sơ có sẵn thay vì bắt người nhập lại. */
  | { ok: false; reason: "CUSTOMER_EXISTS"; existing: Customer };

const COLUMNS = {
  id: schema.customers.id,
  fullName: schema.customers.fullName,
  phone: schema.customers.phone,
  note: schema.customers.note,
};

/** Tìm theo tên hoặc số điện thoại. `q` rỗng trả về danh sách rỗng, không phải toàn bộ bảng. */
export async function searchCustomers(q: string): Promise<Customer[]> {
  const term = q.trim();
  if (term.length === 0) return [];

  // Chuẩn hoá ĐƯỜNG ĐỌC nữa, không chỉ đường ghi: người dùng gõ "+84912..." vào ô
  // tìm kiếm cũng phải ra đúng khách đó. Chỉ chuẩn hoá một đường là tạo ra hàng
  // không bao giờ tìm thấy — xem docs/DEBT.md, mục email phân biệt hoa thường.
  const asPhone = normalizePhone(term);

  return db
    .select(COLUMNS)
    .from(schema.customers)
    .where(
      asPhone
        ? or(eq(schema.customers.phone, asPhone), like(schema.customers.fullName, `%${term}%`))
        : like(schema.customers.fullName, `%${term}%`),
    )
    .orderBy(asc(schema.customers.fullName))
    .limit(20);
}

export async function findCustomerByPhone(rawPhone: string): Promise<Customer | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const [row] = await db.select(COLUMNS).from(schema.customers).where(eq(schema.customers.phone, phone)).limit(1);
  return row ?? null;
}

export async function createCustomer(input: {
  fullName: string;
  phone: string;
  note?: string | null;
}): Promise<CreateCustomerResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, reason: "INVALID_PHONE" };

  const existing = await findCustomerByPhone(phone);
  if (existing) return { ok: false, reason: "CUSTOMER_EXISTS", existing };

  const [row] = await db
    .insert(schema.customers)
    .values({ fullName: input.fullName.trim(), phone, note: input.note ?? null })
    .returning(COLUMNS);

  if (!row) throw new Error("INSERT customers không trả về hàng nào");
  return { ok: true, customer: row };
}
```

- [ ] **Step 2: Viết test**

Tạo `apps/api/src/services/customers.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import { createCustomer, findCustomerByPhone, searchCustomers } from "./customers";

// Tiền tố riêng để dọn sạch mà không đụng dữ liệu thật. Dọn ở CẢ hai đầu: afterAll
// không chạy khi lần trước bị Ctrl-C, và hàng sót lại làm assertion sai lệch.
const P = "ztest-kh-";
const PHONE = "0912000001";

async function clean() {
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
}

beforeAll(clean);
afterAll(clean);

describe("createCustomer", () => {
  it("chuẩn hoá số điện thoại trước khi ghi", async () => {
    const r = await createCustomer({ fullName: `${P}Minh Anh`, phone: "+84 912 000 001" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.customer.phone).toBe(PHONE);
  });

  it("trả CUSTOMER_EXISTS kèm hồ sơ cũ khi trùng số, dù gõ khác dạng", async () => {
    const r = await createCustomer({ fullName: `${P}Minh Anh lần hai`, phone: "0912.000.001" });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "CUSTOMER_EXISTS") {
      expect(r.existing.phone).toBe(PHONE);
      expect(r.existing.fullName).toBe(`${P}Minh Anh`);
    } else {
      throw new Error(`mong đợi CUSTOMER_EXISTS, nhận được ${JSON.stringify(r)}`);
    }
  });

  it("từ chối số không dùng được", async () => {
    const r = await createCustomer({ fullName: `${P}Sai`, phone: "abc" });
    expect(r).toEqual({ ok: false, reason: "INVALID_PHONE" });
  });
});

describe("searchCustomers", () => {
  it("tìm được bằng số điện thoại gõ ở dạng khác", async () => {
    const rows = await searchCustomers("+84912000001");
    expect(rows.map((c) => c.phone)).toContain(PHONE);
  });

  it("tìm được bằng một phần tên", async () => {
    const rows = await searchCustomers(`${P}Minh`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("chuỗi rỗng trả về rỗng, không trả cả bảng", async () => {
    expect(await searchCustomers("   ")).toEqual([]);
  });
});

describe("findCustomerByPhone", () => {
  it("trả null cho số không tồn tại", async () => {
    expect(await findCustomerByPhone("0999999999")).toBeNull();
  });
});
```

- [ ] **Step 3: Chạy test**

```bash
bun test apps/api/src/services/customers.test.ts
```

Kỳ vọng: PASS, 7 test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/customers.ts apps/api/src/services/customers.test.ts
git commit -m "feat(api): services/customers — tìm và tạo khách, chuẩn hoá hai đường"
```

---

## Task 9: `services/rentals.ts` — `createRental` và bẫy `.errno`

**Files:**
- Create: `apps/api/src/services/rentals.ts`
- Create: `apps/api/src/services/rentals.test.ts`

- [ ] **Step 1: Viết service**

Tạo `apps/api/src/services/rentals.ts`:

```ts
import { schema } from "@v9/db";
import type { RentalStatus } from "@v9/shared/domain/rental";
import type { Vnd } from "@v9/shared/domain/money";
import { db } from "../db";

export interface Rental {
  readonly id: string;
  readonly vehicleId: string;
  readonly customerId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: RentalStatus;
  readonly handedOverAt: Date | null;
  readonly returnedAt: Date | null;
  readonly totalAmount: Vnd;
  readonly depositAmount: Vnd;
  readonly note: string | null;
}

export type CreateRentalResult =
  | { ok: true; rental: Rental }
  | { ok: false; reason: "RENTAL_OVERLAP" };

/**
 * ⚠️ SQLSTATE của Bun.SQL nằm ở `.errno`, KHÔNG phải `.code`.
 *
 * `.code` LUÔN là "ERR_POSTGRES_SERVER_ERROR", nên `e.code === "23P01"` là điều
 * kiện không bao giờ đúng — va chạm booking sẽ rơi ra 500 thay vì 409, và không
 * unit test mock database nào bắt được (nó sẽ xác nhận đoạn code sai là đúng).
 *
 * `packages/db/src/schema/rentals-schema.test.ts` khoá cả hai vế của luật này
 * bằng Postgres thật.
 */
function isOverlapViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "errno" in e &&
    (e as { errno?: unknown }).errno === "23P01"
  );
}

const COLUMNS = {
  id: schema.rentals.id,
  vehicleId: schema.rentals.vehicleId,
  customerId: schema.rentals.customerId,
  startsAt: schema.rentals.startsAt,
  endsAt: schema.rentals.endsAt,
  status: schema.rentals.status,
  handedOverAt: schema.rentals.handedOverAt,
  returnedAt: schema.rentals.returnedAt,
  totalAmount: schema.rentals.totalAmount,
  depositAmount: schema.rentals.depositAmount,
  note: schema.rentals.note,
};

/**
 * Tạo đơn. MỘT câu INSERT, không transaction và không savepoint — cả hai chỉ cần
 * khi transaction còn phải chạy tiếp SAU một lỗi có thể phục hồi, mà ở đây không
 * có gì chạy tiếp. (Luật savepoint của CLAUDE.md áp cho `changeRentalStatus` bên
 * dưới, nơi có đọc-rồi-ghi trong cùng một transaction.)
 *
 * Không kiểm chồng lịch bằng SELECT trước khi INSERT: câu đó luôn thua race
 * condition. Hàng rào là exclusion constraint, và ở đây ta chỉ DỊCH lỗi của nó.
 */
export async function createRental(input: {
  vehicleId: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date;
  totalAmount: Vnd;
  depositAmount: Vnd;
  createdBy: string;
  note?: string | null;
}): Promise<CreateRentalResult> {
  try {
    const [row] = await db
      .insert(schema.rentals)
      .values({
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        totalAmount: input.totalAmount,
        depositAmount: input.depositAmount,
        createdBy: input.createdBy,
        note: input.note ?? null,
      })
      .returning(COLUMNS);

    if (!row) throw new Error("INSERT rentals không trả về hàng nào");
    return { ok: true, rental: { ...row, status: row.status as RentalStatus } };
  } catch (e) {
    if (isOverlapViolation(e)) return { ok: false, reason: "RENTAL_OVERLAP" };
    throw e;
  }
}
```

- [ ] **Step 2: Viết test**

Tạo `apps/api/src/services/rentals.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import { createRental } from "./rentals";

const P = "ztest-thue-";
const AUG = (d: number) => new Date(`2026-08-${String(d).padStart(2, "0")}T00:00:00+07:00`);

let vehicleId: string;
let customerId: string;
let staffId: string;

async function clean() {
  // rentals đi TRƯỚC: nó có FK RESTRICT tới cả ba bảng kia.
  //
  // Lọc theo `created_by` chứ KHÔNG `delete(schema.rentals)` trần: `bun test`
  // chạy mọi file trong cùng một tiến trình và cùng một database dev, nên một câu
  // DELETE không điều kiện ở đây sẽ xoá luôn dữ liệu của file test khác — và triệu
  // chứng là "test kia thỉnh thoảng đỏ", tuỳ thứ tự chạy do Bun chọn.
  await db.delete(schema.rentals).where(like(schema.rentals.createdBy, `${P}%`));
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

beforeAll(async () => {
  await clean();
  const [v] = await db
    .insert(schema.vehicles)
    .values({ slug: `${P}cb500x`, make: "Honda", model: "CB500X", engineCc: 471, pricePerDay: 500_000, deposit: 5_000_000 })
    .returning();
  const [c] = await db
    .insert(schema.customers)
    .values({ fullName: `${P}Minh Anh`, phone: "0912000101" })
    .returning();
  const [s] = await db
    .insert(schema.staffUsers)
    .values({ id: `${P}owner`, email: `${P}owner@example.com`, fullName: "Chủ shop test", role: "OWNER", status: "ACTIVE" })
    .returning();
  if (!v || !c || !s) throw new Error("seed hỏng");
  vehicleId = v.id;
  customerId = c.id;
  staffId = s.id;
});

afterAll(clean);

describe("createRental", () => {
  it("tạo được đơn đầu tiên, mặc định BOOKED", async () => {
    const r = await createRental({
      vehicleId, customerId, startsAt: AUG(12), endsAt: AUG(17),
      totalAmount: 2_500_000, depositAmount: 5_000_000, createdBy: staffId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rental.status).toBe("BOOKED");
      expect(r.rental.handedOverAt).toBeNull();
    }
  });

  // Test này là lý do cả file tồn tại. Nếu `isOverlapViolation` đọc `.code` thay
  // vì `.errno`, exception bay ra ngoài và test đỏ ở đây — chứ không phải rơi ra
  // 500 trên production vào một ngày đông khách.
  it("trả RENTAL_OVERLAP (không throw) khi chồng lịch cùng xe", async () => {
    const r = await createRental({
      vehicleId, customerId, startsAt: AUG(15), endsAt: AUG(20),
      totalAmount: 2_500_000, depositAmount: 5_000_000, createdBy: staffId,
    });
    expect(r).toEqual({ ok: false, reason: "RENTAL_OVERLAP" });
  });

  it("cho phép đơn chạm biên", async () => {
    const r = await createRental({
      vehicleId, customerId, startsAt: AUG(17), endsAt: AUG(20),
      totalAmount: 1_500_000, depositAmount: 5_000_000, createdBy: staffId,
    });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Chạy test**

```bash
bun test apps/api/src/services/rentals.test.ts
```

Kỳ vọng: PASS, 3 test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/rentals.ts apps/api/src/services/rentals.test.ts
git commit -m "feat(api): createRental — dịch 23P01 thành RENTAL_OVERLAP"
```

---

## Task 10: `listRentalsInRange` — dữ liệu cho lịch

**Files:**
- Modify: `apps/api/src/services/rentals.ts`
- Modify: `apps/api/src/services/rentals.test.ts`

- [ ] **Step 1: Thêm vào service**

Thêm vào cuối `apps/api/src/services/rentals.ts`:

```ts
import { sql } from "drizzle-orm";

/** Trần khoảng thời gian, hằng CÓ TÊN — không rải số 92 trong route. */
export const MAX_RANGE_DAYS = 92;

export interface RentalWithCustomer extends Rental {
  readonly customerName: string;
  readonly customerPhone: string;
}

export type ListRentalsResult =
  | { ok: true; rentals: RentalWithCustomer[] }
  | { ok: false; reason: "INVALID_RANGE" };

/**
 * Mọi đơn GIAO với [from, to). Dùng toán tử `&&` trên cột sinh `period`, nên nó
 * đi qua đúng GiST index mà exclusion constraint đã tạo ra — không index nào
 * được thêm cho truy vấn này.
 *
 * Vượt trần hoặc khoảng không hợp lệ thì trả về lỗi, KHÔNG tự cắt bớt: cắt là trả
 * dữ liệu thiếu dưới vỏ một response thành công, và client không có cách nào biết.
 */
export async function listRentalsInRange(from: Date, to: Date): Promise<ListRentalsResult> {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (!(days > 0) || days > MAX_RANGE_DAYS) return { ok: false, reason: "INVALID_RANGE" };

  const rows = await db
    .select({
      ...COLUMNS,
      customerName: schema.customers.fullName,
      customerPhone: schema.customers.phone,
    })
    .from(schema.rentals)
    .innerJoin(schema.customers, sql`${schema.customers.id} = ${schema.rentals.customerId}`)
    .where(sql`${schema.rentals.status} <> 'CANCELLED' AND period && tstzrange(${from}, ${to}, '[)')`)
    .orderBy(schema.rentals.vehicleId, schema.rentals.startsAt);

  return {
    ok: true,
    rentals: rows.map((r) => ({ ...r, status: r.status as RentalStatus })),
  };
}
```

- [ ] **Step 2: Thêm test**

Thêm vào cuối `apps/api/src/services/rentals.test.ts`:

```ts
import { listRentalsInRange, MAX_RANGE_DAYS } from "./rentals";

describe("listRentalsInRange", () => {
  it("trả đơn giao với khoảng, kèm tên khách", async () => {
    const r = await listRentalsInRange(AUG(14), AUG(16));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rentals.length).toBeGreaterThan(0);
      expect(r.rentals[0]?.customerName).toBe(`${P}Minh Anh`);
    }
  });

  it("KHÔNG trả đơn nằm ngoài khoảng", async () => {
    const r = await listRentalsInRange(AUG(1), AUG(5));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rentals).toEqual([]);
  });

  it("đơn chạm biên trái của cửa sổ thì không tính là giao nhau", async () => {
    // Đơn 12→17 và cửa sổ [17, 20) chạm nhau tại 17 — biên [) nên KHÔNG giao.
    // Đơn 17→20 thì có. Vậy cửa sổ này phải trả đúng một đơn.
    const r = await listRentalsInRange(AUG(17), AUG(20));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rentals).toHaveLength(1);
  });

  it("từ chối khoảng vượt trần thay vì cắt bớt trong im lặng", async () => {
    const from = AUG(1);
    const to = new Date(from.getTime() + (MAX_RANGE_DAYS + 1) * 86_400_000);
    expect(await listRentalsInRange(from, to)).toEqual({ ok: false, reason: "INVALID_RANGE" });
  });

  it("từ chối khoảng ngược và khoảng rỗng", async () => {
    expect(await listRentalsInRange(AUG(20), AUG(10))).toEqual({ ok: false, reason: "INVALID_RANGE" });
    expect(await listRentalsInRange(AUG(10), AUG(10))).toEqual({ ok: false, reason: "INVALID_RANGE" });
  });
});
```

- [ ] **Step 3: Chạy test**

```bash
bun test apps/api/src/services/rentals.test.ts
```

Kỳ vọng: PASS, 8 test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/rentals.ts apps/api/src/services/rentals.test.ts
git commit -m "feat(api): listRentalsInRange qua GiST index, trần MAX_RANGE_DAYS"
```

---

## Task 11: `changeRentalStatus` — đọc-rồi-ghi trong transaction

**Files:**
- Modify: `apps/api/src/services/rentals.ts`
- Modify: `apps/api/src/services/rentals.test.ts`

- [ ] **Step 1: Thêm vào service**

Thêm vào cuối `apps/api/src/services/rentals.ts`:

```ts
import { transition } from "@v9/shared/domain/rental";
import { eq } from "drizzle-orm";

export type ChangeStatusResult =
  | { ok: true; rental: Rental }
  | { ok: false; reason: "NOT_FOUND" | "INVALID_TRANSITION" };

/**
 * Đổi trạng thái đơn. Đọc-rồi-ghi, nên PHẢI nằm trong transaction có
 * `SELECT ... FOR UPDATE`: không có nó, hai nhân viên bấm "giao xe" cùng lúc đều
 * đọc thấy BOOKED và cả hai đều ghi được.
 *
 * Transaction boundary thuộc SERVICE, không thuộc route — pattern 4 của repo.
 *
 * Dấu thời gian đóng ở đây chứ không để route truyền vào: `handed_over_at` là mốc
 * ghi nhận doanh thu, và một route truyền sai giờ là một tháng doanh thu sai.
 */
export async function changeRentalStatus(
  id: string,
  to: RentalStatus,
  now: Date,
): Promise<ChangeStatusResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: schema.rentals.id, status: schema.rentals.status })
      .from(schema.rentals)
      .where(eq(schema.rentals.id, id))
      .for("update")
      .limit(1);

    if (!current) return { ok: false as const, reason: "NOT_FOUND" as const };

    const check = transition(current.status as RentalStatus, to);
    if (!check.ok) return { ok: false as const, reason: check.reason };

    const [row] = await tx
      .update(schema.rentals)
      .set({
        status: to,
        updatedAt: now,
        ...(to === "ONGOING" ? { handedOverAt: now } : {}),
        ...(to === "COMPLETED" ? { returnedAt: now } : {}),
      })
      .where(eq(schema.rentals.id, id))
      .returning(COLUMNS);

    if (!row) throw new Error("UPDATE rentals không trả về hàng nào");
    return { ok: true as const, rental: { ...row, status: row.status as RentalStatus } };
  });
}
```

- [ ] **Step 2: Thêm test**

Thêm vào cuối `apps/api/src/services/rentals.test.ts`:

```ts
import { changeRentalStatus } from "./rentals";

describe("changeRentalStatus", () => {
  const NOW = new Date("2026-08-15T03:00:00Z");

  it("BOOKED → ONGOING đóng dấu handed_over_at", async () => {
    const created = await createRental({
      vehicleId, customerId, startsAt: AUG(25), endsAt: AUG(27),
      totalAmount: 1_000_000, depositAmount: 5_000_000, createdBy: staffId,
    });
    if (!created.ok) throw new Error("seed hỏng");

    const r = await changeRentalStatus(created.rental.id, "ONGOING", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rental.status).toBe("ONGOING");
      expect(r.rental.handedOverAt?.toISOString()).toBe(NOW.toISOString());
      expect(r.rental.returnedAt).toBeNull();
    }
  });

  it("ONGOING → COMPLETED đóng dấu returned_at, giữ nguyên handed_over_at", async () => {
    const [row] = await db
      .select({ id: schema.rentals.id })
      .from(schema.rentals)
      .where(eq(schema.rentals.status, "ONGOING"))
      .limit(1);
    if (!row) throw new Error("không có đơn ONGOING để test");

    const r = await changeRentalStatus(row.id, "COMPLETED", NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rental.status).toBe("COMPLETED");
      expect(r.rental.handedOverAt).not.toBeNull();
      expect(r.rental.returnedAt?.toISOString()).toBe(NOW.toISOString());
    }
  });

  it("từ chối đường chuyển không hợp lệ, không đụng vào DB", async () => {
    const created = await createRental({
      vehicleId, customerId, startsAt: AUG(28), endsAt: AUG(30),
      totalAmount: 1_000_000, depositAmount: 5_000_000, createdBy: staffId,
    });
    if (!created.ok) throw new Error("seed hỏng");

    const r = await changeRentalStatus(created.rental.id, "COMPLETED", NOW);
    expect(r).toEqual({ ok: false, reason: "INVALID_TRANSITION" });

    const [after] = await db
      .select({ status: schema.rentals.status })
      .from(schema.rentals)
      .where(eq(schema.rentals.id, created.rental.id))
      .limit(1);
    expect(after?.status).toBe("BOOKED");
  });

  it("trả NOT_FOUND cho id không tồn tại", async () => {
    const r = await changeRentalStatus(crypto.randomUUID(), "ONGOING", NOW);
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
```

Thêm `import { eq } from "drizzle-orm";` vào đầu file test nếu chưa có.

- [ ] **Step 3: Chạy test**

```bash
bun test apps/api/src/services/rentals.test.ts
```

Kỳ vọng: PASS, 12 test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/rentals.ts apps/api/src/services/rentals.test.ts
git commit -m "feat(api): changeRentalStatus với SELECT FOR UPDATE"
```

---

## Task 12: `services/fleet.ts` — danh sách xe nội bộ

**Files:**
- Create: `apps/api/src/services/fleet.ts`
- Create: `apps/api/src/services/fleet.test.ts`

- [ ] **Step 1: Viết service**

Tạo `apps/api/src/services/fleet.ts`:

```ts
import { schema } from "@v9/db";
import { asc, ne } from "drizzle-orm";
import { db } from "../db";

/**
 * Shape NỘI BỘ — có `plate`. Đây là lý do `/fleet` là route riêng chứ không phải
 * một field thêm vào `/vehicles`: comment ở `routes/vehicles.ts` nói rõ rằng
 * `plate` VẮNG MẶT trong schema công khai chính là cơ chế chặn, vì Elysia cắt mọi
 * field không được khai. Nới schema đó để staff dùng ké là tháo hàng rào của một
 * route công khai.
 */
export interface FleetVehicle {
  readonly id: string;
  readonly slug: string;
  readonly make: string;
  readonly model: string;
  readonly plate: string | null;
  readonly status: string;
}

/**
 * Mọi xe trừ `archived`. Xe `draft` VẪN có mặt: chưa lên web không có nghĩa là
 * không cho thuê được — trạng thái đó là trạng thái DANH MỤC, không phải trạng
 * thái rảnh/bận (xem comment ở `packages/db/src/schema/vehicles.ts`).
 */
export async function listFleet(): Promise<FleetVehicle[]> {
  return db
    .select({
      id: schema.vehicles.id,
      slug: schema.vehicles.slug,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      plate: schema.vehicles.plate,
      status: schema.vehicles.status,
    })
    .from(schema.vehicles)
    .where(ne(schema.vehicles.status, "archived"))
    .orderBy(asc(schema.vehicles.make), asc(schema.vehicles.model), asc(schema.vehicles.id));
}
```

- [ ] **Step 2: Viết test**

Tạo `apps/api/src/services/fleet.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import { listFleet } from "./fleet";

const P = "ztest-fleet-";

async function clean() {
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
}

beforeAll(async () => {
  await clean();
  await db.insert(schema.vehicles).values([
    { slug: `${P}pub`, make: "Honda", model: "CB500X", engineCc: 471, plate: "59H1-234.56", pricePerDay: 500_000, deposit: 5_000_000, status: "published" },
    { slug: `${P}draft`, make: "Kawasaki", model: "Z900", engineCc: 948, plate: "59H1-887.21", pricePerDay: 900_000, deposit: 10_000_000, status: "draft" },
    { slug: `${P}arch`, make: "Yamaha", model: "MT-07", engineCc: 689, plate: "59H1-402.90", pricePerDay: 700_000, deposit: 7_000_000, status: "archived" },
  ]);
});

afterAll(clean);

describe("listFleet", () => {
  it("có biển số — đây là shape NỘI BỘ, khác /vehicles", async () => {
    const rows = await listFleet();
    const v = rows.find((r) => r.slug === `${P}pub`);
    expect(v?.plate).toBe("59H1-234.56");
  });

  it("gồm cả xe draft — chưa lên web không có nghĩa là không cho thuê được", async () => {
    const slugs = (await listFleet()).map((r) => r.slug);
    expect(slugs).toContain(`${P}draft`);
  });

  it("loại xe archived", async () => {
    const slugs = (await listFleet()).map((r) => r.slug);
    expect(slugs).not.toContain(`${P}arch`);
  });
});
```

- [ ] **Step 3: Chạy test**

```bash
bun test apps/api/src/services/fleet.test.ts
```

Kỳ vọng: PASS, 3 test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/fleet.ts apps/api/src/services/fleet.test.ts
git commit -m "feat(api): services/fleet — danh sách xe nội bộ kèm biển số"
```

---

## Task 13: `services/stats.ts` — sáu số doanh thu, cắt kỳ theo giờ VN

**Files:**
- Create: `apps/api/src/services/stats.ts`
- Create: `apps/api/src/services/stats.test.ts`

- [ ] **Step 1: Viết service**

Tạo `apps/api/src/services/stats.ts`:

```ts
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import type { Vnd } from "@v9/shared/domain/money";
import { client } from "../db";

export interface PeriodStat {
  readonly amount: Vnd;
  readonly orders: number;
  readonly prevAmount: Vnd;
}

export interface StatsSummary {
  readonly revenue: {
    readonly today: PeriodStat;
    readonly thisWeek: PeriodStat;
    readonly thisMonth: PeriodStat;
  };
  readonly attention: {
    readonly overdue: number;
    readonly dueToday: number;
  };
}

/**
 * ⚠️ `now` là THAM SỐ chứ không phải `now()` của SQL, và đó là điều kiện để test
 * được. Lỗi múi giờ ở đây tự biến mất lúc 7h sáng: nếu cắt kỳ bằng UTC thì từ 0h
 * đến 7h giờ VN mọi đơn bị đếm vào NGÀY HÔM TRƯỚC, rồi số tự đúng lại. Một test
 * chạy lúc 10h sáng sẽ xanh mãi mãi. Xem §5.5 design doc.
 *
 * Phép cắt kỳ làm trong Postgres (`date_trunc(... AT TIME ZONE tz) AT TIME ZONE tz`)
 * chứ không trong JS: đó là chỗ duy nhất trong stack này biết chắc múi giờ.
 * `date_trunc('week', ...)` của Postgres bắt đầu từ THỨ HAI — đúng quy ước VN.
 *
 * Doanh thu lọc đúng một điều kiện `handed_over_at IS NOT NULL`, không kiểm trạng
 * thái: `transition()` cấm ONGOING → CANCELLED nên đơn huỷ không thể đã giao xe.
 */
export async function getStatsSummary(now: Date): Promise<StatsSummary> {
  const tz = SHOP_TIMEZONE;

  const [row] = await client`
    WITH b AS (
      SELECT
        date_trunc('day',   ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS day_start,
        date_trunc('week',  ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS week_start,
        date_trunc('month', ${now}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS month_start
    ),
    r AS (SELECT total_amount, handed_over_at FROM rentals WHERE handed_over_at IS NOT NULL)
    SELECT
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.day_start)                                             AS today_amount,
      (SELECT COUNT(*)::int                      FROM r, b WHERE handed_over_at >= b.day_start)                                             AS today_orders,
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.day_start - interval '1 day' AND handed_over_at < b.day_start)     AS prev_day_amount,

      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.week_start)                                            AS week_amount,
      (SELECT COUNT(*)::int                      FROM r, b WHERE handed_over_at >= b.week_start)                                            AS week_orders,
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.week_start - interval '1 week' AND handed_over_at < b.week_start)  AS prev_week_amount,

      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.month_start)                                           AS month_amount,
      (SELECT COUNT(*)::int                      FROM r, b WHERE handed_over_at >= b.month_start)                                           AS month_orders,
      (SELECT COALESCE(SUM(total_amount),0)::int FROM r, b WHERE handed_over_at >= b.month_start - interval '1 month' AND handed_over_at < b.month_start) AS prev_month_amount,

      (SELECT COUNT(*)::int FROM rentals WHERE status = 'ONGOING' AND ends_at < ${now})                                                     AS overdue,
      (SELECT COUNT(*)::int FROM rentals, b WHERE status = 'ONGOING' AND ends_at >= b.day_start AND ends_at < b.day_start + interval '1 day') AS due_today`;

  if (!row) throw new Error("truy vấn thống kê không trả về hàng nào");

  return {
    revenue: {
      today: { amount: row.today_amount, orders: row.today_orders, prevAmount: row.prev_day_amount },
      thisWeek: { amount: row.week_amount, orders: row.week_orders, prevAmount: row.prev_week_amount },
      thisMonth: { amount: row.month_amount, orders: row.month_orders, prevAmount: row.prev_month_amount },
    },
    attention: { overdue: row.overdue, dueToday: row.due_today },
  };
}
```

- [ ] **Step 2: Viết test — bao gồm ca 2h sáng**

Tạo `apps/api/src/services/stats.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { schema } from "@v9/db";
import { like } from "drizzle-orm";
import { db } from "../db";
import { getStatsSummary } from "./stats";

const P = "ztest-tk-";

let vehicleId: string;
let customerId: string;
let staffId: string;

/**
 * ⚠️ File này là file test DUY NHẤT được phép xoá TOÀN BỘ bảng `rentals`, và nó
 * buộc phải làm thế: `getStatsSummary` tổng hợp trên cả bảng, không nhận bộ lọc
 * nào — nên một hàng lạ còn sót lại làm mọi assertion số học ở dưới sai.
 *
 * Chấp nhận được vì `rentals` là bảng mới và DB dev chưa có dữ liệu vận hành thật.
 * Ngày nào dev bắt đầu giữ đơn thật, đổi cách này: cho `getStatsSummary` nhận một
 * bộ lọc, hoặc chuyển test sang database riêng.
 *
 * Các bảng khác vẫn lọc theo tiền tố — chúng có dữ liệu của file test khác.
 */
async function clean() {
  await db.delete(schema.rentals);
  await db.delete(schema.vehicles).where(like(schema.vehicles.slug, `${P}%`));
  await db.delete(schema.customers).where(like(schema.customers.fullName, `${P}%`));
  await db.delete(schema.staffUsers).where(like(schema.staffUsers.id, `${P}%`));
}

beforeAll(async () => {
  await clean();
  const [v] = await db.insert(schema.vehicles).values({ slug: `${P}xe`, make: "Honda", model: "CB500X", engineCc: 471, pricePerDay: 500_000, deposit: 5_000_000 }).returning();
  const [c] = await db.insert(schema.customers).values({ fullName: `${P}Khach`, phone: "0912000202" }).returning();
  const [s] = await db.insert(schema.staffUsers).values({ id: `${P}owner`, email: `${P}o@example.com`, fullName: "Chủ", role: "OWNER", status: "ACTIVE" }).returning();
  if (!v || !c || !s) throw new Error("seed hỏng");
  vehicleId = v.id; customerId = c.id; staffId = s.id;
});

afterAll(clean);

/** Tạo một đơn ĐÃ GIAO tại đúng thời điểm chỉ định. */
async function handedOver(handedOverAt: string, amount: number, startDay: number, endDay: number) {
  await db.insert(schema.rentals).values({
    vehicleId, customerId, createdBy: staffId,
    startsAt: new Date(`2026-08-${String(startDay).padStart(2, "0")}T00:00:00+07:00`),
    endsAt: new Date(`2026-08-${String(endDay).padStart(2, "0")}T00:00:00+07:00`),
    totalAmount: amount, depositAmount: 0,
    status: "ONGOING", handedOverAt: new Date(handedOverAt),
  });
}

describe("getStatsSummary — cắt kỳ theo giờ Việt Nam", () => {
  /**
   * ĐÂY là test không được bỏ. 2026-08-15T02:00+07:00 là 2026-08-14T19:00Z —
   * tức lúc 2h sáng ở TP.HCM thì UTC vẫn đang là NGÀY HÔM TRƯỚC.
   *
   * Nếu SQL cắt kỳ bằng UTC, đơn giao lúc 1h sáng ngày 15 (giờ VN) sẽ bị đếm vào
   * ngày 14, "doanh thu hôm nay" ra 0 — rồi tự đúng lại lúc 7h sáng. Test chạy
   * lúc 10h sáng sẽ không bao giờ thấy lỗi này.
   */
  it("lúc 2h sáng giờ VN, đơn giao lúc 1h sáng CÙNG NGÀY vẫn tính vào hôm nay", async () => {
    await handedOver("2026-08-15T01:00:00+07:00", 2_400_000, 15, 18);

    const s = await getStatsSummary(new Date("2026-08-15T02:00:00+07:00"));
    expect(s.revenue.today.amount).toBe(2_400_000);
    expect(s.revenue.today.orders).toBe(1);
  });

  it("đơn giao lúc 23h ĐÊM HÔM TRƯỚC không tính vào hôm nay, mà vào prevAmount", async () => {
    await db.delete(schema.rentals);
    await handedOver("2026-08-14T23:00:00+07:00", 1_000_000, 20, 22);

    const s = await getStatsSummary(new Date("2026-08-15T02:00:00+07:00"));
    expect(s.revenue.today.amount).toBe(0);
    expect(s.revenue.today.prevAmount).toBe(1_000_000);
  });

  it("tuần bắt đầu THỨ HAI — đơn giao Chủ Nhật thuộc tuần trước", async () => {
    await db.delete(schema.rentals);
    // 2026-08-16 là Chủ Nhật, 2026-08-17 là Thứ Hai.
    await handedOver("2026-08-16T10:00:00+07:00", 500_000, 20, 22);

    const s = await getStatsSummary(new Date("2026-08-17T10:00:00+07:00"));
    expect(s.revenue.thisWeek.amount).toBe(0);
    expect(s.revenue.thisWeek.prevAmount).toBe(500_000);
  });

  it("đơn CHƯA giao không tính vào doanh thu", async () => {
    await db.delete(schema.rentals);
    await db.insert(schema.rentals).values({
      vehicleId, customerId, createdBy: staffId,
      startsAt: new Date("2026-08-20T00:00:00+07:00"),
      endsAt: new Date("2026-08-22T00:00:00+07:00"),
      totalAmount: 9_000_000, depositAmount: 0,
    });

    const s = await getStatsSummary(new Date("2026-08-20T10:00:00+07:00"));
    expect(s.revenue.thisMonth.amount).toBe(0);
  });

  it("đếm đúng đơn quá hạn và đơn phải trả hôm nay", async () => {
    await db.delete(schema.rentals);
    await handedOver("2026-08-10T09:00:00+07:00", 1_000_000, 10, 14); // hết hạn 14 → quá hạn
    const s = await getStatsSummary(new Date("2026-08-15T10:00:00+07:00"));
    expect(s.attention.overdue).toBe(1);
    expect(s.attention.dueToday).toBe(0);
  });
});
```

- [ ] **Step 3: Chạy test**

```bash
bun test apps/api/src/services/stats.test.ts
```

Kỳ vọng: PASS, 5 test.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/stats.ts apps/api/src/services/stats.test.ts
git commit -m "feat(api): getStatsSummary — cắt kỳ theo Asia/Ho_Chi_Minh"
```

---

## Task 14: `routes/fleet.ts` và phần customers của `routes/rentals.ts`

**Files:**
- Create: `apps/api/src/routes/fleet.ts`
- Create: `apps/api/src/routes/rentals.ts`

- [ ] **Step 1: Viết `routes/fleet.ts`**

Tạo `apps/api/src/routes/fleet.ts`:

```ts
import { Elysia, t } from "elysia";
import { listFleet } from "../services/fleet";

/**
 * `name` là BẮT BUỘC — thiếu nó Elysia chạy lại plugin mỗi lần `.use()`.
 *
 * Route này KHÔNG khai trong `PUBLIC_ROUTES` của staff-guard, nên nó được bảo vệ
 * theo mặc định. Đó là chủ ý: biển số là dữ liệu nội bộ.
 */
export const fleet = new Elysia({ name: "fleet" }).get("/fleet", () => listFleet(), {
  response: t.Array(
    t.Object({
      id: t.String({ format: "uuid" }),
      slug: t.String(),
      make: t.String(),
      model: t.String(),
      plate: t.Nullable(t.String()),
      status: t.String(),
    }),
  ),
});
```

- [ ] **Step 2: Viết `routes/rentals.ts` với phần customers trước**

Tạo `apps/api/src/routes/rentals.ts`:

```ts
import { Elysia, t } from "elysia";
import { createCustomer, searchCustomers } from "../services/customers";

const errorSchema = t.Object({ message: t.String(), code: t.String() });

const customerSchema = t.Object({
  id: t.String({ format: "uuid" }),
  fullName: t.String(),
  phone: t.String(),
  note: t.Nullable(t.String()),
});

/**
 * Mã lỗi của nhóm route này. Suy từ kiểu trả về của service ở Task 16 khi nối vào
 * `ApiErrorCode`; ở đây gõ literal là chấp nhận được vì `MESSAGES` bên dưới có
 * `satisfies`, nên thiếu một mã là lỗi biên dịch.
 */
const MESSAGES = {
  INVALID_PHONE: "Số điện thoại không hợp lệ",
  CUSTOMER_EXISTS: "Khách hàng này đã có trong hệ thống",
  RENTAL_OVERLAP: "Xe này đã có đơn trong khoảng thời gian đó",
  INVALID_RANGE: "Khoảng thời gian không hợp lệ",
  INVALID_TRANSITION: "Không chuyển được đơn sang trạng thái đó",
  NOT_FOUND: "Không tìm thấy đơn thuê",
} as const;

export type RentalErrorCode = keyof typeof MESSAGES;

const toError = (code: RentalErrorCode) => ({ code, message: MESSAGES[code] });

export const rentals = new Elysia({ name: "rentals" })
  .get(
    "/customers",
    async ({ query }) => searchCustomers(query.q ?? ""),
    {
      query: t.Object({ q: t.Optional(t.String()) }),
      response: { 200: t.Array(customerSchema) },
    },
  )

  .post(
    "/customers",
    async ({ body, status }) => {
      const r = await createCustomer(body);
      if (r.ok) return status(201, r.customer);
      if (r.reason === "CUSTOMER_EXISTS") {
        // 409 kèm hồ sơ đã có, để form dùng lại thay vì bắt người nhập lại.
        return status(409, { ...toError("CUSTOMER_EXISTS"), existing: r.existing });
      }
      return status(400, toError("INVALID_PHONE"));
    },
    {
      body: t.Object({
        fullName: t.String({ minLength: 1 }),
        phone: t.String({ minLength: 1 }),
        note: t.Optional(t.Nullable(t.String())),
      }),
      response: {
        201: customerSchema,
        400: errorSchema,
        409: t.Composite([errorSchema, t.Object({ existing: customerSchema })]),
      },
    },
  );
```

- [ ] **Step 3: Xác minh `StaffUser` có trường `id`**

Task 15 sẽ dùng `staff.id` làm `created_by`. Kiểm trước, đừng đoán:

```bash
grep -n "interface StaffUser" -A 12 apps/api/src/services/staff.ts
```

Kỳ vọng: thấy `id` trong danh sách trường. Nếu tên khác (ví dụ `userId`), dùng tên đó ở Task 15 Step 1.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Kỳ vọng: xanh.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/fleet.ts apps/api/src/routes/rentals.ts
git commit -m "feat(api): routes /fleet và /customers"
```

---

## Task 15: Phần rentals và stats của route

**Files:**
- Modify: `apps/api/src/routes/rentals.ts`
- Create: `apps/api/src/routes/stats.ts`

- [ ] **Step 1: Thêm route rentals**

Nối vào chuỗi `.use`/`.get` của `export const rentals` trong `apps/api/src/routes/rentals.ts`, ngay trước dấu `;` kết thúc:

```ts
  .get(
    "/rentals",
    async ({ query, status }) => {
      const r = await listRentalsInRange(new Date(query.from), new Date(query.to));
      if (!r.ok) return status(400, toError("INVALID_RANGE"));
      return status(200, r.rentals);
    },
    {
      query: t.Object({
        from: t.String({ format: "date-time" }),
        to: t.String({ format: "date-time" }),
      }),
      response: { 200: t.Array(rentalSchema), 400: errorSchema },
    },
  )

  .post(
    "/rentals",
    async ({ body, staff, status }) => {
      // `staff` do `staffGuard.resolve({ as: "global" })` bơm vào. Guard đã chặn
      // mọi request không có hồ sơ ACTIVE trước khi tới đây, nên nhánh null này
      // là phòng thủ cho kiểu, không phải cho luồng.
      if (!staff) return status(400, toError("INVALID_RANGE"));

      const r = await createRental({
        vehicleId: body.vehicleId,
        customerId: body.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        totalAmount: body.totalAmount,
        depositAmount: body.depositAmount,
        createdBy: staff.id,
        note: body.note ?? null,
      });

      if (!r.ok) return status(409, toError("RENTAL_OVERLAP"));
      return status(201, r.rental);
    },
    {
      body: t.Object({
        vehicleId: t.String({ format: "uuid" }),
        customerId: t.String({ format: "uuid" }),
        startsAt: t.String({ format: "date-time" }),
        endsAt: t.String({ format: "date-time" }),
        totalAmount: t.Integer({ minimum: 0 }),
        depositAmount: t.Integer({ minimum: 0 }),
        note: t.Optional(t.Nullable(t.String())),
      }),
      response: { 201: rentalSchema, 400: errorSchema, 409: errorSchema },
    },
  )

  .post(
    "/rentals/:id/status",
    async ({ params, body, status }) => {
      const r = await changeRentalStatus(params.id, body.to, new Date());
      if (r.ok) return status(200, r.rental);
      if (r.reason === "NOT_FOUND") return status(404, toError("NOT_FOUND"));
      return status(409, toError("INVALID_TRANSITION"));
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ to: statusSchema }),
      response: { 200: rentalSchema, 404: errorSchema, 409: errorSchema },
    },
  );
```

Thêm import và schema ở đầu file (sau các import đã có):

```ts
import { changeRentalStatus, createRental, listRentalsInRange } from "../services/rentals";

const statusSchema = t.Union([
  t.Literal("BOOKED"),
  t.Literal("ONGOING"),
  t.Literal("COMPLETED"),
  t.Literal("CANCELLED"),
]);

const rentalSchema = t.Object({
  id: t.String({ format: "uuid" }),
  vehicleId: t.String({ format: "uuid" }),
  customerId: t.String({ format: "uuid" }),
  startsAt: t.Date(),
  endsAt: t.Date(),
  status: statusSchema,
  handedOverAt: t.Nullable(t.Date()),
  returnedAt: t.Nullable(t.Date()),
  totalAmount: t.Integer(),
  depositAmount: t.Integer(),
  note: t.Nullable(t.String()),
  customerName: t.Optional(t.String()),
  customerPhone: t.Optional(t.String()),
});
```

- [ ] **Step 2: Viết `routes/stats.ts`**

Tạo `apps/api/src/routes/stats.ts`:

```ts
import { Elysia, t } from "elysia";
import { countPendingStaff } from "../services/staff";
import { getStatsSummary } from "../services/stats";

const periodSchema = t.Object({
  amount: t.Integer(),
  orders: t.Integer(),
  prevAmount: t.Integer(),
});

export const stats = new Elysia({ name: "stats" }).get(
  "/stats/summary",
  async ({ staff }) => {
    const summary = await getStatsSummary(new Date());

    // `pendingStaff` CHỈ dành cho OWNER — STAFF không được thấy số nhân viên chờ
    // duyệt. Field tuỳ chọn thay vì một endpoint riêng: Home cần tất cả cùng lúc.
    const pendingStaff = staff?.role === "OWNER" ? await countPendingStaff() : undefined;

    return {
      ...summary,
      attention: { ...summary.attention, ...(pendingStaff === undefined ? {} : { pendingStaff }) },
    };
  },
  {
    response: {
      200: t.Object({
        revenue: t.Object({
          today: periodSchema,
          thisWeek: periodSchema,
          thisMonth: periodSchema,
        }),
        attention: t.Object({
          overdue: t.Integer(),
          dueToday: t.Integer(),
          pendingStaff: t.Optional(t.Integer()),
        }),
      }),
    },
  },
);
```

- [ ] **Step 3: Thêm `countPendingStaff` vào `services/staff.ts`**

Thêm vào cuối `apps/api/src/services/staff.ts`:

```ts
/** Số nhân viên đang chờ duyệt. Dùng cho dòng "cần chú ý" của màn Thống kê. */
export async function countPendingStaff(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.staffUsers)
    .where(eq(schema.staffUsers.status, "PENDING"));
  return row?.n ?? 0;
}
```

Nếu `sql` chưa được import trong file đó, thêm nó vào import từ `drizzle-orm`.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Kỳ vọng: xanh.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/rentals.ts apps/api/src/routes/stats.ts apps/api/src/services/staff.ts
git commit -m "feat(api): routes /rentals và /stats/summary"
```

---

## Task 16: Nối vào `index.ts`, mở rộng `ApiErrorCode`, verify toàn bộ

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/staff.ts`

- [ ] **Step 1: Đăng ký ba plugin route**

Trong `apps/api/src/index.ts`, thêm import:

```ts
import { fleet } from "./routes/fleet";
import { rentals } from "./routes/rentals";
import { stats } from "./routes/stats";
```

và nối vào chuỗi, **sau** `.use(staffGuard)`:

```ts
  .use(staff)
  .use(fleet)
  .use(rentals)
  .use(stats)
```

⚠️ Phải đứng SAU `.use(staffGuard)`. Route đăng ký trước guard không được bảo vệ, và **không có gì báo lỗi**.

- [ ] **Step 2: Mở rộng `ApiErrorCode`**

Trong `apps/api/src/routes/staff.ts`, sửa dòng khai `ApiErrorCode`:

```ts
export type ApiErrorCode = Reason | GuardErrorCode | RentalErrorCode | "EMAIL_NOT_CONFIGURED";
```

và thêm import ở đầu file:

```ts
import type { RentalErrorCode } from "./rentals";
```

Đây là nguồn sự thật cho `errorCode()` ở `apps/staff/src/lib/errors.ts`. Không thêm vào đây thì Plan C không so `code` theo kiểu được, và mọi lỗi mới rơi về nhánh chung.

- [ ] **Step 3: Xác minh guard THẬT SỰ phủ route mới**

Khởi động API ở một terminal:

```bash
bun run dev
```

Ở terminal khác:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/fleet
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/rentals?from=2026-08-15T00:00:00Z\&to=2026-08-20T00:00:00Z
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/stats/summary
```

Kỳ vọng: **401** cho cả ba. Nếu thấy **200** thì route đăng ký sai chỗ (trước `staffGuard`) — sửa Step 1. Nếu thấy **404** thì plugin chưa được `.use()`.

- [ ] **Step 4: Chạy toàn bộ hàng rào**

```bash
bun test
bun run typecheck
bun run lint
bun run bench
```

Kỳ vọng: tất cả xanh. `bun run typecheck` là **hai lệnh nối bằng `&&`** — nửa sau kiểm `scripts/`, đừng chỉ chạy nửa đầu.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/routes/staff.ts
git commit -m "feat(api): đăng ký fleet/rentals/stats sau staffGuard, mở rộng ApiErrorCode"
```

---

## Xong Plan A khi

- [ ] `bun test` xanh, gồm cả `rentals-schema.test.ts` (cần Postgres)
- [ ] `bun run typecheck` xanh (cả hai nửa)
- [ ] `bun run lint` xanh
- [ ] `bun run bench` không vượt ngân sách
- [ ] Ba `curl` ở Task 16 Step 3 đều trả **401**
- [ ] `\d rentals` trong psql cho thấy `rentals_no_overlap EXCLUDE USING gist`

Sau đó: **Plan B — hệ thiết kế + app shell**.

---

## Ghi chú cho người thực thi

**Một chỗ plan này tinh chỉnh so với design doc.** §5.2 của design nói "câu insert có thể lỗi được bọc trong `tx.savepoint(...)`". Trong `createRental` **không** dùng savepoint, vì đó là một câu INSERT đơn lẻ không nằm trong transaction nào — không có gì phải chạy tiếp sau lỗi. Luật savepoint của `CLAUDE.md` áp cho trường hợp transaction còn tiếp tục sau một lỗi phục hồi được; trong Plan A đó là các test ở Task 7 (và chúng có dùng savepoint). Nếu sau này `POST /rentals` gộp thêm việc tạo khách trong cùng transaction thì luật đó quay lại áp dụng.

**Đừng thêm gì vào `PUBLIC_ROUTES`.** Mọi route của Plan A đều phải được bảo vệ. Bước curl ở Task 16 tồn tại để chứng minh điều đó chứ không phải để trang trí.

**Thứ tự task không tuỳ tiện.** Task 6 và 7 (migration + chứng minh hàng rào) đứng trước mọi service là có chủ ý: nếu exclusion constraint không hành xử như kỳ vọng thì mọi tầng phía trên phải thiết kế lại, và biết điều đó ở Task 7 rẻ hơn nhiều so với ở Task 15.
