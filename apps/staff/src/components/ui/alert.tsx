/**
 * Ba mức, ba nền — đi qua token thay vì `bg-red-100`/`bg-amber-100`/`bg-gray-100`
 * rải rác. `--color-warning` (`index.css`) được thêm sau file này ở đợt token
 * trượt AA (dùng trước cho chấm "phải trả hôm nay" ở `attention-list.tsx`) —
 * "warning" nay mượn ĐÚNG token đó, cùng khuôn `bg-X/10 text-X` với error/info,
 * thay vì viền `ink` trung tính nhìn y hệt "info" như bản cũ.
 */
type AlertTone = "error" | "warning" | "info";

const TONE: Record<AlertTone, string> = {
  error: "bg-status-overdue/10 text-status-overdue",
  warning: "bg-warning/10 text-warning",
  info: "bg-accent/10 text-accent",
};

export function Alert({
  tone,
  children,
}: {
  readonly tone: AlertTone;
  readonly children: React.ReactNode;
}) {
  return (
    // `role="alert"` cho lỗi (ngắt lời trình đọc màn hình — người dùng cần biết
    // NGAY), `role="status"` + `aria-live="polite"` cho warning/info (chờ tới
    // lượt, không cắt ngang). Trước đây đây là `<p>` trần: câu 409 "Số điện
    // thoại này đã thuộc về khách hàng khác: …" hiện lên màn hình và KHÔNG được
    // đọc ra — người dùng screen reader nghe thấy đúng con số không.
    //
    // `role="alert"` đã NGẦM mang `aria-live="assertive"` (và `role="status"`
    // ngầm mang `polite`) — khai `aria-live` tường minh là dư nhưng vô hại; giữ
    // lại cho rõ ý khi đọc code, và để không phụ thuộc việc mọi trình đọc màn
    // hình đều tự suy đúng live-mode ngầm định từ `role`.
    //
    // ⚠️ Biết trước, CHƯA sửa trong đổi này: mapping đi theo `tone`, không theo
    // "lỗi này có phải phản hồi một hành động người dùng đang chờ hay không".
    // Soát cả 10 màn dùng `Alert` (2026-08-31): quá nửa số `tone="error"` là
    // banner báo lỗi TẢI DỮ LIỆU tự động lúc vào trang, không phải lỗi submit
    // đang chờ như ca 409 ở trên — `rental-calendar.tsx` (tải đội xe + tải lịch),
    // `rental-form.tsx` (tải đội xe + tìm khách), `customer-detail-page.tsx`
    // (hồ sơ + lịch sử thuê), `customers-list-page.tsx`, `stats-page.tsx`, một
    // nhánh lỗi của `staff-list-page.tsx`. `assertive` cắt ngang AT ngay lúc
    // query lỗi dù người dùng có đang chờ hay không — mạnh hơn cần thiết cho
    // nhóm này. Sửa đúng là thêm prop override (vd. `live?: "assertive" |
    // "polite"`, mặc định suy từ `tone`) rồi chỉnh từng call site — vượt phạm
    // vi task này (chỉ đổi `ui/alert.tsx` + `ui/text-field.tsx`, không đổi call
    // site). Để lại làm việc kế tiếp, không âm thầm bỏ qua.
    <p
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`rounded-card p-3 text-sm ${TONE[tone]}`}
    >
      {children}
    </p>
  );
}
