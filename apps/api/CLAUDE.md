# apps/api — CLAUDE.md

Luật chung của repo ở [`../../CLAUDE.md`](../../CLAUDE.md). Đọc file đó trước.

Bun + Elysia + TypeBox. Export `type App` từ `src/index.ts` — đó là nguồn type cho Eden Treaty
ở cả hai frontend.

## Luồng bắt buộc: `routes → services → infra`

```
routes/    chỉ HTTP + response schema, KHÔNG logic, KHÔNG chạm hạ tầng
services/  orchestration, gọi Drizzle, mở transaction
db.ts      Bun.SQL + drizzle/bun-sql   ← chỗ DUY NHẤT biết driver là gì
env.ts     đọc + validate env, fail fast lúc khởi động
```

`routes/` **không được import** `db.ts` hay `env.ts`. ESLint chặn thật — nếu bạn thấy cần, nghĩa
là logic đó thuộc về `services/`.

Đổi driver Postgres = sửa **đúng một file** `db.ts`. Đường lùi sang `postgres-js` đã ghi sẵn
trong comment của file đó.

## Mọi route phải khai `response` schema

Không phải để đẹp: Elysia dùng response schema cho đường serialize nhanh, và đó là thứ làm Eden
suy được type ở frontend. Route không khai schema thì frontend nhận `unknown`.

## Mọi plugin phải có `name`

`new Elysia({ name: "..." })`. Thiếu `name` thì Elysia chạy lại plugin mỗi lần `.use()`.

## ⚠️ Khi có bảng `rentals`: bắt `23P01` → 409

Chống double-booking nằm ở tầng DB bằng exclusion constraint. Service **bắt buộc** bắt
`exclusion_violation` và dịch thành 409. Không bắt thì va chạm booking rơi ra thành 500.

**SQLSTATE của Bun.SQL nằm ở `.errno`, KHÔNG phải `.code`** — `.code` luôn là
`"ERR_POSTGRES_SERVER_ERROR"`. Viết `e.code === "23P01"` cho ra điều kiện không bao giờ đúng, và
unit test không bắt được vì phải có Postgres thật mới lộ. Chi tiết ở `../../CLAUDE.md`.

## Perf budget

`GET /health` p95 < 5ms · đọc một record < 25ms · availability < 50ms.
`bun run bench` exit 1 khi vượt. Vượt budget là fail, không phải góp ý.

## Auth — seam đã ghép, và luật là **mặc định chặn**

**`/auth/*` đi thẳng vào SuperTokens core.** `src/plugins/auth.ts` phơi nó qua framework `custom`
của `supertokens-node` (`PreParsedRequest` / `CollectingResponse`). Đăng ký, đăng nhập, session
đều chạy được. Kiểm:

```bash
# PHẢI ra: {"message":"Missing input param: formFields"}
curl -s -X POST localhost:3001/auth/signup -H 'content-type: application/json' -d '{}'
```

Ra được thông báo đó nghĩa là request **đã tới SuperTokens core**, không phải rơi vào 404 của
Elysia — đối chứng: `POST /auth/khong-ton-tai` trả **404**.

**`-H content-type` và `-d '{}'` là bắt buộc, không phải trang trí.** Thiếu body thì
`request.json()` ném và bạn nhận `Unexpected end of JSON input` — trông như auth hỏng trong khi
nó chạy tốt. Probe này **không tạo user**; đã kiểm bằng
`SELECT count(*) FROM supertokens.all_auth_recipe_users` trước và sau: đều bằng 0.

Signup đầy đủ (gửi `formFields` thật) cũng đã chạy end-to-end và trả `{"status":"OK"}` kèm user
id. **Đừng dùng bản đó làm probe thường xuyên** — nó ghi user thật vào DB, muốn dọn phải gọi
`POST http://localhost:3567/user/remove` với `api-key` và `cdi-version: 5.1`.

### Mặc định chặn — `src/plugins/staff-guard.ts`

Guard là plugin Elysia gắn `resolve` + `onBeforeHandle` phạm vi **`global`**, nối vào `index.ts`
**trước** mọi route nghiệp vụ. Route nào không khớp danh sách công khai thì phải có session **và**
hồ sơ `ACTIVE` trong `staff_users`. Route đợt sau (`rentals`, `customers`) **quên khai là bị
chặn**, không phải lọt — đó là toàn bộ điểm của plugin này: không ai phải _nhớ_ bật bảo vệ.

| Tình trạng                                     | HTTP  | `code`               | Ai trả                      |
| ---------------------------------------------- | ----- | -------------------- | --------------------------- |
| không có session, hoặc token hỏng/hết hạn      | `401` | `CHUA_DANG_NHAP`     | guard                       |
| token cấp **trước** mốc thu hồi của chủ nó     | `401` | `PHIEN_HET_HIEU_LUC` | guard                       |
| có session nhưng không có hàng `staff_users`   | `403` | `CHUA_CO_HO_SO`      | guard                       |
| `PENDING`                                      | `403` | `CHO_DUYET`          | guard                       |
| `DISABLED` (với token cấp **sau** mốc thu hồi) | `403` | `DA_KHOA`            | guard                       |
| `ACTIVE` nhưng sai role                        | `403` | `THIEU_QUYEN`        | `requireRole()` trong route |

Hai danh sách chứ không phải một: `CONG_KHAI` (không cần session) và
`CAN_SESSION_KHONG_CAN_ACTIVE` (**đúng một mục** — `GET /staff/me`, để màn "chờ duyệt" đọc được
chính trạng thái của mình). `DISABLED` bị chặn ở cả hai nhánh cần session.

Hàng thứ hai của bảng đứng **trên** mọi hàng `403` không phải để cho đẹp: xem mục kế tiếp.

Ba chi tiết trong file đó trông sửa được nhưng không:

- **Route công khai thoát sớm, KHÔNG chạm DB.** `/health` có perf budget p95 < 5 ms và không được
  mọc thêm một query vì đợt auth.
- **Guard nuốt `Session.Error` thành "chưa đăng nhập", và ném tiếp mọi lỗi khác.** Cờ
  `sessionRequired: false` chỉ lo ca "không có token gì cả" — token hết hạn hoặc hỏng thì
  `getSession` vẫn ném. Để nó bay ra ngoài thì Elysia trả 500, mà **500 không phải tín hiệu để
  `supertokens-web-js` đi refresh — 401 mới là**. Ngược lại, nuốt cả lỗi hạ tầng thì một sự cố
  Postgres hiện ra thành "bạn chưa đăng nhập".
- **`as: "global"`.** Đổi sang `scoped`/mặc định thì guard chỉ còn bảo vệ chính plugin nó, tức là
  không bảo vệ gì, và **không có gì báo lỗi**. `staff-guard.test.ts` giữ đúng cạnh này bằng một
  fixture route nằm trong plugin RIÊNG nối sau guard.

Probe — comment bên phải là **output thật**, chạy 2026-08-11 với API đang lên:

```bash
curl -s localhost:3001/staff/me            # {"message":"Chưa đăng nhập","code":"CHUA_DANG_NHAP"} 401
curl -s localhost:3001/staff/users         # 401, cùng body
curl -s localhost:3001/health              # {"status":"ok"} 200 — công khai
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/khong-ton-tai   # 404
```

**Dòng cuối là đối chứng bắt buộc, không phải thừa** — xem mục "Elysia trả 404 trước
`onBeforeHandle`" bên dưới.

Type `Role` (`OWNER` | `STAFF` | `SALES`) và `AuthContext` đã export sẵn ở `auth.ts`; nguồn thật
của role/status là `StaffRole`/`StaffStatus` ở `@v9/shared/domain/staff`.

### ⚠️ Thu hồi session cần **HAI** cơ chế — chúng giết hai loại token khác nhau

`Session.revokeAllSessionsForUser` **một mình là không đủ**, và cách nó thiếu thì im lặng: nó xoá
session ở core nên **refresh token chết ngay**, nhưng **access token đang cầm thì không**. Access
token của SuperTokens là **JWT tự xác thực cục bộ** — `getSession` không hỏi core trừ khi truyền
`checkDatabase: true`. Đo 2026-08-11 trên stack thật, với đúng cookie cũ sau khi đổi mật khẩu, khi
mới chỉ có `revokeSessions`:

```
/auth/session/refresh        → 401     (refresh token chết ngay)
supertokens.session_info     → 0 hàng  (core đã xoá session)
/staff/me  cùng cookie đó    → 200     ← VẪN SỐNG, tới khi token hết hạn (mặc định 1 giờ)
```

Cơ chế thứ hai là cột `staff_users.sessions_invalid_before`, và **nó mới là công tắc ngắt tức thì**:

| Cơ chế                                | Giết gì                   | Có hiệu lực khi nào                       |
| ------------------------------------- | ------------------------- | ----------------------------------------- |
| `revokeAllSessionsForUser`            | **refresh** token, ở core | ngay — nhưng chỉ chặn việc _gia hạn_      |
| `staff_users.sessions_invalid_before` | **access** token đang cầm | ngay ở request kế tiếp, qua `staff-guard` |

Nó rẻ vì **ăn theo lần đọc DB đã có**: guard đã `loadStaff()` một hàng `staff_users` ở mỗi request
được bảo vệ, cột mới đi kèm trong đúng câu `SELECT` đó. Đo được, không suy luận — đếm
`pg_stat_all_tables` quanh 200 lần `GET /staff/me`: `public.staff_users` **1,000 lượt quét/request**
và `supertokens.session_info` **0**. Thời điểm cấp token lấy từ `session.getAccessTokenPayload().iat`
— hàm **đồng bộ**, chỉ `return this.userDataInAccessToken`. **Đừng đổi sang `getTimeCreated()`**:
nó `await getSessionInformation()`, tức một lời gọi sang core cho **mỗi** request được bảo vệ, đúng
cái giá mà việc không dùng `checkDatabase: true` sinh ra để tránh.

Bất biến, và nó là thứ dễ vỡ nhất ở đây: **hễ gọi `revokeSessions` thì phải gọi
`dongDauThuHoiSession`**. Hiện có đúng hai chỗ — `doiMatKhauBangMa` (`services/password-reset.ts`)
và `disableStaff` (`services/staff.ts`). Thêm chỗ thứ ba mà quên đóng dấu là thủng lại y như cũ, và
không có gì báo. Thứ tự trong mỗi chỗ là **revoke trước, đóng dấu sau**: chết máy giữa hai lời gọi
theo thứ tự này để lại "refresh chết, access sống ≤1 giờ"; theo thứ tự ngược lại để lại "access
chết, refresh sống" — kẻ tấn công refresh một lần là có token mới cấp _sau_ mốc, tức sống mãi.

**⚠️ Cạm bẫy độ phân giải — chỗ dễ sai nhất.** `iat` của JWT tính bằng **giây** (làm tròn xuống),
`now()` của Postgres có micro giây. `tokenDaBiThuHoi` **phải** cắt mốc xuống giây rồi so `<` nghiêm
ngặt. So thẳng thì: đóng dấu 10:00:00.500 · người dùng đăng nhập lại 10:00:00.900 · token mang
`iat = 10:00:00` → bị coi là "trước mốc" → **đá văng chính người vừa đổi mật khẩu xong**, ngay lần
đăng nhập đầu tiên. Đó là biến "quên mật khẩu" thành tính năng không dùng được — hỏng nặng hơn lỗ
đang vá. Đánh đổi đã chấp nhận theo chiều ngược lại: token cấp trong **cùng giây** với lúc đóng dấu
sống sót; cửa sổ đó dưới một giây và không thu hẹp được vì `iat` không có độ phân giải nhỏ hơn.

Hệ quả cho test: một bài test chạy hết trong vài chục mili giây **nằm gọn trong cửa sổ đó** và sẽ
xanh/đỏ tuỳ vị trí so với biên giây. `staff-guard-thu-hoi.test.ts` đẩy mình ra khỏi cửa sổ bằng
`choSangGiayMoi()` — tường minh, có comment, không phải "sleep cho hết flaky".

**401, KHÔNG phải 403**, và phép kiểm đứng **trước** cả `DISABLED` lẫn ngoại lệ `/staff/me`:

- 401 là tín hiệu để interceptor của `supertokens-web-js` đi `/auth/session/refresh`; refresh thất
  bại (core đã xoá session) nên SDK dọn session và `apps/staff` đá người dùng về `/dang-nhap`. 403
  thì SDK **không** refresh, cookie rác nằm lại và người dùng kẹt ở màn lỗi.
- Đứng trước mọi phép kiểm trạng thái vì token cấp trước mốc **không còn là credential** — câu hỏi
  của tầng xác thực, phải trả lời trước mọi câu hỏi về quyền. Hệ quả quan sát được: người vừa bị
  khoá mà còn cầm token cũ nhận `401`, không phải `403 DA_KHOA`. Thông điệp "đã bị khoá" không mất
  — nó tới sau một vòng đăng nhập (SuperTokens không biết gì về `staff_users` nên vẫn cho đăng
  nhập), và lúc đó token mới nằm sau mốc.

### ⚠️ `POST /auth/user/password/reset/token` PHẢI trả **404**

Luồng đặt lại mật khẩu dựng sẵn của SuperTokens đã bị **tắt** bằng `override.apis`
(`generatePasswordResetTokenPOST: undefined`, `passwordResetPOST: undefined`). Luồng thật của ta là
mã 6 số ở `/staff/password-reset/*`.

```bash
# PHẢI ra 404. Ra 400 (hay bất cứ gì khác) = override đã mất.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3001/auth/user/password/reset/token \
  -H 'content-type: application/json' \
  -d '{"formFields":[{"id":"email","value":"a@b.vn"}]}'
```

400 nghĩa là API đó **sống lại**, và hệ thống có **hai** luồng đặt lại mật khẩu song song — một
cái gửi mail từ `noreply@supertokens.io` qua dịch vụ hosted mặc định mà không ai trong shop biết là
có. Hỏng theo kiểu không ai nhìn thấy: luồng của ta vẫn chạy đúng, nên không có test nào đỏ.

### ⚠️ `CollectingResponse` tách cookie **ra khỏi** headers

`CollectingResponse.cookies` là một mảng `CookieInfo` **riêng**, không nằm trong `.headers` —
adapter `custom` không biết framework đích biểu diễn `Set-Cookie` kiểu gì. Forward mỗi `.headers`
thì `POST /auth/signin` vẫn trả `{"status":"OK"}` mà **không có một header `Set-Cookie` nào**:
đăng nhập "thành công", session không bao giờ tồn tại trong trình duyệt, và không có lỗi ở đâu cả.

Phải duyệt `.cookies` và `serializeCookieValue(...)` từng cái. Và **`.append`, KHÔNG `.set`**: một
response mang nhiều cookie (`sAccessToken`, `sRefreshToken`, cộng cookie xoá lúc signout). `.set`
chỉ giữ cái cuối — mất access token thì session chết sau đúng một chu kỳ refresh, tức **hỏng muộn
và trông như một lỗi khác**. `auth.test.ts` giữ chỗ này bằng một lần đăng nhập thật.

### ⚠️ KHÔNG dùng `.state()` của Elysia để mang danh tính người gọi

`store` của Elysia là **một object dùng chung cho cả tiến trình**, không phải per-request. Hai
request đồng thời ghi đè lên nhau và request này đọc ra nhân viên của request kia — đó là lỗ hổng
phân quyền, và nó **chỉ lộ ra khi có tải**, nên không unit test đơn lẻ nào bắt được.

Dùng `resolve({ as: "global" }, ...)`. Vòng đời Elysia: **`transform` → `derive`/`resolve` →
`beforeHandle`**, nên `staff` đã sẵn sàng khi hook chặn chạy, và guard với route dùng chung **đúng
một** lần đọc DB (`/staff/me` cố ý không gọi `loadStaff` lần nữa — đó là đường nóng nhất của
`apps/staff`).

### ⚠️ Elysia trả **404 TRƯỚC** khi `onBeforeHandle` chạy

Guard chỉ bảo vệ được route **có thật**. Route chưa đăng ký ra 404, không phải 401.

Quan trọng khi viết probe, vì hai kết quả trông giống nhau ở chỗ "không vào được": `/staff/me` ra
**404 nghĩa là route chưa đăng ký** (ai đó bỏ `.use(staff)` khỏi `index.ts`), **không** phải guard
đang chặn. Chỉ **401** mới chứng minh cả hai vế: route tồn tại VÀ hàng rào phủ lên nó. Trước đợt
auth, đúng đường dẫn đó cũng "không vào được" — bằng 404, tức là không có hàng rào nào cả.

### ⚠️ `original` trong `override.apis` là **Proxy** — đừng destructure

`supertokens-js-override` trả về một Proxy; getter của nó sinh ra hàm đọc `this._call`. Viết
`apis: ({ signUpPOST, ...original }) => ...` rồi gọi `signUpPOST(input)` trần là làm mất `this`, và
**mọi** lần đăng ký nổ:

```
TypeError: undefined is not an object (evaluating 'this._call')
  at supertokens-js-override/lib/build/getProxyObject.js:27:24
```

Bắt buộc gọi qua object: `original.signUpPOST!(input)`.

Chỗ này dễ tái phát vì lý do rất tầm thường: dấu `!` ở đó **trông y hệt** một non-null assertion
lười biếng mà người sau sẽ muốn dọn — và cách dọn tự nhiên nhất, destructure cho gọn, chính là cách
làm vỡ. `!` đó là ràng buộc **lúc chạy**, không phải chuyện thu hẹp kiểu. Khác các bẫy còn lại
trong mục này, cái này **không** hỏng im lặng: nó giết toàn bộ luồng đăng ký bằng 500.

## ⚠️ `SELECT ... FOR UPDATE`: cùng transaction là **cần nhưng không đủ**

Mức cô lập mặc định là `READ COMMITTED`, và ở mức đó một `SELECT` — **kể cả `count(*)`** — không
khoá hàng nào; nó chỉ đọc snapshot tại thời điểm câu lệnh bắt đầu. Nên "đếm rồi kiểm rồi ghi, tất
cả trong một transaction" vẫn để lọt hai lời gọi song song.

Đã đo, không suy luận: bỏ `FOR UPDATE` khỏi `countActiveOwnersLocked` thì **hai OWNER cùng tự hạ
role đều thành công** — cả hai đọc được count = 2, cả hai đi qua điều kiện "còn hơn một OWNER", và
shop mất OWNER cuối cùng dù xét riêng từng lời gọi đều hợp lệ.

Ba chỗ trong `services/` dựa vào cùng lý lẽ này, và cả ba đều có chú thích tại chỗ:

| Chỗ                       | Cách đóng cổng                                     | Hỏng thế nào nếu bỏ                                                                                                                                                          |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `countActiveOwnersLocked` | các hàng OWNER đang `ACTIVE` (`ORDER BY id`)       | mất OWNER cuối cùng; `ORDER BY id` là để hai transaction khoá cùng thứ tự, tránh deadlock `40P01`                                                                            |
| `taoMaDatLaiMatKhau`      | hàng `staff_users` của chính người xin mã          | bất biến "tối đa một mã `used_at IS NULL`" vỡ — đo được: 8 lời gọi song song để lại 5 mã cùng sống, và các mã cũ hơn thành vô hiệu với chính người vừa nhận email chứa chúng |
| `kiemTraMa`               | không khoá — **dồn `attempts < 5` vào câu UPDATE** | check-then-act với argon2 ~115 ms ở giữa: đo được **20/20** lần đoán song song đi qua cổng "tối đa 5 lần"                                                                    |

Dòng cuối là chỗ tinh vi nhất và đáng đọc kỹ: bộ đếm vẫn **tăng đúng** (`attempts + 1` tính ở
Postgres), nên nhìn vào DB sau đó thấy `attempts = 20` và tưởng hàng rào đang chạy. **Đếm đúng ≠
chặn đúng.** Cổng phải nằm trong chính `WHERE` của câu `UPDATE` để Postgres đọc lại hàng và áp lại
điều kiện sau khi câu trước commit. Đừng tách nó ra thành `if` ở JS cho "dễ đọc".

Khoá **phải** đặt qua `tx`, không phải `db`: gọi `db` bên trong callback của `db.transaction` mở
một **connection khác**, và khoá đặt trên đó vô nghĩa với transaction đang chạy.

## Test của `apps/api` — hai bẫy đã cắn thật

Test ở đây chạm Postgres thật (`docker compose up -d`), và cả hai bẫy dưới đây đều **không làm test
đỏ** — chúng làm test xanh vì lý do sai.

**① `bun test` chạy MỌI file trong MỘT tiến trình, dùng chung module cache.** `db.ts` export một
client singleton, nên gọi `client.close()` trong `afterAll` của một file test là **giết kết nối của
cả tiến trình**. File test thứ hai chạm `../db` chết ở `beforeAll` với
`ERR_POSTGRES_CONNECTION_CLOSED` — và thứ tự nạp file do **Bun** quyết, không theo thứ tự bạn gõ
trên dòng lệnh, nên triệu chứng đổi chỗ giữa các lần chạy. Đã đo ở cả hai thứ tự. Đừng đóng
singleton trong test; để tiến trình thoát với client còn mở.

**② `afterAll(clean)` với `clean` trả về query builder của Drizzle KHÔNG dọn gì.** Query builder là
_thenable_ nhưng **không phải** `instanceof Promise`, và Bun chỉ đợi khi hook trả về một Promise
thật. Hook "xong" ngay trong khi `DELETE` còn đang bay, tiến trình thoát trước khi câu lệnh chạm
Postgres, và hàng `ztest-%` sống sót qua một lần chạy trông rất sạch.

```ts
afterAll(clean); // ❌ im lặng không dọn gì
afterAll(async () => {
  await clean();
}); // ✅
```

Hai quy ước đi kèm, cùng lý do: dọn ở **cả** `beforeAll` lẫn `afterAll` (`afterAll` không chạy khi
lần trước bị Ctrl-C), và fixture của `routes/staff.test.ts` được viết để **chạy lại được** thay vì
để dọn — file trong `routes/` bị boundaries cấm import `../db`, nên nó không có đường xoá hàng.

## Chạy

```bash
docker compose up -d                                  # postgres + minio
bun --env-file=.env run --filter @v9/api dev          # cần --env-file, xem CLAUDE.md gốc
curl localhost:3001/health        # {"status":"ok"}
curl localhost:3001/health/deep   # kiểm tra thật cả postgres lẫn minio
```
