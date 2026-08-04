FROM oven/bun:1.3.10-alpine AS base
WORKDIR /app

# Bun dùng "isolated linker" cho workspace này: `bun install` KHÔNG hoist mọi
# gói lên node_modules/ gốc. Mỗi package (apps/api, packages/db, ...) có
# node_modules RIÊNG, chứa symlink tới một store chung (node_modules/.bun) —
# kể cả @v9/db, @v9/shared LẪN drizzle-orm, elysia, @elysiajs/cors. Xác nhận
# bằng readlink trên máy dev: node_modules/@v9 gốc KHÔNG tồn tại, nhưng
# apps/api/node_modules/@v9/db và apps/api/node_modules/elysia thì có.
#
# => Một stage "deps" tách riêng rồi chỉ COPY --from=deps /app/node_modules
#    (root) sang stage runtime sẽ BỎ SÓT toàn bộ node_modules lồng trong từng
#    package — container build xong nhưng "bun apps/api/src/index.ts" chết
#    ngay vì không resolve được cả @v9/db lẫn elysia. Cách sửa an toàn nhất
#    là copy toàn bộ source TRƯỚC rồi mới `bun install` tại đúng vị trí cuối
#    cùng, để mọi symlink (kể cả cái tương đối ../../../../packages/db) được
#    tạo ra khớp với layout thật trong image.
FROM base AS runtime
COPY package.json bun.lock bunfig.toml ./
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/shared packages/shared
# `bun install --frozen-lockfile` đối chiếu TOÀN BỘ workspace graph trong
# bun.lock với đĩa — thiếu package.json của apps/web hay apps/admin (dù
# apps/api không phụ thuộc chúng) khiến nó báo "lockfile had changes" và
# fail. Chỉ cần manifest, không cần source, nên copy nhẹ hai dòng dưới.
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "apps/api/src/index.ts"]
