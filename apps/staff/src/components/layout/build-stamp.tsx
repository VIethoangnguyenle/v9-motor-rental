/**
 * Nhãn nhận dạng bản dựng, đứng ở chân thanh điều hướng.
 *
 * ## Vì sao nó tồn tại
 *
 * Ca thật đã cắn: `vite preview` chạy ở ĐÚNG cổng của dev server (3003, vì đó
 * là origin duy nhất `STAFF_APP_URL` cho phép qua CORS). Bản build có service
 * worker `registerType: "autoUpdate"`, nên nó đăng ký vào origin đó và **tiếp
 * tục phục vụ bản đã cache kể cả sau khi dev server quay lại cổng ấy**.
 *
 * Triệu chứng: sửa code, HMR báo đã cập nhật, nhưng màn hình không đổi gì. Không
 * có lỗi ở đâu cả. Cách duy nhất để biết là mở DevTools đọc
 * `navigator.serviceWorker.controller` — tức phải NGHI NGỜ đúng chỗ mới tìm ra.
 *
 * Nhãn này biến câu hỏi đó thành một cái liếc mắt: giờ dựng đứng yên trong khi
 * bạn vừa sửa code nghĩa là thứ đang chạy không phải thứ bạn vừa sửa.
 *
 * ## Vì sao đủ ba mẩu
 *
 * - `version` — nhảy khi phát hành, hợp để báo cho người khác.
 * - `commit` — nhảy theo từng lần sửa, kể cả chưa bump version. Đây là mẩu duy
 *   nhất nối được màn hình với một dòng trong `git log`.
 * - `giờ dựng` — nhảy MỖI lần build. Đây là mẩu bắt được bản cache đứng yên,
 *   vì hai mẩu kia không đổi giữa hai lần build cùng một commit.
 *
 * Giờ hiển thị theo múi giờ MÁY ĐANG XEM chứ không theo `SHOP_TIMEZONE`, và đó
 * là ngoại lệ có chủ ý so với mọi mốc thời gian khác trong app: nó trả lời "tôi
 * vừa dựng cái này bao lâu rồi", một câu hỏi về đồng hồ của chính người đang
 * ngồi trước máy, không phải về giờ mở cửa của shop.
 */
/**
 * ⚠️ Đọc qua `typeof`, KHÔNG đọc thẳng ba hằng.
 *
 * `define` của Vite thay thế lúc BUILD, nên nếu bundle chạy mà không đi qua
 * config đó thì tên hằng còn nguyên và JS ném `ReferenceError` — làm TRẮNG cả
 * app. Đã cắn thật: dev server đang chạy sẵn không nạp lại `vite.config.ts` khi
 * file đó đổi, nên vừa thêm `define` xong là màn hình trắng cho tới khi restart.
 *
 * Một cái nhãn chẩn đoán mà đánh sập được app thì tệ hơn là không có nhãn. Ba
 * giá trị dự phòng dưới đây khiến trường hợp xấu nhất chỉ là hiện "dev".
 */
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
const COMMIT = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "local";
const BUILT_AT = new Date(typeof __APP_BUILT_AT__ === "string" ? __APP_BUILT_AT__ : Date.now());

const STAMP_FMT = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function BuildStamp() {
  return (
    // `title` mang bản đầy đủ cho ai cần chép lại vào báo lỗi; dòng hiển thị giữ
    // ngắn để không chiếm chỗ của danh tính người dùng ngay trên nó.
    <p
      className="truncate px-3 text-xs text-muted tabular-nums"
      title={`v${VERSION} · ${COMMIT} · dựng lúc ${BUILT_AT.toLocaleString("vi-VN")}`}
    >
      v{VERSION} · {COMMIT} · {STAMP_FMT.format(BUILT_AT)}
    </p>
  );
}
