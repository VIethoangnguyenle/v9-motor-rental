import { useSyncExternalStore } from "react";

/**
 * `md` = ngưỡng `AppShell` đổi bottom nav thành sidebar. `lg` = ngưỡng vùng nội
 * dung đủ rộng cho bố cục hai cột (bảng + panel chi tiết cạnh nhau).
 *
 * Vì sao cần ngưỡng thứ hai: sidebar chiếm `w-[168px]`, nên ở 768px vùng nội
 * dung chỉ còn 600px — hẹp hơn cả `min-w-[640px]` mà một bảng 6 cột đang phải
 * khai để chữ không chồng nhau (`staff-table.tsx`). Một bố cục hai cột ở đó
 * hỏng trước khi được dựng.
 *
 * EXPORT có chủ ý, dù chỉ hook này và `use-layout-variant.testing.ts` đọc tới.
 * Trước đây ba file test chép tay chuỗi `"(min-width: 768px)"`, và comment ở hai
 * trong ba file đó tự ghi rằng đổi ngưỡng ở hook mà quên đổi ở test thì test
 * SAI ÂM. Thêm ngưỡng thứ hai biến rủi ro đó thành sự cố thật ngay lần chạy đầu
 * (`staff-table.test.tsx` stub mỗi `md`, nên query `lg` rơi xuống happy-dom —
 * mặc định rộng 1024 nên nó KHỚP, và ca "mobile" nhận về hình dạng desktop).
 * Một nguồn sự thật đóng luôn cả lớp lỗi đó.
 */
export const LAYOUT_QUERIES = {
  tablet: "(min-width: 768px)",
  desktop: "(min-width: 1024px)",
} as const;

export type LayoutVariant = "mobile" | "tablet" | "desktop";

/**
 * Nghe CẢ HAI ngưỡng. Nghe mỗi `md` là bỏ sót lần vượt 1024: `md` vẫn khớp ở cả
 * hai phía mốc đó nên nó không phát `change`, và hình dạng kẹt ở `tablet` cho
 * tới lần render kế tiếp vì lý do khác.
 */
function subscribe(callback: () => void): () => void {
  const lists = [
    window.matchMedia(LAYOUT_QUERIES.tablet),
    window.matchMedia(LAYOUT_QUERIES.desktop),
  ];
  for (const list of lists) list.addEventListener("change", callback);
  return () => {
    for (const list of lists) list.removeEventListener("change", callback);
  };
}

function getSnapshot(): LayoutVariant {
  if (window.matchMedia(LAYOUT_QUERIES.desktop).matches) return "desktop";
  if (window.matchMedia(LAYOUT_QUERIES.tablet).matches) return "tablet";
  return "mobile";
}

/**
 * `useSyncExternalStore`, KHÔNG `useEffect` + `useState`: effect chạy SAU lần vẽ
 * đầu, nên hình dạng sai kịp xuất hiện đúng một khung hình rồi mới bị sửa.
 *
 * Dùng `matchMedia` trên CỬA SỔ ở đây là ĐÚNG — khác với `rental-calendar.tsx`
 * (đo `gridRef.current.clientWidth`, bề rộng VÙNG LƯỚI, không phải cửa sổ, để
 * đóng bug #5: sidebar ăn bớt phần cửa sổ nên đo cửa sổ trả sai số cột). Hai
 * hook đo hai ràng buộc khác nhau: `useLayoutVariant` chọn HÌNH DẠNG của cả
 * trang (nav trên cùng vs. nav dưới, bảng vs. thẻ) — ràng buộc thật là bề rộng
 * VIEWPORT chứ không phải bề rộng của riêng một vùng nội dung nào, nên
 * `matchMedia` trên cửa sổ khớp đúng thứ nó cần đo.
 *
 * Đây là QUYẾT ĐỊNH kiến trúc — ghi ra vì nhất quán với `rental-calendar.tsx`,
 * KHÔNG phải vì test "lần vẽ ĐẦU đã đúng" ở `use-layout-variant.test.ts` ép
 * buộc phải chọn nó. Test đó canh HÀNH VI (không giá trị sai lọt vào lần vẽ
 * đầu), không canh cách triển khai: mutation-test đo được một `useState(() =>
 * compute())` lazy-init + effect chỉ để subscribe cũng qua trót lọt cả ba test
 * ở file đó. Nó chỉ bắt được đúng biến thể `useEffect`+`useState` NGÂY THƠ
 * (mặc định `"mobile"` rồi sửa ở effect) — xem chú thích tại chỗ assert trong
 * file test để không tưởng nhầm nó khoá implementation này.
 *
 * ⚠️ `"tablet"` là giá trị THÊM VÀO, không phải giá trị đổi tên. Chỗ gọi nào
 * hỏi `=== "mobile"` giữ nguyên hành vi; chỗ nào hỏi `=== "desktop"` thì ĐỔI
 * NGHĨA — trước đây nó bao gồm tablet, giờ thì không. Lúc thêm giá trị này chỉ
 * có đúng một chỗ như vậy (`stats-page.tsx`, nút "Lên đơn"), và nó đã được đổi
 * sang `!== "mobile"` để giữ nguyên hành vi cũ. Thêm chỗ gọi mới thì tự hỏi câu
 * đó trước.
 *
 * Server snapshot trả `"desktop"`: app này là SPA, không SSR, nên nhánh đó chỉ
 * chạy trong test chưa cắm `matchMedia`. Chọn `"desktop"` vì đó là hình dạng đầy
 * đủ — hỏng theo hướng thừa thông tin, không thiếu.
 */
export function useLayoutVariant(): LayoutVariant {
  return useSyncExternalStore(subscribe, getSnapshot, () => "desktop");
}
