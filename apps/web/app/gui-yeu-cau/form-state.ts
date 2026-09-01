/**
 * Kiểu + giá trị khởi tạo cho form gửi yêu cầu.
 *
 * ⚠️ File này tồn tại RIÊNG vì một luật của Server Actions, không phải vì thẩm
 * mỹ chia file: một module mang directive `"use server"` chỉ được export **hàm
 * async**. Mọi export khác — kể cả một hằng object — không đi qua được ranh giới
 * server/client: bundler thay nó bằng một tham chiếu hành động, và phía client
 * đọc ra `undefined`.
 *
 * Đã cắn thật: `EMPTY_STATE` từng nằm trong `actions.ts`, và `useActionState`
 * nhận `undefined` làm state khởi tạo. Triệu chứng là 500 ở LẦN RENDER ĐẦU với
 * `Cannot read properties of undefined (reading 'vehicleSlug')` — trỏ vào dòng
 * JSX đọc `state.values`, tức cách xa nguyên nhân thật một quãng.
 *
 * `import type` từ `actions.ts` thì vẫn an toàn (kiểu bị xoá lúc biên dịch);
 * chỉ GIÁ TRỊ mới là thứ không qua được.
 */
export interface RequestFormState {
  readonly status: "idle" | "ok" | "error";
  /** Câu hiện cho khách. Rỗng khi `idle`. */
  readonly message: string;
  /**
   * Giá trị khách vừa gõ, trả ngược lại để form điền lại khi lỗi.
   *
   * Không có nó thì một lỗi mạng xoá sạch sáu ô vừa gõ — trên điện thoại, giữa
   * một chuyến đi, đó là chỗ khách bỏ cuộc và quay lại Zalo. Đây chính là hành vi
   * mà `PRODUCT.md` nói web sinh ra để thay thế.
   */
  readonly values: Record<string, string>;
}

export const EMPTY_STATE: RequestFormState = { status: "idle", message: "", values: {} };
