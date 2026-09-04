import { describe, expect, it } from "bun:test";
import { ALL_REQUESTS, validateRequestsSearch } from "./requests-search";

describe("validateRequestsSearch", () => {
  /**
   * Ca đã cắn thật khi viết màn này: bản đầu biểu diễn "xem tất cả" bằng việc
   * THIẾU `?status=`, nhưng `validateSearch` của TanStack Router luôn chạy và
   * luôn trả đủ khoá — nên page không phân biệt được "URL chưa nói gì" với
   * "người dùng chọn Tất cả", và mặc định tụt từ "Chưa xử lý" xuống "Tất cả".
   */
  it("URL chưa nói gì thì mặc định 'NEW', KHÔNG phải xem tất cả", () => {
    expect(validateRequestsSearch({})).toEqual({ status: "NEW" });
  });

  it("'xem tất cả' là một giá trị có tên trong URL, không phải sự vắng mặt", () => {
    expect(validateRequestsSearch({ status: ALL_REQUESTS })).toEqual({ status: ALL_REQUESTS });
  });

  it("nhận đủ ba trạng thái thật của domain", () => {
    expect(validateRequestsSearch({ status: "NEW" })).toEqual({ status: "NEW" });
    expect(validateRequestsSearch({ status: "CONTACTED" })).toEqual({ status: "CONTACTED" });
    expect(validateRequestsSearch({ status: "CLOSED" })).toEqual({ status: "CLOSED" });
  });

  /**
   * Rơi về `NEW`, KHÔNG về `ALL`: màn này tồn tại để yêu cầu mới không trôi, nên
   * một URL hỏng không được phép mở ra kèm cả yêu cầu đã đóng.
   */
  it("giá trị lạ rơi về 'NEW' chứ không rơi về xem tất cả, và không throw", () => {
    expect(validateRequestsSearch({ status: "xyz" })).toEqual({ status: "NEW" });
    expect(validateRequestsSearch({ status: 7 })).toEqual({ status: "NEW" });
    expect(validateRequestsSearch({ status: null })).toEqual({ status: "NEW" });
  });
});
