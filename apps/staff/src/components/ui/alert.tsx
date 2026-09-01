import { Icon, type IconName } from "./icon";

/**
 * Ba mức, ba nền — đi qua token thay vì `bg-red-100`/`bg-amber-100`/`bg-gray-100`
 * rải rác. `--color-warning` (`index.css`) được thêm sau file này ở đợt token
 * trượt AA (dùng trước cho chấm "phải trả hôm nay" ở `attention-list.tsx`) —
 * "warning" nay mượn ĐÚNG token đó, thay vì viền `ink` trung tính nhìn y hệt
 * "info" như bản cũ.
 *
 * ⚠️ Nền là token ĐẶC `*-soft`, KHÔNG phải `bg-X/10`. Bản pha alpha để tương
 * phản phụ thuộc nền phía sau: tone `error` đo được 4,59:1 trên `surface` nhưng
 * **4,38:1** trên `canvas` — trượt AA ở đúng chỗ banner lỗi hay nằm nhất, và
 * không đo một lần cho xong được. Lý lẽ và số đo đầy đủ ở `index.css`.
 */
type AlertTone = "error" | "warning" | "info";

const TONE: Record<AlertTone, string> = {
  error: "bg-status-overdue-soft text-status-overdue",
  warning: "bg-warning-soft text-warning",
  info: "bg-accent-soft text-accent",
};

/**
 * Icon theo tone. Trước đó ba tone chỉ khác nhau bằng MÀU — tức thông tin đi
 * bằng đúng một kênh, trượt SC 1.4.1, và người mù màu đỏ–lục không phân biệt
 * được `error` với `warning`. Đây cùng một lớp lỗi mà §2.5 của design doc đo
 * được trên chip trạng thái.
 *
 * Ba SILHOUETTE khác nhau, không phải ba biểu tượng khác nhau: tam giác / bát
 * giác / tròn còn phân biệt được khi màu biến mất hoàn toàn, còn ba hình cùng
 * đường bao tròn thì không. Thứ tự đó cũng đọc ra đúng mức khẩn.
 */
const TONE_ICON: Record<AlertTone, IconName> = {
  error: "alert-triangle",
  warning: "octagon-alert",
  info: "info",
};

export function Alert({
  tone,
  live,
  children,
}: {
  readonly tone: AlertTone;
  /**
   * Ghi đè mức khẩn của live region. Mặc định suy từ `tone`: `error` →
   * `assertive` (cắt ngang), còn lại → `polite` (chờ tới lượt). Vì có mặc định,
   * MỌI call site cũ giữ nguyên hành vi — prop này chỉ mở đường chỉnh từng chỗ.
   *
   * Truyền `"polite"` cho banner báo lỗi TẢI DỮ LIỆU: nó xuất hiện vì một query
   * settle, không phải vì người dùng vừa bấm gì và đang chờ — cắt ngang họ ở đó
   * là mạnh hơn cần thiết. Giữ mặc định `assertive` cho lỗi submit (ca 409
   * "Số điện thoại này đã thuộc về khách hàng khác").
   */
  readonly live?: "assertive" | "polite";
  readonly children: React.ReactNode;
}) {
  // `role="alert"` cho `assertive` (ngắt lời trình đọc màn hình — người dùng cần
  // biết NGAY), `role="status"` cho `polite` (chờ tới lượt, không cắt ngang).
  // Trước đây đây là `<p>` trần: câu 409 "Số điện thoại này đã thuộc về khách
  // hàng khác: …" hiện lên màn hình và KHÔNG được đọc ra — người dùng screen
  // reader nghe thấy đúng con số không.
  //
  // `role="alert"` đã NGẦM mang `aria-live="assertive"` (và `role="status"`
  // ngầm mang `polite`) — khai `aria-live` tường minh là dư nhưng vô hại; giữ
  // lại cho rõ ý khi đọc code, và để không phụ thuộc việc mọi trình đọc màn
  // hình đều tự suy đúng live-mode ngầm định từ `role`.
  //
  // ⚠️ Nợ CÒN LẠI sau khi có prop `live`: cơ chế đã xong, phần còn lại thuần tuý
  // là chỉnh call site. Đợt màn Khách hàng đã chuyển `customers-list-page.tsx`
  // và `customer-detail-page.tsx` sang `live="polite"`. VẪN dùng mặc định
  // `assertive` cho banner TẢI DỮ LIỆU (sai mức, nhưng sửa thì phải kiểm lại
  // những màn đợt này không đụng tới): `rental-calendar.tsx` (tải đội xe + tải
  // lịch), `rental-form.tsx` (tải đội xe + tìm khách), `stats-page.tsx`, một
  // nhánh lỗi của `staff-list-page.tsx`.
  const liveMode = live ?? (tone === "error" ? "assertive" : "polite");
  return (
    <p
      role={liveMode === "assertive" ? "alert" : "status"}
      aria-live={liveMode}
      className={`flex items-start gap-2 rounded-card p-3 text-sm ${TONE[tone]}`}
    >
      {/* `mt-0.5` là căn QUANG HỌC, không phải căn hộp: icon 20px và line box
          `text-sm` cũng 20px nên `items-start` đã khớp hộp — nhưng đỉnh chữ nằm
          thấp hơn đỉnh line box (half-leading + khoảng ascender-tới-cap) trong
          khi nét icon gần sát mép trên của nó, nên không bù thì icon trông
          nhô lên. Cỡ vẫn đi qua prop `size`, không qua `className`. */}
      <Icon name={TONE_ICON[tone]} className="mt-0.5" />
      <span className="flex-1">{children}</span>
    </p>
  );
}
