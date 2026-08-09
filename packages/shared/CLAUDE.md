# packages/shared — CLAUDE.md

Luật chung của repo ở [`../../CLAUDE.md`](../../CLAUDE.md). Đọc file đó trước.

Đây là **functional core** của cả hệ thống. Mọi phép tính giá thuê, tiền cọc, tính khả dụng nằm
ở đây. `apps/api` và hai frontend **không được implement lại** — ESLint chặn thật.

## TDD nghiêm — bắt buộc, không có ngoại lệ

Với mọi thứ trong `src/domain/`: **viết test trước, chạy cho nó đỏ, rồi mới viết implementation.**
Đây là package duy nhất trong repo áp luật này tuyệt đối, vì nó chứa tiền và logic đặt xe.

Thấy test đỏ vì đúng lý do là thứ chứng minh test thật sự nối với code. Bỏ bước đó thì bạn có
một test luôn xanh và không ai biết.

## `src/domain/**` không được import bất cứ gì

Không thư viện, không package khác, không type. Đó là điều kiện để nó test được không cần DB,
không cần mock, không cần network — và là lý do TDD nghiêm khả thi ở đây.

Package có đúng **hai** dependency: `@elysiajs/eden` và `elysia`. Cả hai chỉ dùng trong
`src/client.ts`, và `elysia` chỉ ở dạng `import type` (bị xoá lúc build).

## `client.ts` phải giữ generic — không bao giờ import `@v9/api`

```ts
export function createApiClient<T extends AnyElysiaApp>(baseUrl: string);
```

Import `App` trực tiếp ở đây sẽ tạo chu trình `shared → api → shared`, vì `apps/api` import domain
logic từ chính package này. Frontend là nơi ghép hai đầu:

```ts
import type { App } from "@v9/api";
import { createApiClient } from "@v9/shared/client";
export const api = createApiClient<App>(url);
```

## Tiền: `Vnd` là số nguyên đồng

VND không có đơn vị phụ. Mọi phép chia **phải** đi qua `roundVnd()` — không được để số lẻ rò ra
ngoài dưới dạng `Vnd`. `formatVnd()` ném lỗi nếu nhận số không nguyên, có chủ ý.

## `overlaps()` dùng nửa khoảng `[start, end)`

Biên này **cố ý** khớp với `tstzrange` mặc định của Postgres, vì exclusion constraint chống
double-booking dùng đúng ngữ nghĩa đó. Trả xe 10:00 rồi cho thuê tiếp 10:00 phải hợp lệ.

Đổi `<` thành `<=` ở đây mà không đổi ở DB sẽ sinh lỗi booking **chỉ lộ ra lúc chạy thật**.
Test `"chạm đầu-đuôi thì KHÔNG chồng"` tồn tại để chặn đúng việc đó — đừng sửa nó.

## Chạy

```bash
bun test packages/shared
bun run --filter @v9/shared typecheck
```
