---
name: v9-deploy
description: Chuẩn bị và chạy deploy v9-rental lên VPS (compose.prod.yaml, Caddy, ghcr.io, GitHub Actions). Dùng khi chuẩn bị deploy, khi sửa compose.prod.yaml hoặc deploy.yml, hoặc khi cần biết còn thiếu gì trước khi stack chạm máy thật. Vài bước người còn thiếu trước lần deploy đầu, xem dưới.
---

# Deploy — trạng thái và chặn cứng

## ✅ Directus không còn cầm credential ROOT của MinIO — mã đã sửa, còn một bước người trên VPS

**Đã gỡ ở tầng mã (2026-08-18):** `compose.prod.yaml` từng truyền
`STORAGE_S3_KEY: ${MINIO_ROOT_USER}` / `STORAGE_S3_SECRET: ${MINIO_ROOT_PASSWORD}` — service phơi
ra internet nhiều nhất giữ đúng cái khoá mở được **mọi** bucket, kể cả `checkins` (ảnh tình trạng
xe lúc bàn giao, bằng chứng khi tranh chấp). Giờ compose đọc `DIRECTUS_S3_KEY`/`DIRECTUS_S3_SECRET`
— không có mặc định rơi về root nữa; để trống thì Directus không xác thực được với MinIO, thất bại
rõ ràng lúc chạy thay vì âm thầm cấp thừa quyền.

Policy JSON scoped đúng bucket `vehicles`, không đụng `checkins`, sống ở
[`scripts/directus-minio-policy.json`](../../../scripts/directus-minio-policy.json) — đã kiểm
chứng cả hai chiều (dương tính `vehicles`, âm tính `checkins`, với đúng thông báo lỗi MinIO) trên
MinIO **dev**. Chi tiết phép đo ở `docs/DEBT.md`.

**Còn lại, chưa chứng minh được vì VPS chưa tồn tại:** áp policy đó lên MinIO **thật** trên VPS và
tạo access key thật cho Directus. Đây là một bước người, bắt buộc trước khi Directus chạy được ở
prod — làm theo
[`docs/runbooks/minio-directus-scoped-key.md`](../../../docs/runbooks/minio-directus-scoped-key.md),
copy-paste được, có bước xác nhận key đúng scope trước khi đi tiếp. Ở dev vẫn dùng root, chấp nhận
được — dev không phơi ra internet và volume vứt đi được.

## Còn thiếu trước lần deploy đầu

Secret SSH đã đặt. Chưa có:

- `ssh-copy-id` lên VPS
- `ROOT_DOMAIN` + `CADDY_EMAIL`
- bootstrap thư mục `~/v9-motor-rental` trên VPS
- `docker login ghcr.io` trên VPS — repo private nên image cũng private
- chạy `docs/runbooks/minio-directus-scoped-key.md` để tạo access key MinIO scoped cho Directus
  (mục ✅ ở trên) — không có bước này thì `DIRECTUS_S3_KEY`/`SECRET` rỗng và Directus không lên

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
