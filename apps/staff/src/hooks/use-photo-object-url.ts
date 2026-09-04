import { useEffect, useState } from "react";
import { fetchPhotoObjectUrl } from "../lib/photos";

export type PhotoObjectUrl =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly url: string }
  | { readonly state: "failed" };

/**
 * Byte của một tấm ảnh, dựng thành `blob:` URL gắn được vào `<img src>`.
 *
 * ⚠️ Không gắn thẳng URL của API vào `<img src>` — ảnh nằm sau `staffGuard` và
 * thẻ `<img>` không mang cookie session cross-site. Lý do đầy đủ ở `lib/photos.ts`.
 *
 * Hook này sinh ra khi màn Hiện trường cần đúng cơ chế mà `PhotoThumb`
 * (`components/rentals/handover-photos.tsx`) đã có. Chép sang là chép cả hai cái
 * bẫy dưới đây, và bẫy thứ hai thì im lặng:
 *
 * 1. `revokeObjectURL` phải chạy trong cleanup, nếu không mỗi blob giữ nguyên
 *    ảnh trong bộ nhớ tab cho tới lúc tải lại trang.
 * 2. Cờ `alive` chặn ca component unmount trong lúc `fetch` còn bay: không có nó
 *    thì URL được tạo SAU khi cleanup đã chạy, nên không ai thu hồi nó nữa — rò
 *    rỉ không có triệu chứng, và tệ dần theo số lần mở màn.
 *
 * Trả một union ba nhánh chứ không phải `string | null`: `null` phải mang hai
 * nghĩa "đang tải" và "tải hỏng", nên mọi chỗ gọi buộc phải giữ thêm một
 * `useState` thứ hai để phân biệt — đúng thứ bản cũ trong `PhotoThumb` đã làm.
 */
export function usePhotoObjectUrl(rentalId: string, photoId: string): PhotoObjectUrl {
  const [result, setResult] = useState<PhotoObjectUrl>({ state: "loading" });

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    setResult({ state: "loading" });

    void fetchPhotoObjectUrl(rentalId, photoId).then((url) => {
      if (!alive) {
        if (url !== null) URL.revokeObjectURL(url);
        return;
      }
      if (url === null) {
        setResult({ state: "failed" });
        return;
      }
      created = url;
      setResult({ state: "ready", url });
    });

    return () => {
      alive = false;
      if (created !== null) URL.revokeObjectURL(created);
    };
  }, [rentalId, photoId]);

  return result;
}
