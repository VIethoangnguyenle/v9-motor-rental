# Bộ probe hàng rào kiến trúc

Tách khỏi `../CLAUDE.md` để file đó giữ luật chứ không giữ lệnh. **Luật vẫn ở `CLAUDE.md`**;
đây là bốn lệnh để chứng minh luật còn hiệu lực.

Chạy sau mỗi lần đụng `eslint.config.js` hoặc nâng version plugin — và **đọc tên luật trong thông
báo lỗi**, đừng nhìn exit code.

```bash
# ① PHẢI nổ với boundaries/dependencies — KHÔNG phải lỗi khác
cp apps/api/src/index.ts /tmp/idx.bak
sed -i '1i import { schema } from "@v9/db";' apps/api/src/index.ts
bun x eslint apps/api/src/index.ts
#   → phải thấy: boundaries/dependencies
#     "no policy allowing dependencies from elements of type "api-root" to elements of type "db""
cp /tmp/idx.bak apps/api/src/index.ts

# ② PHẢI nổ với boundaries/no-unknown-files
mkdir -p apps/api/src/nowhere && echo 'export const x = 1;' > apps/api/src/nowhere/x.ts
bun x eslint apps/api/src/nowhere/x.ts
rm -rf apps/api/src/nowhere

# ③ PHẢI im (mẫu Eden hợp lệ — import type bị xoá lúc build)
bun x eslint apps/web/lib/api.ts apps/staff/src/lib/api.ts

# ④ PHẢI nổ với boundaries/dependencies, thông điệp nhắc "api-plugins" → "db"
cp apps/api/src/plugins/timing.ts /tmp/timing.bak
sed -i '1i import { schema } from "@v9/db";' apps/api/src/plugins/timing.ts
bun x eslint apps/api/src/plugins/timing.ts
#   → phải thấy: boundaries/dependencies
#     "no policy allowing dependencies from elements of type "api-plugins" to elements of type "db""
cp /tmp/timing.bak apps/api/src/plugins/timing.ts
```

Probe ④ khoá cạnh `api-plugins → api-services` mở ở đợt auth: plugin được gọi service, nhưng vẫn
**không** được tự viết Drizzle.

**Đọc kỹ mã lỗi, đừng chỉ nhìn exit code.** Probe ① dùng `apps/api` chứ không dùng
`packages/shared` là **có lý do**: `apps/api` khai `@v9/db` là dependency thật nên import resolve
được và boundaries mới có gì để phân loại. Bản cũ của bộ probe này đặt vi phạm trong
`packages/shared/src/domain/` — package đó **không** khai `@v9/db`, nên lint chết ở
`no-unsafe-assignment` **trước khi boundaries kịp nhìn**. Probe vẫn exit 1, vẫn trông như đang
bảo vệ, và không chứng minh gì cả.

Đó là lần thứ tư trong dự án này một cơ chế kiểm chứng trông như đang chạy mà thực ra không —
và lần này nạn nhân là chính bộ probe được viết ra để chống chuyện đó.

Config linter "chạy được và exit 0" **không chứng minh điều gì**. Probe exit 1 **cũng chưa chứng
minh gì** nếu bạn không đọc nó nổ vì luật nào.

---
