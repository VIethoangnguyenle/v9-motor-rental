---
name: v9-web
description: Luật viết code trong apps/web (Next 16, SSG/ISR, SEO quan trọng): app này KHÔNG chốt đơn chỉ tạo yêu cầu, phải tôn trọng DESIGN.md/PRODUCT.md, ảnh Directus hỏng ở dev, và NEXT_PUBLIC_* nướng lúc build. Dùng TRƯỚC khi sửa bất cứ file nào trong apps/web.
---

# apps/web

Kiến trúc chung: [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) · Quy trình: [`CLAUDE.md`](../../../CLAUDE.md) · ADR: Serena memory `architecture/*`.

## ⚠️ App này KHÔNG chốt đơn — chỉ tạo yêu cầu

Đây là ràng buộc sản phẩm quan trọng nhất của app, và nó dễ bị vi phạm bằng một câu copy vô ý.

Khách **xem mẫu xe** và **gửi yêu cầu thuê**. Yêu cầu đi vào hệ thống; **nhân viên** tiếp nhận và
chốt thành đơn thuê thật trong `apps/staff`. Web không đọc availability thời gian thực và không
biết xe có còn trống hay không.

**Hệ quả cho copy — luật cứng:** không câu nào trên app này được **hứa** rằng xe còn trống, rằng
đơn đã được xác nhận, hay rằng ngày khách chọn đã được giữ. Đúng cách nói:

> "Đã nhận yêu cầu. Shop sẽ liên hệ với bạn để xác nhận xe và thời gian."

Sai — dù nghe hay hơn:

> ~~"Đặt xe thành công! Xe của bạn đã được giữ cho ngày 12/8."~~

Hứa sai ở đây tạo ra khách bực bội, và **không ai phát hiện cho tới lúc gọi điện**. Copy đã có
sẵn trong `messages/vi.json` dưới khoá `booking` — dùng lại, đừng viết câu mới.

**Hệ quả kỹ thuật:** vì không cần availability thời gian thực, trang danh sách và trang chi tiết
xe tĩnh hoàn toàn được. Đó đúng là lý do Next được chọn. Xem §3.3 của
[`../../docs/plans/2026-08-05-round2-directus-staff-design.md`](../../docs/plans/2026-08-05-round2-directus-staff-design.md).

## SEO là lý do app này dùng Next

Đây là điều duy nhất phân biệt nó với `apps/staff` (Vite PWA). Ưu tiên SSG/ISR; tránh
`force-dynamic` trừ khi có lý do viết ra thành chữ. Trang chủ hiện dùng `revalidate = 60`.

## UI phải tôn trọng `DESIGN.md` và `PRODUCT.md`

[`../../DESIGN.md`](../../DESIGN.md) là hệ thiết kế của app này — nền **BMW M** (từ
`VoltAgent/awesome-design-md`) đã adapt bảy chỗ cho V9. [`../../PRODUCT.md`](../../PRODUCT.md) là
ràng buộc sản phẩm. Khán giả: dân chơi mô tô phân khối lớn người Việt ở TP.HCM **cộng** khách du
lịch nước ngoài.

Tóm tắt để không phải mở file: nền đen tuyền · **ảnh xe gánh toàn bộ năng lượng** · Archivo,
tiêu đề 700 HOA / thân bài 300 · **góc 0px, không bo nút** · không đổ bóng, không gradient ·
lưới xe 3-up.

**Styling: Tailwind v4**, cắm qua PostCSS (`postcss.config.mjs`). **Không có `tailwind.config.js`**
— token khai bằng `@theme` trong `app/globals.css`. Dùng utility (`bg-canvas`, `text-ink`,
`py-section`), **không hard-code hex, không arbitrary value** cho màu/thang cách. Thang chữ và
hình dạng nút là `@utility` (`display-xl`, `label-upper`, `btn-shape`) — dùng lại, đừng viết tay.

**Ba thứ khác bản BMW gốc, đừng "sửa lại cho giống":** `line-height` display **1.15** (ở 1.0 dấu
tiếng Việt đâm dòng trên, đã render kiểm chứng) · **không dùng Inter** dù file gốc khuyên thế ·
accent lấy từ **logo thật của shop**, không phải M tricolor.

⛔ **Màu accent chưa chốt** — chờ file logo. Cho tới lúc đó dựng đơn sắc trắng-đen, **không bịa
màu**. Xem §9 của `DESIGN.md`.

**Cấm rõ**: thẩm mỹ SaaS generic — gradient tím, Inter ở mọi nơi, card lồng card.

`impeccable` áp dụng cho app này (không phải cho `apps/staff`, nơi ưu tiên chức năng).

## i18n mới là seam, chưa phải hệ thống

`messages/vi.json` + `NEXT_PUBLIC_DEFAULT_LOCALE`. **Chưa cài `next-intl`** — hiện có đúng một
ngôn ngữ, dựng bộ máy routing đa ngôn ngữ lúc này là chi phí không có người trả. Thêm khi thật sự
có tiếng Anh, không sớm hơn.

## ⚠️ Ảnh Directus hỏng sạch ở dev — và thông báo lỗi trỏ nhầm chỗ

Triệu chứng: mọi ảnh xe qua `next/image` trả **400** với

```
"url" parameter is not allowed
```

Câu đó đọc như `remotePatterns` khai thiếu. **Không phải.** `remotePatterns` trong
`next.config.ts` đã đúng và vẫn đúng — đi sửa nó là mất buổi chiều.

Nguyên nhân thật là **chốt chặn thứ hai**: Next 16.3 thêm một SSRF guard trong
`fetchExternalImage`, từ chối mọi ảnh remote có host **resolve về IP private**, rồi gộp lỗi đó vào
đúng cùng một thông báo với lỗi `remotePatterns`. Ở dev, Directus là `localhost:8055` — private —
nên **mọi** ảnh xe bị chặn, kể cả khi cấu hình hoàn toàn đúng.

Đổi sang IP LAN **không cứu được**: `192.168.x.x` cũng nằm trong dải private, cùng `10.x`,
`172.16–31.x` và `127.x`. Không có địa chỉ nội bộ nào lách qua guard này, vì bịt đúng chúng là
việc guard sinh ra để làm.

Cách xử lý đã chọn, trong `next.config.ts`:

```ts
dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
```

**Cờ này KHÔNG được true ở production, và biểu thức trên là lý do nó an toàn** — không phải một
`true` kèm lời hứa nhớ tắt. Bật ở prod là mở lại đúng lỗ SSRF mà guard dựng lên để bịt: image
optimizer nhận URL từ **query string của người ngoài**, nên một cờ mở sẽ biến `/_next/image` thành
công cụ để người lạ bắt server đi fetch địa chỉ nội bộ của chính hạ tầng — metadata endpoint của
cloud, service chỉ nghe trên mạng riêng, Postgres, MinIO — rồi đọc kết quả qua response. Đó là
port scan có ủy quyền, chạy từ bên trong.

Prod không cần cờ này: `NEXT_PUBLIC_DIRECTUS_URL` trỏ vào host công khai (`data.<domain>`), host đó
resolve ra IP public, guard cho qua. Nếu một ngày ảnh prod hỏng vì guard, câu trả lời đúng là **sửa
địa chỉ Directus**, không phải mở cờ.

## ⚠️ Build không cần API, nhưng hỏng im lặng nếu API chết

Với `revalidate = 60`, Next fetch `/health` ngay lúc `next build`. Nếu API không tới được, Eden
trả `{data: null, error}` chứ không ném lỗi — **build vẫn thành công** và nướng chuỗi lỗi vào HTML
tĩnh. Trang deploy ra hiển thị trạng thái lỗi cho tới khi ISR revalidate sau 60 giây kể từ request
thật đầu tiên.

Không phải lỗi build, nhưng là một phút xấu xí sau mỗi lần deploy. Biết trước để không đi debug
nhầm chỗ.

## ⚠️ `NEXT_PUBLIC_*` nướng lúc build, KHÔNG đọc lúc chạy

Điểm này từng bị ghi ngược ở ba chỗ (`.env.example`, bảng so sánh dưới đây, `compose.prod.yaml`)
và cả ba đều đã sửa. Next thay `process.env.NEXT_PUBLIC_*` bằng **hằng số lúc compile** — không
chỉ trong bundle client mà **cả trong chunk SSR**. Đo trên bản dựng:

```bash
bun --env-file=.env run --filter @v9/web build
grep -r "process.env.NEXT_PUBLIC_API_URL" .next/server/   # → rỗng
grep -ro '("http://localhost:3001")' .next/server/chunks/ssr/  # → có
```

Hệ quả thực tế: đổi `NEXT_PUBLIC_API_URL` hay `NEXT_PUBLIC_DIRECTUS_URL` trong compose rồi
restart container **không có tác dụng gì**. Phải build lại image; `deploy.yml` truyền cả hai qua
`--build-arg`. Đây đúng là ràng buộc đã ghi cho `VITE_API_URL` của `apps/staff` — hai app giống
nhau ở điểm này, không khác nhau.

Biến runtime thật duy nhất của web là `PORT`, do `server.js` của bản standalone đọc.

## Khác biệt với apps/staff

|           | `apps/web`                                   | `apps/staff`                              |
| --------- | -------------------------------------------- | ----------------------------------------- |
| Framework | Next 16                                      | Vite                                      |
| Mô hình   | server-first (RSC)                           | client-first (SPA + TanStack Query)       |
| Biến env  | `process.env.NEXT_PUBLIC_*`, nướng lúc build | `import.meta.env.VITE_*`, nướng lúc build |
| JSX       | `jsx: "preserve"`                            | `jsx: "react-jsx"`                        |
| SEO       | quan trọng                                   | vô nghĩa                                  |

## Chạy

```bash
bun run --filter @v9/web dev
bun run --filter @v9/web build    # -> .next/standalone
```
