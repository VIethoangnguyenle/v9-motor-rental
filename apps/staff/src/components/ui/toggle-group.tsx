/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Giá trị đi qua generic `T`, nhãn do phía gọi truyền vào.
 *
 * Chọn MỘT trong N, dạng dải nút. Sinh ra vì app đã có hai bản viết tay của
 * đúng khuôn này, mang **cùng một chuỗi class** ở hai file:
 *
 *   rental-calendar.tsx  Timeline | Tháng
 *   requests-page.tsx    Tất cả | Chưa xử lý | Đã liên hệ | Đã đóng
 *
 * Hai bản chỉ khác phần vỏ — lịch bọc trong một khung có viền, màn Yêu cầu để
 * rời — nên cùng một thao tác cho ra hai hình dạng ở hai màn hình. Đó đúng là
 * thứ `operate.md` gọi là drift: "If the save button looks different in two
 * places, one is wrong."
 *
 * Lấy hình dạng của màn Yêu cầu (nút rời, `flex-wrap`) chứ không lấy khung có
 * viền của lịch: khung viền đẹp với 2 lựa chọn nhưng 4 lựa chọn ở 390px thì
 * tràn, còn `flex-wrap` đúng ở cả hai. Chọn cái CO GIÃN ĐƯỢC, không chọn cái
 * đang đẹp hơn ở một chỗ.
 *
 * `aria-pressed` chứ không `role="radiogroup"`: đây là những nút LỌC/CHUYỂN
 * CHẾ ĐỘ có hiệu lực ngay khi bấm, không phải một trường trong form chờ submit.
 * Bọc ngoài bằng `role="group"` + `aria-label` để trình đọc màn hình biết mấy
 * nút này thuộc về nhau.
 */
export function ToggleGroup<T extends string | null>({
  label,
  options,
  value,
  onChange,
}: {
  /** Tên của cả nhóm cho trình đọc màn hình, vd "Chế độ xem". */
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            // `String(value)` vì `T` cho phép `null` ("Tất cả" ở màn Yêu cầu) —
            // `null` không dùng làm key React được.
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            // `min-h-11` = 44px, ngưỡng vùng chạm app tự đặt (`ui/button.tsx`).
            // Nút KHÔNG chọn mang viền chứ không chỉ khác màu chữ: nếu chỉ khác
            // màu thì "đang chọn cái nào" phụ thuộc hoàn toàn vào màu, và đó là
            // thông tin chỉ-bằng-màu. Viền + nền đặc là hai tín hiệu.
            className={`min-h-11 rounded-card px-3 text-sm font-medium ${
              selected
                ? "bg-accent text-accent-ink"
                : "border border-border text-ink hover:border-muted hover:bg-canvas active:bg-border"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
