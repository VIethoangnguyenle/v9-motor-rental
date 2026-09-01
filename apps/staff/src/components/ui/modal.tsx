import { useEffect, useRef } from "react";

/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì. Component này chỉ nhận tên hiển thị, vị trí và `children`.
 *
 * ## Vì sao là `<dialog>` gốc chứ không phải `<div role="dialog">`
 *
 * App có ba lớp phủ, và trước file này chúng có ba hành vi bàn phím khác nhau:
 *
 * | Lớp phủ                             | Esc | Focus vào | Trả focus | Bẫy Tab |
 * | ----------------------------------- | --- | --------- | --------- | ------- |
 * | sheet "Thêm" (`layout/app-nav.tsx`) | ✗   | ✗         | ✗         | ✗       |
 * | form lên đơn (`rentals/rental-form`) | ✓  | ✗         | ✗         | ✗       |
 * | sheet chi tiết đơn                  | ✓   | ✓         | ✓         | ✗       |
 *
 * Cả ba đều khai `aria-modal="true"` mà không làm phần còn lại của trang inert —
 * tức Tab đi xuyên qua lớp phủ xuống trang phía sau, và trình đọc màn hình đọc
 * được cả nội dung đang bị che. `aria-modal` là một LỜI KHAI, không phải một cơ
 * chế; thứ thực thi nó là `inert`, và không ai đặt.
 *
 * `dialog.showModal()` cho cả bốn cột MIỄN PHÍ và đúng theo spec: top layer,
 * bẫy Tab, `inert` cho phần còn lại của document, Esc đóng, và trả tiêu điểm về
 * phần tử đã mở nó. Viết tay bốn thứ đó là viết lại một phần của trình duyệt —
 * và bản viết tay sẽ lệch lần nữa ở lớp phủ thứ tư.
 *
 * Đánh đổi đã biết: `showModal()` là API MỆNH LỆNH, nên phải gọi trong effect
 * chứ không khai được bằng JSX. Đó là toàn bộ phần lằng nhằng của file này.
 *
 * ## Phần chrome mặc định của trình duyệt phải dọn tay
 *
 * Preflight của Tailwind v4 đã zero `margin`/`padding`/`border` cho `*` (kiểm
 * trong CSS đã build: `*,:after,:before,::backdrop{box-sizing:border-box;
 * border:0 solid;margin:0;padding:0}`), và style của tác giả thắng UA bất kể độ
 * đặc hiệu — nên ba thứ đó KHÔNG cần khai lại. Nhưng `dialog:modal` của UA còn
 * đặt `width`/`height: fit-content` và `max-width`/`max-height: calc(...)`, và
 * preflight không đụng tới bốn cái đó. Vì vậy `h-full w-full max-h-none
 * max-w-none` bên dưới là BẮT BUỘC, không phải thừa: thiếu chúng thì `<dialog>`
 * co lại vừa nội dung và vùng bấm-ra-ngoài-để-đóng biến mất.
 */

/**
 * Ba vị trí, mỗi cái buộc vào một chỗ gọi có lý do riêng:
 *
 * - `bottom` — luôn dính đáy. Sheet "Thêm" của bottom nav; nó chỉ tồn tại dưới
 *   768px và ngón cái ở đó với tới đáy dễ hơn giữa màn.
 * - `adaptive` — đáy trên điện thoại, giữa màn từ ≥640px. Sheet chi tiết đơn:
 *   mở bằng cách chạm một thanh trên lịch (điện thoại) hoặc bấm chuột (desktop).
 * - `top` — neo mép trên. Form lên đơn: form dài và người dùng đang GÕ, nên bàn
 *   phím ảo đẩy từ dưới lên; neo đáy thì mọi ô nhập bị đẩy khỏi màn hình.
 *
 * `pb-safe` chỉ có ở hai vị trí chạm đáy, và `adaptive` gỡ nó lại ở `sm:` — trên
 * bản centered thì `env(safe-area-inset-bottom)` không còn nghĩa gì, để nguyên
 * chỉ tạo ra 8px đệm lệch so với mép trên.
 */
export type ModalPlacement = "bottom" | "adaptive" | "top";

const PANEL_PLACEMENT: Record<ModalPlacement, string> = {
  bottom: "inset-x-0 bottom-0 rounded-t-card border-t border-border pb-safe",
  adaptive:
    "inset-x-0 bottom-0 rounded-t-card pb-safe sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-card sm:border sm:border-border sm:pb-0",
  top: "inset-x-0 top-0 mt-6 rounded-card border border-border",
};

export function Modal({
  label,
  placement,
  onClose,
  children,
}: {
  /** Tên của lớp phủ cho trình đọc màn hình (`aria-label` của `<dialog>`). */
  readonly label: string;
  readonly placement: ModalPlacement;
  /** Người dùng đã đóng — phía gọi gỡ component này khỏi cây. */
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Giữ callback MỚI NHẤT trong ref. Listener `close` gắn đúng một lần (deps
  // rỗng — `showModal()` chỉ được gọi lúc mount), nhưng `onClose` là arrow
  // inline ở cả ba chỗ gọi nên đổi tham chiếu mỗi lần render; đọc nó qua ref
  // thay vì đưa vào deps để không gỡ-gắn lại listener sau mỗi lần vẽ.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    // `showModal()`, KHÔNG phải thuộc tính `open`. Chỉ `showModal` mới đưa
    // dialog vào top layer, bẫy Tab, làm phần còn lại inert và cho Esc đóng —
    // `<dialog open>` chỉ là một cái hộp, tức dựng lại đúng ba lỗ mà component
    // này sinh ra để bịt. Gọi `showModal()` trên dialog ĐANG mở thì ném, nên
    // vẫn phải hỏi `el.open` dù effect chạy một lần (StrictMode ở `main.tsx`
    // chạy effect hai lần trong dev).
    if (!el.open) el.showModal();

    // Đưa tiêu điểm vào PANEL, không để `showModal()` tự chọn.
    //
    // Bước focus mặc định của spec là "phần tử focusable đầu tiên bên trong", mà
    // ở cả ba chỗ gọi thứ đó là nút ✕ — đo được trong trình duyệt thật:
    // `document.activeElement.id === "x"` ngay sau `showModal()`. Hai hệ quả:
    // trình đọc màn hình đọc "Đóng, button" thay vì TÊN của lớp phủ và nội dung
    // của nó, và phím Enter đầu tiên đóng luôn thứ vừa mở.
    //
    // Focus vào một container `tabIndex={-1}` là khuôn mà `rental-detail-sheet.tsx`
    // đã tự làm trước khi có file này; giữ lại nó thay vì để hành vi mặc định
    // nuốt mất. Gọi tay chứ không dùng thuộc tính `autofocus`: React đối xử với
    // `autoFocus` khác nhau qua các bản, còn `.focus()` sau `showModal()` thì
    // xác định.
    panelRef.current?.focus();

    // Người dùng đóng bằng Esc, bấm nền, hay một nút của phía gọi → báo lên
    // trên. `unmounting` chặn vòng ngược: cleanup gọi `close()`, `close()` bắn
    // event `close`, event lại gọi `onClose` lần nữa cho một component vừa bị
    // gỡ. Vô hại ở cả ba chỗ gọi hôm nay (đều setState về cùng một giá trị)
    // nhưng nó là cái bẫy đang chờ chỗ gọi thứ tư.
    let unmounting = false;
    const handleClose = () => {
      if (!unmounting) onCloseRef.current();
    };

    // `addEventListener` chứ không phải prop `onClose` của JSX: React map
    // `onClose` sang event `close` của `<dialog>`, nhưng tên đó trùng đúng tên
    // prop của chính component này — hai `onClose` với hai nghĩa khác nhau
    // trong cùng một file là cách chắc chắn nhất để người sau nối nhầm dây.
    el.addEventListener("close", handleClose);
    return () => {
      unmounting = true;
      el.removeEventListener("close", handleClose);
      if (el.open) el.close();
    };
  }, []);

  // Bấm ra ngoài panel. `<dialog>` phủ kín viewport và panel là CON của nó, nên
  // `e.target === e.currentTarget` nghĩa là cú bấm rơi vào vùng nền.
  //
  // Chốt thêm ở `pointerdown` vì `click` một mình không đủ: bôi đen số điện
  // thoại của khách TRONG panel rồi nhả chuột ra ngoài cũng sinh một `click` có
  // target là dialog (target của click là tổ tiên chung của mousedown và
  // mouseup). Không có chốt này thì thao tác copy đóng luôn sheet.
  const downOnBackdrop = useRef(false);

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) dialogRef.current?.close();
      }}
      // Nền mờ nằm trên CHÍNH `<dialog>`, không trên `::backdrop`: `::backdrop`
      // không kế thừa biến CSS từ `:root` ở mọi trình duyệt còn phải hỗ trợ, nên
      // `bg-ink/40` ở đó sẽ im lặng ra trong suốt trên một số máy. `<dialog>`
      // phủ kín viewport rồi nên đặt nền lên nó cho ra đúng lớp mờ đó, bằng
      // token thật. `backdrop:bg-transparent` dập lớp xám mặc định của Chromium
      // để hai lớp không chồng nhau thành đậm hơn thiết kế — `transparent` là từ
      // khoá, không phải biến, nên nó an toàn ở `::backdrop`.
      //
      // Không có `z-index`: phần tử trong top layer vẽ trên mọi thứ theo định
      // nghĩa, một con số ở đây chỉ làm người đọc tưởng nó có tác dụng.
      className="fixed inset-0 h-full max-h-none w-full max-w-none bg-ink/40 text-ink backdrop:bg-transparent"
    >
      {/*
       * `max-h-[90dvh]` chứ không `90vh`: trên trình duyệt điện thoại `vh` đo
       * theo viewport LỚN (thanh công cụ đã thu), nên ở trạng thái thanh công cụ
       * đang hiện, 90vh vẫn tràn khỏi màn hình và đáy panel — nơi đặt nút chính —
       * nằm dưới mép nhìn thấy. `dvh` co theo thật. Cùng đơn vị `h-dvh` mà
       * `AppShell` đã dùng. Đây là arbitrary value cho CHIỀU CAO, không phải
       * padding/margin/gap, nên hàng rào `spacing-fence.test.ts` không chặn.
       *
       * Panel KHÔNG tự đặt padding: ba chỗ gọi có ba nhịp nội dung khác nhau
       * (`card-pad`, `p-3` lồng trong danh sách, header + form). Modal sở hữu
       * HÀNH VI và cái hộp; nội dung bên trong vẫn thuộc phía gọi.
       *
       * `overscroll-contain`: cuộn hết panel rồi tiếp tục vuốt sẽ không kéo theo
       * trang phía sau — thứ hay xảy ra nhất ở sheet chi tiết đơn trên điện thoại.
       */}
      <div
        ref={panelRef}
        // `-1`: nhận được tiêu điểm bằng script (xem effect) nhưng KHÔNG chen vào
        // thứ tự Tab — người dùng Tab một cái là sang thẳng control đầu tiên.
        tabIndex={-1}
        className={`absolute mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain bg-surface ${PANEL_PLACEMENT[placement]}`}
      >
        {children}
      </div>
    </dialog>
  );
}
