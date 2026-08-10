# ⛔ Ảnh AI sinh — KHÔNG phải xe của shop

Bốn file `.jpg` trong thư mục này do AI sinh (Gemini qua `agy`, 2026-08-10) để dựng thử trang chủ
theo `DESIGN.md`. **Không chiếc nào có thật trong đội xe.**

## Phải thay trước khi ship

`PRODUCT.md` nguyên tắc #2: _"Khách thấy đúng chiếc xe mình sẽ nhận — ảnh thật của từng xe, tình
trạng thật, không phải ảnh hãng."_ Ảnh AI vi phạm trực tiếp nguyên tắc đó. Đây là điểm khác biệt
shop nhỏ có mà chuỗi lớn không có, nên để ảnh giả lên production là tự bỏ đi lợi thế duy nhất.

## Nhãn trên UI phải còn nguyên

Ảnh còn render ra hiện chỉ còn **`hero.jpg`** (trang chủ), và nó mang nhãn
**"Ảnh AI tạm — chưa phải xe của shop"** (component `PlaceholderTag` trong `app/page.tsx`).

Ba file `bike-0*.jpg` **không còn chỗ nào dùng**: lưới xe trên trang chủ, `/xe` và `/xe/[slug]`
đều lấy ảnh thật từ Directus. Chúng nằm lại chờ cùng một lần dọn với `hero.jpg`.

**Gỡ nhãn mà không thay ảnh = nói dối khách.** Chiều ngược lại cũng sai và đã suýt xảy ra: gắn
nhãn "ảnh tạm" lên ảnh xe thật lấy từ Directus là nói sai theo hướng còn lại. Nhãn thuộc về đúng
tấm ảnh giả, không thuộc về trang.

Thay `hero.jpg` bằng ảnh thật thì gỡ nhãn, xoá `PlaceholderTag` cùng khoá
`placeholder.imageTag` trong `messages/vi.json`, và xoá cả thư mục này.
(`app/_placeholder-data.ts` **đã bị xoá** cùng đợt danh mục đội xe — không đi tìm nó nữa.)

## Khi có ảnh thật

Ảnh hero là **LCP** của trang (`DESIGN.md` §8) — giữ `priority` trên `next/image`, phục vụ
AVIF/WebP. Alt text phải mô tả thật: loại xe, phân khối, tình trạng — không phải tên file.
