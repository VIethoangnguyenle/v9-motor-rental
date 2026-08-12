import { describe, expect, it } from "bun:test";
import { docLoi, maLoi, thongDiepLoi } from "./loi";

/**
 * Hình dạng 422 THẬT của Elysia (`node_modules/.../elysia/dist/error.js`,
 * class `ValidationError`, chế độ không phải production): body là chuỗi JSON
 * của `{ type: "validation", on, property, message, summary, expected,
 * found, errors }`. Có `message` (string, mô tả field sai) nhưng KHÔNG BAO
 * GIỜ có `code` — đây chính là ca `docLoi` phải loại, và là lý do
 * `"message" in value` một mình không đủ.
 */
const loi422Elysia = {
  type: "validation",
  on: "body",
  property: "email",
  message: "Expected string",
  summary: "Property 'email' should be string",
  expected: { email: "" },
  found: { email: 1 },
  errors: [],
};

describe("docLoi", () => {
  it("ca 1: hình dạng đúng { message, code } → đọc được cả hai field", () => {
    expect(docLoi({ message: "x", code: "Y" })).toEqual({ message: "x", code: "Y" });
  });

  it("ca 2: 422 validation dựng sẵn của Elysia (có message, KHÔNG có code) → null", () => {
    expect(docLoi(loi422Elysia)).toBeNull();
  });

  it("ca 3: null → null", () => {
    expect(docLoi(null)).toBeNull();
  });

  it("ca 4: chuỗi thay vì object → null", () => {
    expect(docLoi("chuỗi")).toBeNull();
  });

  it("ca 5: undefined → null", () => {
    expect(docLoi(undefined)).toBeNull();
  });

  it("ca 6: object rỗng, thiếu cả hai field → null", () => {
    expect(docLoi({})).toBeNull();
  });

  it("ca 7: có đủ hai field nhưng cả hai sai kiểu giá trị (số thay vì chuỗi) → null", () => {
    expect(docLoi({ message: 1, code: 2 })).toBeNull();
  });

  // Hai ca dưới tách riêng từng field: `{ message: 1, code: 2 }` ở ca 7 sai CẢ
  // HAI, nên nó không phân biệt được nhánh nào trong hai nhánh `typeof` đang
  // thật sự chặn. Bỏ một trong hai ca dưới thì nhánh còn lại của
  // `docLoi` mất người canh — sai kiểu chỉ MỘT field vẫn phải bị chặn.
  it("ca 7b: chỉ message sai kiểu (code vẫn là chuỗi hợp lệ) → null", () => {
    expect(docLoi({ message: 1, code: "Y" })).toBeNull();
  });

  it("ca 7c: chỉ code sai kiểu (message vẫn là chuỗi hợp lệ) → null", () => {
    expect(docLoi({ message: "x", code: 1 })).toBeNull();
  });

  it("ca 8: chỉ có message, thiếu code → null", () => {
    expect(docLoi({ message: "x" })).toBeNull();
  });

  it("ca 9: chỉ có code, thiếu message → null", () => {
    expect(docLoi({ code: "Y" })).toBeNull();
  });
});

describe("maLoi", () => {
  it("ca 1: hình dạng đúng → trả về code", () => {
    expect(maLoi({ message: "x", code: "DA_KHOA" })).toBe("DA_KHOA");
  });

  it("ca 2: 422 validation của Elysia → null, không phải chuỗi rỗng hay undefined", () => {
    expect(maLoi(loi422Elysia)).toBeNull();
  });

  it("ca 3: null → null", () => {
    expect(maLoi(null)).toBeNull();
  });

  it("ca 4: chuỗi → null", () => {
    expect(maLoi("chuỗi")).toBeNull();
  });

  it("ca 5: undefined → null", () => {
    expect(maLoi(undefined)).toBeNull();
  });

  it("ca 6: object rỗng → null", () => {
    expect(maLoi({})).toBeNull();
  });

  it("ca 7: sai kiểu giá trị → null", () => {
    expect(maLoi({ message: 1, code: 2 })).toBeNull();
  });
});

describe("thongDiepLoi", () => {
  it("ca 1: hình dạng đúng → hiện nguyên văn message của backend, không phải mặc định", () => {
    expect(thongDiepLoi({ message: "Tài khoản đã bị khoá", code: "DA_KHOA" }, "mặc định")).toBe(
      "Tài khoản đã bị khoá",
    );
  });

  it("ca 2: 422 validation của Elysia → rơi về mặc định vì docLoi không đọc được", () => {
    expect(thongDiepLoi(loi422Elysia, "mặc định")).toBe("mặc định");
  });

  it("ca 3: null → rơi về mặc định", () => {
    expect(thongDiepLoi(null, "mặc định")).toBe("mặc định");
  });
});
