/**
 * Đọc lỗi của `apps/api` — và lý do file này tồn tại KHÔNG phải là "đoán sai
 * hình dạng response".
 *
 * Mọi route của ta khai lỗi bằng đúng một schema: `{ message, code }`. Nhưng
 * kiểu Eden suy ra cho `res.error.value` là hợp của NHIỀU hơn thế, và cả phần
 * thừa đều là response CÓ THẬT:
 *
 *   • 401 `CHUA_DANG_NHAP` · 403 `DA_KHOA` / `CHUA_CO_HO_SO` / `CHO_DUYET` —
 *     `staffGuard` khai `onBeforeHandle({ as: "global" })`, nên Elysia gộp kiểu
 *     trả về của nó vào response của MỌI route, kể cả route công khai.
 *   • 422 validation dựng sẵn của Elysia — hình dạng khác hẳn
 *     (`{ type: "validation", on, message?, … }`, KHÔNG có `code`).
 *
 * Vì vậy `res.error.value.code` không biên dịch được, và cách đúng không phải là
 * `as` cho im: một 422 thật sẽ không có `code` lúc chạy. Hai hàm dưới đọc những
 * gì có mặt và nói thẳng khi không đọc được.
 */
export interface ApiError {
  readonly message: string;
  readonly code: string;
}

/** `null` khi thân lỗi không phải hình dạng `{ message, code }` của ta. */
export function parseApiError(value: unknown): ApiError | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("message" in value) || !("code" in value)) return null;
  const { message, code } = value;
  if (typeof message !== "string" || typeof code !== "string") return null;
  return { message, code };
}

/**
 * Thông điệp để hiện cho người dùng. Thông điệp của backend đã là tiếng Việt và
 * viết cho người đọc (`THONG_DIEP` trong `apps/api/src/routes/staff.ts`) — hiện
 * nguyên văn, đừng dịch lại ở đây thành bản thứ hai sẽ lệch.
 */
export const errorMessage = (value: unknown, macDinh: string): string =>
  parseApiError(value)?.message ?? macDinh;

/** Mã máy đọc được, để phân nhánh. `null` khi thân lỗi không mang mã. */
export const errorCode = (value: unknown): string | null => parseApiError(value)?.code ?? null;
