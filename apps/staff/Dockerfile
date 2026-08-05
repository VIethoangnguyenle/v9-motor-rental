FROM oven/bun:1.3.10-alpine AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/staff/package.json apps/staff/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
# `bun install --frozen-lockfile` đối chiếu TOÀN BỘ workspace graph trong
# bun.lock với đĩa — thiếu package.json của bất kỳ workspace nào (dù
# apps/staff không phụ thuộc nó) khiến nó báo "lockfile had changes" và
# fail. Chỉ cần manifest, không cần source.
RUN bun install --frozen-lockfile
COPY . .
# VITE_API_URL bị NƯỚNG VÀO BUNDLE lúc build, không đọc được lúc chạy.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN bun run --filter @v9/staff build

# SPA tĩnh: không có server-side runtime nào để chạy, chỉ cần thứ phục vụ file.
FROM caddy:2-alpine AS runtime
COPY --from=builder /app/apps/staff/dist /srv
COPY apps/staff/Caddyfile /etc/caddy/Caddyfile
EXPOSE 3003
