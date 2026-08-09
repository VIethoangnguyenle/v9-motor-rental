<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# apps/web — luật của repo

> Nội dung phía trên cặp marker `nextjs-agent-rules` do `next dev` tự sinh và tự ghi lại.
> Đừng sửa nó. Phần dưới đây là của chúng ta và sẽ sống sót.
>
> `CLAUDE.md` trong thư mục này chỉ là con trỏ `@AGENTS.md` — cũng do Next sinh. Nội dung thật ở đây.

Luật chung của repo ở [`../../CLAUDE.md`](../../CLAUDE.md). Đọc file đó trước.

Next 16 App Router, `output: "standalone"`. Site công khai cho khách thuê xe.

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

## UI phải tôn trọng PRODUCT.md — `DESIGN.md` **chưa tồn tại**

[`../../PRODUCT.md`](../../PRODUCT.md) là ràng buộc sản phẩm của app này, do `/impeccable init`
sinh ra. Khán giả: dân chơi mô tô phân khối lớn người Việt ở TP.HCM **cộng** khách du lịch nước
ngoài. Vibe moto-garage — tối, nhiều ảnh, typography đậm.

**`DESIGN.md` chưa có, và đó là cố ý.** `/impeccable init` chỉ sinh `PRODUCT.md` — nó không bịa
ra một thế giới thị giác. `DESIGN.md` sinh bằng `/impeccable document` (đọc code có sẵn) hoặc
trong một phiên thiết kế, và cả hai đều cần **màn hình thật** để đọc: hiện `app/page.tsx` mới là
trang tạm monospace. Chạy sớm chỉ tạo ra một `DESIGN.md` bịa, rồi mọi phiên sau tuân theo nó.

Điều kiện để làm: có màn hình danh sách/chi tiết xe thật, và có asset logo thật của shop.

**Cấm rõ**: thẩm mỹ SaaS generic — gradient tím, Inter ở mọi nơi, card lồng card.

`impeccable` áp dụng cho app này (không phải cho `apps/staff`, nơi ưu tiên chức năng).

## i18n mới là seam, chưa phải hệ thống

`messages/vi.json` + `NEXT_PUBLIC_DEFAULT_LOCALE`. **Chưa cài `next-intl`** — hiện có đúng một
ngôn ngữ, dựng bộ máy routing đa ngôn ngữ lúc này là chi phí không có người trả. Thêm khi thật sự
có tiếng Anh, không sớm hơn.

## ⚠️ Build không cần API, nhưng hỏng im lặng nếu API chết

Với `revalidate = 60`, Next fetch `/health` ngay lúc `next build`. Nếu API không tới được, Eden
trả `{data: null, error}` chứ không ném lỗi — **build vẫn thành công** và nướng chuỗi lỗi vào HTML
tĩnh. Trang deploy ra hiển thị trạng thái lỗi cho tới khi ISR revalidate sau 60 giây kể từ request
thật đầu tiên.

Không phải lỗi build, nhưng là một phút xấu xí sau mỗi lần deploy. Biết trước để không đi debug
nhầm chỗ.

## Khác biệt với apps/staff

|           | `apps/web`                                | `apps/staff`                              |
| --------- | ----------------------------------------- | ----------------------------------------- |
| Framework | Next 16                                   | Vite                                      |
| Mô hình   | server-first (RSC)                        | client-first (SPA + TanStack Query)       |
| Biến env  | `process.env.NEXT_PUBLIC_*`, đọc lúc chạy | `import.meta.env.VITE_*`, nướng lúc build |
| JSX       | `jsx: "preserve"`                         | `jsx: "react-jsx"`                        |
| SEO       | quan trọng                                | vô nghĩa                                  |

## Chạy

```bash
bun run --filter @v9/web dev
bun run --filter @v9/web build    # -> .next/standalone
```
