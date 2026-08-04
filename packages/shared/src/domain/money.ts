/**
 * Tiền trong hệ này luôn là VND, luôn là số nguyên đồng.
 * VND không có đơn vị phụ, nên không có khái niệm "xu" ở bất kỳ tầng nào.
 * Xem §4.4 của docs/plans/2026-08-04-scaffolding-design.md.
 */
export type Vnd = number;

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
