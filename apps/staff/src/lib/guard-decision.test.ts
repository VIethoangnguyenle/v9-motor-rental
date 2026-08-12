import { describe, expect, it } from "bun:test";
import { decideEntry } from "./guard-decision";
import type { Me } from "./me";

/**
 * `Me` suy ra từ response schema của `GET /staff/me` — sáu field, không hơn.
 * Dựng bằng literal thay vì mock: hàm đang test là hàm thuần, không cần gì khác.
 */
const me = (status: Me["status"]): Me => ({
  id: "u1",
  email: "a@v9.vn",
  fullName: "Nguyễn A",
  phone: null,
  role: "STAFF",
  status,
});

describe("decideEntry", () => {
  it("ca 1: không có session → về đăng nhập, không kèm lý do", () => {
    expect(decideEntry(false, null)).toEqual({ type: "redirect", to: "/dang-nhap" });
  });

  /**
   * Có session nhưng không đọc được kết quả — hôm nay chỗ gọi thật không sinh ra
   * được trạng thái này (`queryFn` luôn resolve một object), nên đây là phòng thủ.
   * Vẫn test: điều kiện `!hasSession || !result` có hai nửa, và một nửa không có
   * ca nào chạm là một nửa đổi thành `&&` mà cả bộ test vẫn xanh.
   */
  it("ca 1b: có session nhưng không có kết quả → về đăng nhập, không đăng xuất", () => {
    expect(decideEntry(true, null)).toEqual({ type: "redirect", to: "/dang-nhap" });
  });

  it("ca 2: 403 DA_KHOA → đăng xuất TRƯỚC rồi mới chuyển, kèm lý do", () => {
    expect(decideEntry(true, { ok: false, code: "DA_KHOA" })).toEqual({
      type: "signOutThenRedirect",
      to: "/dang-nhap",
      reason: "disabled",
    });
  });

  it("ca 3: 403 CHUA_CO_HO_SO → cũng đăng xuất, lý do riêng", () => {
    expect(decideEntry(true, { ok: false, code: "CHUA_CO_HO_SO" })).toEqual({
      type: "signOutThenRedirect",
      to: "/dang-nhap",
      reason: "no-profile",
    });
  });

  /**
   * Ca quan trọng nhất của file này. `code === null` gộp cả "mạng chết" — huỷ một
   * session còn hợp lệ vì wifi chớp một cái là hỏng theo chiều sai. Chỉ đăng xuất
   * khi server NÓI RÕ tài khoản không dùng được nữa.
   */
  it("ca 4: lỗi không rõ hoặc mạng chết → chuyển hướng nhưng KHÔNG đăng xuất", () => {
    expect(decideEntry(true, { ok: false, code: null })).toEqual({
      type: "redirect",
      to: "/dang-nhap",
    });
    expect(decideEntry(true, { ok: false, code: "CHUA_DANG_NHAP" })).toEqual({
      type: "redirect",
      to: "/dang-nhap",
    });
  });

  it("ca 5: PENDING → màn chờ duyệt", () => {
    expect(decideEntry(true, { ok: true, me: me("PENDING") })).toEqual({
      type: "redirect",
      to: "/cho-duyet",
    });
  });

  /**
   * Hôm nay API KHÔNG trả được nhánh này: `staff-guard.ts` chặn DISABLED trước cả
   * ngoại lệ `/staff/me`, nên người bị khoá luôn ra 403 DA_KHOA (ca 2). Giữ ca này
   * để nếu ngoại lệ đó đổi thì đây là chỗ đúng — và để tính không-tới-được của nó
   * là một tính chất ĐƯỢC TEST, không phải một lỗi im lặng.
   */
  it("ca 6: hồ sơ nói DISABLED → đăng xuất rồi chuyển (phòng thủ)", () => {
    expect(decideEntry(true, { ok: true, me: me("DISABLED") })).toEqual({
      type: "signOutThenRedirect",
      to: "/dang-nhap",
      reason: "disabled",
    });
  });

  it("ca 7: ACTIVE → cho vào, kèm hồ sơ", () => {
    const hoSo = me("ACTIVE");
    expect(decideEntry(true, { ok: true, me: hoSo })).toEqual({ type: "allow", me: hoSo });
  });
});
