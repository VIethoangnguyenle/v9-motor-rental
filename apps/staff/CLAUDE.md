# apps/staff — CLAUDE.md

Luật chung của repo ở [`../../CLAUDE.md`](../../CLAUDE.md). Đọc file đó trước.

Vite + TanStack Router/Query, **PWA**. App vận hành nội bộ cho chủ shop và nhân viên.
Role `OWNER`, `STAFF`; `SALES` để dành, chưa định nghĩa làm gì.

Bốn tính năng chính **chưa làm**, mỗi cái cần brainstorm nghiệp vụ riêng: lịch · thống kê ·
lên đơn/bàn giao xe · quản lý khách hàng.

Đã có: **đăng nhập / đăng ký / quên mật khẩu / chờ duyệt / quản lý nhân viên**, cộng trang `health`
cũ — nay nằm dưới nhánh được bảo vệ, xem mục xác thực bên dưới.

## Styling: Tailwind v4, theme mặc định — **không** dùng `DESIGN.md`

Cắm qua **Vite plugin** (`@tailwindcss/vite` trong `vite.config.ts`), khác `apps/web` vốn đi qua
PostCSS. Hai cơ chế build khác nhau nên hai cách cắm; không có `tailwind.config.js` ở cả hai (v4
khai theme trong CSS).

`src/index.css` **cố ý không khai `@theme` riêng** — chưa có màn hình nghiệp vụ nào để rút token
ra. Khi làm lịch/thống kê/bàn giao thì mới thêm.

`../../DESIGN.md` là hệ thị giác của `apps/web` (site công khai, ảnh dẫn dắt, SEO). App này ưu
tiên **chức năng và mật độ thông tin** — đừng bê nền đen tuyền và typography 60px sang đây.

## SEO vô nghĩa ở đây — đó là lý do không dùng Next

Đây là điều duy nhất phân biệt app này với `apps/web`. Đừng "thống nhất" hai frontend về một
framework: `apps/web` giữ Next vì SEO chính là lý do Next được chọn ở đó.

|                              | `apps/staff`                                     | `apps/web`                                            |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Framework                    | Vite 8                                           | Next 16                                               |
| Mô hình                      | client-first (SPA + TanStack Query)              | server-first (RSC)                                    |
| Biến env                     | `import.meta.env.VITE_*`, **nướng lúc build**    | `process.env.NEXT_PUBLIC_*`, **cũng nướng lúc build** |
| JSX                          | `jsx: "react-jsx"`                               | `jsx: "preserve"`                                     |
| `exactOptionalPropertyTypes` | tắt                                              | tắt                                                   |
| SEO                          | vô nghĩa                                         | quan trọng                                            |
| impeccable                   | audit nhẹ, **không polish trừ khi được yêu cầu** | app chính                                             |

Dòng "biến env" **không** phải một khác biệt: Next thay `process.env.NEXT_PUBLIC_*` bằng hằng số
lúc compile, kể cả trong chunk SSR — hai app giống hệt nhau ở điểm này. Bảng này từng ghi ngược
(cùng lỗi đã sửa ở `.env.example`, `apps/web/AGENTS.md`, `compose.prod.yaml`); bằng chứng đo được ở
`../web/AGENTS.md`, mục `NEXT_PUBLIC_*`.

## ⚠️ `VITE_API_URL` bị nướng vào bundle **lúc build**

`src/lib/api.ts` đọc `import.meta.env.VITE_API_URL` — Vite thay thế nó bằng **hằng chuỗi** lúc
build. Đặt biến đó lúc chạy trong compose **không có tác dụng gì**.

Đổi API URL của staff ⇒ **bắt buộc build lại image**. `deploy.yml` truyền nó qua `--build-arg`.

Có fallback `?? "http://localhost:3001"` nên quên set biến thì app vẫn build và vẫn chạy — rồi
gọi vào localhost của **máy người dùng**. Hỏng im lặng, không có lỗi ở đâu cả.

## ⚠️ PWA **không** chạy ở chế độ dev

`vite-plugin-pwa` không chèn link manifest và không đăng ký service worker ở `vite dev`, trừ khi
bật `devOptions.enabled` (hiện **không** bật). Nghĩa là **mọi hành vi PWA chỉ quan sát được trên
bản build**:

```bash
bun run --filter @v9/staff build
bun run --filter @v9/staff preview
```

Kiểm ở dev rồi kết luận "PWA hỏng" là kết luận sai. Đây là lỗi dễ mắc nhất với app này.

### `navigateFallbackDenylist` **hôm nay không chặn gì** — và vẫn nên giữ

`vite.config.ts` khai `navigateFallbackDenylist: [/^\/auth\//, /^\/staff\//]`. Đọc nó như một hàng
rào là đọc sai:

| Điều                                                          | Thực tế                                                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nó áp cho request nào?                                        | chỉ request `mode: "navigate"` — tức người gõ URL / bấm link, **không** phải `fetch`                                                                                                             |
| Hôm nay có khớp gì không?                                     | **không**. Eden và `supertokens-web-js` gọi API bằng `fetch` sang **origin khác** (`VITE_API_URL`, mặc định `:3001`); app chạy ở `:3003`                                                         |
| Vậy giữ làm gì?                                               | bảo hiểm rẻ cho một thay đổi rất dễ xảy ra: proxy API về cùng origin (`staff.$ROOT_DOMAIN/auth/*`) để né CORS. Ngày đó tới mà thiếu dòng này thì app shell được trả cho đường API — hỏng im lặng |
| Vậy cái gì thật sự chặn "session chết, màn hình cũ vẫn hiện"? | guard ở `beforeLoad` (mục xác thực bên trên): nó gọi `/staff/me` qua mạng và hỏng-thì-chặn                                                                                                       |

Đừng dựa vào dòng đó cho ca session chết, và cũng đừng xoá nó vì "không thấy nó làm gì".

## ⚠️ Icon đang là placeholder — trình duyệt **im lặng** không mời cài app

`public/icon-192.png` (547B) và `icon-512.png` (1.8K) hiện là **ô màu đặc**, chưa phải logo thật.
Thiếu hoặc sai file icon thì trình duyệt không hiện lời mời cài đặt — **không báo lỗi ở đâu cả**,
không có warning trong console, manifest vẫn parse được.

Shop đã có logo ngoài đời. Thay hai file này trước khi ship.

## Xác thực: năm màn hình, và **một** hàng rào ở `beforeLoad`

Cây route chia **hai nhánh**, và việc treo route vào nhánh nào _là_ toàn bộ cơ chế phân quyền của
app này:

| Nhánh                       | Route                                                       | Vì sao nằm ở đó                                                                                           |
| --------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| công khai (`cong-khai`)     | `/dang-nhap` · `/dang-ky` · `/quen-mat-khau` · `/cho-duyet` | ba cái đầu hiển nhiên; `/cho-duyet` thì **không** — xem ngay dưới                                         |
| được bảo vệ (`duoc-bao-ve`) | `/` (health) · `/nhan-vien` (chỉ OWNER)                     | guard chạy ở `beforeLoad` của chính layout route này, nên mọi route con được bảo vệ mà không phải khai gì |

**Không kiểm quyền trong component.** Chỗ duy nhất để treo một trang mới là `getParentRoute`, và cả
hai lựa chọn đều hiện ra trong diff. Một trang tự gọi `useQuery(meQuery)` rồi tự kiểm là một trang
mở toang ngay lần đầu ai đó quên — và nó im lặng.

Guard làm đúng bốn việc, theo thứ tự: `Session.doesSessionExist()` sai → `/dang-nhap` · đọc
`/staff/me` qua `ensureQueryData` (không được thì coi như không vào được) · `PENDING` →
`/cho-duyet` · `DISABLED` → **`signOut()` trước** rồi mới về `/dang-nhap?ly_do=da-khoa`.

Thứ tự ở ca cuối không phải chi tiết: để nguyên session của người bị khoá thì họ quay lại `/`, guard
chạy lại đúng vòng đó, và app kẹt trong vòng chuyển hướng vô tận.

**`/cho-duyet` là route công khai, dù chỉ người đã đăng nhập mới thấy nội dung thật.** Nó phải mở
được bởi tài khoản `PENDING` — mà `PENDING` chính là thứ guard đá ra. Treo nó dưới `duoc-bao-ve` là
tạo một vòng lặp chuyển hướng. Cùng lý lẽ với ngoại lệ `GET /staff/me` ở
`apps/api/src/plugins/staff-guard.ts`: người đang chờ duyệt phải đọc được **lý do** họ bị chặn, nếu
không họ nhìn một màn hình trắng.

**Trang `/` (health) nằm dưới nhánh được bảo vệ CÓ CHỦ Ý.** Nó là bằng chứng end-to-end rằng guard
thật sự chạy. Nếu hàng rào chỉ phủ lên những trang chưa ai mở thì nó chưa được chứng minh gì —
đúng kiểu "cơ chế trông như đang bảo vệ" mà CLAUDE.md gốc đếm được bốn lần.

**Hai hàng rào cho `/nhan-vien`, làm hai việc khác nhau.** `beforeLoad` kiểm `context.me.role !==
"OWNER"` là hàng rào của **trải nghiệm**; hàng rào của **dữ liệu** nằm ở server
(`/staff/users*` trả `403 THIEU_QUYEN`). Bỏ cái ở đây thì `STAFF` không thấy dữ liệu — họ thấy một
trang trống toàn lỗi 403. Bỏ cái ở server thì mất thật.

### `Session.init()` vá `window.fetch` — Eden ăn theo, không phải bọc lại

`lib/auth.ts` gọi `SuperTokens.init()` với `apiDomain` + `apiBasePath: "/auth"`. `Session.init()`
vá `window.fetch`: request tới `apiDomain` được thêm `credentials: "include"`, và khi access token
hết hạn thì tự gọi `/auth/session/refresh` rồi chạy lại request.

Eden Treaty tra `fetch` từ global scope ở **mỗi lần gọi** (`{ fetcher = fetch }` nằm trong thân
proxy, không bắt tham chiếu lúc import), nên `lib/api.ts` hưởng nguyên cơ chế đó mà không phải bọc
gì. Đây là lý do chọn `supertokens-web-js` thay vì tự `fetch` thẳng vào `/auth/*`.

Ba chỗ hỏng im lặng quanh nó:

- **`initAuth()` phải chạy trước lần render đầu tiên** (`main.tsx` gọi nó ở dòng đầu). Gọi sau thì
  request bay ra trong khoảng đó đi bằng `fetch` chưa vá — không cookie, không refresh — và triệu
  chứng là "thỉnh thoảng 401", không phải một lỗi đọc được.
- **`apiDomain` ở `lib/auth.ts` và base URL ở `lib/api.ts` phải bằng nhau.** Hai chỗ, hai fallback
  `http://localhost:3001` riêng. Lệch nhau thì interceptor không nhận ra request của Eden là request
  "cùng API" và bỏ qua nó.
- **`queryClient` truyền vào router qua tham số, không phải import một singleton.** Guard ghi
  `/staff/me` vào cache; nếu đó không đúng cache mà `QueryClientProvider` đang phát cho cây React
  thì guard đọc xong mà màn hình vẫn trống, và không có lỗi ở đâu cả.

Kiểu `Me` **suy ra** từ `response` schema của `GET /staff/me` (`lib/me.ts`), không gõ tay lại. Gõ
tay một `interface` nữa là dựng bản sao thứ hai của hợp đồng API: nó biên dịch được cho tới ngày
`routes/staff.ts` đổi một field, và ngày đó chỗ sai không phải chỗ nổ. Không dùng `as` ở bất kỳ đâu
trong app — mọi ép kiểu ở frontend là dấu hiệu đã đoán sai hình dạng API.

## Bắt buộc khai `typecheck` trong `package.json`

Đã khai rồi, đừng gỡ. `bun run --filter '*'` **im lặng bỏ qua** workspace thiếu script rồi vẫn
exit 0 — gỡ nó ra thì `bun run typecheck` ở root vẫn xanh mà không kiểm package này.

## Chạy

```bash
bun run --filter @v9/staff dev       # cổng ${STAFF_PORT:-3003}
bun run --filter @v9/staff build     # tsc --noEmit rồi vite build
bun run --filter @v9/staff preview   # bản build — CHỖ DUY NHẤT kiểm được PWA
```
