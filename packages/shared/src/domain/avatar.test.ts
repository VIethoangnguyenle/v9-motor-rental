import { describe, expect, it } from "bun:test";
import {
  AVATAR_CONTENT_TYPES,
  MAX_AVATAR_BYTES,
  avatarObjectKey,
  extensionForAvatarType,
  isAllowedAvatarType,
  isAvatarSizeValid,
  parseAvatarObjectKey,
} from "./avatar";

describe("isAllowedAvatarType", () => {
  it("nhận ba định dạng ảnh chụp", () => {
    expect(isAllowedAvatarType("image/jpeg")).toBe(true);
    expect(isAllowedAvatarType("image/png")).toBe(true);
    expect(isAllowedAvatarType("image/webp")).toBe(true);
  });

  it("chuẩn hoá tham số và hoa/thường — trình duyệt gửi cả hai kiểu", () => {
    expect(isAllowedAvatarType("image/jpeg; charset=binary")).toBe(true);
    expect(isAllowedAvatarType("IMAGE/JPEG")).toBe(true);
    expect(isAllowedAvatarType("  image/png  ")).toBe(true);
  });

  it("TỪ CHỐI image/svg+xml — đó là tài liệu chạy được script, không phải ảnh", () => {
    expect(isAllowedAvatarType("image/svg+xml")).toBe(false);
  });

  it("từ chối ảnh động và định dạng lạ", () => {
    expect(isAllowedAvatarType("image/gif")).toBe(false);
    expect(isAllowedAvatarType("application/pdf")).toBe(false);
    expect(isAllowedAvatarType("")).toBe(false);
  });
});

describe("AVATAR_CONTENT_TYPES", () => {
  it("đúng bằng tập mà `isAllowedAvatarType` nhận — route không được chép tay lần hai", () => {
    for (const contentType of AVATAR_CONTENT_TYPES) {
      expect(isAllowedAvatarType(contentType)).toBe(true);
    }
    expect(AVATAR_CONTENT_TYPES.length).toBe(3);
  });

  it("không chứa định dạng bị cấm", () => {
    expect(AVATAR_CONTENT_TYPES.includes("image/svg+xml")).toBe(false);
    expect(AVATAR_CONTENT_TYPES.includes("image/gif")).toBe(false);
  });
});

describe("extensionForAvatarType", () => {
  it("đồng ý với isAllowedAvatarType ở MỌI đầu vào thử", () => {
    for (const t of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
      "image/gif",
      "",
      "rác",
    ]) {
      expect(extensionForAvatarType(t) !== null).toBe(isAllowedAvatarType(t));
    }
  });

  it("trả đuôi file, không trả nguyên content type", () => {
    expect(extensionForAvatarType("image/jpeg")).toBe("jpg");
    expect(extensionForAvatarType("image/webp")).toBe("webp");
  });
});

describe("isAvatarSizeValid", () => {
  it("trần là 1 MB — nhỏ hơn hẳn ảnh bàn giao", () => {
    expect(MAX_AVATAR_BYTES).toBe(1024 * 1024);
    expect(isAvatarSizeValid(MAX_AVATAR_BYTES)).toBe(true);
    expect(isAvatarSizeValid(MAX_AVATAR_BYTES + 1)).toBe(false);
  });

  it("từ chối 0 byte — file rỗng là lỗi, không phải ảnh", () => {
    expect(isAvatarSizeValid(0)).toBe(false);
    expect(isAvatarSizeValid(1)).toBe(true);
  });

  it("từ chối giá trị bẩn thay vì dựa vào thứ tự so sánh", () => {
    expect(isAvatarSizeValid(Number.NaN)).toBe(false);
    expect(isAvatarSizeValid(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isAvatarSizeValid(-1)).toBe(false);
    expect(isAvatarSizeValid(1.5)).toBe(false);
  });
});

describe("avatarObjectKey", () => {
  it("chỉ ghép id và hằng — không mảnh nào đến từ tên file người dùng", () => {
    expect(avatarObjectKey("staff-1", "av-9", "webp")).toBe("staff/staff-1/avatar/av-9.webp");
  });

  it("khoá đổi theo avatarId — thay ảnh KHÔNG ghi đè object cũ", () => {
    const a = avatarObjectKey("staff-1", "av-1", "webp");
    const b = avatarObjectKey("staff-1", "av-2", "webp");
    expect(a).not.toBe(b);
  });

  it("mỗi người một tiền tố riêng — xoá sạch một người là xoá một tiền tố", () => {
    expect(avatarObjectKey("A", "x", "png").startsWith("staff/A/")).toBe(true);
    expect(avatarObjectKey("B", "x", "png").startsWith("staff/B/")).toBe(true);
  });
});

describe("parseAvatarObjectKey", () => {
  it("đọc ngược ĐÚNG thứ `avatarObjectKey` ghi ra, cho mọi định dạng nhận được", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      const extension = extensionForAvatarType(contentType);
      expect(extension).not.toBeNull();
      const key = avatarObjectKey("staff-1", "av-9", extension ?? "");
      expect(parseAvatarObjectKey(key)).toEqual({
        staffId: "staff-1",
        avatarId: "av-9",
        contentType,
      });
    }
  });

  it("trả null cho khoá không đúng khuôn — hàng cũ hay ai đó sửa tay DB", () => {
    expect(parseAvatarObjectKey("")).toBeNull();
    expect(parseAvatarObjectKey("staff/staff-1/avatar/av-9")).toBeNull();
    expect(parseAvatarObjectKey("rentals/r-1/HANDOVER/p-1.webp")).toBeNull();
    expect(parseAvatarObjectKey("staff/staff-1/avatar/av-9.webp/thêm")).toBeNull();
  });

  it("trả null cho đuôi file không thuộc bảng định dạng", () => {
    expect(parseAvatarObjectKey("staff/staff-1/avatar/av-9.svg")).toBeNull();
    expect(parseAvatarObjectKey("staff/staff-1/avatar/av-9.gif")).toBeNull();
  });
});
