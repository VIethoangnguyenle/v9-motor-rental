import {
  ArrowLeft,
  ArrowRight,
  Bike,
  CalendarCheck,
  CalendarDays,
  Camera,
  ChartColumnBig,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Info,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  OctagonAlert,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Sun,
  Trash2,
  TriangleAlert,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * ⚠️ `ui/` KHÔNG được biết domain — không import `lib/api`, không biết `Me` hay
 * `StaffRole` là gì.
 *
 * ## Vì sao có file này
 *
 * App từng dùng KÝ TỰ thay cho icon: `✕` ở ba nút đóng, `‹`/`›` ở nút lật kỳ của
 * lịch và ở dấu "còn tiếp" của thanh đơn, `●` ở chấm trạng thái, `+`/`←`/`→` ở
 * sáu nút hành động. `craft-floor` cấm thẳng: "Unicode glyphs or emoji standing
 * in for an icon system. Icons are drawn, from a real library or authored SVG,
 * in one consistent stroke and weight."
 *
 * Ký tự không phải icon, và ba hệ quả đo được:
 *   • Hình dạng do FONT quyết định. `✕` trong một font hệ thống không cùng độ
 *     dày nét với `‹` — hai nút cạnh nhau trong cùng một sheet đã lệch nhau.
 *   • Kích thước ăn theo `font-size`, nên không canh được theo lưới với chữ bên
 *     cạnh; căn quang học phải chỉnh tay ở từng chỗ.
 *   • Máy khác font khác → giao diện đổi hình dạng mà không ai đổi code.
 *
 * ## Vì sao là thư viện, và vì sao vẫn có lớp bọc này
 *
 * Hình lấy từ **lucide-react** thay vì tự vẽ path: bộ này được vẽ trên một lưới
 * thống nhất bởi người biết vẽ, và brief kiến trúc thông tin còn đòi thêm mấy
 * màn nữa — tự vẽ thì mỗi icon mới là một lần đoán lại tỉ lệ.
 *
 * Nhưng KHÔNG import thẳng `lucide-react` ở chỗ gọi, vì như vậy mỗi chỗ tự chọn
 * `size` và `strokeWidth` và bộ icon trôi ra khỏi một độ dày chung — đúng cái
 * bệnh mà việc bỏ ký tự Unicode sinh ra để chữa. Lớp bọc này ghim:
 *
 *   • `strokeWidth={2.5}` — KHÔNG phải 2 mặc định của Lucide. Đây là lựa chọn
 *     có chủ ý: 2.0 bo tròn đọc ra "phần mềm SaaS", còn app này là công cụ của
 *     một gara mô tô phân khối lớn (`PRODUCT.md`: moto-garage, không phải SaaS).
 *     Icon ở đây đứng trong nút 44px, nhìn dưới ánh sáng gara — mảnh hơn là mất.
 *   • cỡ **20px cố định**, KHÔNG phải `1em`. Đây là chỗ bản đầu của file này làm
 *     SAI, và chỉ phép đo mới thấy: với `size-[1em]`, icon trong nút `text-sm`
 *     render ra **14×14px trong một nút 48×44** — đúng bằng cỡ ký tự `‹` nó vừa
 *     thay. Thay xong nhìn KHÔNG khác gì, vì nó nặng thị giác y hệt một chữ cái.
 *     Icon có THANG RIÊNG: nó là hình, không phải glyph, nên không được ăn theo
 *     `font-size` của câu chữ bên cạnh. Chỗ nào cần nhỏ hơn thì khai tường minh
 *     (`size-3` cho dấu "còn tiếp" trong chip lịch), chứ không đổi mặc định.
 *   • `aria-hidden` — xem chú thích ở `Icon`.
 *
 * Import TỪNG icon một (không `import * as`) để tree-shaking còn cắt được phần
 * không dùng: cả bộ Lucide hơn 1.500 hình.
 */
const ICONS = {
  /** Đóng sheet/modal. */
  close: X,
  /** Lật về kỳ trước, và dấu "đơn còn kéo dài về trước" trên lưới lịch. */
  "chevron-left": ChevronLeft,
  /** Lật sang kỳ sau, và dấu "đơn còn kéo dài về sau". */
  "chevron-right": ChevronRight,
  /** Quay lại — trong nhãn nút, khác `chevron-*` (chỉ hướng, không đi đâu). */
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  /** Thêm mới: lên đơn, thêm khách hàng. */
  plus: Plus,
  search: Search,
  /** Gọi điện — số điện thoại trong app này là HÀNH ĐỘNG, không phải dữ liệu. */
  phone: Phone,
  /** Chụp/thêm ảnh bàn giao. */
  camera: Camera,
  /** Xoá ảnh. */
  trash: Trash2,
  /** Xác nhận đã xong một bước. */
  check: Check,

  // ── Điểm đến trên thanh điều hướng ────────────────────────────────────────
  //
  // Bảy mục nav trước đây là CHỮ TRẦN. Với một danh sách dọc bảy dòng chữ cùng
  // cỡ cùng màu, mắt phải ĐỌC mới biết mình đang ở đâu — icon cho phép nhận ra
  // bằng hình dạng, tức nhanh hơn một bậc. Trên bottom nav (<768px) nó còn quan
  // trọng hơn: ba ô chỉ có chữ nhỏ là ba ô trông giống hệt nhau.
  //
  // Chọn hình theo NGHĨA của màn hình, không theo tên:
  "nav-stats": ChartColumnBig,
  "nav-calendar": CalendarDays,
  /** Yêu cầu từ web — hộp thư đến, thứ chảy vào và cần xử lý. */
  "nav-requests": Inbox,
  /** Đơn thuê — chứng từ một lượt thuê, không phải "danh sách" chung chung. */
  "nav-rentals": ReceiptText,
  "nav-customers": Users,
  /** Bàn giao — chiếc xe rời shop rồi quay về; đây là màn việc VẬT LÝ. */
  "nav-handover": Bike,
  /** Nhân viên — quản trị người, khác `users` của khách hàng. */
  "nav-staff": UserCog,
  /** Đổi mật khẩu. */
  key: KeyRound,
  /** Đăng xuất. */
  "log-out": LogOut,

  // ── Kênh hình dạng ────────────────────────────────────────────────────────
  //
  // Năm hình dưới đây KHÔNG phải trang trí: chúng là kênh thông tin thứ hai
  // bên cạnh màu. Design doc §2.5 đo được sáu màu trạng thái không phân biệt
  // nổi dưới deuteranopia và không giá trị màu nào sửa được — lý lẽ đầy đủ ở
  // `lib/rental-status.ts` (`STATUS_ICON`) và `ui/alert.tsx` (`TONE_ICON`).
  //
  // Vì vậy tiêu chí chọn ở đây là SILHOUETTE, không phải mức dễ thương của
  // biểu tượng: dưới mù màu nặng thì đường bao là thứ còn lại. Hai chỗ dùng
  // chúng còn mượn lại `check`, `close`, `nav-calendar` và `nav-handover` ở
  // trên — bốn hình đó đã đủ khác nhau, vẽ thêm hình mới cho chúng chỉ làm bộ
  // icon phình ra mà không phân biệt thêm gì.

  /** Quá hạn trả — xe đang ngoài đường. Tam giác: hình cảnh báo mạnh nhất. */
  "alert-triangle": TriangleAlert,
  /**
   * Cảnh báo chung của `Alert`. Bát giác — silhouette THỨ BA, tách khỏi cả tam
   * giác (`error`) lẫn tròn (`info`).
   *
   * `clock` và `circle-alert` bị loại: cả hai đều là đường bao TRÒN, tức trùng
   * silhouette với `info` và tone `warning` lại chỉ còn phân biệt bằng màu —
   * đúng lỗi một-kênh mà cả mục này sinh ra để chữa. `clock` còn sai nghĩa:
   * không call site `tone="warning"` nào trong app nói về thời gian.
   */
  "octagon-alert": OctagonAlert,
  /** Chưa ai lấy xe. Tròn — khác hẳn tam giác kể cả khi mất màu. */
  clock: Clock,
  /** Phải trả hôm nay. */
  "calendar-check": CalendarCheck,
  /** Tone `info` của Alert. */
  info: Info,

  /** Nút gạt theme — trạng thái "theo hệ điều hành". */
  monitor: Monitor,
  /** Nút gạt theme — ép sáng. */
  sun: Sun,
  /** Nút gạt theme — ép tối. */
  moon: Moon,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/**
 * Hai cỡ, khai bằng PROP chứ không bằng `className`.
 *
 * Bản trước để phía gọi truyền `className="size-3"` và nó **im lặng không có
 * tác dụng**: `Icon` nối class của caller vào SAU `size-5` của mình, nhưng cả
 * hai đều là utility `size-*` nên thứ tự trong stylesheet quyết định ai thắng,
 * không phải thứ tự trong chuỗi. Đo trên app đang chạy: dấu "còn tiếp" khai
 * `size-3` vẫn render 20×20px.
 *
 * Đây đúng là cái bẫy `ui/text-field.tsx` đã ghi ("class của caller nối THÊM
 * vào, không ghi đè"). Một prop có kiểu thì không có đường hỏng im lặng: gõ sai
 * là lỗi biên dịch.
 */
const SIZE = {
  /** 12px — dấu "đơn còn kéo dài ngoài cửa sổ" nằm trong chip `text-xs` của lịch. */
  sm: "size-3",
  /** 20px — mặc định. Nút, link, dòng danh sách. */
  md: "size-5",
} as const;

export function Icon({
  name,
  size = "md",
  className = "",
}: {
  readonly name: IconName;
  readonly size?: keyof typeof SIZE;
  /**
   * MÀU (`text-*`) và căn quang học (`mt-*`) — không phải CỠ. Cỡ đi qua `size`,
   * xem lý lẽ ở `SIZE`: một `size-*` truyền qua đây hỏng im lặng.
   */
  readonly className?: string;
}) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      // `aria-hidden`: icon trong app này LUÔN đi kèm nhãn chữ hoặc `aria-label`
      // trên nút bao ngoài. Để trình đọc màn hình đọc thêm một lần nữa là đọc
      // đúp. Không có ngoại lệ — icon đứng một mình không nhãn là lỗi ở CHỖ GỌI.
      aria-hidden
      focusable="false"
      strokeWidth={2.5}
      className={`${SIZE[size]} shrink-0 ${className}`}
    />
  );
}
