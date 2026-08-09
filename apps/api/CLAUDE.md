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

## Seam auth — **đã ghép SuperTokens**, nhưng chưa route nào enforce

Đọc kỹ hai vế, đừng gộp làm một.

**Đã có thật:** `src/plugins/auth.ts` phơi `/auth/*` qua framework `custom` của `supertokens-node`
(`PreParsedRequest` / `CollectingResponse`). Đăng ký, đăng nhập, session đều chạy được. Kiểm:

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

**Chưa có:** không route nghiệp vụ nào enforce auth, và chưa có màn hình đăng nhập ở `apps/staff`.
Có chủ ý — chưa có route nghiệp vụ nào để bảo vệ, mà một cơ chế phân quyền chưa từng chạy còn tệ
hơn không có: nó trông như đã kiểm chứng trong khi không.

Type `Role` (`OWNER` | `STAFF` | `SALES`) và `AuthContext` đã export sẵn ở cùng file.
Tìm bằng `grep -rn "SEAM: JWT auth"`.

## Chạy

```bash
docker compose up -d                                  # postgres + minio
bun --env-file=.env run --filter @v9/api dev          # cần --env-file, xem CLAUDE.md gốc
curl localhost:3001/health        # {"status":"ok"}
curl localhost:3001/health/deep   # kiểm tra thật cả postgres lẫn minio
```
