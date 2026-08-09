FROM oven/bun:1.3.10-alpine AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/staff/package.json apps/staff/
# `bun install --frozen-lockfile` đối chiếu TOÀN BỘ workspace graph trong
# bun.lock với đĩa — thiếu package.json của apps/staff (dù apps/web không
# phụ thuộc nó) khiến nó báo "lockfile had changes" và fail. Chỉ cần
# manifest, không cần source.
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# next.config.ts đọc biến này LÚC BUILD để dựng images.remotePatterns, nên nó
# phải là build-arg chứ không phải env lúc chạy — cùng bản chất VITE_API_URL
# của apps/staff. Xem comment ở service `web` trong compose.prod.yaml.
ARG NEXT_PUBLIC_DIRECTUS_URL
ENV NEXT_PUBLIC_DIRECTUS_URL=$NEXT_PUBLIC_DIRECTUS_URL
# `bun run --filter @v9/web build` chạy `next build` DƯỚI runtime Bun. Trên
# glibc (máy dev) việc này ổn, nhưng trên bun 1.3.10 bản Alpine/musl nó vỡ ở
# bước "Collecting page data": Bun crash với
#   "Expected CommonJS module to have a function wrapper"
# khi Next nạp chunk SSR đã compile bởi Turbopack — dùng ĐÚNG source, ĐÚNG
# node_modules (do bun install), chỉ đổi runtime thực thi từ bun sang node
# là hết lỗi. Nên cài thêm nodejs (chỉ dùng để chạy build, KHÔNG thay bun
# làm package manager) và tự gọi thẳng next build qua node, né bun runtime
# cho riêng bước này.
RUN apk add --no-cache nodejs \
  && cd apps/web && node ./node_modules/.bin/next build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# `output: "standalone"` KHÔNG gói public/ vào .next/standalone — phải copy tay.
# Thiếu dòng này thì ảnh hero (public/placeholder/) 404 trên prod trong khi dev
# vẫn bình thường, vì `next dev` phục vụ public/ thẳng từ đĩa.
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
