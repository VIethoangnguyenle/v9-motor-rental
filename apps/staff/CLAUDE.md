# apps/staff — CLAUDE.md

Luật chung của repo ở [`../../CLAUDE.md`](../../CLAUDE.md). Đọc file đó trước.

Vite + TanStack Router/Query, **PWA**. App vận hành nội bộ cho chủ shop và nhân viên.
Role `OWNER`, `STAFF`; `SALES` để dành, chưa định nghĩa làm gì.

Bốn tính năng chính **chưa làm**, mỗi cái cần brainstorm nghiệp vụ riêng: lịch · thống kê ·
lên đơn/bàn giao xe · quản lý khách hàng. Hiện chỉ có một trang `health` chứng minh đường Eden
typed nối được tới `apps/api`.

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

|                              | `apps/staff`                                     | `apps/web`                                |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------- |
| Framework                    | Vite 8                                           | Next 16                                   |
| Mô hình                      | client-first (SPA + TanStack Query)              | server-first (RSC)                        |
| Biến env                     | `import.meta.env.VITE_*`, **nướng lúc build**    | `process.env.NEXT_PUBLIC_*`, đọc lúc chạy |
| JSX                          | `jsx: "react-jsx"`                               | `jsx: "preserve"`                         |
| `exactOptionalPropertyTypes` | tắt                                              | tắt                                       |
| SEO                          | vô nghĩa                                         | quan trọng                                |
| impeccable                   | audit nhẹ, **không polish trừ khi được yêu cầu** | app chính                                 |

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

## ⚠️ Icon đang là placeholder — trình duyệt **im lặng** không mời cài app

`public/icon-192.png` (547B) và `icon-512.png` (1.8K) hiện là **ô màu đặc**, chưa phải logo thật.
Thiếu hoặc sai file icon thì trình duyệt không hiện lời mời cài đặt — **không báo lỗi ở đâu cả**,
không có warning trong console, manifest vẫn parse được.

Shop đã có logo ngoài đời. Thay hai file này trước khi ship.

## Xác thực: SuperTokens — đã nối ở API, **chưa có màn hình đăng nhập ở đây**

`apps/api` đã phơi `/auth/*` qua SuperTokens core (xem `../api/CLAUDE.md`). App này **chưa** có
màn hình đăng nhập và **chưa** route nào enforce. Có chủ ý: chưa có route nghiệp vụ nào để bảo vệ.

Khi làm màn hình đăng nhập, `websiteDomain` và `websiteBasePath` của SuperTokens đã trỏ sẵn về
`STAFF_APP_URL` + `/auth` — xem `apps/api/src/plugins/auth.ts`.

## Bắt buộc khai `typecheck` trong `package.json`

Đã khai rồi, đừng gỡ. `bun run --filter '*'` **im lặng bỏ qua** workspace thiếu script rồi vẫn
exit 0 — gỡ nó ra thì `bun run typecheck` ở root vẫn xanh mà không kiểm package này.

## Chạy

```bash
bun run --filter @v9/staff dev       # cổng ${STAFF_PORT:-3003}
bun run --filter @v9/staff build     # tsc --noEmit rồi vite build
bun run --filter @v9/staff preview   # bản build — CHỖ DUY NHẤT kiểm được PWA
```
