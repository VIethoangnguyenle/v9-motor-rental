/**
 * Mark V9 Motor Rental — bản MỘT MÀU cho `apps/staff`.
 *
 * Nguồn hình học: `apps/web/public/brand/v9-mark.svg`, chốt 2026-09-03. Nhông
 * xích làm vành, số 9 âm bản khoét giữa, 24 răng cách đều. Vành dùng
 * `fill-rule="evenodd"` để khoét lỗ thay vì `<mask>` — mask vỡ khi SVG được
 * inline vào nền khác, và ở đây nó ĐANG được inline.
 *
 * ## Vì sao một màu, không phải bản gốc
 *
 * Bản gốc vẽ **trắng** cho thế giới tối của `apps/web`; dán nguyên vào nền
 * `canvas` (#f8fafc) của app này là một hình vô hình. Ba răng nhấn của nó là
 * `#f72b28` — accent THƯƠNG HIỆU, khác `--color-accent` (#0067c8) vốn là accent
 * GIAO DIỆN của app này. Tô lại ba răng đó bằng màu xanh là tự ý đổi nhận diện;
 * giữ nguyên đỏ là nhét một hex ngoài hệ token vào một app có hàng rào token.
 *
 * Đường thứ ba, và nó do chính tài liệu nhận diện mở ra (`DESIGN.md` §9): *"Ba
 * răng đỏ không mang thông tin nào: bỏ hết màu thì mark vẫn đọc đủ. Đây là điều
 * kiện để nó sống ở chỗ in một màu và ở chế độ tương phản cao."* Bản một màu vì
 * vậy không phải bản rút gọn — nó là một trong hai cách dùng đã được khai.
 *
 * `currentColor` chứ không phải một token cứng: app có BA trạng thái theme
 * (sáng · tối · theo máy), nên mark phải đi theo màu chữ của chỗ nó đứng thay vì
 * tự chọn. Một `fill="var(--color-ink)"` sẽ đúng ở bản sáng và chìm ở bản tối.
 *
 * `aria-hidden`: chỗ dùng luôn có chữ "V9 MOTOR RENTAL" đứng cạnh, nên để SVG
 * mang `role="img"` nữa là trình đọc màn hình đọc tên thương hiệu hai lần.
 */
export function BrandMark({ className = "" }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={className}>
      {/* Vành nhông. */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M 462 256 A 206 206 0 1 0 50 256 A 206 206 0 1 0 462 256 Z M 432 256 A 176 176 0 1 1 80 256 A 176 176 0 1 1 432 256 Z"
      />
      {/* 21 răng. */}
      <path
        fill="currentColor"
        d="M 298.30 54.39 L 310.18 22.20 L 325.98 26.43 L 320.17 60.25 Z M 349.04 72.21 L 368.85 44.19 L 383.01 52.36 L 368.65 83.53 Z M 393.44 102.55 L 419.82 80.61 L 431.39 92.18 L 409.45 118.56 Z M 428.47 143.35 L 459.64 128.99 L 467.81 143.15 L 439.79 162.96 Z M 451.75 191.83 L 485.57 186.02 L 489.80 201.82 L 457.61 213.70 Z M 461.69 244.68 L 495.86 247.82 L 495.86 264.18 L 461.69 267.32 Z M 457.61 298.30 L 489.80 310.18 L 485.57 325.98 L 451.75 320.17 Z M 409.45 393.44 L 431.39 419.82 L 419.82 431.39 L 393.44 409.45 Z M 368.65 428.47 L 383.01 459.64 L 368.85 467.81 L 349.04 439.79 Z M 320.17 451.75 L 325.98 485.57 L 310.18 489.80 L 298.30 457.61 Z M 267.32 461.69 L 264.18 495.86 L 247.82 495.86 L 244.68 461.69 Z M 213.70 457.61 L 201.82 489.80 L 186.02 485.57 L 191.83 451.75 Z M 162.96 439.79 L 143.15 467.81 L 128.99 459.64 L 143.35 428.47 Z M 118.56 409.45 L 92.18 431.39 L 80.61 419.82 L 102.55 393.44 Z M 60.25 320.17 L 26.43 325.98 L 22.20 310.18 L 54.39 298.30 Z M 50.31 267.32 L 16.14 264.18 L 16.14 247.82 L 50.31 244.68 Z M 54.39 213.70 L 22.20 201.82 L 26.43 186.02 L 60.25 191.83 Z M 72.21 162.96 L 44.19 143.15 L 52.36 128.99 L 83.53 143.35 Z M 102.55 118.56 L 80.61 92.18 L 92.18 80.61 L 118.56 102.55 Z M 143.35 83.53 L 128.99 52.36 L 143.15 44.19 L 162.96 72.21 Z M 191.83 60.25 L 186.02 26.43 L 201.82 22.20 L 213.70 54.39 Z"
      />
      {/*
        Ba răng ở 120°. Ở bản gốc chúng là `#f72b28`; ở đây cùng màu với 21 răng
        kia. GIỮ THÀNH MỘT `<path>` RIÊNG dù màu đang giống hệt: ngày shop quyết
        đưa accent thương hiệu vào app này thì chỗ sửa là đúng một thuộc tính ở
        đây, không phải tách lại đường path.
      */}
      <path
        fill="currentColor"
        d="M 244.68 50.31 L 247.82 16.14 L 264.18 16.14 L 267.32 50.31 Z M 439.79 349.04 L 467.81 368.85 L 459.64 383.01 L 428.47 368.65 Z M 83.53 368.65 L 52.36 383.01 L 44.19 368.85 L 72.21 349.04 Z"
      />
      {/* Số 9, dựng bằng hình học — không phụ thuộc font nào có mặt. */}
      <g fill="none" stroke="currentColor" strokeWidth="38" strokeLinecap="butt">
        <circle cx="256" cy="212" r="56" />
        <path d="M 312 212 C 312 296 298 338 232 364" />
      </g>
    </svg>
  );
}
