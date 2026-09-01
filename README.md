# V9 Motor Rental

Hệ quản lý cho shop cho thuê mô tô phân khối lớn ở TP.HCM.

File này là **hướng dẫn chạy máy local**. Luật kiến trúc và quyết định thiết kế nằm ở
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); nợ đã biết ở [`docs/DEBT.md`](docs/DEBT.md); đợt kế tiếp ở
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Dựng lần đầu

```bash
bun install
cp .env.example .env          # sửa các giá trị đánh dấu CHANGE_ME
docker compose up -d          # postgres · minio · directus · supertokens
bun run db:migrate            # tạo schema public
bun run directus:setup        # collection, quyền Public, preset ảnh
STAFF_OWNER_EMAIL=ban@shop.vn STAFF_OWNER_PASSWORD='…' bun run staff:bootstrap
bun run dev                   # api + web + staff, chạy trên host
```

`docker compose up -d` **không** chạy ứng dụng — chỉ hạ tầng. Ba app chạy trên host bằng
`bun run dev` để có hot reload.

## Cổng

| Thứ           | Cổng | Địa chỉ               | Ghi chú                                            |
| ------------- | ---- | --------------------- | -------------------------------------------------- |
| `apps/web`    | 3000 | http://localhost:3000 | Next 16, site công khai cho khách                  |
| `apps/api`    | 3001 | http://localhost:3001 | Bun + Elysia. `/` không có route → 404 là **đúng** |
| `apps/staff`  | 3003 | http://localhost:3003 | Vite + TanStack, app vận hành nội bộ               |
| SuperTokens   | 3567 | http://localhost:3567 | core xác thực                                      |
| Directus      | 8055 | http://localhost:8055 | Data Studio, đăng nhập bằng `DIRECTUS_ADMIN_EMAIL` |
| Postgres      | 5432 | —                     | user/db lấy từ `.env`                              |
| MinIO API     | 9000 | http://localhost:9000 | bucket `vehicles`, `checkins`                      |
| MinIO Console | 9001 | http://localhost:9001 | đăng nhập bằng `MINIO_ROOT_USER`                   |

## Kiểm nhanh stack có sống không

```bash
curl -s localhost:3001/health                                    # {"status":"ok"}
curl -s localhost:3001/staff/me -H 'st-auth-mode: cookie'        # 401 NOT_AUTHENTICATED
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/khong-ton-tai   # 404
```

Dòng thứ ba **không thừa**. Elysia trả 404 **trước khi** guard chạy, nên `/staff/me` ra 404 nghĩa là
route chưa đăng ký, không phải guard đang chặn. Chỉ **401** mới chứng minh cả hai vế cùng sống.

⚠️ Gọi `curl` vào `/auth/*` phải kèm `-H 'st-auth-mode: cookie'`, nếu không SuperTokens rơi về header
mode và không trả `Set-Cookie` nào — trông y hệt một bug adapter. Và đọc **body**, đừng đọc status:
sai mật khẩu vẫn là `200` kèm `{"status":"WRONG_CREDENTIALS_ERROR"}`.

## Đăng nhập ở local

`apps/staff` dùng SuperTokens. Chủ shop đầu tiên **không tạo bằng form đăng ký** — ai đăng ký cũng ra
`PENDING`, mà chỉ `OWNER` mới duyệt được, nên hệ tự khoá chính nó lúc mới dựng. Tạo bằng script:

```bash
STAFF_OWNER_EMAIL=ban@shop.vn STAFF_OWNER_PASSWORD='mat-khau-cua-ban' bun run staff:bootstrap
```

Chạy lại nhiều lần vô hại. `STAFF_OWNER_PASSWORD` **bắt buộc** khi `NODE_ENV=production` — thiếu là
script ném, vì mặc định dev của nó nằm trong git.

Quên mật khẩu tài khoản dev? Chạy lại `staff:bootstrap` với email khác, hoặc đặt lại trực tiếp:

```bash
docker exec v9-rental-dev-postgres-1 psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SELECT email, role, status FROM staff_users ORDER BY created_at;"
```

### Màn hình của `apps/staff`

| Đường dẫn                                 | Cần gì                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `/login` · `/signup` · `/forgot-password` | công khai                                                                           |
| `/pending-approval`                       | công khai — tài khoản `PENDING` phải mở được, nếu không thành vòng lặp chuyển hướng |
| `/` · `/change-password`                  | đã đăng nhập, hồ sơ `ACTIVE`                                                        |
| `/staff`                                  | thêm điều kiện `OWNER`                                                              |

## Quên mật khẩu ở dev

Ngoài production, mã 6 số **luôn là `999999`**. Điều kiện là `NODE_ENV`, không phải "SMTP chưa cấu
hình" — thiếu config là trạng thái mặc định của một prod mới dựng, nên nếu thiếu config bật được mã
cố định thì hàng rào tự tắt đúng lúc cần nhất.

Dev thường chưa cấu hình SMTP, nên bước 1 của `/forgot-password` trả `503 EMAIL_NOT_CONFIGURED` và
màn hình hiện hướng dẫn màu hổ phách. Đó là **đường đi đúng**, không phải lỗi: chủ shop phát mã bằng
nút "Phát mã" ở `/staff`, đọc cho nhân viên qua Zalo, rồi nhân viên gõ vào bước 2.

## Lệnh hay dùng

```bash
bun run dev            # api + web + staff
bun test               # toàn repo
bun run typecheck      # 5 workspace + scripts/ — HAI lệnh nối bằng &&, đọc hết output
bun run lint           # eslint, có ép ranh giới kiến trúc
bun run format         # prettier
bun run db:migrate     # apply migration
bun run db:generate    # sinh migration cho bảng thường
bun run bench          # đo /health, exit 1 nếu vượt perf budget
```

## Ba chỗ dễ mất buổi chiều

**`--filter` đặt cwd ở thư mục package, nên `.env` ở root không tới nơi.** Mọi script ở root động tới
app hoặc DB đều phải mang `--env-file`. Và `bun --env-file=... x <cli>` **không** hoạt động —
`bun x` spawn tiến trình mới, env-file bị bỏ. Gọi thẳng binary trong `node_modules/.bin/`.

**`VITE_API_URL` và `NEXT_PUBLIC_*` bị nướng vào bundle lúc build.** Đổi chúng trong compose rồi
restart container không có tác dụng gì — phải build lại image.

**PWA của `apps/staff` không chạy ở `vite dev`.** Kiểm PWA ở dev rồi kết luận "hỏng" là kết luận sai;
phải `bun run --filter @v9/staff build` rồi `preview`.

## Dọn và dựng lại từ đầu

```bash
docker compose down -v        # ⚠️ -v xoá luôn volume: mất sạch dữ liệu dev
docker compose up -d
bun run db:migrate && bun run directus:setup
STAFF_OWNER_EMAIL=… STAFF_OWNER_PASSWORD=… bun run staff:bootstrap
```

Cấu hình Directus (collection, role Public, preset transform) **không nằm trong git** — nó sống trong
database của Directus. `git clone` không mang nó theo, và bấm nút trong Data Studio không để lại dấu
vết nào trong diff. `scripts/directus-setup.ts` là nguồn sự thật viết ra được, nhưng nó **không tự
chạy** — nên sau mỗi lần dựng lại, chạy nó.
