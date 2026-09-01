import { describe, expect, it } from "bun:test";
import {
  MAX_PHOTO_BYTES,
  PHOTO_KINDS,
  extensionForPhotoType,
  isAllowedPhotoType,
  isPhotoSizeValid,
  photoObjectKey,
  type PhotoKind,
} from "./rental-photo";

describe("PHOTO_KINDS", () => {
  it("đúng ba loại, và kiểu suy ra từ chính mảng", () => {
    expect(PHOTO_KINDS).toEqual(["DOCUMENT", "HANDOVER", "RETURN"]);
    const k: PhotoKind = "HANDOVER";
    expect(PHOTO_KINDS.includes(k)).toBe(true);
  });
});

describe("isAllowedPhotoType", () => {
  it("nhận ba định dạng ảnh điện thoại hay chụp ra", () => {
    expect(isAllowedPhotoType("image/jpeg")).toBe(true);
    expect(isAllowedPhotoType("image/png")).toBe(true);
    expect(isAllowedPhotoType("image/webp")).toBe(true);
  });

  it("bỏ qua tham số charset và khoảng trắng — trình duyệt có gửi kèm", () => {
    expect(isAllowedPhotoType("image/jpeg; charset=binary")).toBe(true);
    expect(isAllowedPhotoType("  image/png  ")).toBe(true);
  });

  it("không phân biệt hoa thường", () => {
    expect(isAllowedPhotoType("IMAGE/JPEG")).toBe(true);
  });

  /**
   * `image/svg+xml` bị từ chối CÓ CHỦ Ý dù nó là ảnh: SVG là tài liệu XML chạy
   * được script, nên một file SVG phục vụ lại từ cùng origin là một đường XSS.
   * Đây không phải ca biên — nó là định dạng "ảnh" duy nhất có hành vi.
   */
  it("TỪ CHỐI svg — là ảnh, nhưng chạy được script", () => {
    expect(isAllowedPhotoType("image/svg+xml")).toBe(false);
  });

  it("từ chối mọi thứ không phải ảnh", () => {
    expect(isAllowedPhotoType("application/pdf")).toBe(false);
    expect(isAllowedPhotoType("text/html")).toBe(false);
    expect(isAllowedPhotoType("")).toBe(false);
    expect(isAllowedPhotoType("image/")).toBe(false);
  });
});

describe("isPhotoSizeValid", () => {
  it("một byte là hợp lệ, đúng trần cũng vậy", () => {
    expect(isPhotoSizeValid(1)).toBe(true);
    expect(isPhotoSizeValid(MAX_PHOTO_BYTES)).toBe(true);
  });

  it("rỗng và quá trần thì không", () => {
    expect(isPhotoSizeValid(0)).toBe(false);
    expect(isPhotoSizeValid(MAX_PHOTO_BYTES + 1)).toBe(false);
  });

  it("NaN, Infinity và số lẻ bị từ chối — byte là số nguyên", () => {
    expect(isPhotoSizeValid(Number.NaN)).toBe(false);
    expect(isPhotoSizeValid(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPhotoSizeValid(1.5)).toBe(false);
    expect(isPhotoSizeValid(-1)).toBe(false);
  });

  /**
   * Trần phải đủ lớn cho một tấm ảnh điện thoại hiện đại chụp thẳng, không nén.
   * Đặt quá thấp thì nhân viên đứng ở bãi xe bấm gửi và bị từ chối — và họ sẽ
   * bỏ luôn việc chụp, tức mất bằng chứng.
   */
  it("trần đủ cho ảnh điện thoại chụp thẳng (≥ 8 MB)", () => {
    expect(MAX_PHOTO_BYTES).toBeGreaterThanOrEqual(8 * 1024 * 1024);
  });
});

describe("extensionForPhotoType", () => {
  it("trả đuôi khớp từng định dạng", () => {
    expect(extensionForPhotoType("image/jpeg")).toBe("jpg");
    expect(extensionForPhotoType("image/png")).toBe("png");
    expect(extensionForPhotoType("image/webp")).toBe("webp");
  });

  it("chuẩn hoá trước khi tra, cùng khuôn `isAllowedPhotoType`", () => {
    expect(extensionForPhotoType("IMAGE/JPEG; charset=binary")).toBe("jpg");
  });

  it("trả null cho định dạng không nhận", () => {
    expect(extensionForPhotoType("image/svg+xml")).toBeNull();
    expect(extensionForPhotoType("application/pdf")).toBeNull();
  });
});

describe("photoObjectKey", () => {
  const RENTAL = "11111111-1111-4111-8111-111111111111";
  const PHOTO = "22222222-2222-4222-8222-222222222222";

  it("gộp đơn / loại / id ảnh thành đường dẫn có cấu trúc", () => {
    expect(photoObjectKey(RENTAL, "HANDOVER", PHOTO, "jpg")).toBe(
      `rentals/${RENTAL}/HANDOVER/${PHOTO}.jpg`,
    );
  });

  /**
   * Khoá phải suy được TỪ id, không phải từ tên file khách/nhân viên gửi lên.
   * Tên file người dùng là dữ liệu không tin được: `../../etc/passwd` hay một
   * tên dài 4KB đều là chuyện có thật ở endpoint upload.
   */
  it("không phụ thuộc tên file gửi lên — mọi thành phần đều là id hoặc hằng", () => {
    const key = photoObjectKey(RENTAL, "DOCUMENT", PHOTO, "png");
    expect(key).not.toContain("..");
    expect(key.startsWith("rentals/")).toBe(true);
    expect(key.split("/")).toHaveLength(4);
  });

  it("mỗi loại nằm một nhánh riêng — xoá ảnh giấy tờ của một đơn là xoá một tiền tố", () => {
    const doc = photoObjectKey(RENTAL, "DOCUMENT", PHOTO, "jpg");
    const handover = photoObjectKey(RENTAL, "HANDOVER", PHOTO, "jpg");
    expect(doc).not.toBe(handover);
    expect(doc.startsWith(`rentals/${RENTAL}/DOCUMENT/`)).toBe(true);
  });
});
