import { useSyncExternalStore } from "react";

/** Cùng ngưỡng `md` mặc định của Tailwind mà `AppShell` dùng để đổi nav. */
const MD_QUERY = "(min-width: 768px)";

function subscribe(callback: () => void): () => void {
  const list = window.matchMedia(MD_QUERY);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}

function getSnapshot(): "mobile" | "desktop" {
  return window.matchMedia(MD_QUERY).matches ? "desktop" : "mobile";
}

/**
 * `useSyncExternalStore`, KHÔNG `useEffect` + `useState`: effect chạy SAU lần vẽ
 * đầu, nên hình dạng sai kịp xuất hiện đúng một khung hình rồi mới bị sửa. Cùng
 * kỹ thuật và cùng lý do với `currentDayCount` ở `rental-calendar.tsx`.
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
 * Server snapshot trả `"desktop"`: app này là SPA, không SSR, nên nhánh đó chỉ
 * chạy trong test chưa cắm `matchMedia`. Chọn `"desktop"` vì đó là hình dạng đầy
 * đủ — hỏng theo hướng thừa thông tin, không thiếu.
 */
export function useLayoutVariant(): "mobile" | "desktop" {
  return useSyncExternalStore(subscribe, getSnapshot, () => "desktop");
}
