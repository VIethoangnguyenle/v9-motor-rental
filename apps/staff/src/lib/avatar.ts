import type { ApiErrorCode } from "@v9/api";
import { MAX_AVATAR_BYTES } from "@v9/shared/domain/avatar";
import { api } from "./api";
import { errorCode } from "./errors";

/**
 * Cạnh của ảnh gửi lên, tính bằng pixel CSS × 2 cho màn hình dày điểm ảnh.
 *
 * Chỗ hiển thị lớn nhất là avatar `md` ở `/settings` — 40px, tức 80px trên màn
 * hình 2×. 256 dư gấp ba, và cái dư đó có mục đích: nó là ảnh gốc cho mọi chỗ
 * dùng SAU này (một trang hồ sơ, một sheet chi tiết) mà không phải bắt người
 * dùng tải lại ảnh. Trên nữa thì không: 512×512 nặng gấp bốn mà không có màn
 * hình nào của app này hiện tới cỡ đó.
 */
const AVATAR_EDGE = 256;

/**
 * Chất lượng encode. 0.85 là chỗ mà artifact JPEG còn nằm dưới ngưỡng nhìn thấy
 * ở một ô tròn 40px; 1.0 làm file nặng gấp đôi cho phần khác biệt không ai thấy
 * ở cỡ đó.
 */
const AVATAR_QUALITY = 0.85;

/**
 * ⛔ **JPEG, KHÔNG PHẢI WEBP — và đây là ràng buộc ĐO ĐƯỢC, không phải sở thích.**
 *
 * `apps/api` KHÔNG nhận nổi một file WebP nào, ở bất kỳ đường nào. Nguyên nhân
 * nằm dưới Elysia: bộ phân tích multipart của Bun đặt `File.type` bằng cách ĐOÁN
 * từ byte đầu file và **bỏ qua hoàn toàn `Content-Type` người gửi khai**, mà
 * bảng đoán của nó không có WebP. Đo 2026-09-02, gửi qua một app Elysia trần
 * (Bun 1.3.10, elysia 1.4.29), cột cuối là `body.file.type` server đọc được:
 *
 *   a.png            khai `image/webp`  → `image/png`    ← lời khai bị bỏ qua
 *   anh-do.jpg       khai `text/plain`  → `image/jpeg`   ← lời khai bị bỏ qua
 *   canvas.webp      khai `image/webp`  → `""`           ← WebP không có trong bảng
 *   pil-lossy.webp   khai `image/webp`  → `""`           (VP8  — không phải lỗi của canvas)
 *   pil-lossless.webp khai `image/webp` → `""`           (VP8L)
 *   x.pdf            khai `image/png`   → `""`
 *
 * Chuỗi rỗng đó trượt cả hai hàng rào: `t.File({ type })` của route trả 422, và
 * `isAllowedAvatarType("")` của domain trả `false`. Nên gửi WebP lên là **luôn
 * hỏng**, không phải "hỏng ở vài trình duyệt".
 *
 * Giá phải trả rất nhỏ: ở 256×256 thì JPEG q0.85 nặng hơn WebP cỡ vài KB. Giá
 * của việc không biết điều này thì lớn — mọi lần đổi ảnh đều 422, và câu lỗi duy
 * nhất người dùng thấy là "Không tải được ảnh lên".
 *
 * ⚠️ Hệ quả thứ hai, KHÔNG sửa ở đợt này: `POST /rentals/:id/photos`
 * (`routes/handover.ts`) khai cùng hình dạng `t.File({ type: [... "image/webp"] })`,
 * nên nó cũng không nhận được WebP — nhân viên chụp ảnh bàn giao bằng một máy
 * xuất WebP sẽ nhận 422. Chưa ai báo vì camera điện thoại xuất JPEG/HEIC.
 */
const AVATAR_ENCODE_TYPE = "image/jpeg";

export type MutateAvatarResult =
  { ok: true } | { ok: false; code: ApiErrorCode | null; value: unknown };

/**
 * Hạ ảnh người dùng chọn về một ô vuông 256×256 JPEG trước khi gửi (vì sao JPEG
 * chứ không WebP: xem `AVATAR_ENCODE_TYPE` ngay trên).
 *
 * Vì sao hạ ở CLIENT chứ không ở server: ảnh điện thoại ngày nay 3–5 MB, mà chỗ
 * hiển thị lớn nhất là 40px. Gửi nguyên là bắt nhân viên ở gara chờ một upload
 * 4 MB qua 4G cho một tấm ảnh sẽ bị thu nhỏ 100 lần. Sau khi hạ còn ~15–25 KB.
 *
 * ⚠️ **Trần 1 MB của server KHÔNG vì thế mà bỏ được** — hàm này chạy trong trình
 * duyệt, tức trong tay người gửi. `MAX_AVATAR_BYTES` ở API là hàng rào thật.
 *
 * Cắt VUÔNG ở giữa trước khi thu nhỏ, không bóp cả khung hình: avatar hiển thị
 * trong một hình TRÒN, nên một ảnh ngang bị bóp cho vừa sẽ ra mặt người bẹp.
 *
 * ⚠️ `toBlob` KHÔNG trả `null` khi trình duyệt không encode được định dạng đang
 * xin — theo spec nó rơi về `image/png` và trả một blob PNG bình thường. Nên
 * KHÔNG có nhánh "nếu null thì thử định dạng khác" ở đây: nhánh đó không bao giờ
 * chạy, và nó sẽ làm người đọc tưởng ca không-encode-được đã có người lo. PNG
 * cũng là định dạng API nhận (và Bun đoán được), nên ca đó vẫn tải lên được —
 * chỉ nặng hơn. `null` THẬT thì nghĩa khác hẳn: canvas không đọc được, và đó là
 * lỗi chứ không phải một nhánh rơi về.
 */
export async function shrinkAvatar(file: File): Promise<Blob> {
  // `createImageBitmap` ném khi dữ liệu không giải mã được thành ảnh — đó là
  // hàng rào bắt file `.pdf` hay `.heic` mà `accept="image/*"` để lọt, và nó bắt
  // TRƯỚC khi có byte nào bay lên mạng. Người gọi dịch lỗi này thành câu tiếng
  // Việt (xem `settings-page.tsx`).
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    // KHÔNG phóng to ảnh nhỏ hơn 256: phóng to không thêm được chi tiết nào, chỉ
    // thêm byte. Một avatar 96×96 cũ vẫn giữ nguyên 96×96.
    const edge = Math.min(AVATAR_EDGE, side);

    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Trình duyệt không dựng được canvas 2D");

    ctx.drawImage(
      bitmap,
      // Ô vuông ở GIỮA ảnh gốc: mặt người hầu như luôn nằm ở giữa khung, và cắt
      // từ mép trên-trái sẽ cắt mất nửa mặt trong một ảnh ngang.
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      edge,
      edge,
    );

    return await toBlob(canvas, AVATAR_ENCODE_TYPE);
  } finally {
    // Giải phóng bộ nhớ giải mã ngay, đừng đợi GC: ảnh 12 MP chiếm ~48 MB ở dạng
    // bitmap, và trên điện thoại tầm trung vài lần thử ảnh là hết bộ nhớ tab.
    bitmap.close();
  }
}

/** `toBlob` là callback API; không bọc thì không `await` được ở trên. */
function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Không encode được ảnh sau khi thu nhỏ"));
      },
      type,
      AVATAR_QUALITY,
    );
  });
}

/**
 * Gửi ảnh đã hạ lên. Nhận `Blob` chứ không `File` vì `shrinkAvatar` trả `Blob` —
 * và tên file không có ý nghĩa gì ở đây: object key dựng từ id, không mảnh nào
 * đến từ tên người dùng gửi (xem `avatarObjectKey` ở `@v9/shared/domain/avatar`).
 */
export async function uploadAvatar(blob: Blob): Promise<MutateAvatarResult> {
  const res = await api.staff.me.avatar.post({
    // Eden cần một `File` để dựng multipart; tên chỉ để lấp field bắt buộc.
    file: new File([blob], "avatar", { type: blob.type }),
  });
  if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
  return { ok: true };
}

export async function deleteAvatar(): Promise<MutateAvatarResult> {
  const res = await api.staff.me.avatar.delete();
  if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
  return { ok: true };
}

/** Trần của server, để UI nói ra con số thay vì để người dùng đoán. */
export const MAX_AVATAR_MB = Math.floor(MAX_AVATAR_BYTES / 1024 / 1024);

/**
 * Tải byte ảnh đại diện về thành `blob:` URL để gắn vào `<img src>`.
 *
 * ⚠️ **Không gắn thẳng URL của API vào `<img src>`.** Ảnh nằm sau `staffGuard`,
 * và `apps/staff` (`:3003`) khác origin với `apps/api` (`:3001`), nên request do
 * thẻ `<img>` tự phát KHÔNG mang cookie session — trình duyệt chỉ gửi cookie
 * cross-site khi nó là `SameSite=None; Secure`, mà cookie của SuperTokens ở đây
 * không phải vậy. Kết quả sẽ là mọi ảnh hiện ra thành icon vỡ với 401, và triệu
 * chứng đó trông y hệt "ảnh hỏng" chứ không giống "thiếu quyền". `fetch` thì
 * khác: `Session.init()` đã vá `window.fetch` để thêm `credentials: "include"`
 * cho request tới `apiDomain`. Lý lẽ đầy đủ ở `lib/photos.ts`.
 *
 * ⚠️ `version` KHÔNG phải trang trí: URL ảnh không đổi khi người ta thay ảnh, mà
 * route trả `cache-control: private, max-age=3600`. Không gắn nó vào query thì
 * đổi ảnh xong trình duyệt vẫn phục vụ ảnh cũ từ bộ nhớ đệm — tới một tiếng, và
 * không có gì kêu. Nó cũng là thứ làm `useEffect` ở chỗ gọi chạy lại.
 *
 * Người gọi PHẢI `URL.revokeObjectURL()` khi không dùng nữa; mỗi blob giữ nguyên
 * ảnh trong bộ nhớ tab cho tới lúc đó.
 */
export async function fetchAvatarObjectUrl(
  staffId: string,
  version: string,
): Promise<string | null> {
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const res = await fetch(
    `${base}/staff/users/${encodeURIComponent(staffId)}/avatar/content?v=${encodeURIComponent(version)}`,
  );
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
