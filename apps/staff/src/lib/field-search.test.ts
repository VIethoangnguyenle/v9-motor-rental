import { describe, expect, it } from "bun:test";
import { validateFieldSearch } from "./field-search";

describe("validateFieldSearch", () => {
  it("không có `?rental=` thì chuỗi rỗng — màn hình tự mở việc gấp nhất", () => {
    expect(validateFieldSearch({})).toEqual({ rental: "" });
  });

  it("giữ nguyên id được yêu cầu", () => {
    expect(validateFieldSearch({ rental: "abc-123" })).toEqual({ rental: "abc-123" });
  });

  /**
   * KHÔNG kiểm dạng UUID: chỗ duy nhất biết id có thật hay không là hàng đợi vừa
   * tải về, nên một chuỗi đúng dạng UUID mà không có trong hàng đợi vẫn phải rơi
   * về cùng nhánh với chuỗi rác. Kiểm dạng ở đây chỉ sinh ra nhánh thứ hai làm
   * cùng một việc.
   */
  it("giá trị không phải chuỗi bị lọc, không throw", () => {
    expect(validateFieldSearch({ rental: 7 })).toEqual({ rental: "" });
    expect(validateFieldSearch({ rental: null })).toEqual({ rental: "" });
  });
});
