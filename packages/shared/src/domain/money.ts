/**
 * Tiền trong hệ này luôn là VND, luôn là số nguyên đồng.
 * VND không có đơn vị phụ, nên không có khái niệm "xu" ở bất kỳ tầng nào.
 * Xem §4.4 của docs/plans/2026-08-04-scaffolding-design.md.
 */
export type Vnd = number;

/**
 * ⚠️ Phụ thuộc vào **dữ liệu locale ICU của runtime**, và `Intl` hỏng trong IM LẶNG:
 * runtime không có `vi-VN` thì nó KHÔNG ném lỗi, chỉ lặng lẽ rơi về `en-US` và in
 * `450,000` thay vì `450.000` — người Việt đọc thành 450 đồng.
 *
 * Đã xảy ra thật: `apps/web/Dockerfile` build bằng Node bản Alpine, mà bản đó dựng
 * với ICU tối giản (chỉ `en`), nên MỌI trang tĩnh và cả `generateMetadata` ra số
 * sai. Fix là `apk add icu-data-full` — xem comment ở Dockerfile.
 *
 * Bun và Node bản glibc đã có ICU đầy đủ, nên máy dev KHÔNG BAO GIỜ thấy lỗi này —
 * và `bun test` cũng không, vì Bun luôn mang sẵn ICU. Hàng rào nằm ở chỗ khác: một
 * câu `node -e` ngay trong stage build của `apps/web/Dockerfile`, chạy trên đúng
 * runtime thiếu ICU, làm đỏ image build thay vì đẻ ra trang tĩnh in sai tiền.
 */
const formatter = new Intl.NumberFormat("vi-VN");

/**
 * Làm tròn về số nguyên đồng. Mọi phép chia trong domain PHẢI đi qua đây —
 * không được để số lẻ rò ra ngoài dưới dạng Vnd.
 * Quy ước: nửa lên (half-up), khớp với cách người Việt tính tiền mặt.
 */
export function roundVnd(amount: number): Vnd {
  return Math.round(amount);
}

export function formatVnd(amount: Vnd): string {
  if (!Number.isInteger(amount)) {
    throw new Error(`VND phải là số nguyên, nhận được ${amount}`);
  }
  return `${formatter.format(amount)} ₫`;
}
