/**
 * Ảnh đại diện của một tài khoản nhân viên.
 *
 * Đứng riêng khỏi `rental-photo.ts` dù hai bên trông giống nhau, vì **ràng buộc
 * ngược chiều nhau**: ảnh bàn giao là BẰNG CHỨNG (`PRODUCT.md` nguyên tắc #3),
 * mất một tấm là mất thứ bảo vệ cả khách lẫn shop; còn avatar là TIỆN NGHI —
 * không có nó thì rơi về chữ cái, và không ai mất gì. Hai loại đó không nên
 * dùng chung một trần dung lượng, xem `MAX_AVATAR_BYTES`.
 *
 * File này KHÔNG import gì ngoài chính nó — điều kiện để test được không cần DB,
 * và là lý do TDD nghiêm khả thi ở đây.
 */

/**
 * Trần một avatar: **1 MB**, nhỏ hơn ảnh bàn giao 12 lần.
 *
 * `rental-photo.ts` chọn 12 MB với lý lẽ rõ: đặt trần thấp thì nhân viên bị từ
 * chối rồi **bỏ luôn việc chụp**, và thứ mất đi là bằng chứng. Ở đây lý lẽ đó
 * KHÔNG áp: bị từ chối một avatar thì người ta chọn ảnh khác, chẳng mất gì.
 *
 * Client hạ ảnh về 256×256 WebP trước khi gửi (~15–30 KB), nên 1 MB là dư sức
 * cho đường bình thường. Nó tồn tại cho đường KHÔNG bình thường: server không
 * được tin client, và một ảnh 12 MB để hiển thị ở 40px là vô nghĩa dù đến từ đâu.
 */
export const MAX_AVATAR_BYTES = 1024 * 1024;

/**
 * Định dạng nhận được và đuôi tương ứng. Một bảng chứ hai hằng riêng: tra đuôi
 * và kiểm hợp lệ phải luôn đồng ý, và hai danh sách rời là hai danh sách sẽ lệch.
 *
 * ⚠️ `image/svg+xml` KHÔNG có mặt, và ở đây lý do **nặng hơn** so với ảnh bàn
 * giao: SVG là tài liệu XML chạy được script, mà avatar được render trên **mọi
 * màn hình** của app — nav, Cài đặt, bảng nhân viên. Một đường XSS ở ảnh bàn
 * giao chỉ mở khi ai đó mở đúng một đơn; ở đây nó mở ngay khi đăng nhập.
 *
 * `image/gif` cũng không: avatar động trong một công cụ vận hành là nhiễu, và nó
 * kéo theo câu hỏi "tôn trọng `prefers-reduced-motion` thế nào" cho một thứ
 * không đáng có câu hỏi đó.
 */
const TYPE_EXTENSION: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Chuẩn hoá `Content-Type` trước khi tra bảng — trình duyệt gửi kèm tham số
 * (`image/jpeg; charset=binary`) và không đảm bảo hoa/thường. So chuỗi trần sẽ
 * từ chối nhầm ảnh hợp lệ, và triệu chứng là "máy này gửi được, máy kia không".
 */
function normalizeType(raw: string): string {
  return raw.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Cùng tập với `isAllowedAvatarType`, ở dạng MẢNG — vì `t.File({ type })` của
 * Elysia (`routes/staff.ts`) cần một danh sách, không gọi được một vị từ.
 *
 * Suy từ `TYPE_EXTENSION` chứ không gõ lại: `routes/handover.ts` chép tay đúng ba
 * chuỗi này cho ảnh bàn giao, và bản chép đó là một danh sách thứ hai phải nhớ
 * sửa cùng lúc. Ở đây thì hàng rào của Elysia và hàng rào của domain KHÔNG lệch
 * nhau được — chúng đọc cùng một bảng.
 */
export const AVATAR_CONTENT_TYPES: readonly string[] = Object.keys(TYPE_EXTENSION);

export function isAllowedAvatarType(contentType: string): boolean {
  return normalizeType(contentType) in TYPE_EXTENSION;
}

/** Đuôi file cho một `Content-Type`, `null` nếu không nhận định dạng đó. */
export function extensionForAvatarType(contentType: string): string | null {
  return TYPE_EXTENSION[normalizeType(contentType)] ?? null;
}

/**
 * `Number.isInteger` làm cả ba việc trong một bước — loại `NaN`, loại `Infinity`,
 * loại số lẻ. Dựa vào thứ tự so sánh để bắt giá trị bẩn là dựa vào may mắn.
 */
export function isAvatarSizeValid(bytes: number): boolean {
  return Number.isInteger(bytes) && bytes >= 1 && bytes <= MAX_AVATAR_BYTES;
}

/**
 * Đường dẫn object trong bucket.
 *
 * ⚠️ Mọi thành phần là **id hoặc hằng** — không mảnh nào đến từ tên file người
 * dùng gửi lên. Tên file ở một endpoint upload là dữ liệu không tin được
 * (`../../etc/passwd`, tên dài 4 KB, ký tự null đều là chuyện có thật), và ghép
 * thẳng nó vào object key là mở đường ghi đè object khác trong cùng bucket.
 *
 * **`avatarId` là bắt buộc, không dùng một khoá cố định kiểu
 * `staff/<id>/avatar.webp`.** Lý do nằm ở thứ tự ghi mà `services/photos.ts` đã
 * lập luận: object ghi TRƯỚC, hàng ghi SAU. Với khoá cố định, thay ảnh sẽ **ghi
 * đè object cũ trước khi hàng kịp cập nhật** — và nếu bước ghi hàng hỏng thì ảnh
 * cũ đã mất trong khi DB vẫn trỏ vào nó. Khoá mới mỗi lần thì ảnh cũ sống cho
 * tới lúc hàng trỏ đi chỗ khác, nên chiều lệch tệ nhất chỉ còn là một object mồ
 * côi — rác dọn được, không phải ảnh hỏng người dùng thấy.
 *
 * Tiền tố theo người (`staff/<staffId>/`) nên xoá sạch dữ liệu ảnh của một nhân
 * viên nghỉ việc là xoá đúng một tiền tố.
 */
export function avatarObjectKey(staffId: string, avatarId: string, extension: string): string {
  return `staff/${staffId}/avatar/${avatarId}.${extension}`;
}

/**
 * Bảng NGƯỢC của `TYPE_EXTENSION`, dựng từ chính nó chứ không gõ lần thứ hai —
 * hai bảng gõ tay là hai bảng sẽ lệch, đúng cái mà chú thích của `TYPE_EXTENSION`
 * đã nêu. Nghịch đảo tồn tại được vì ba đuôi hiện tại đôi một khác nhau; thêm một
 * định dạng dùng chung đuôi với định dạng cũ sẽ lặng lẽ mất một chiều, nên nếu
 * ngày đó tới thì phải khai bảng ngược tường minh và có test canh cả hai chiều.
 */
const EXTENSION_TYPE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TYPE_EXTENSION).map(([type, extension]) => [extension, type]),
);

/**
 * Nghịch đảo của `avatarObjectKey`, và lý do nó cần tồn tại là chỉ có MỘT cột
 * (`staff_users.avatar_object_key`) lưu toàn bộ thứ ta biết về ảnh — trong khi
 * hai chỗ cần đọc lại từng mảnh:
 *
 *  - route stream byte cần `contentType` để đặt header. Lấy nó bằng cách `stat()`
 *    object trên MinIO là thêm một vòng mạng vào đường NÓNG nhất (avatar hiện ở
 *    chân thanh điều hướng, tức mọi màn hình); đuôi file trong khoá đã nói đủ.
 *  - hồ sơ công khai cần `avatarId` làm **số hiệu bản** để client phân biệt được
 *    ảnh cũ với ảnh mới (`avatarVersion` ở `routes/staff.ts`). Không có nó thì
 *    "đã đổi ảnh" và "vẫn ảnh cũ" là cùng một trạng thái với client.
 *
 * `null` cho mọi thứ không đúng khuôn, kể cả đuôi lạ: hàng trong DB có thể được
 * sửa tay hoặc mang khuôn của một đợt trước, và đoán bừa `contentType` từ một
 * khoá không đọc được là cách biến dữ liệu hỏng thành ảnh hỏng ở trình duyệt.
 */
export function parseAvatarObjectKey(
  objectKey: string,
): { staffId: string; avatarId: string; contentType: string } | null {
  // Neo hai đầu và cấm `/` bên trong từng mảnh: không có neo thì
  // `staff/x/avatar/y.webp/thêm-gì-đó` cũng khớp, và ta trả về một `staffId`
  // không phải của khoá đang xét.
  const m = /^staff\/([^/]+)\/avatar\/([^/.]+)\.([^/.]+)$/.exec(objectKey);
  if (!m) return null;
  const [, staffId, avatarId, extension] = m;
  if (staffId === undefined || avatarId === undefined || extension === undefined) return null;
  const contentType = EXTENSION_TYPE[extension];
  if (contentType === undefined) return null;
  return { staffId, avatarId, contentType };
}
