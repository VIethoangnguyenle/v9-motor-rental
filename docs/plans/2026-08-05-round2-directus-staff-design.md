# V9 Motor Rental — Đợt 2: Directus, `apps/staff`, thu hẹp `apps/web`

- **Ngày**: 2026-08-05
- **Trạng thái**: Approved (người dùng duyệt phạm vi trước khi viết)
- **Tiền đề**: [`2026-08-04-scaffolding-design.md`](2026-08-04-scaffolding-design.md) — đợt 1 đã xong, 17/17 task
- **Phạm vi**: thay đổi kiến trúc + dựng khung. **Không** có business feature nào.

---

## 1. Vì sao có đợt 2

Sau khi đợt 1 hoàn tất, người dùng thay đổi ba điều về sản phẩm. Đây không phải sửa lỗi — là
hiểu biết mới về cách shop thật sự vận hành:

|                    | Đợt 1                                   | Đợt 2                                            |
| ------------------ | --------------------------------------- | ------------------------------------------------ |
| App quản trị       | `apps/admin` tự viết (Vite + TanStack)  | **Directus**, và chỉ cho dữ liệu gốc             |
| Vai trò `apps/web` | đặt xe online đầy đủ, khách tự chốt đơn | **xem mẫu xe + tạo request** cho admin tiếp nhận |
| App hiện trường    | không có                                | **`apps/staff`** — PWA cho chủ và nhân viên      |

### 1.1 Một đảo chiều phải ghi rõ

`PRODUCT.md` viết ngày 2026-08-05 (buổi sáng) ghi _"apps/web nhận đặt xe online đầy đủ"_, kèm kết
luận rằng **khách cuối sẽ chạm trực tiếp vào exclusion constraint** chống đặt trùng, và vì thế luật
`23P01 → 409` là đường dẫn khách hàng nhìn thấy.

**Điều đó không còn đúng.** Booking trên web giờ chỉ tạo một _request_; nhân viên mới là người chốt
thành đơn thuê thật. Hệ quả:

- Khách cuối **không** chạm vào exclusion constraint. Nhân viên chạm, qua `apps/staff`.
- Luật `23P01 → 409` vẫn **bắt buộc**, nhưng mức độ nghiêm trọng hạ từ "mất khách" xuống "nhân
  viên thấy thông báo khó hiểu". Vẫn phải làm đúng, chỉ là không còn ở mức báo động.
- `apps/web` không cần đọc availability thời gian thực. Đây là tin tốt cho SSG/ISR: trang xe có
  thể tĩnh hoàn toàn.

`PRODUCT.md` phải được sửa cho khớp. Để nguyên là để lại một tài liệu nói sai về sản phẩm.

## 2. Kiến trúc sau đợt 2

```
                    ┌──────────────┐
   khách  ────────► │  apps/web    │  Next 16, SSG/ISR
                    │  xem mẫu xe  │  tạo request
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  apps/api    │  Elysia — NƠI DUY NHẤT ghi dữ liệu nghiệp vụ
                    └──────┬───────┘
                           │
   chủ/nhân viên ─► ┌──────▼───────┐        ┌─────────────┐
                    │ apps/staff   │        │  Directus   │
                    │ PWA          │        │ dữ liệu gốc │
                    └──────┬───────┘        └──────┬──────┘
                           │                       │
                    ┌──────▼───────────────────────▼──────┐
                    │           PostgreSQL                │
                    │   schema do packages/db làm chủ     │
                    └─────────────────────────────────────┘
```

| Thành phần        | Trách nhiệm                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `apps/api`        | Bun + Elysia. Nơi duy nhất ghi dữ liệu nghiệp vụ. Export `type App` cho Eden.                    |
| `apps/web`        | Next 16, SSG/ISR. Xem mẫu xe, tạo request. **Không** chốt đơn.                                   |
| `apps/staff`      | **Mới.** PWA (Vite + TanStack). Lịch, thống kê, lên đơn/bàn giao, khách hàng, tiếp nhận request. |
| Directus          | **Chỉ dữ liệu gốc**: danh mục xe, ảnh, bảng giá. Tra cứu dữ liệu thô.                            |
| SuperTokens       | **Mới.** Service xác thực self-host cho `apps/staff`. Schema riêng trong cùng Postgres.          |
| `packages/db`     | Làm chủ schema. Migration là nguồn sự thật duy nhất.                                             |
| `packages/shared` | Không đổi. Domain logic thuần + Eden client factory.                                             |
| ~~`apps/admin`~~  | **Xoá.**                                                                                         |

## 3. Quyết định và lý do

### 3.1 Directus chỉ giữ dữ liệu gốc, không làm vận hành

`apps/staff` làm toàn bộ vận hành hằng ngày: lịch đặt xe, thống kê doanh thu, lên đơn và bàn giao,
quản lý khách hàng, tiếp nhận request từ web. Directus thu về đúng thế mạnh của nó: nhập và sửa
danh mục xe, ảnh, bảng giá, tài khoản — cộng tra cứu dữ liệu thô khi cần.

**Vì sao không để Directus làm lịch và thống kê.** Đây là giới hạn kỹ thuật thật, không phải sở
thích. Lịch đặt xe cần lưới _xe × thời gian_, hiển thị khoảng thuê chồng lấn, kéo thả đổi ngày —
calendar layout của Directus chỉ nhóm bản ghi theo một trường ngày. Thống kê doanh thu theo xe theo
tháng vượt xa những gì Insights của Directus làm được. Ép hai thứ đó vào Directus sẽ dẫn tới việc
viết extension cho Directus, tức tự viết code nhưng trong một môi trường khó hơn.

**Đã loại.** Bỏ Directus để `apps/staff` làm hết (phải tự viết CRUD danh mục xe, upload ảnh, bảng
giá — thứ Directus cho không) · Directus làm quản trị chính giai đoạn đầu rồi chuyển dần (có giai
đoạn hai nơi cùng làm một việc, và người dùng phải nhớ vào đâu làm gì).

### 3.2 Schema drift phải chặn bằng Postgres, không bằng cấu hình Directus

**Đây là quyết định quan trọng nhất của đợt này.**

Directus cho phép admin đổi cấu trúc bảng ngay trên giao diện. Một cú bấm "add field" là schema
thật lệch khỏi `packages/db/migrations/`, và lần `drizzle-kit generate` sau không biết gì về nó.

Chặn bằng cách tắt quyền trong Directus là **không đủ**: đó là một toggle mà người sau bật lại
được, và không có gì trong repo ghi lại rằng nó từng bị tắt. Chặn ở tầng database thì công cụ nào
kết nối cũng bị ép như nhau:

```sql
CREATE ROLE directus_app LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA public TO directus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO directus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO directus_app;
REVOKE CREATE ON SCHEMA public FROM directus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO directus_app;
```

Directus kết nối bằng role này. Nó vẫn cần tự tạo được bảng `directus_*` của riêng nó — nên
những bảng đó đặt trong **schema riêng** (`directus`), nơi role được toàn quyền:

```sql
CREATE SCHEMA directus AUTHORIZATION directus_app;
```

Kết quả: Directus toàn quyền trong schema của nó, chỉ đọc-ghi _dữ liệu_ trong `public`, và Postgres
từ chối mọi DDL lên bảng nghiệp vụ bất kể ai bấm gì trên giao diện.

**Cách kiểm chứng** (phải chạy thật, không tin cấu hình): đăng nhập Directus, thử thêm một field
vào một bảng nghiệp vụ, xác nhận nó báo lỗi quyền.

### 3.3 `apps/web` thu hẹp về xem xe + tạo request

Không đọc availability thời gian thực, không chốt đơn. Trang danh sách và trang chi tiết xe tĩnh
hoàn toàn (SSG/ISR), đúng lý do Next được chọn. Form đặt xe chỉ tạo một bản ghi request và trả lời
"shop sẽ liên hệ", không hứa hẹn xe còn trống.

Đây cũng là câu trả lời trung thực với thực tế shop: khách vẫn nhắn Zalo/Fanpage, và web là kênh
thêm vào để khách chốt được ngoài giờ — không phải kênh thay thế người thật.

### 3.4 `apps/staff` là PWA, không phải native

Chọn PWA vì nó dùng lại được toàn bộ hạ tầng đã dựng: Eden client, `@v9/shared`, cùng một pipeline
build và deploy. Cài được lên màn hình chính, chụp ảnh qua camera API, lưu tạm khi mất sóng.

**Giá phải trả, ghi rõ:** offline và camera kém mượt hơn native, và iOS còn hạn chế thêm về push,
dung lượng lưu trữ và tác vụ nền. Nếu sau này việc bàn giao ngoài hiện trường chứng minh PWA không
đủ, đường lùi là React Native — nhưng khi đó `packages/shared` vẫn dùng lại được, chỉ tầng UI phải
viết lại.

### 3.5 Xoá hẳn `apps/admin`

Directus thay toàn bộ vai trò quản trị nên `apps/admin` không còn lý do tồn tại. Xoá khỏi bảy chỗ:
workspace, `Dockerfile`, `Caddyfile` riêng, service trong `compose.prod.yaml`, nhánh trong matrix
của `deploy.yml`, element `frontend` trong `eslint.config.js`, và `CLAUDE.md` của nó.

**Ghi nhận công làm lại:** `apps/staff` sẽ dựng lại gần đúng stack mà `apps/admin` đang có (Vite +
TanStack + Eden). Người dùng đã thấy phương án đổi tên `apps/admin` thành `apps/staff` và chọn xoá
hẳn. Theo quyết định đó; chỉ ghi lại để sau này không ai tưởng là sơ suất.

### 3.6 Vì sao không đổi sang Supabase

Câu hỏi được đặt ra và đã cân nhắc nghiêm túc.

Về đúng vấn đề schema drift, Supabase **không hơn** — Studio của nó cũng cho sửa cấu trúc bảng qua
giao diện. Giải pháp đúng là role Postgres ở §3.2, và nó áp dụng như nhau cho cả hai.

Về tổng thể, phần lớn giá trị Supabase bán đã bị các quyết định đã khoá chiếm chỗ: PostgREST đối
đầu Elysia + Eden (đã dựng, type xuyên suốt), GoTrue đối đầu seam JWT, Storage đối đầu MinIO (đã
chạy). Thứ thật sự cần chỉ là giao diện quản trị — mà đó lại là phần Directus làm tốt hơn, vì
Directus sinh ra để làm giao diện nhập liệu còn Studio sinh ra để lập trình viên xem bảng.

Chi phí vận hành cũng lệch hẳn: tự host Supabase là khoảng chín container; Directus là một.

**Chỗ Supabase thật sự hơn, ghi lại cho công bằng:** GoTrue giải quyết luôn câu hỏi danh tính ở
§4 dưới đây, kèm RLS ở tầng database. Nhưng đổi sang Supabase chỉ để giải việc đó là đảo bốn quyết
định đã dựng xong, cho một vấn đề mà tự viết JWT trong Elysia giải được.

## 4. `apps/staff` xác thực bằng SuperTokens

**Chốt 2026-08-05.** Thay cho ba phương án cân nhắc trước đó (Directus làm nhà cung cấp danh tính ·
`apps/api` tự viết JWT · dùng chung bảng user), `apps/staff` dùng **SuperTokens** self-host.

### 4.1 Khả thi — đã kiểm chứng, không phải đọc tài liệu rồi đoán

`supertokens-node` không có adapter cho Elysia, nên câu hỏi sống còn là nó có chạy dưới Bun không.
Đã thử thật:

| Kiểm                                                      | Kết quả                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `supertokens-node@24.0.3` cài được                        | ✅                                                                     |
| Adapter framework có `custom`                             | ✅ (cạnh `express`, `fastify`, `koa`, `hapi`, `loopback`, `awsLambda`) |
| `supertokens.init({ framework: "custom" })` chạy dưới Bun | ✅ in ra `init OK`                                                     |
| `middleware()` trả về handler                             | ✅                                                                     |

Framework `custom` phơi ra `PreParsedRequest` và `CollectingResponse` — lớp adapter theo chuẩn Web
`Request`/`Response`, cùng thứ SuperTokens dùng cho Next App Router và edge runtime. Elysia cũng
chạy trên `Request`/`Response`, nên đây là chỗ ghép tự nhiên, không phải chắp vá.

`apps/api/src/plugins/auth.ts` — seam đã đánh dấu `// SEAM: JWT auth` từ đợt 1 — giờ có đích cụ
thể: bọc `middleware()` của `custom` thành một Elysia plugin và cho `derive` trả `AuthContext` từ
session của SuperTokens.

### 4.2 Hệ quả hạ tầng

SuperTokens core là **một service riêng** (image `supertokens-postgresql`), kết nối vào chính
Postgres của ta và tự tạo bảng của nó.

**Áp cùng luật với Directus (§3.2): schema riêng, role riêng, không có DDL lên `public`.**

```sql
CREATE ROLE supertokens_app LOGIN PASSWORD '...';
CREATE SCHEMA supertokens AUTHORIZATION supertokens_app;
REVOKE CREATE ON SCHEMA public FROM supertokens_app;
```

SuperTokens toàn quyền trong schema `supertokens`, và **không chạm được** vào bảng nghiệp vụ. Sau
đợt này Postgres có ba vùng tách bạch: `public` (migration của ta làm chủ), `directus`, `supertokens`.

### 4.3 Vẫn còn hai nơi đăng nhập — chấp nhận có ý thức

Directus giữ hệ user riêng của nó. Nghĩa là:

| Ai                                 | Đăng nhập ở đâu                           |
| ---------------------------------- | ----------------------------------------- |
| Chủ và nhân viên dùng `apps/staff` | SuperTokens                               |
| Người nhập liệu vào Directus       | tài khoản Directus                        |
| Khách trên `apps/web`              | **không cần đăng nhập** — chỉ gửi request |

Chấp nhận được vì hai nhóm khác nhau và Directus chỉ có vài tài khoản back-office. Nếu sau này
phiền, SuperTokens làm được OAuth2/OIDC provider và Directus nhận SSO — nhưng đó là việc thêm khi
có nhu cầu thật, không làm trước.

**`apps/web` không dùng SuperTokens.** Khách gửi request không cần tài khoản. Thêm đăng nhập vào
luồng đó chỉ làm giảm số request nhận được.

### 4.4 Đợt này làm tới đâu

Dựng SuperTokens core chạy được, tạo schema và role, và ghép `middleware()` vào `apps/api` sau seam
đã có. **Chưa** làm màn hình đăng nhập, chưa enforce trên route nào — vì chưa có route nghiệp vụ
nào để bảo vệ. Mục tiêu là seam không còn là giấy: nó gọi được SuperTokens thật.

## 5. Non-goals đợt này

- Không làm bốn tính năng của `apps/staff`: lịch, thống kê, lên đơn/bàn giao, quản lý khách hàng.
- Không tạo schema nghiệp vụ (`vehicles`, `customers`, `rentals`, `booking_requests`).
- Không quyết chính sách tính ngày thuê và bảng giá.
- Không làm màn hình đăng nhập, không enforce auth trên route nào — chưa có route nghiệp vụ để bảo vệ.
- **Không dựng khung dashboard thống kê.** Chưa có một đơn thuê nào tồn tại; vẽ biểu đồ trước khi
  có dữ liệu là cách chắc chắn nhất để thiết kế sai thứ mình chưa hiểu.

## 6. Phạm vi đợt này

| #   | Việc                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sửa `PRODUCT.md` (đảo chiều booking, thêm Directus và `apps/staff`) + design doc                                                                    |
| 2   | Xoá `apps/admin` khỏi bảy chỗ                                                                                                                       |
| 3   | Directus vào `compose.yaml` + `compose.prod.yaml` + route Caddy; role Postgres theo §3.2; **verify bằng cách thử đổi schema và thấy nó bị từ chối** |
| 4   | Thu hẹp `apps/web` về xem xe + tạo request                                                                                                          |
| 5   | Dựng khung `apps/staff` PWA — cài được, offline shell, gọi được `/health`                                                                           |
| 6   | SuperTokens core vào compose, schema + role riêng, ghép `middleware()` vào seam `apps/api`                                                          |
| 7   | Cập nhật CLAUDE.md, ghi ADR, verify lại toàn bộ                                                                                                     |

## 7. Tiêu chí "xong" cho đợt 2

Không tiêu chí nào được tuyên bố đạt nếu chưa chạy lệnh và đọc output.

| #   | Tiêu chí                                            | Cách verify                                                                                        |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `apps/admin` biến mất hoàn toàn                     | `grep -rn "admin" --include=* .` không còn tham chiếu sống; `bun run typecheck` và `lint` vẫn xanh |
| 2   | Directus lên được và thấy bảng nghiệp vụ            | mở UI, đăng nhập, thấy collection                                                                  |
| 3   | **Directus KHÔNG đổi được schema**                  | thử thêm field vào bảng nghiệp vụ trong UI → phải bị Postgres từ chối                              |
| 4   | Directus tự quản được bảng của nó                   | bảng `directus_*` nằm trong schema `directus`, không nằm trong `public`                            |
| 5   | `apps/web` không còn hứa hẹn chốt đơn               | đọc lại copy và luồng                                                                              |
| 6   | `apps/staff` cài được như app                       | Lighthouse PWA installable, hoặc trình duyệt hiện nút cài                                          |
| 7   | `apps/staff` gọi được `/health` qua Eden typed      | mở app thật, thấy trạng thái                                                                       |
| 8   | Toàn bộ vẫn xanh                                    | `bun test`, `bun run typecheck`, `bun run lint`, CI                                                |
| 9   | Bộ probe boundaries vẫn nổ                          | chạy lại bộ probe trong CLAUDE.md sau khi đổi `eslint.config.js`                                   |
| 10  | SuperTokens core lên được và `apps/api` gọi tới nơi | endpoint của SuperTokens trả về qua Elysia, không phải 404                                         |
| 11  | **SuperTokens KHÔNG đổi được schema `public`**      | thử DDL bằng role `supertokens_app` → phải bị từ chối                                              |
| 12  | ADR đã ghi                                          | `memory_recall` đọc lại được quyết định Directus, SuperTokens, và role Postgres                    |

Tiêu chí **#3** là tiêu chí quan trọng nhất của đợt này. Nếu Directus vẫn đổi được schema thì luật
"migration làm chủ" chỉ là chữ trên giấy, và toàn bộ kỷ luật migration của đợt 1 mất tác dụng.
