import { describe, expect, it } from "bun:test";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("bỏ khoảng trắng, dấu chấm, dấu gạch", () => {
    expect(normalizePhone("0912 345 678")).toBe("0912345678");
    expect(normalizePhone("0912.345.678")).toBe("0912345678");
    expect(normalizePhone("0912-345-678")).toBe("0912345678");
  });

  // Cùng một người, ba cách gõ. Không chuẩn hoá thì UNIQUE(phone) không chặn
  // được gì và danh sách khách bẩn dần theo tháng — không có lỗi ở đâu cả.
  it("quy +84 và 84 về dạng 0", () => {
    expect(normalizePhone("+84912345678")).toBe("0912345678");
    expect(normalizePhone("84912345678")).toBe("0912345678");
    expect(normalizePhone("+84 912 345 678")).toBe("0912345678");
  });

  it("giữ nguyên số đã đúng dạng", () => {
    expect(normalizePhone("0912345678")).toBe("0912345678");
  });

  it("trả null cho thứ không phải số điện thoại dùng được", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("091234567890123")).toBeNull();
    expect(normalizePhone("1912345678")).toBeNull();
  });

  // Hàm này ép đúng cái CHECK ở tầng DB. Lệch nhau thì service ghi được thứ
  // Postgres từ chối, và lỗi nổ ở chỗ không ai đọc được.
  it("mọi kết quả không-null đều khớp CHECK của bảng customers", () => {
    const pattern = /^0[0-9]{8,10}$/;
    for (const raw of ["0912 345 678", "+84912345678", "0281234567", "84987654321"]) {
      const n = normalizePhone(raw);
      expect(n).not.toBeNull();
      expect(n as string).toMatch(pattern);
    }
  });
});
