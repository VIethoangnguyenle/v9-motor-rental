/**
 * Chuẩn hoá số điện thoại Việt Nam về đúng một dạng: chỉ chữ số, bắt đầu bằng `0`.
 *
 * Dùng ở CẢ đường ghi lẫn đường đọc. Chỉ chuẩn hoá một đường là tạo ra hàng không
 * bao giờ tìm thấy — đúng lớp lỗi đã ghi ở docs/DEBT.md cho email phân biệt hoa
 * thường: không exception, không log, chỉ một danh sách bẩn dần.
 *
 * Trả `null` khi chuỗi không dùng được, thay vì throw hay trả về rác: gọi ở tầng
 * service rồi dịch thành lỗi HTTP.
 */
export function normalizePhone(raw: string): string | null {
  // Bỏ mọi thứ không phải chữ số, trừ dấu `+` ở đầu (đã xử lý ngay dưới).
  const digits = raw.trim().replace(/[^\d+]/g, "");

  let local = digits;
  if (local.startsWith("+84")) local = `0${local.slice(3)}`;
  else if (local.startsWith("84") && !local.startsWith("840")) local = `0${local.slice(2)}`;

  local = local.replace(/\D/g, "");

  // Cùng biểu thức với CHECK `customers_phone_normalized` ở packages/db.
  // Hai chỗ phải khớp; test ở file này khoá điều đó lại.
  return /^0[0-9]{8,10}$/.test(local) ? local : null;
}
