import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "../ui/icon";
import { applyChoice, nextChoice, readChoice, type ThemeChoice } from "../../lib/theme";

/**
 * Ở `layout/` chứ KHÔNG ở `ui/`, và hàng rào kiến trúc ép điều đó: `ui/` chỉ
 * được import lẫn nhau (`frontend-ui` trong `eslint.config.js`), mà nút này đọc
 * và ghi trạng thái của cả tài liệu qua `lib/theme`. Nó cũng đúng về nghĩa —
 * `ui/` là những mảnh trình bày thuần, còn đây là một mẩu trạng thái app, cùng
 * loại với `build-stamp.tsx` nằm ngay cạnh.
 *
 * MỘT nút xoay vòng ba trạng thái, không phải ba nút radio: nó nằm ở chân
 * sidebar cạnh "Đổi mật khẩu"/"Đăng xuất", nơi mỗi hàng là một hành động. Nhãn
 * luôn nói trạng thái HIỆN TẠI, không nói trạng thái kế tiếp — "Giao diện: Tối"
 * đọc được một mình, còn "Chuyển sang sáng" thì bắt người đọc suy ngược.
 */
const LABEL: Record<ThemeChoice, string> = {
  system: "Theo máy",
  light: "Sáng",
  dark: "Tối",
};

const ICON: Record<ThemeChoice, IconName> = {
  system: "monitor",
  light: "sun",
  dark: "moon",
};

/**
 * `data-theme` trên `<html>` là nguồn sự thật, và `applyChoice` là thứ duy nhất
 * ghi nó — nên nghe đúng thuộc tính đó là biết mọi lần lựa chọn đổi, kể cả khi
 * người đổi là một `ThemeToggle` KHÁC.
 *
 * Cần thiết vì `AppShell` dựng CẢ HAI biến thể nav cùng lúc, tức có hai nút gạt
 * sống song song và chỉ một cái đang hiện. Với state cục bộ thì bản sidebar
 * (đang `display:none` dưới 768px) không thấy cú bấm trong sheet "Thêm": kéo
 * rộng cửa sổ qua 768px là thấy "Giao diện: Theo máy" trên một app đang tối, và
 * bấm vào đó nhảy sang "Sáng" thay vì về "Theo máy".
 */
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function ThemeToggle({ className = "" }: { readonly className?: string }) {
  // `readChoice` chạy ngay ở khung hình ĐẦU, không đợi một `useEffect`: đặt tạm
  // "system" rồi sửa sau nghĩa là khung đầu ghi sai nhãn ("Giao diện: Theo máy"
  // trên một app đang tối). App dựng bằng `createRoot`, không `hydrateRoot`,
  // nên không có ràng buộc "server và client phải render y hệt"; và `readChoice`
  // tự bắt lỗi nên nơi không có `localStorage` vẫn ra "system" chứ không nổ.
  const choice = useSyncExternalStore(subscribeToTheme, readChoice);

  return (
    <button
      type="button"
      onClick={() => {
        // Đi tiếp từ thứ ĐANG LƯU, không từ `choice` của lần render này: hai
        // thứ đó lệch nhau trong đúng một khoảnh khắc — giữa lúc nút kia ghi
        // `localStorage` và lúc `MutationObserver` báo về.
        applyChoice(nextChoice(readChoice()));
      }}
      className={className}
    >
      <Icon name={ICON[choice]} />
      <span className="flex-1 text-left">Giao diện: {LABEL[choice]}</span>
    </button>
  );
}
