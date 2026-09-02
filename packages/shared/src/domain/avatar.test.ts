import { describe, expect, it } from "bun:test";
import {
  MAX_AVATAR_BYTES,
  avatarObjectKey,
  extensionForAvatarType,
  isAllowedAvatarType,
  isAvatarSizeValid,
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
