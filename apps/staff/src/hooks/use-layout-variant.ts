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
 * Server snapshot trả `"desktop"`: app này là SPA, không SSR, nên nhánh đó chỉ
 * chạy trong test chưa cắm `matchMedia`. Chọn `"desktop"` vì đó là hình dạng đầy
 * đủ — hỏng theo hướng thừa thông tin, không thiếu.
 */
export function useLayoutVariant(): "mobile" | "desktop" {
  return useSyncExternalStore(subscribe, getSnapshot, () => "desktop");
}
