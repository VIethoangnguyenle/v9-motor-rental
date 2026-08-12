---
name: v9-deploy
description: Chuẩn bị và chạy deploy v9-rental lên VPS (compose.prod.yaml, Caddy, ghcr.io, GitHub Actions). Dùng khi chuẩn bị deploy, khi sửa compose.prod.yaml hoặc deploy.yml, hoặc khi cần biết còn thiếu gì trước khi stack chạm máy thật. Có một chặn cứng chưa gỡ.
---

# Deploy — trạng thái và chặn cứng

## ⛔ Chặn cứng: Directus đang cầm credential ROOT của MinIO

**Không deploy trước khi gỡ cái này.**

`compose.prod.yaml` truyền `STORAGE_S3_KEY: ${MINIO_ROOT_USER}` và
`STORAGE_S3_SECRET: ${MINIO_ROOT_PASSWORD}` — tức là service phơi ra internet nhiều nhất lại giữ
đúng cái khoá mở được **mọi** bucket, kể cả `checkins` (ảnh tình trạng xe lúc bàn giao, thứ dùng
làm bằng chứng khi tranh chấp). Một lỗ hổng trong Directus thành quyền toàn bộ object storage.

`.env.example` có câu cảnh báo đúng chỗ đó, và nó **không ép được gì** — một dòng comment không
phải hàng rào.

**Cách gỡ:** tạo access key MinIO riêng cho Directus, policy giới hạn đúng bucket `vehicles`, rồi
trỏ `STORAGE_S3_KEY`/`STORAGE_S3_SECRET` vào cặp key đó. Ở dev dùng root vẫn chấp nhận được — dev
không phơi ra internet và volume vứt đi được.

## Còn thiếu trước lần deploy đầu

Secret SSH đã đặt. Chưa có:

- `ssh-copy-id` lên VPS
- `ROOT_DOMAIN` + `CADDY_EMAIL`
- bootstrap thư mục `~/v9-motor-rental` trên VPS
- `docker login ghcr.io` trên VPS — repo private nên image cũng private

## ⚠️ Biến env của frontend nướng lúc BUILD, không đọc lúc chạy

`VITE_API_URL` (staff) và `NEXT_PUBLIC_*` (web) bị thay bằng hằng số lúc compile — **cả trong
chunk SSR của Next**, không chỉ bundle client. Đổi chúng trong compose rồi restart container
**không có tác dụng gì**; phải build lại image. `deploy.yml` truyền qua `--build-arg`.

Biến runtime thật duy nhất của web là `PORT`.

## ⚠️ `ROOT_DOMAIN` rò xuống cookie ở dev

`Session.init` chỉ đặt `cookieDomain` khi `env.isProduction && env.rootDomain`. Bỏ điều kiện
`isProduction` thì `ROOT_DOMAIN=example.com` trong `.env` dev làm cookie mang
`Domain=.example.com` và trình duyệt **vứt im lặng** — đăng nhập "thành công" mà không có session.

Dùng `?.trim() ||` chứ **không** `??`: compose expand biến chưa đặt thành chuỗi rỗng, mà `??`
không bắt chuỗi rỗng → `cookieDomain: "."`.

## Sau khi deploy

Chạy lại probe của skill `v9-directus` trên môi trường thật — cấu hình Directus sống trong DB của
nó, không trong git, nên môi trường mới không tự có.

Prod không cần `dangerouslyAllowLocalIP` của `next.config.ts`:
`NEXT_PUBLIC_DIRECTUS_URL` trỏ host công khai → resolve ra IP public → SSRF guard cho qua. Nếu ảnh
prod hỏng vì guard, câu trả lời đúng là **sửa địa chỉ Directus**, không phải mở cờ.
