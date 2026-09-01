"use server";

import { api } from "@/lib/api";
import messages from "@/messages/vi.json";
import type { RequestFormState } from "./form-state";

/**
 * Nhận form gửi yêu cầu thuê và chuyển tiếp sang `apps/api`.
 *
 * ⚠️ Đây là Server Action, và việc nó chạy trên SERVER là điểm kiến trúc, không
 * phải tuỳ chọn. `apps/api` chỉ mở CORS cho `staffAppUrl` (xem `index.ts`), nên
 * một `fetch` từ trình duyệt khách sang `POST /requests` sẽ bị chặn. Quan trọng
 * hơn: mở CORS cho origin công khai là biến đường ghi KHÔNG cần auth duy nhất của
 * API thành thứ mọi trang web trên đời gọi được bằng trình duyệt của khách. Giữ
 * lời gọi ở phía server thì bất biến "apps/web không nói chuyện với API từ
 * browser" còn nguyên, và CORS không phải nới một dòng nào.
 *
 * Trả `RequestFormState` thay vì ném hay `redirect()`: `useActionState` ở
 * `request-form.tsx` cần một giá trị để render, và khách cần thấy lại thứ mình
 * vừa gõ khi có lỗi.
 */
export async function submitRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  /**
   * `formData.get()` trả `string | File | null`. `String(file)` cho ra
   * `"[object File]"` — một chuỗi trông hợp lệ, đi lọt mọi kiểm tra "khác rỗng"
   * bên dưới, rồi hạ cánh vào cột `full_name`. Đây là endpoint nhận dữ liệu từ
   * người lạ, nên `typeof` là hàng rào chứ không phải phòng thủ thừa.
   */
  const read = (k: string): string => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };

  // Đọc ra BIẾN rồi mới gói vào `values`, không đọc ngược lại từ `values`:
  // `noUncheckedIndexedAccess` khiến `values.phone` có kiểu `string | undefined`,
  // và một `?? ""` rải khắp nơi chỉ để dỗ trình biên dịch là cách làm mất đúng
  // thông tin mà cờ đó sinh ra để giữ.
  const vehicleSlug = read("vehicleSlug");
  const fullName = read("fullName");
  const phone = read("phone");
  const startDate = read("startDate");
  const deliveryAddress = read("deliveryAddress");
  const note = read("note");
  const daysRaw = read("days");

  const values: Record<string, string> = {
    vehicleSlug,
    fullName,
    phone,
    startDate,
    days: daysRaw,
    deliveryAddress,
    note,
  };

  const days = Number(daysRaw);
  if (
    vehicleSlug === "" ||
    fullName === "" ||
    phone === "" ||
    startDate === "" ||
    !Number.isInteger(days)
  ) {
    return { status: "error", message: messages.request.required, values };
  }

  const { error } = await api.requests.post({
    vehicleSlug,
    fullName,
    phone,
    startDate,
    days,
    deliveryAddress: deliveryAddress === "" ? null : deliveryAddress,
    note: note === "" ? null : note,
  });

  if (error) {
    // `message` của API viết bằng tiếng Việt CHO NGƯỜI ĐỌC (xem đầu
    // `apps/staff/src/lib/errors.ts`) — hiện nguyên văn khi có, vì nó cụ thể hơn
    // câu chung chung: "Số điện thoại không hợp lệ" giúp khách sửa được, còn
    // "chưa gửi được" thì không. Chỉ rơi về câu chung khi lỗi không mang message
    // (mạng chết, 5xx), và câu đó chỉ sang kênh Zalo/Fanpage đang thật sự chạy.
    const value: unknown = error.value;
    const apiMessage =
      typeof value === "object" && value !== null && "message" in value
        ? String(value.message)
        : "";

    console.warn(`[web] gửi yêu cầu thất bại: HTTP ${String(error.status)} ${apiMessage}`);
    return {
      status: "error",
      message: apiMessage === "" ? messages.request.failed : apiMessage,
      values,
    };
  }

  // Câu này lấy NGUYÊN VĂN từ `booking.afterSubmit`, không viết mới. DESIGN.md §7
  // và `docs/workspaces/web.md`: không câu nào được ngụ ý xe đã được giữ.
  return { status: "ok", message: messages.booking.afterSubmit, values: {} };
}
