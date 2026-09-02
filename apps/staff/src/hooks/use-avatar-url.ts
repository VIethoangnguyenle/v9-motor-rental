import { useEffect, useState } from "react";
import { fetchAvatarObjectUrl } from "../lib/avatar";

/**
 * `blob:` URL của ảnh đại diện một người, `undefined` khi người đó chưa có ảnh
 * hoặc byte chưa về. Chỗ gọi truyền thẳng vào `src` của `<Avatar>` — không có
 * `src` thì avatar rơi về chữ cái, nên `undefined` đã là một trạng thái hiển thị
 * đầy đủ và hook này không cần trả thêm cờ "đang tải" nào.
 *
 * ⚠️ Tồn tại thành hook riêng vì phần khó KHÔNG phải lời gọi `fetch` mà là VÒNG
 * ĐỜI của blob: mỗi `createObjectURL` ghim ảnh trong bộ nhớ tab cho tới khi có
 * `revokeObjectURL`, và ba chỗ dùng avatar (chân nav, `/settings`, bảng nhân
 * viên) mà mỗi chỗ tự viết lấy là ba chỗ để quên. Bảng nhân viên còn nhân số
 * chỗ quên đó lên theo số dòng.
 *
 * Cờ `alive` chặn ca component unmount trong lúc `fetch` còn bay: không có nó
 * thì URL được tạo SAU khi cleanup đã chạy, và blob đó rò lại cho tới lúc tải
 * lại trang — im lặng, và tệ dần theo số lần mở màn hình. Cùng cơ chế
 * `PhotoThumb` ở `components/rentals/handover-photos.tsx`.
 *
 * `version` trong danh sách phụ thuộc là thứ làm ĐỔI ẢNH hiện ra được: URL của
 * route không đổi khi người ta thay ảnh, nên nếu chỉ phụ thuộc `staffId` thì
 * effect không chạy lại và màn hình giữ ảnh cũ (xem `fetchAvatarObjectUrl`).
 */
export function useAvatarUrl(staffId: string, version: string | null): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    // Về chữ cái NGAY khi đổi bản, đừng giữ URL cũ chờ ảnh mới về: URL cũ vừa bị
    // cleanup của lần chạy trước thu hồi, nên nó chỉ còn là một `<img>` hỏng.
    setUrl(undefined);
    if (version === null) return;

    let alive = true;
    let created: string | null = null;

    void fetchAvatarObjectUrl(staffId, version).then((u) => {
      if (!alive) {
        if (u !== null) URL.revokeObjectURL(u);
        return;
      }
      if (u !== null) {
        created = u;
        setUrl(u);
      }
    });

    return () => {
      alive = false;
      if (created !== null) URL.revokeObjectURL(created);
    };
  }, [staffId, version]);

  return url;
}
