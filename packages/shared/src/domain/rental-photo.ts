/**
 * Ảnh chụp lúc bàn giao xe — bằng chứng khi có tranh chấp xước xát.
 *
 * `PRODUCT.md` nguyên tắc #3: "Bằng chứng bảo vệ cả hai phía. Ảnh lúc giao và
 * lúc nhận tồn tại để bảo vệ khách khỏi bị đổ oan, chứ không chỉ để bảo vệ
 * shop." Đó là lý do ba loại dưới đây tách nhau chứ không gộp thành một đống
 * "ảnh của đơn": câu hỏi vận hành luôn là "lúc GIAO xe trông thế nào" so với
 * "lúc NHẬN LẠI trông thế nào", và một tập ảnh không phân loại không trả lời
 * được câu đó.
 *
 * `DOCUMENT` là ảnh giấy tờ tuỳ thân shop giữ trong lượt thuê. Migration `0012`
 * cố ý KHÔNG lưu `document_number` — chỉ `document_type` — và ghi rằng bằng
 * chứng đối chiếu là ảnh chụp, cùng chỗ với ảnh tình trạng xe. File này là chỗ
 * "cùng chỗ" đó.
 */
export const PHOTO_KINDS = ["DOCUMENT", "HANDOVER", "RETURN"] as const;

export type PhotoKind = (typeof PHOTO_KINDS)[number];

/**
 * Trần một tấm ảnh: 12 MB.
 *
 * Chọn theo thiết bị thật, không theo con số tròn: nhân viên chụp bằng điện
 * thoại ngay tại bãi xe, ảnh gốc chưa nén của máy tầm trung nằm quanh 4–8 MB và
 * máy mới hơn vượt 10 MB. Đặt trần thấp thì họ bấm gửi, bị từ chối, rồi **bỏ
 * luôn việc chụp** — và thứ mất đi là bằng chứng, không phải vài megabyte.
 */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

/**
 * Định dạng nhận được, và đuôi file tương ứng. Một bảng chứ hai hằng riêng: tra
 * đuôi và kiểm hợp lệ phải luôn đồng ý với nhau, và hai danh sách rời là hai
 * danh sách sẽ lệch.
 *
 * ⚠️ `image/svg+xml` KHÔNG có trong bảng, có chủ ý. Nó là định dạng "ảnh" duy
 * nhất mang hành vi: SVG là tài liệu XML chạy được script, nên một file SVG
 * phục vụ lại từ cùng origin là một đường XSS. Ở đây thứ được upload là ảnh
 * chụp từ camera — không có ca dùng nào cần vector.
 */
const TYPE_EXTENSION: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Chuẩn hoá `Content-Type` trước khi tra bảng.
 *
 * Trình duyệt gửi kèm tham số (`image/jpeg; charset=binary`) và không đảm bảo
 * hoa/thường, nên so sánh chuỗi trần sẽ từ chối nhầm ảnh hợp lệ — và triệu
 * chứng là "điện thoại này gửi được, điện thoại kia thì không".
 */
function normalizeType(raw: string): string {
  return raw.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedPhotoType(contentType: string): boolean {
  return normalizeType(contentType) in TYPE_EXTENSION;
}

/** Đuôi file cho một `Content-Type`, `null` nếu không nhận định dạng đó. */
export function extensionForPhotoType(contentType: string): string | null {
  return TYPE_EXTENSION[normalizeType(contentType)] ?? null;
}

/**
 * Kích thước có dùng được không.
 *
 * `Number.isInteger` làm cả ba việc trong một bước — loại `NaN`, loại
 * `Infinity`, loại số lẻ. Cùng lý lẽ `isRequestDaysValid`: dựa vào thứ tự so
 * sánh để bắt giá trị bẩn là dựa vào may mắn.
 */
export function isPhotoSizeValid(bytes: number): boolean {
  return Number.isInteger(bytes) && bytes >= 1 && bytes <= MAX_PHOTO_BYTES;
}

/**
 * Đường dẫn object trong bucket `checkins`.
 *
 * ⚠️ Mọi thành phần đều là **id hoặc hằng** — KHÔNG có mảnh nào đến từ tên file
 * người dùng gửi lên. Đó là toàn bộ điểm của hàm này. Tên file ở một endpoint
 * upload là dữ liệu không tin được: `../../etc/passwd`, một tên dài 4KB, hay
 * một ký tự null đều là chuyện có thật, và ghép thẳng nó vào object key là mở
 * đường ghi đè object khác trong cùng bucket.
 *
 * Phân nhánh theo LOẠI trước, id ảnh sau, nên xoá toàn bộ ảnh giấy tờ của một
 * đơn là xoá đúng một tiền tố `rentals/<id>/DOCUMENT/` — hữu ích nếu một ngày
 * chính sách lưu ảnh PII đổi (xem `docs/DEBT.md`).
 */
export function photoObjectKey(
  rentalId: string,
  kind: PhotoKind,
  photoId: string,
  extension: string,
): string {
  return `rentals/${rentalId}/${kind}/${photoId}.${extension}`;
}
