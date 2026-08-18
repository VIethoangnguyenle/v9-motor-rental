# Runbook — tạo access key MinIO scoped cho Directus (bắt buộc trước lần deploy VPS đầu tiên)

Ngữ cảnh và lý do: `docs/DEBT.md` mục "Directus đang cầm credential ROOT của MinIO ở prod" và
`.claude/skills/v9-deploy/SKILL.md`. Runbook này là thủ tục THỰC THI — lý do đã ghi ở hai chỗ đó,
không lặp lại ở đây.

Policy JSON scoped đúng bucket `vehicles` (không đụng `checkins`) đã có sẵn trong repo tại
[`scripts/directus-minio-policy.json`](../../scripts/directus-minio-policy.json) — đã kiểm chứng
cả hai chiều (dương tính trên `vehicles`, âm tính trên `checkins`) trên MinIO dev trước khi viết
runbook này, xem `docs/DEBT.md`. Việc còn lại là áp đúng policy đó lên MinIO **thật** trên VPS —
phần đó KHÔNG thể chứng minh trước vì VPS chưa tồn tại.

Chạy đúng MỘT LẦN trước lần deploy đầu tiên (hoặc bất cứ khi nào tạo lại volume MinIO trên VPS —
policy và user sống trong `minio-data`, mất theo volume). Mọi lệnh chạy TRÊN VPS, trong thư mục
chứa `compose.prod.yaml` và `.env` (mặc định `~/v9-motor-rental`, xem
`.claude/skills/v9-deploy/SKILL.md`).

## Điều kiện trước

- MinIO đã lên và healthy: `docker compose -f compose.prod.yaml ps minio` → cột STATUS có
  `healthy`.
- `.env` trên VPS đã có `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET_VEHICLES`,
  `MINIO_BUCKET_CHECKINS` điền giá trị THẬT (không phải placeholder của `.env.example`).
- Checkout trên VPS có `scripts/directus-minio-policy.json` (cùng repo với `compose.prod.yaml`).

Không cần cài `mc` trên VPS ở bất kỳ bước nào — mọi lệnh mượn image `minio/mc` qua
`docker compose run`, dùng lại định nghĩa service `minio-init` đã có sẵn trong cả hai file
compose (chỉ override `entrypoint`). Lý do dùng `docker compose run` thay vì `docker run
--network <tên>`: compose tự nối đúng network của stack và tự phân giải hostname `minio` —
không phải đoán tên network, tên network đổi giữa các máy nhưng lệnh này thì không.

## Bước 1 — Tạo policy trên MinIO thật từ file JSON đã commit

```bash
set -a; source .env; set +a   # nạp MINIO_ROOT_USER/PASSWORD vào shell hiện tại

docker compose -f compose.prod.yaml run --rm \
  -v "$(pwd)/scripts:/policies:ro" \
  --entrypoint sh minio-init -c "
    mc alias set local http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' &&
    mc admin policy create local directus-vehicles-only /policies/directus-minio-policy.json &&
    mc admin policy info local directus-vehicles-only
  "
```

Kỳ vọng: in ra JSON của policy vừa tạo, đúng hai statement — `s3:ListBucket` trên
`arn:aws:s3:::vehicles`, và `s3:GetObject`/`s3:PutObject`/`s3:DeleteObject` trên
`arn:aws:s3:::vehicles/*`. Không có `checkins`, không có `s3:*`.

## Bước 2 — Tạo user/access key riêng cho Directus, gắn policy

Sinh secret ngẫu nhiên mạnh — **không** tái dùng bất kỳ secret nào đã từng gõ trong dev hay trong
tài liệu này:

```bash
DIRECTUS_S3_SECRET=$(openssl rand -base64 32)
echo "LƯU LẠI NGAY — chỉ hiện một lần, cần dán vào .env ở Bước 4: $DIRECTUS_S3_SECRET"

docker compose -f compose.prod.yaml run --rm \
  --entrypoint sh minio-init -c "
    mc alias set local http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' &&
    mc admin user add local directus-app '$DIRECTUS_S3_SECRET' &&
    mc admin policy attach local directus-vehicles-only --user directus-app
  "
```

Access key = tên user = `directus-app` (MinIO dùng tên user làm access key).

## Bước 3 — Xác nhận key được scoped ĐÚNG (bắt buộc, đừng bỏ qua)

Đây là bước quan trọng nhất trong runbook: một policy cấp thừa quyền trông giống hệt một policy
đúng cho tới khi có ai kiểm chiều ÂM. Kiểm cả hai chiều trong cùng một lần chạy:

```bash
docker compose -f compose.prod.yaml run --rm \
  --entrypoint sh minio-init -c "
    mc alias set scoped http://minio:9000 directus-app '$DIRECTUS_S3_SECRET' &&
    echo probe > /tmp/probe.txt &&

    echo '--- PHAI duoc: ghi vao vehicles ---' &&
    mc cp /tmp/probe.txt scoped/${MINIO_BUCKET_VEHICLES}/_scoped-key-probe.txt &&
    mc cat scoped/${MINIO_BUCKET_VEHICLES}/_scoped-key-probe.txt &&
    mc rm scoped/${MINIO_BUCKET_VEHICLES}/_scoped-key-probe.txt &&

    echo '--- PHAI BI TU CHOI: doc checkins ---' &&
    (mc ls scoped/${MINIO_BUCKET_CHECKINS}/ && echo 'LOI: key doc duoc checkins - DUNG LAI' && exit 1) || echo 'OK - bi tu choi dung nhu ky vong' &&

    echo '--- PHAI BI TU CHOI: ghi vao checkins ---' &&
    (mc cp /tmp/probe.txt scoped/${MINIO_BUCKET_CHECKINS}/_scoped-key-probe.txt && echo 'LOI: key ghi duoc vao checkins - DUNG LAI' && exit 1) || echo 'OK - bi tu choi dung nhu ky vong'
  "
```

Kỳ vọng — hai dòng cuối phải là `OK - bi tu choi dung nhu ky vong`, và lỗi MinIO in ra ngay trước
đó phải đúng dạng từ chối quyền (không phải lỗi kết nối hay "bucket không tồn tại"):

```
mc: <ERROR> Unable to list folder. Access Denied.
mc: <ERROR> Failed to copy `/tmp/probe.txt`. Insufficient permissions to access this path `http://minio:9000/checkins/...`
```

Đã đo đúng hai dòng lỗi này trên MinIO dev khi soạn runbook (xem `docs/DEBT.md`) — script trên là
nguyên văn đã chạy qua, không phải suy đoán.

**Nếu bước này KHÔNG in ra "OK" cho cả hai lệnh checkins: dừng lại, đừng đi tiếp sang Bước 4.**
Policy đang cấp thừa quyền. Quay lại Bước 1, kiểm file `directus-minio-policy.json` thật sự được
nạp vào container (không phải bản cache cũ) bằng `mc admin policy info local
directus-vehicles-only`.

## Bước 4 — Trỏ Directus vào cặp key mới

Thêm vào `.env` trên VPS (không commit `.env` — chỉ `.env.example` được commit):

```
DIRECTUS_S3_KEY=directus-app
DIRECTUS_S3_SECRET=<giá trị in ra ở Bước 2>
```

Rồi áp dụng:

```bash
docker compose -f compose.prod.yaml up -d directus
docker compose -f compose.prod.yaml exec directus printenv STORAGE_S3_KEY
# phải in ra "directus-app" — KHÔNG phải giá trị của MINIO_ROOT_USER
```

## Bước 5 — Xác nhận Directus vẫn hoạt động bằng key mới

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://data.$ROOT_DOMAIN/server/health   # phải là 200
```

Rồi thử một upload thật qua Data Studio (Directus admin) vào collection `vehicle_photos`, xác
nhận ảnh hiện được qua `/assets/<id>?key=web`. Nếu ảnh không lên được: quay lại kiểm policy —
**không** vá bằng cách quay lại dùng `MINIO_ROOT_USER`, đó chính là thứ runbook này tồn tại để
xoá bỏ.

## Dọn dẹp

Không cần dọn gì thêm — Bước 3 tự `mc rm` object probe của nó, và `directus-app` là user thật,
giữ nguyên vĩnh viễn (không phải tài nguyên tạm).
