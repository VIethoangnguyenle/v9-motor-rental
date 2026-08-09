/**
 * ⚠️ DỮ LIỆU GIẢ — XOÁ TOÀN BỘ FILE NÀY KHI CÓ BẢNG `vehicles`.
 *
 * Chưa có schema nghiệp vụ nào trong `packages/db` (xem CLAUDE.md §Việc còn để
 * lại). File này tồn tại để dựng thử trang chủ theo DESIGN.md, không phải để
 * làm nguồn dữ liệu.
 *
 * Tên xe cố ý đặt là "Xe mẫu 01/02/03" và thông số để gạch ngang: nhìn phát
 * biết chưa có dữ liệu. KHÔNG thay bằng tên model có thật (CB500X, Z900...) —
 * PRODUCT.md §Evidence on Hand cấm bịa nội dung, và tên model thật sẽ trông
 * như shop đang có mấy con đó.
 *
 * Ảnh trỏ vào `public/placeholder/` là ẢNH AI SINH, không phải xe của shop.
 * Mỗi ảnh render ra đều mang nhãn `.placeholder-tag` — đừng gỡ nhãn nếu chưa
 * thay ảnh thật.
 */
export interface PlaceholderVehicle {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly image: string;
}

export const PLACEHOLDER_VEHICLES: readonly PlaceholderVehicle[] = [
  { id: "01", name: "Xe mẫu 01", meta: "— cc · đời — · ODO —", image: "/placeholder/bike-01.jpg" },
  { id: "02", name: "Xe mẫu 02", meta: "— cc · đời — · ODO —", image: "/placeholder/bike-02.jpg" },
  { id: "03", name: "Xe mẫu 03", meta: "— cc · đời — · ODO —", image: "/placeholder/bike-03.jpg" },
];
