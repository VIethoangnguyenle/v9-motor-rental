import { describe, expect, it } from "bun:test";
import { RENTAL_STATUSES } from "./rental";
import { PHOTO_KINDS, type PhotoKind } from "./rental-photo";
import { missingEvidence, nextEvidence, requiredEvidenceFor } from "./rental-evidence";

describe("requiredEvidenceFor", () => {
  it("BOOKED nợ giấy tờ và ảnh lúc giao — hai thứ phải có TRƯỚC khi bấm 'Đã giao xe'", () => {
    expect(requiredEvidenceFor("BOOKED")).toEqual(["DOCUMENT", "HANDOVER"]);
  });

  it("ONGOING chỉ nợ ảnh lúc nhận lại — hai thứ kia thuộc bước đã qua", () => {
    expect(requiredEvidenceFor("ONGOING")).toEqual(["RETURN"]);
  });

  it("đơn đã đóng không nợ gì thêm", () => {
    expect(requiredEvidenceFor("COMPLETED")).toEqual([]);
    expect(requiredEvidenceFor("CANCELLED")).toEqual([]);
  });

  it("phủ đủ bốn trạng thái, và chỉ trả loại ảnh có thật", () => {
    for (const status of RENTAL_STATUSES) {
      for (const kind of requiredEvidenceFor(status)) {
        expect(PHOTO_KINDS).toContain(kind);
      }
    }
  });
});

describe("missingEvidence", () => {
  it("trừ đi loại đã có, giữ nguyên thứ tự nợ", () => {
    expect(missingEvidence("BOOKED", ["DOCUMENT"])).toEqual(["HANDOVER"]);
    expect(missingEvidence("BOOKED", [])).toEqual(["DOCUMENT", "HANDOVER"]);
  });

  it("đủ rồi thì rỗng, và ảnh thừa loại khác không làm nó nợ thêm", () => {
    expect(missingEvidence("BOOKED", ["HANDOVER", "DOCUMENT", "RETURN"])).toEqual([]);
  });

  it("nhiều ảnh cùng loại vẫn chỉ trả đúng một món nợ đã trả", () => {
    expect(missingEvidence("ONGOING", ["RETURN", "RETURN"])).toEqual([]);
  });

  it("ONGOING thiếu ảnh của bước ĐÃ QUA không bị tính là nợ của bước này", () => {
    // Xe đã giao rồi mà không có ảnh lúc giao là một lỗ hổng bằng chứng có
    // thật, nhưng nó KHÔNG phải thứ chặn bước "nhận lại xe" — gộp hai câu
    // chuyện vào một danh sách là bắt nhân viên đứng ngoài đường sửa quá khứ.
    expect(missingEvidence("ONGOING", [])).toEqual(["RETURN"]);
  });
});

describe("nextEvidence", () => {
  it("là món nợ đầu tiên, để màn hình chỉ phải hỏi MỘT câu", () => {
    expect(nextEvidence("BOOKED", [])).toBe("DOCUMENT");
    expect(nextEvidence("BOOKED", ["DOCUMENT"])).toBe("HANDOVER");
  });

  it("null khi không còn nợ — không có 'bước kế tiếp' để vẽ", () => {
    expect(nextEvidence("BOOKED", ["DOCUMENT", "HANDOVER"])).toBeNull();
    expect(nextEvidence("COMPLETED", [])).toBeNull();
  });

  it("không bao giờ trả một loại nằm ngoài danh sách nợ của chính trạng thái đó", () => {
    for (const status of RENTAL_STATUSES) {
      const next: PhotoKind | null = nextEvidence(status, []);
      if (next !== null) expect(requiredEvidenceFor(status)).toContain(next);
    }
  });
});
