# Đăng nhập / đăng ký / quên mật khẩu cho `apps/staff` — design doc

**Ngày:** 2026-08-10 · **Trạng thái:** đã chốt, chưa implement
**Tiếp nối:** `2026-08-05-round2-directus-staff-design.md` §4 (SuperTokens core đã dựng, seam đã ghép,
cố ý chưa có màn đăng nhập và chưa route nào enforce).

---

## 0. Tóm tắt cho người đọc vội

`apps/staff` có ba màn hình auth và một màn quản lý nhân viên. Danh tính **chia đôi có chủ ý**:
SuperTokens giữ mật khẩu và session, `public.staff_users` (migration làm chủ) giữ role, trạng thái
duyệt, và hồ sơ nghiệp vụ. Nhân viên tự đăng ký, OWNER duyệt. Quên mật khẩu đi bằng **mã 6 số**,
không phải link. API chuyển sang **mặc định chặn**: route nào không nằm trong danh sách công khai
thì đòi session.

Năm quyết định đã chốt trong phiên brainstorm 2026-08-10:

| # | Câu hỏi | Chốt |
| --- | --- | --- |
| 1 | Ai tạo tài khoản nhân viên | Tự đăng ký, OWNER duyệt |
| 2 | Role và trạng thái duyệt ở đâu | Bảng `staff_users` trong `public` |
| 3 | Kênh đặt lại mật khẩu | SMTP của shop + đường cứu do OWNER phát mã |
| 4 | SDK frontend | `supertokens-web-js` (headless) |
| 5 | Phạm vi đợt này | Auth + quản lý nhân viên + luật mặc định chặn |

Cộng một quyết định phát sinh giữa phiên: luồng đặt lại mật khẩu dùng **mã 6 số**, và ở môi trường
không phải production mã đó là **`999999`**.

---

## 1. Đã kiểm chứng vs còn là giả định

Mục này tồn tại vì repo này đã bốn lần có cơ chế trông như đang chạy mà thực ra không. Đọc nó
trước khi tin bất cứ đoạn nào bên dưới.

**Đã kiểm bằng cách chạy hoặc đọc `node_modules`, không phải đọc tài liệu rồi đoán:**

| Điều | Bằng chứng |
| --- | --- |
| `verifySession` có bản cho framework `custom` | `lib/build/recipe/session/framework/custom.d.ts` — nhận `BaseRequest`/`BaseResponse`, khớp `PreParsedRequest`/`CollectingResponse` đang dùng |
| `SMTPService` có sẵn cho emailpassword | `lib/build/recipe/emailpassword/emaildelivery/services/smtp` |
| `nodemailer` đã có trong cây phụ thuộc | dependency của `supertokens-node@24.0.3` (`^8.0.2`) |
| `supertokens-web-js` tồn tại, bản mới nhất | `0.16.0` |
| `@elysiajs/cors@1.4.2` mặc định | `origin = true`, `credentials = true`, headers **phản chiếu** chứ không phát `*` (đọc `dist/index.mjs`) |
| `EmailPassword` và `Session` đã init thật và `/auth/*` gọi tới core | `apps/api/CLAUDE.md` — `POST /auth/signup` với body rỗng trả `Missing input param: formFields` |

**Còn là giả định, phải kiểm lúc implement:**

- Eden Treaty gọi qua `globalThis.fetch` nên hưởng luôn interceptor refresh mà `Session.init()` cài
  vào `window.fetch`. Kiểm bằng cách để access token hết hạn rồi gọi API, **không** bằng đọc code.
- `apps/web` không gọi API từ trình duyệt. Phải `grep` xác nhận trước khi siết CORS, vì siết sai
  thì trang công khai vỡ.
- Cookie đi được giữa `staff.$ROOT_DOMAIN` và `api.$ROOT_DOMAIN`. **Localhost không kiểm được vế
  này** — xem §7.

---

## 2. Danh tính chia đôi

```
đăng ký   →  SuperTokens tạo user (id, email, password hash)
              └─ override signUpPOST → INSERT staff_users(id, email, hoTen, sdt, status='PENDING')

mỗi request →  cookie session → userId → SELECT staff_users WHERE id = userId
              └─ ACTIVE? role đủ? → cho qua, gắn AuthContext vào handler
```

**SuperTokens giữ đúng hai thứ: mật khẩu và session.** Mọi thứ khác về một nhân viên là dữ liệu
nghiệp vụ và thuộc về `public`, nơi migration làm chủ.

Bốn lý do chọn bảng riêng thay vì recipe `UserRoles` của SuperTokens:

1. **Dù chọn gì cũng phải có bảng đó.** `rentals` đợt sau cần trả lời "ai chốt đơn, ai bàn giao
   xe" — đó là FK tới một hàng nhân viên. FK sang `supertokens.*` là buộc dữ liệu nghiệp vụ vào
   schema do tool khác làm chủ và tự đổi mỗi lần nâng version. Migration `0001` tách ba vùng ra
   chính vì thế.
2. **Họ tên và số điện thoại không có chỗ ở `UserRoles`.** Recipe `usermetadata` cất được nhưng là
   JSON blob: không index, không FK, không join được vào báo cáo.
3. **Chi phí đọc là chi phí tưởng tượng.** Một hàng theo primary key ~1ms, budget cho phép 25ms,
   shop có chưa tới mười người. Tối ưu claim ở đây là tối ưu cho tải không tồn tại.
4. **Khoá tài khoản phải có hiệu lực ngay.** Nhân viên nghỉ việc mà token cũ còn sống thêm một giờ
   là hỏng thật. Phương án nhét role vào claim phải thu hồi session thủ công mới đạt được điều
   phương án này có sẵn.

Đánh đổi thật: mỗi request được bảo vệ tốn một query. Nếu sau này thành vấn đề, thêm claim vào token
là việc **thêm được sau** mà không đổi nguồn sự thật; đi ngược lại thì phải viết migration.

### 2.1 Hai ghi không nguyên tử — và hai lớp chống

SuperTokens ghi user vào schema của nó, ta ghi hàng vào `public`: hai transaction khác nhau, không
có transaction chung. Insert `staff_users` hỏng thì còn lại một user SuperTokens mồ côi — đăng nhập
được, không có hồ sơ.

- **Lớp 1:** override bắt lỗi rồi gọi `supertokens.deleteUser(userId)` bù trừ.
- **Lớp 2:** guard coi **thiếu hàng = `PENDING` không hồ sơ** (`403 CHUA_CO_HO_SO`) thay vì crash.

Cần cả hai vì lớp bù trừ cũng hỏng được (mất mạng đúng lúc đó).

---

## 3. Schema

Theo đúng quy ước của `vehicles`: `text` + `CHECK` chứ không `pgEnum` — luật thuộc về DB, và thêm
giá trị mới không phải chạy `ALTER TYPE`.

```sql
CREATE TABLE staff_users (
  id          text PRIMARY KEY,              -- = userId của SuperTokens
  email       text NOT NULL UNIQUE,
  full_name   text NOT NULL,
  phone       text,
  role        text NOT NULL DEFAULT 'STAFF',
  status      text NOT NULL DEFAULT 'PENDING',
  approved_at timestamptz,
  approved_by text REFERENCES staff_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_users_role_valid   CHECK (role   IN ('OWNER','STAFF','SALES')),
  CONSTRAINT staff_users_status_valid CHECK (status IN ('PENDING','ACTIVE','DISABLED'))
);
CREATE INDEX staff_users_pending ON staff_users (created_at) WHERE status = 'PENDING';

CREATE TABLE password_reset_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id text NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  code_hash     text NOT NULL,          -- Bun.password.hash — KHÔNG lưu mã thô
  expires_at    timestamptz NOT NULL,   -- +10 phút
  attempts      integer NOT NULL DEFAULT 0,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prc_attempts_nonneg CHECK (attempts >= 0)
);
CREATE INDEX prc_active ON password_reset_codes (staff_user_id) WHERE used_at IS NULL;
```

Ba điểm cố ý:

- **`id` là `text`, không phải `uuid`.** Id do hệ khác sinh; khai `uuid` là đặt cược vào chi tiết
  triển khai của SuperTokens (họ có cơ chế user-id-mapping cho id ngoài). Đổi sang `uuid` sau này
  là một migration rẻ; chọn sai chiều kia thì hỏng lúc chạy.
- **`email` là bản sao**, nguồn sự thật vẫn ở SuperTokens. Có ở đây để OWNER tìm và duyệt mà không
  phải gọi sang core. **Hệ quả phải ghi vào CLAUDE.md:** đổi email nhân viên phải đồng bộ hai nơi —
  đó là lý do việc đó nằm ở non-goals (§10).
- **Partial index chỉ trên hàng `PENDING`** — cùng lý lẽ với partial index của `vehicles`: màn duyệt
  luôn lọc đúng tập đó, và tập đó gần như luôn rỗng.

### 3.1 Domain logic thuần

`packages/shared/src/domain/staff.ts`, **test trước** theo TDD nghiêm (luật của `packages/shared`):

```ts
canApprove(actor, target)                       // chỉ OWNER, không tự duyệt mình
canChangeRole(actor, target, activeOwnerCount)  // không hạ role OWNER cuối cùng
canDisable(actor, target, activeOwnerCount)     // không tự khoá mình, không khoá OWNER cuối
```

Luật "OWNER cuối cùng" là chỗ dễ tự khoá mình ra khỏi hệ thống nhất, và nó là hàm thuần không cần
DB — đúng loại thứ `src/domain/` sinh ra để giữ. Trả discriminated union `{ ok: false, reason }`
theo pattern 3 của repo, không throw.

---

## 4. API: mặc định chặn

Guard là plugin Elysia (`name: "require-staff"`) đăng ký **trước** mọi route nghiệp vụ, hook
`onBeforeHandle` phạm vi global, đọc session bằng `verifySession` của framework `custom` rồi
`SELECT staff_users WHERE id = userId`.

| Tình trạng | Kết quả |
| --- | --- |
| Không có session | `401` |
| Có session, không có hàng `staff_users` | `403 CHUA_CO_HO_SO` |
| `PENDING` | `403 CHO_DUYET` |
| `DISABLED` | `403 DA_KHOA` + `revokeAllSessionsForUser` |
| `ACTIVE`, thiếu role | `403 THIEU_QUYEN` |

Công khai là **danh sách khai tường minh** ngay trong plugin đó — và có **hai** danh sách, không phải
một:

```ts
// Không cần session chút nào.
const CONG_KHAI = [
  { method: "*",    pattern: /^\/auth\// },
  { method: "GET",  pattern: /^\/health/ },
  { method: "GET",  pattern: /^\/vehicles(\/|$)/ },          // apps/web SSG cần
  { method: "POST", pattern: /^\/staff\/password-reset\/(request|confirm)$/ },
];

// Cần session, nhưng KHÔNG đòi status ACTIVE. Đúng một mục, và phải đúng một mục:
// màn "chờ duyệt" phải đọc được chính trạng thái của mình, nếu không người dùng
// nhìn thấy màn hình trắng không giải thích được vì sao họ vào không được.
const CAN_SESSION_KHONG_CAN_ACTIVE = [{ method: "GET", pattern: /^\/staff\/me$/ }];
```

Với `/staff/me`, guard vẫn chặn `DISABLED` (người bị khoá không có lý do gì để đọc tiếp) nhưng cho
`PENDING` và `CHUA_CO_HO_SO` đi qua, và trả về đúng trạng thái đó cho frontend.

Gõ sai một mục thì route đó **bị chặn**, không phải lọt — sai theo chiều an toàn. Và vì CLAUDE.md đã
đếm bốn lần hàng rào im lặng ngừng chạy, hàng rào này đi kèm **test tự động**: một fixture route
đăng ký sau guard, không cookie → phải nhận `401`. Test đó xanh khi guard tắt là không chấp nhận
được; nó phải hỏng.

### 4.1 Cái bẫy phải gỡ: luồng reset cũ của SuperTokens vẫn đang bật

`/auth/*` là catch-all chuyển thẳng vào core, nên `POST /auth/user/password/reset/token` **đang sống**
— nó gửi mail từ `noreply@supertokens.io` bằng dịch vụ hosted mặc định, song song với luồng mã 6 số
sắp viết. Hai luồng đặt lại mật khẩu, một cái không ai biết là có.

```ts
EmailPassword.init({
  signUpFeature: { formFields: [{ id: "hoTen" }, { id: "soDienThoai", optional: true }] },
  override: {
    apis: (orig) => ({
      ...orig,
      generatePasswordResetTokenPOST: undefined,  // tắt: ta tự làm bằng mã 6 số
      passwordResetPOST: undefined,
      signUpPOST: /* bọc: gọi orig rồi INSERT staff_users, hỏng thì deleteUser bù trừ */,
    }),
  },
});
```

Vì cả hai API đó bị tắt và ta không dùng email verification, **SuperTokens không bao giờ gửi email**.
Toàn bộ email của hệ thống đi qua `nodemailer` do ta gọi trực tiếp.

### 4.2 Route mới

Đặt dưới `/staff/` chứ không nhét vào `/auth/`, để không phải đánh cược vào thứ tự ưu tiên giữa
route cụ thể và wildcard đã đăng ký.

```
GET   /staff/me                                mọi session, kể cả PENDING (màn chờ duyệt đọc cái này)
GET   /staff/users?status=PENDING              OWNER
POST  /staff/users/:id/approve   {role}        OWNER
POST  /staff/users/:id/role      {role}        OWNER
POST  /staff/users/:id/disable                 OWNER  → kèm revokeAllSessionsForUser
POST  /staff/users/:id/reset-code              OWNER  → trả mã 6 số ngay trên màn hình OWNER
POST  /staff/password-reset/request  {email}                       công khai
POST  /staff/password-reset/confirm  {email, code, matKhauMoi}     công khai
```

Mọi route khai `response` schema (luật của `apps/api`), `routes → services → infra` không có mũi tên
ngược, service mở transaction chứ không phải route.

---

## 5. Quên mật khẩu bằng mã 6 số

### 5.1 Luồng

**`POST /staff/password-reset/request`**

1. Tìm user theo email. **Luôn trả 200** kể cả không tồn tại — không để ai dò xem shop có những
   email nào.
2. Đánh dấu mọi mã chưa dùng của người đó là đã dùng.
3. Sinh mã, `Bun.password.hash`, insert với `expires_at = now() + 10 phút`.
4. Gửi mã qua SMTP, nội dung tiếng Việt, from là địa chỉ của shop.

**`POST /staff/password-reset/confirm`**

1. Lấy mã chưa dùng, chưa hết hạn, `attempts < 5`.
2. Sai → `attempts++`, trả lỗi chung chung. Đúng → đi tiếp.
3. `createResetPasswordToken` → `resetPasswordUsingToken` → `revokeAllSessionsForUser`.
4. Đánh dấu mã đã dùng.

**Không lưu token của SuperTokens.** Token chỉ sinh ở bước xác nhận và dùng xong trong cùng một lời
gọi. Trong DB của ta không có chuỗi nào tự nó mở được tài khoản.

Bốn ràng buộc, tất cả test được không cần SMTP: hết hạn 10 phút · tối đa 5 lần sai · xin mã mới giết
mã cũ · request luôn trả 200.

### 5.2 Chỗ `999999` gắn vào — đúng một dòng

```ts
// Chỉ MỘT thứ khác nhau giữa dev và prod. Toàn bộ phần còn lại — băm, hết hạn,
// đếm lần sai, đổi mã lấy mật khẩu mới — chạy y hệt nhau ở cả hai môi trường.
//
// randomSixDigits() dùng crypto.getRandomValues, KHÔNG dùng Math.random:
// mã đoán được là mã không bảo vệ gì, và Math.random không hứa hẹn gì về việc
// đoán được hay không.
const sinhMa = () => (env.isProduction ? randomSixDigits() : env.devOtp);
```

`env.devOtp` mặc định là `"999999"`; biến `AUTH_DEV_OTP` chỉ để **đổi giá trị đó ở dev** khi cần test
nhiều mã khác nhau. Nghĩa là không cần cấu hình gì thì dev vẫn ra `999999` — đúng yêu cầu — và biến
đó không phải công tắc bật/tắt cửa sau.

Cố ý **không** làm thành nhánh `if (code === "999999") cho qua`. Một cửa sau riêng nghĩa là luồng
chạy ở prod không phải luồng được test nhiều nhất — đúng loại lệch dev/prod repo này đã dính. Ở đây
dev chỉ *sinh ra* một mã đoán trước được; đường xác minh vẫn là đường thật.

Hai hàng rào quanh nó, vì một dòng comment trong `.env.example` không ép được gì:

1. **`env.ts` ném lúc khởi động** nếu `NODE_ENV=production` mà có biến `AUTH_DEV_OTP`. Cấu hình dev
   lọt vào prod thì app không chạy, chứ không chạy sai.
2. **Điều kiện là `NODE_ENV`, KHÔNG phải "SMTP chưa cấu hình".** Quên set SMTP ở prod là chuyện rất
   dễ xảy ra — deploy đang gác và `SMTP_*` còn chưa có trong `.env.example`. Nếu thiếu config bật
   được mã cố định thì cả shop mở bằng sáu con số.

### 5.3 Thiếu SMTP ở prod thì sao

App **vẫn chạy**. `POST /staff/password-reset/request` trả `503 CHUA_CAU_HINH_EMAIL` kèm câu "liên hệ
chủ shop", và log cảnh báo lúc khởi động.

Đường cứu của OWNER (`POST /staff/users/:id/reset-code`) **không cần email**: dùng chung đúng bảng và
đúng đường xác minh, OWNER chỉ đọc sáu số qua Zalo. Cần cả hai đường vì nhân viên mất quyền vào email
thì đường chính vô dụng — và ở VN nhân viên shop dùng Zalo nhiều hơn email.

Nghĩa là credential SMTP là thứ **nên có**, không phải thứ **chặn deploy** — khác với logo (xem
CLAUDE.md, mục "chặn ở người").

`nodemailer` khai **trực tiếp** trong `apps/api/package.json`. Nó đang có sẵn như dependency bắc cầu
của `supertokens-node`; xài ké dep bắc cầu là vỡ ở lần nâng version nào đó mà không ai đoán được.

---

## 6. `apps/staff`: ba màn hình và một guard

`supertokens-web-js@0.16.0` init ở `main.tsx` (`apiDomain`, `apiBasePath: "/auth"`). `Session.init()`
vá `window.fetch`, mà Eden Treaty gọi qua `globalThis.fetch` — nên mọi lời gọi API hiện có tự động
được refresh token, không phải bọc lại `lib/api.ts`. **Giả định, phải kiểm bằng test thật** (để
access token hết hạn rồi gọi API).

Cây route đổi từ một route phẳng thành hai nhánh:

```
công khai    /dang-nhap · /dang-ky · /quen-mat-khau · /cho-duyet
được bảo vệ  /  (health hiện tại) · /nhan-vien  (chỉ OWNER)
```

Guard ở `beforeLoad` của layout được bảo vệ: `Session.doesSessionExist()` sai → `/dang-nhap`; đúng →
`ensureQueryData(/staff/me)` → `PENDING` → `/cho-duyet`; `DISABLED` → signOut rồi về đăng nhập kèm lý
do. Trang `/` (health) trở thành trang được bảo vệ — nó là bằng chứng end-to-end rằng guard chạy,
thay vì một trang test rỗng.

`/quen-mat-khau` là hai bước trên cùng route: nhập email → nhập mã 6 số + mật khẩu mới. Ở dev, bước 2
hiện sẵn gợi ý `999999`.

**PWA:** service worker phải **không** cache `/auth/*` và `/staff/*`. Không loại trừ thì có ngày app
hiện màn hình đã-đăng-nhập lấy từ cache trong khi session đã chết. Nhắc lại luật của app này: PWA chỉ
quan sát được trên bản build (`build` rồi `preview`), kiểm ở `vite dev` rồi kết luận là kết luận sai.

Giao diện dùng theme Tailwind mặc định, tiếng Việt, ưu tiên mật độ thông tin. `DESIGN.md` là hệ thị
giác của `apps/web` — không bê sang.

---

## 7. CORS và cookie

```ts
cors({
  origin: [env.staffAppUrl],                                   // KHÔNG phản chiếu Origin
  credentials: true,
  allowedHeaders: ["content-type", ...supertokens.getAllCORSHeaders()],
})
```

Hiện `cors()` gọi không tham số: `origin: true` phản chiếu **bất kỳ** Origin nào kèm
`credentials: true`. Chưa mất gì vì chưa có session — nhưng đợt này chính là đợt cookie ra đời, nên
phải sửa cùng lúc, không để lệch một commit.

**Rủi ro của việc siết:** nếu `apps/web` có chỗ gọi API từ trình duyệt, nó vỡ. Web là SSG/ISR nên
fetch chạy phía server (không qua CORS) — nhưng đó là điều phải `grep` xác nhận, không phải suy luận.

**Cookie ở prod là thứ localhost không kiểm được.** Dev: staff `:3003` và api `:3001` cùng `localhost`,
cổng không tính vào "site" nên cookie đi bình thường. Prod: `staff.$ROOT_DOMAIN` gọi
`api.$ROOT_DOMAIN` — cùng site, khác origin. Đặt `cookieDomain: ".$ROOT_DOMAIN"` theo khuyến nghị của
SuperTokens cho thế tách subdomain này, và **chỉ coi là đã kiểm khi đăng nhập thật trên stack đã
deploy**. Dev xanh không chứng minh gì cho vế này.

---

## 8. OWNER đầu tiên

Ai đăng ký cũng ra `PENDING`, mà chỉ OWNER mới duyệt được → hệ thống tự khoá chính nó lúc mới dựng.

`scripts/staff-bootstrap.ts` + `bun run staff:bootstrap`, theo đúng khuôn `directus:setup` đã có: đọc
`STAFF_OWNER_EMAIL`, tạo user SuperTokens nếu chưa có, upsert `staff_users` thành `OWNER`/`ACTIVE`,
**chạy lại nhiều lần vô hại**.

Hai luật của repo áp vào đây: root script phải mang `--env-file` (nếu không, `.env` ở root không tới
nơi), và file phải nằm trong `scripts/tsconfig.json` — `scripts/` không phải workspace, không thêm
vào đó thì nó vô hình với `bun run typecheck` mà lệnh vẫn xanh.

Phương án "người đăng ký đầu tiên tự động thành OWNER" bị loại: nó là một luật sống mãi mãi để phục
vụ đúng một lần dùng, và nó chạy đua với chính internet nếu API lên mạng trước khi chủ shop kịp
đăng ký.

---

## 9. Tiêu chí xong

Không tiêu chí nào được tuyên bố đạt nếu chưa chạy lệnh và đọc output.

| # | Tiêu chí | Cách verify |
| --- | --- | --- |
| 1 | Luồng reset cũ của SuperTokens đã tắt | `POST /auth/user/password/reset/token` → **404** |
| 2 | Mặc định chặn có thật | fixture route đăng ký sau guard, không cookie → **401** (test tự động) |
| 3 | Cấu hình dev không lọt vào prod | `NODE_ENV=production` + `AUTH_DEV_OTP` → app **không khởi động** |
| 4 | Đăng ký ra `PENDING` | signup → `GET /staff/users` → `403 CHO_DUYET` |
| 5 | Duyệt có hiệu lực | OWNER approve → gọi lại → `200` |
| 6 | Khoá có hiệu lực **ngay** | disable → session đang mở bị chặn, không đợi token hết hạn |
| 7 | Mã 6 số đúng luật | sai 5 lần chết · quá 10 phút chết · xin mã mới giết mã cũ |
| 8 | Không dò được email | request với email không tồn tại → vẫn `200` |
| 9 | CORS đã siết | `curl -H 'Origin: https://ke-la.com'` → **không** có `access-control-allow-origin` |
| 10 | Refresh token tự động | để access token hết hạn → gọi API qua Eden → vẫn `200` |
| 11 | Không tự khoá được OWNER cuối | unit test `packages/shared/src/domain/staff.test.ts` |
| 12 | Toàn bộ vẫn xanh | `bun test`, `bun run typecheck`, `bun run lint`, ba probe boundaries |
| 13 | Cookie chạy trên subdomain thật | đăng nhập trên stack đã deploy — **không kiểm được ở localhost** |

Tiêu chí **#2** là quan trọng nhất. Nếu guard im lặng không chạy thì mọi thứ còn lại chỉ là trang trí,
và đó đúng là kiểu suy thoái đã xảy ra bốn lần trong dự án này.

---

## 10. Không làm đợt này

Xác minh email · 2FA/TOTP · định nghĩa role `SALES` · hợp nhất đăng nhập với Directus bằng OIDC ·
đổi email nhân viên (email nằm hai nơi, cần luồng đồng bộ riêng) · audit log · enforce lên route
`rentals`/`customers` (chưa tồn tại).

**Một lỗ ghi rõ thay vì giấu:** đăng ký mở công khai và **không có rate limit theo IP** — bot spam
được hàng `PENDING`. Hậu quả giới hạn ở việc OWNER thấy rác trong danh sách chờ; không ai vào được hệ
thống vì `PENDING` không làm được gì. Không xử lý đợt này, nhưng nó là lỗ có thật.

---

## 11. Việc phải cập nhật ngoài code

- `CLAUDE.md` gốc: mục "Xác thực" hiện ghi "chưa route nào enforce auth và chưa có màn hình đăng
  nhập" — sau đợt này sai. Mục "Việc còn để lại" cũng phải bỏ dòng enforce auth.
- `apps/api/CLAUDE.md`: mục seam auth, thêm luật mặc định chặn và danh sách công khai.
- `apps/staff/CLAUDE.md`: mục "chưa có màn hình đăng nhập" — sau đợt này sai.
- `.env.example`: `SMTP_HOST/PORT/USER/PASSWORD/FROM`, `STAFF_OWNER_EMAIL`, và ghi rõ `AUTH_DEV_OTP`
  **không được** xuất hiện ở prod.
- `PRODUCT.md`: luồng "nhân viên vào hệ thống" hiện chưa mô tả ở đâu cả.
