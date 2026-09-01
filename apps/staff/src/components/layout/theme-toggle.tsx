import { useEffect, useState } from "react";
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

export function ThemeToggle({ className = "" }: { readonly className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  // Đọc trong effect chứ không trong `useState(readChoice)`: `readChoice` chạm
  // `localStorage`, và giữ khởi tạo state thuần thì component render được ở bất
  // kỳ đâu không có DOM. Script trong `index.html` đã đặt `data-theme` đúng từ
  // trước khung hình đầu, nên không có nháy dù state ở đây bắt đầu là "system".
  useEffect(() => {
    setChoice(readChoice());
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = nextChoice(choice);
        setChoice(next);
        applyChoice(next);
      }}
      className={className}
    >
      <Icon name={ICON[choice]} />
      <span className="flex-1 text-left">Giao diện: {LABEL[choice]}</span>
    </button>
  );
}
