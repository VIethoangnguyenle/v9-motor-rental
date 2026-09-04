import { useCallback, useEffect, useRef } from "react";

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

/**
 * Trần chờ hiệu ứng ra trước khi báo `onClose` lên trên. Lớn hơn
 * `--duration-quick` (180ms) một quãng để không cắt ngang hiệu ứng thật trên
 * máy đang tải nặng, và ĐÚNG BẰNG trần cứng 400ms của design doc §4.2 — vượt
 * lên thì cái lưới an toàn tự nó thành độ trễ người dùng cảm được.
 *
 * Con số này chỉ được dùng khi `transitionend` không bao giờ tới. Trình duyệt
 * không hiểu `allow-discrete` không rơi vào đây nữa — `handleClose` bắt ca đó
 * bằng feature test và về đích ngay, xem chú thích ở đó.
 */
const EXIT_FALLBACK_MS = 400;

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
  footer,
}: {
  /** Tên của lớp phủ cho trình đọc màn hình (`aria-label` của `<dialog>`). */
  readonly label: string;
  readonly placement: ModalPlacement;
  /** Người dùng đã đóng — phía gọi gỡ component này khỏi cây. */
  readonly onClose: () => void;
  /**
   * Render prop, KHÔNG phải `ReactNode` — và đó là toàn bộ điểm của nó: nhận
   * `children` dưới dạng hàm là cách duy nhất để phía gọi KHÔNG THỂ vẽ nội dung
   * mà không được trao sẵn hàm đóng đúng.
   *
   * Ba chỗ gọi trước đây nối nút ✕ thẳng vào prop `onClose` của chính chúng,
   * tức gỡ component khỏi cây ngay lập tức — đo được: 4ms sau cú bấm là
   * `<dialog>` đã biến mất, và hiệu ứng ra không có một khung hình nào để chạy.
   * `close` bên dưới đi qua `dialog.close()` nên nó chạy đủ.
   *
   * KHÔNG dùng context cho việc này: provider sẽ nằm BÊN DƯỚI phía gọi trong
   * cây (nó ở trong `Modal`), mà cả ba nút ✕ lại nằm trong chính component gọi
   * `<Modal>` — muốn đọc được context thì phải tách mỗi nút ✕ ra một component
   * con, tức ba lần tách chỉ để lấy một hàm.
   */
  readonly children: (close: () => void) => React.ReactNode;
  /**
   * Hành động chính, neo ở CHÂN panel và KHÔNG cuộn theo nội dung.
   *
   * Sinh ra từ một ca đo được: ở 390px nút `Tạo đơn` của `RentalForm` nằm ở
   * y=705–749, tràn ra ngoài hộp `max-h-[90dvh]` của chính panel — chạm vào
   * nửa dưới của nút rơi vào nền `<dialog>` chứ không vào nút, tức 19/44px là
   * vùng chết. KHÔNG phải nav dưới đè lên nút: `<dialog>` mở bằng
   * `showModal()` nằm trong top layer, luôn vẽ trên mọi z-index thường, nên
   * nav (bắt đầu ở y=724, cùng phép tính chiều cao viewport nhưng không liên
   * quan nhân quả) không thể che được nó. Sheet chi tiết đơn còn nặng hơn:
   * 4/7 hành động (`Thêm ảnh` ×2, `Đã giao xe`, `Huỷ đơn`) nằm dưới nếp gấp
   * của panel, không có gì báo rằng chúng tồn tại.
   *
   * KHÔNG truyền thì panel giữ nguyên hành vi cũ — sheet "Thêm" đo sạch (0/6 nút
   * ngoài tầm) chính vì nội dung của nó ngắn hơn khung, nên nó không cần khe này.
   */
  readonly footer?: (close: () => void) => React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Nhờ chính `<dialog>` đóng, không gọi `onClose` thẳng. `onClose` vẫn bắn
   * ĐÚNG MỘT LẦN: `close()` trên một dialog đã đóng là no-op theo spec (không
   * có `open` thì trả về ngay), nên bấm ✕ hai lần thật nhanh chỉ sinh một event
   * `close`, và `finish()` bên dưới còn tự gỡ listener sau lần đầu.
   */
  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

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
    let exitTimer: ReturnType<typeof setTimeout> | undefined;

    // ⚠️ Báo lên trên NGAY trong `close` là xoá luôn hiệu ứng ra.
    //
    // Cả ba chỗ gọi đều render `<Modal>` có điều kiện (`{open && <Modal …>}`),
    // nên `onClose` = gỡ phần tử khỏi cây. `close()` gỡ `[open]` — hiệu ứng ra
    // bắt đầu — rồi bắn event `close`, và React gỡ `<dialog>` ngay sau đó. Đo
    // trên bản build: sau `close()` một khung hình là `document.querySelector
    // ("dialog")` đã ra `null`, `opacity` chưa kịp rời khỏi 1. Toàn bộ CSS
    // `allow-discrete` ở `index.css` đúng mà vẫn không thấy gì.
    //
    // Nên: giữ phần tử sống cho tới khi hiệu ứng ra chạy xong rồi mới báo.
    //
    // ⚠️ Chỉ che được đường đi QUA `dialog.close()`. Đó là lý do `children` là
    // render prop: mọi nút đóng của phía gọi phải dùng `close` được trao xuống,
    // chứ không nối thẳng vào prop `onClose` của chính nó. Đường nào gỡ
    // component mà không qua `close()` thì vẫn không có hiệu ứng ra, và không
    // có gì kêu — cleanup bên dưới là một đường như vậy, cố ý: lúc đó phần tử
    // đang bị gỡ vì lý do khác, không phải vì người dùng đóng.
    const finish = () => {
      if (unmounting) return;
      clearTimeout(exitTimer);
      el.removeEventListener("transitionend", onExitEnd);
      onCloseRef.current();
    };
    // Lọc theo `opacity` vì đó là thuộc tính LIÊN TỤC duy nhất trong danh sách
    // transition của `<dialog>`; `display`/`overlay` cũng bắn `transitionend`
    // nhưng ở mốc khác. `e.target === el` để một `transitionend` nổi lên từ nội
    // dung của phía gọi không kết thúc hộ.
    function onExitEnd(e: TransitionEvent) {
      if (e.target === el && e.propertyName === "opacity") finish();
    }
    const handleClose = () => {
      if (unmounting) return;

      // ⚠️ `dialog.close()` XẾP HÀNG sự kiện `close` chứ không bắn đồng bộ, nên
      // một `close` do cleanup của LẦN CHẠY TRƯỚC phát ra vẫn còn đang bay khi
      // listener này được gắn. StrictMode dựng đúng chuỗi đó trong MỘT task:
      // mount → cleanup (`el.close()`, sự kiện xếp hàng) → mount lại
      // (`showModal()` rồi gắn listener này) → sự kiện rơi vào ĐÂY. Thiếu dòng
      // dưới thì nó bị đọc là "người dùng đóng", `finish()` gọi `onClose`, và
      // phía gọi gỡ lớp phủ ngay khi vừa mở. Đo được trên `vite dev`: bấm nút
      // mở xong `document.querySelectorAll("dialog").length === 0` ở cả ba lớp
      // phủ; bỏ `<StrictMode>` khỏi `main.tsx` thì ra `dialogs=1, open=true`.
      // Bản build KHÔNG dính (production không double-invoke effect) — nên đây
      // là lỗi chỉ ở dev, và nó chặn toàn bộ vòng kiểm thị giác trên dev.
      //
      // Phân biệt bằng `el.open`, không bằng một cờ "vừa tháo". Đo bằng một
      // listener `close` pha capture gắn ngay lúc `<dialog>` vào DOM: trên
      // `vite dev` có đúng MỘT sự kiện, tới 9ms sau khi mount, và `el.open ===
      // true` — vì lần mount sau gọi `showModal()` TRƯỚC khi gắn listener này.
      // Trên bản build cũng một sự kiện, nhưng `el.open === false`; tức dòng
      // dưới không bao giờ chạm đường đi của bản build.
      //
      // Mọi đường đóng THẬT (Esc, bấm nền, nút ✕ qua `close`) đi qua
      // `dialog.close()`, mà `close()` gỡ `open` TRƯỚC khi xếp hàng sự kiện —
      // nên ở đó luôn `false` và không cái nào bị nuốt. Một cờ sống qua hai lần
      // chạy effect thì còn phải lo nó kẹt lại `true` khi sự kiện không tới;
      // `el.open` không mang trạng thái nào nên không kẹt được.
      if (el.open) return;

      // ⚠️ `<dialog>` đã đóng nhưng còn nằm trong top layer suốt 180ms hiệu ứng
      // ra. `pointer-events: none` ở `index.css` che được CHUỘT, không che được
      // BÀN PHÍM: mọi nút và link bên trong vẫn ở nguyên trong thứ tự Tab, nên
      // người dùng bàn phím Tab được vào một lớp phủ đang tan. `inert` đóng cả
      // hai cửa. Không cần trả lại: phần tử bị gỡ ngay sau khi hiệu ứng xong.
      el.inert = true;

      // ⚠️ Không có `allow-discrete` thì `display: none` áp TỨC THÌ, transition
      // không bao giờ khởi động, `transitionend` không bao giờ bắn — và lưới an
      // toàn bên dưới biến mỗi lần đóng thành 400ms đứng hình. Safari <17.4 và
      // Firefox <129 nằm đúng trong ca này. Hỏi thẳng trình duyệt rồi về đích
      // ngay: không có hiệu ứng để chờ thì không chờ.
      if (!CSS.supports("transition-behavior", "allow-discrete")) {
        finish();
        return;
      }

      el.addEventListener("transitionend", onExitEnd);
      // Lưới an toàn, KHÔNG phải thời lượng: nếu `transition` bị tắt hẳn ở đâu
      // đó thì `transitionend` không bao giờ bắn và lớp phủ treo lại vĩnh viễn
      // ở trạng thái đã đóng. `prefers-reduced-motion` KHÔNG rơi vào đây —
      // `index.css` để 1ms chứ không 0s, đúng để sự kiện vẫn bắn.
      exitTimer = setTimeout(finish, EXIT_FALLBACK_MS);
    };

    // `addEventListener` chứ không phải prop `onClose` của JSX: React map
    // `onClose` sang event `close` của `<dialog>`, nhưng tên đó trùng đúng tên
    // prop của chính component này — hai `onClose` với hai nghĩa khác nhau
    // trong cùng một file là cách chắc chắn nhất để người sau nối nhầm dây.
    el.addEventListener("close", handleClose);
    return () => {
      unmounting = true;
      clearTimeout(exitTimer);
      el.removeEventListener("transitionend", onExitEnd);
      el.removeEventListener("close", handleClose);
      // Gỡ listener xong mới `close()` — nhưng thế KHÔNG đủ, vì sự kiện `close`
      // được xếp hàng chứ không bắn tại chỗ: nó tới sau, và rơi vào listener của
      // lần chạy effect KẾ TIẾP nếu có. Chỗ bắt nó là guard `el.open` đầu
      // `handleClose`.
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
        // Thuộc tính `data-*` chứ không class Tailwind: ba hướng vào khác nhau
        // cần `@starting-style`, mà đó là at-rule — không diễn đạt được bằng
        // utility. Selector thuộc tính giữ toàn bộ luật ở một chỗ trong
        // `index.css`, cạnh chú thích giải thích ba cái bẫy của `<dialog>`.
        data-panel=""
        data-placement={placement}
        className={`absolute mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col overscroll-contain bg-surface ${
          footer ? "" : "overflow-y-auto"
        } ${PANEL_PLACEMENT[placement]}`}
      >
        {footer ? (
          <>
            {/* `min-h-0` BẮT BUỘC: một flex item mặc định không co xuống dưới nội dung
                của nó, nên thiếu dòng này thì vùng cuộn phình bằng nội dung và đẩy chân
                panel ra ngoài `max-h-[90dvh]` — đúng lại con bug đang sửa. */}
            <div data-modal-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {children(close)}
            </div>
            {/* `border-t` để chân không trôi lẫn vào nội dung khi cuộn tới sát nó.
                KHÔNG thêm padding ở đây: `PANEL_PLACEMENT` đã mang `pb-safe`, và phía
                gọi sở hữu nhịp nội dung của chính nó (xem chú thích của panel). */}
            <div className="shrink-0 border-t border-border">{footer(close)}</div>
          </>
        ) : (
          children(close)
        )}
      </div>
    </dialog>
  );
}
