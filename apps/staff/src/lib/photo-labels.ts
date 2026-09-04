import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import type { PhotoKind } from "@v9/shared/domain/rental-photo";

/**
 * Tên và câu gợi ý của ba loại ảnh bàn giao, cùng khuôn format mốc chụp.
 *
 * Ba hằng này sinh ra trong `components/rentals/handover-photos.tsx` và ở đó tới
 * khi màn Hiện trường cần đúng chúng. Chuyển ra đây thay vì chép: hai màn cùng
 * gọi một tấm ảnh bằng hai cái tên là đúng lớp lỗi mà `lib/rental-status.ts` đã
 * gộp `STATUS_LABEL` để chặn — chỉ khác là ở ảnh chứ không ở trạng thái.
 *
 * `lib/` chứ không `components/`: đây là từ vựng của sản phẩm, không phải một
 * mảnh giao diện, và `components/ui/` thì bị cấm biết domain (xem `ui/button.tsx`).
 */
export const KIND_LABEL: Record<PhotoKind, string> = {
  DOCUMENT: "Giấy tờ tuỳ thân",
  HANDOVER: "Tình trạng xe lúc giao",
  RETURN: "Tình trạng xe lúc nhận lại",
};

/**
 * Nhãn NGẮN cho chỗ chật — trạm trên trục dọc màn Hiện trường ở 360px không đủ
 * chỗ cho "Tình trạng xe lúc nhận lại" mà không xuống ba dòng.
 *
 * Không phải bản rút gọn tuỳ tiện của `KIND_LABEL`: mỗi nhãn ở đây vẫn phải tự
 * đứng một mình đọc ra nghĩa, vì trên trục dọc nó là thứ DUY NHẤT gọi tên trạm.
 */
export const KIND_LABEL_SHORT: Record<PhotoKind, string> = {
  DOCUMENT: "Giấy tờ",
  HANDOVER: "Lúc giao",
  RETURN: "Lúc nhận lại",
};

export const KIND_HINT: Record<PhotoKind, string> = {
  DOCUMENT: "CCCD hoặc hộ chiếu shop đang giữ cho đơn này.",
  HANDOVER: "Chụp trước khi khách đi — vết xước có sẵn phải nằm trong ảnh này.",
  RETURN: "Chụp lúc nhận lại, cùng góc với ảnh lúc giao thì dễ đối chiếu nhất.",
};

/**
 * Mốc chụp ảnh, theo giờ SHOP chứ không theo đồng hồ máy đang xem.
 *
 * Nhân viên đối chiếu con số này với khách ("tấm này chụp lúc mấy giờ"), nên đọc
 * theo đồng hồ của người xem là sai. Mọi `Intl.DateTimeFormat` khác trong app
 * đều khai `timeZone` tường minh; lý lẽ đầy đủ ở `calendar-timeline.tsx`.
 */
export const PHOTO_TIME_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
