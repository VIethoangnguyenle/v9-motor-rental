# ADR — đội xe do `apps/staff` quản, Directus lùi về quản trị sâu

Chốt 2026-09-07 với chủ dự án. Thiết kế đầy đủ:
`docs/plans/2026-09-07-staff-fleet-surface-design.md`.

## Quyết định

`OWNER` có toàn quyền CRUD đội xe trong `apps/staff` tại `/fleet`. Directus không còn là nơi chủ
shop phải vào để làm việc hằng ngày; nó giữ vai quản trị sâu (sửa cấu trúc, cứu dữ liệu).

Đây là **đảo ngược** so với `PRODUCT.md` §Operating Context bản trước, vốn ghi Directus giữ danh
mục xe / ảnh / bảng giá. `PRODUCT.md` đã được sửa cùng đợt.

Lý do: chi phí lặp lại hằng ngày. Sửa một con số mà phải rời công cụ vận hành và mở công cụ khác.

## Ba ràng buộc kéo theo, đừng tháo

**Ảnh xe vẫn đi qua Directus.** `apps/staff` → `apps/api` → Directus Files API → mới ghi
`vehicle_photos`. Bắt buộc vì `apps/web` render ảnh bằng `${DIRECTUS_URL}/assets/<fileId>?key=web`;
một file không có hàng trong `directus_files` là ảnh vỡ trên trang khách. Ghi thẳng MinIO KHÔNG
phải đường lùi — khoá `API_S3_KEY` cố ý chỉ mở bucket `checkins`, đã đo là `Access Denied` trên
`vehicles`. Chỗ duy nhất biết Directus tồn tại: `apps/api/src/directus.ts` (element `api-infra`).

**Luật hợp lệ có MỘT nguồn.** `packages/shared/src/domain/vehicle.ts`. `scripts/directus-setup.ts`
sinh `validation`/`validation_message` từ đó; form `apps/staff` hiện `rules` server trả về. Phân
vai ba tầng: CHECK ở Postgres là hàng rào · domain là luật viết một lần · `validation` của Directus
và form là lời giải thích.

⚠️ **Một ngoại lệ đã đo**: với TIỀN, Postgres KHÔNG phải hàng rào. Số lẻ ghi vào cột `integer`
không bị từ chối mà bị làm tròn im lặng, và chế độ làm tròn khác nhau tuỳ literal hay tham số. Ở
đó `Number.isInteger` trong domain là thứ duy nhất đứng giữa. Số đo:
`apps/api/src/services/vehicle-rules-parity.test.ts`.

**Doanh thu theo xe đếm đơn `COMPLETED`, neo vào `returned_at`** — KHÁC `getStatsSummary` (đếm
`handed_over_at IS NOT NULL`, tức gồm cả `ONGOING`). Cộng cột doanh thu mọi xe luôn nhỏ hơn con số
màn Thống kê. Chênh lệch đó phải HIỆN trên màn hình: nhãn đầy đủ "Doanh thu — đơn đã hoàn tất" cộng
một số "đang chạy" bên cạnh. Gộp hai nhóm lại để hai màn khớp số là làm nhãn thành lời nói dối.

## Ba hình dạng màn hình

`<768` danh sách chia nhóm theo tình trạng · `768–1023` bảng + sheet phủ lên · `≥1024` bảng + panel
cố định. Tablet không dùng bố cục hai cột vì sidebar chiếm 168px, còn 600px < `min-w-[760px]` của
bảng. `useLayoutVariant()` vì thế trả ba giá trị từ đợt này.

## Bẫy đã cắn, ghi để không cắn lại

- **"Xe đang bận" phải gồm đơn `ONGOING` QUÁ HẠN.** `ends_at` trôi qua không mang xe về. Điều kiện
  chỉ hỏi `starts_at <= now AND ends_at > now` làm xe đang ở ngoài đường hiện ra là "Trống". Lỗi này
  chỉ lộ ra khi nhìn ảnh chụp màn hình, không test đơn vị nào bắt.
- **`updatedAt` so bằng `date_trunc('milliseconds', ...)`**, không so `=`: `timestamptz` có micro
  giây, `Date` của JS chỉ có mili giây, nên so thẳng không bao giờ khớp. Trigger
  `vehicles_set_updated_at` (BEFORE UPDATE, có sẵn từ trước) là thứ làm cơ chế này phủ được cả
  Directus.
- **`t.File({ type })` kiểm ĐUÔI TÊN FILE, không kiểm byte** — xem `docs/DEBT.md`. WebP có đuôi thì
  nhận bình thường. Đừng loại `image/webp` khỏi `accept` như bản đầu của `vehicle-photos.tsx` đã làm.
