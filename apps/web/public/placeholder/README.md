# ⛔ Ảnh AI sinh — KHÔNG phải xe của shop

Bốn file `.jpg` trong thư mục này do AI sinh (Gemini qua `agy`, 2026-08-10) để dựng thử trang chủ
theo `DESIGN.md`. **Không chiếc nào có thật trong đội xe.**

## Phải thay trước khi ship

`PRODUCT.md` nguyên tắc #2: _"Khách thấy đúng chiếc xe mình sẽ nhận — ảnh thật của từng xe, tình
trạng thật, không phải ảnh hãng."_ Ảnh AI vi phạm trực tiếp nguyên tắc đó. Đây là điểm khác biệt
shop nhỏ có mà chuỗi lớn không có, nên để ảnh giả lên production là tự bỏ đi lợi thế duy nhất.

## Nhãn trên UI phải còn nguyên

Mỗi ảnh render ra đều mang nhãn **"Ảnh AI tạm — chưa phải xe của shop"**
(component `PlaceholderTag` trong `app/page.tsx`).

**Gỡ nhãn mà không thay ảnh = nói dối khách.** Thay ảnh thật thì gỡ nhãn, xoá thư mục này, và
xoá luôn `app/_placeholder-data.ts`.

## Khi có ảnh thật

Ảnh hero là **LCP** của trang (`DESIGN.md` §8) — giữ `priority` trên `next/image`, phục vụ
AVIF/WebP. Alt text phải mô tả thật: loại xe, phân khối, tình trạng — không phải tên file.
