/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì.
 *
 * Khối giữ chỗ trong lúc tải LẦN ĐẦU. Nó làm đúng hai việc, và việc thứ hai mới
 * là lý do nó tồn tại:
 *
 * 1. Nói "đang tải" mà không cần một dòng chữ nữa.
 * 2. **Giữ đúng chỗ mà dữ liệu sắp chiếm.** Bảy màn của app trước đây chỉ hiện
 *    `<p>Đang tải…</p>` cao 20px, nên khi dữ liệu về, trang nhảy một cái —
 *    người đang định bấm vào đâu đó bấm trượt. Đây là CLS, chỉ khác là nó xảy
 *    ra sau tương tác chứ không lúc tải trang.
 *
 * ⚠️ Chỉ dùng cho lần tải ĐẦU (`isPending`). Khi màn hình đã có dữ liệu cũ để
 * hiện — `customers-list-page.tsx` dùng `placeholderData` — thì thay bảng bằng
 * skeleton là ĐI LÙI: người dùng đang đọc dở một danh sách đúng thì nó biến mất
 * để nhường chỗ cho mấy khối xám. Ở đó dùng chỉ báo `isFetching` nhỏ, không
 * dùng component này.
 */
export function Skeleton({ className = "" }: { readonly className?: string }) {
  return (
    <div
      // `aria-hidden`: skeleton là thứ THAY THẾ nội dung cho mắt, không phải nội
      // dung. Trình đọc màn hình nghe trạng thái tải qua `role="status"` của
      // `Alert` hoặc qua chính câu "Đang tải…" mà phía gọi vẫn giữ — đọc thêm
      // một loạt ô trống là nhiễu thuần tuý.
      aria-hidden
      // `motion-reduce:animate-none`: `animate-pulse` là animation DUY NHẤT
      // trong app, nên đây cũng là chỗ duy nhất phải tôn trọng
      // `prefers-reduced-motion`. Bỏ nhấp nháy đi thì khối xám vẫn giữ chỗ và
      // vẫn nói được "chưa có gì ở đây" — mất chuyển động, không mất thông tin.
      className={`animate-pulse rounded-card bg-border motion-reduce:animate-none ${className}`}
    />
  );
}
