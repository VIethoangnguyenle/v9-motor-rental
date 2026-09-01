import type { ApiErrorCode } from "@v9/api";
import type { PhotoKind } from "@v9/shared/domain/rental-photo";
import { api } from "./api";
import { errorCode } from "./errors";

export type RentalPhotoRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof api.rentals>["photos"]["get"]>>["data"]
>[number];

export type PhotosResult =
  { ok: true; photos: RentalPhotoRow[] } | { ok: false; code: ApiErrorCode | null; value: unknown };

export const rentalPhotosQuery = (rentalId: string) => ({
  queryKey: ["rental-photos", rentalId] as const,
  queryFn: async (): Promise<PhotosResult> => {
    const res = await api.rentals({ id: rentalId }).photos.get();
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, photos: res.data };
  },
});

export type MutatePhotoResult =
  { ok: true } | { ok: false; code: ApiErrorCode | null; value: unknown };

export async function uploadRentalPhoto(
  rentalId: string,
  kind: PhotoKind,
  file: File,
): Promise<MutatePhotoResult> {
  const res = await api.rentals({ id: rentalId }).photos.post({ kind, file });
  if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
  return { ok: true };
}

export async function deleteRentalPhoto(
  rentalId: string,
  photoId: string,
): Promise<MutatePhotoResult> {
  const res = await api.rentals({ id: rentalId }).photos({ photoId }).delete();
  if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
  return { ok: true };
}

export async function updateHandover(
  rentalId: string,
  input: {
    documentType?: "CCCD" | "PASSPORT" | null;
    deliveryAddress?: string | null;
    documentReturned?: boolean;
  },
): Promise<MutatePhotoResult> {
  const res = await api.rentals({ id: rentalId }).handover.post(input);
  if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
  return { ok: true };
}

/**
 * Tải byte một tấm ảnh về thành `blob:` URL để gắn vào `<img src>`.
 *
 * ⚠️ **Không gắn thẳng URL của API vào `<img src>`.** Ảnh nằm sau `staffGuard`,
 * và `apps/staff` (`:3003`) khác origin với `apps/api` (`:3001`), nên request do
 * thẻ `<img>` tự phát KHÔNG mang cookie session — trình duyệt chỉ gửi cookie
 * cross-site khi nó là `SameSite=None; Secure`, mà cookie của SuperTokens ở đây
 * không phải vậy. Kết quả sẽ là mọi ảnh hiện ra thành icon vỡ với 401 trong tab
 * Network, và triệu chứng đó trông y hệt "ảnh hỏng" chứ không giống "thiếu quyền".
 *
 * `fetch` thì khác: `Session.init()` đã vá `window.fetch` để thêm
 * `credentials: "include"` cho request tới `apiDomain` (xem `docs/workspaces/staff.md`),
 * nên lời gọi dưới đây mang session mà không cần khai gì thêm — và nó cũng tự
 * refresh token khi hết hạn, thứ `<img>` không bao giờ làm được.
 *
 * Người gọi PHẢI `URL.revokeObjectURL()` khi không dùng nữa; mỗi blob giữ nguyên
 * ảnh trong bộ nhớ tab cho tới lúc đó.
 */
export async function fetchPhotoObjectUrl(
  rentalId: string,
  photoId: string,
): Promise<string | null> {
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const res = await fetch(`${base}/rentals/${rentalId}/photos/${photoId}/content`);
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
