---
name: v9-directus
description: Kiểm và sửa cấu hình Directus của v9-rental (danh mục xe, ảnh, quyền Public, preset transform). Dùng sau khi nâng version Directus, sau khi dựng lại môi trường, khi ảnh xe không hiện, khi nghi ai đó đổi phân quyền trong Data Studio, hoặc trước khi demo. Ba probe bắt drift của cấu hình không nằm trong git.
---

# Directus — probe cấu hình không nằm trong git

Collection, role Public và preset transform sống trong **database của Directus**, không trong
repo. `git clone` không mang chúng theo, và ai đó bấm vài nút trong Data Studio thì không để lại
dấu vết nào trong diff.

Nguồn sự thật viết ra được là `scripts/directus-setup.ts`, áp lại bằng `bun run directus:setup`
(chạy nhiều lần vô hại). Nhưng **script không tự chạy**, và — quan trọng hơn — **nó mù với quyền
ai đó tự thêm**. Nên phải probe.

## Ba probe

Lấy `<uuid>`: `SELECT file_id FROM vehicle_photos LIMIT 1;`

```bash
# ① PHẢI 200 + content-type: image/*  (KHÔNG kèm token — role Public phải đọc được)
curl -sI "http://localhost:8055/assets/<uuid>?key=web" | grep -i '^HTTP\|^content-type'

# ② PHẢI 400 "code":"INVALID_QUERY" — transform tuỳ ý là vòi CPU miễn phí cho bot
curl -s "http://localhost:8055/assets/<uuid>?width=9999" | head -c 120

# ③ PHẢI 403 "code":"FORBIDDEN" — Directus không được phơi dữ liệu nghiệp vụ ra internet
curl -s "http://localhost:8055/items/vehicles" | head -c 120
```

⚠️ Lệnh ① dùng `grep`, **không** `head -3`: Directus nhét một khối CSP dài lên đầu response, nên
`head -3` cắt mất đúng cái `Content-Type` cần đọc. Một probe hiển thị thiếu thứ nó tuyên bố kiểm
là probe không kiểm gì.

Với ② và ③ đọc **body**, vì mã lỗi phân biệt được nguyên nhân (`INVALID_QUERY` vs `FORBIDDEN`)
còn status code thì không.

## Ba probe đo ba thứ khác nhau, không thay thế nhau

| Probe | Chứng minh                                     | Hỏng thì sao                                                          |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------- |
| ①     | ảnh vẫn ra được                                | trang trắng ảnh                                                       |
| ②     | `storage_asset_transform = presets` còn nguyên | mỗi `?width=` lạ thành một lần resize + một entry cache               |
| ③     | role Public **chỉ** đọc `directus_files`       | `plate` và toàn bộ hàng `draft` ra internet, vòng qua lớp lọc của API |

## ⚠️ `directus:setup` KHÔNG áp lại được cả ba

Script chỉ đụng những gì nó khai. **Quyền ai đó THÊM MỚI thì nó không thấy** — đo thật: cấp cho
policy Public một `read` trên `vehicles` trong UI rồi chạy script → script in "Không có gì phải
đổi" trong khi `GET /items/vehicles` trả **200 kèm cả cột `plate`**.

Nghĩa là probe ③ là hàng rào thật ở đây, không phải script.

## Probe DDL — Directus không được đổi schema `public`

Chạy sau mỗi lần nâng version Directus hoặc SuperTokens:

```bash
# PHẢI ra: ERROR: permission denied for schema public
docker compose exec -T postgres psql -U v9 -d v9_rental -c \
  "SET ROLE directus_app; CREATE TABLE public.x (id int);"
```

Bằng chứng thu được từ chính UI Directus khi bấm _Create Field_:
`must be owner of table probe_vehicles`. Dữ liệu vẫn ghi được bình thường — **chặn schema, không
chặn dữ liệu**. Một cấu hình chặn tất là hỏng, không phải an toàn.

`CREATE ROLE` là đối tượng **cấp cluster**, không phải cấp database — migration phải bọc trong
`DO $$ IF NOT EXISTS $$`, `CREATE TABLE IF NOT EXISTS` không có tương đương cho role.

## Chi tiết và cách dọn

[`docs/runbooks/directus-vehicles.md`](../../../docs/runbooks/directus-vehicles.md) — liệt kê
quyền của policy Public bằng SQL, dọn dữ liệu giả trước khi demo, dọn metadata mồ côi, và probe
DDL chứng minh Directus không đổi được schema `public`.
