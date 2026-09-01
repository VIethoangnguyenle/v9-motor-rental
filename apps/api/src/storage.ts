import { S3Client } from "bun";
import { env } from "./env";

/**
 * ĐÂY LÀ CHỖ DUY NHẤT trong repo biết object storage là gì — khuôn `db.ts`.
 *
 * Dùng `Bun.S3Client` có sẵn trong runtime, KHÔNG thêm `@aws-sdk/client-s3`:
 * SDK của AWS kéo theo hàng chục megabyte cho một nhu cầu đúng ba động tác
 * (put, get, delete). Nếu một ngày cần thứ Bun chưa có (multipart upload, presign
 * nâng cao), đường lùi là đổi ĐÚNG file này — service chỉ import `checkins`.
 *
 * ⚠️ `checkins` là bucket RIÊNG TƯ, và đó là ràng buộc chứ không phải mặc định
 * tình cờ. Nó chứa ảnh giấy tờ tuỳ thân và bằng chứng tranh chấp xước xát. Hai
 * hệ quả cho người sửa file này:
 *
 *  1. **Đừng bật public read.** `apps/web` không bao giờ cần đọc bucket này.
 *  2. **Đừng phơi MinIO ra internet để dùng presigned URL.** Đã kiểm:
 *     `Caddyfile` chỉ route `v9.`, `api.`, `staff.`, `data.` — không có host nào
 *     trỏ MinIO, và `compose.prod.yaml` KHÔNG map cổng cho service `minio` (khác
 *     `compose.yaml` dev). Nghĩa là trình duyệt nhân viên không tới được MinIO ở
 *     prod, nên upload/đọc BẮT BUỘC đi qua `apps/api`. Một PR "cho nhanh" bằng
 *     presigned URL sẽ chạy trên máy dev rồi chết ở prod.
 *
 * Khoá là `API_S3_KEY/SECRET` — user riêng chỉ mở được `checkins`, không phải
 * `MINIO_ROOT_*`. Chính sách ở `scripts/api-minio-policy.json`; đã đo là khoá này
 * bị `Access Denied` khi chạm bucket `vehicles`.
 */
export const checkins = new S3Client({
  endpoint: env.minio.endpoint,
  bucket: env.minio.bucketCheckins,
  accessKeyId: env.minio.accessKey,
  secretAccessKey: env.minio.secretKey,
  // MinIO không phải AWS: nó không có khái niệm region, nhưng chữ ký SigV4 vẫn
  // đòi một giá trị. `us-east-1` là quy ước MinIO chấp nhận.
  region: "us-east-1",
});
