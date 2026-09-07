import { describe, expect, it } from "bun:test";
import {
  VEHICLE_MESSAGES,
  VEHICLE_PATTERNS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABEL,
  checkPhotoAlt,
  checkVehicle,
  vehicleRuleMessage,
  vehicleStatusLabel,
  type VehicleDraft,
} from "./vehicle";

/** Xe hợp lệ tối thiểu — mỗi ca dưới chỉ đổi ĐÚNG trường nó đang thử. */
const base: VehicleDraft = {
  slug: "honda-cb500x-01",
  make: "Honda",
  model: "CB500X",
  engineCc: 471,
  pricePerDay: 500_000,
  deposit: 5_000_000,
  status: "draft",
};

const draft = (patch: Partial<VehicleDraft>): VehicleDraft => ({ ...base, ...patch });

describe("checkVehicle — slug", () => {
  const ok = ["honda-cb500x-01", "a", "a1", "xe-2", "honda-cb-500-x"];
  for (const slug of ok) {
    it(`nhận "${slug}"`, () => {
      expect(checkVehicle(draft({ slug }))).toEqual([]);
    });
  }

  // Mỗi chuỗi dưới là một cách sai KHÁC NHAU, không phải sáu biến thể của một
  // cách: hoa, khoảng trắng, gạch đầu, gạch cuối, gạch đôi, gạch dưới, rỗng,
  // dấu tiếng Việt. Regex qua được cả tám mới là regex đang chặn đúng thứ nó
  // hứa chặn.
  const bad = [
    "Honda-CB500X",
    "honda cb500x",
    "-honda",
    "honda-",
    "honda--x",
    "honda_x",
    "",
    "xe-đẹp",
  ];
  for (const slug of bad) {
    it(`từ chối "${slug}"`, () => {
      expect(checkVehicle(draft({ slug }))).toContain("SLUG_FORMAT");
    });
  }
});

describe("checkVehicle — số", () => {
  it("engineCc phải dương", () => {
    expect(checkVehicle(draft({ engineCc: 0 }))).toContain("ENGINE_CC_POSITIVE");
    expect(checkVehicle(draft({ engineCc: -1 }))).toContain("ENGINE_CC_POSITIVE");
    expect(checkVehicle(draft({ engineCc: 1 }))).toEqual([]);
  });

  it("giá và cọc không âm, 0 thì được", () => {
    expect(checkVehicle(draft({ pricePerDay: -1 }))).toContain("PRICE_NON_NEGATIVE");
    expect(checkVehicle(draft({ deposit: -1 }))).toContain("DEPOSIT_NON_NEGATIVE");
    expect(checkVehicle(draft({ pricePerDay: 0, deposit: 0 }))).toEqual([]);
  });

  // Cột DB là `integer`. Số lẻ không bị một CHECK nào chặn — nó bị chặn ở KIỂU
  // CỘT, tức một lỗi Postgres khác hẳn, và form phải nói trước điều đó.
  it("tiền phải là số nguyên đồng — VND không có đơn vị phụ", () => {
    expect(checkVehicle(draft({ pricePerDay: 500_000.5 }))).toContain("PRICE_NON_NEGATIVE");
    expect(checkVehicle(draft({ deposit: 1.5 }))).toContain("DEPOSIT_NON_NEGATIVE");
  });
});

describe("checkVehicle — chữ và trạng thái", () => {
  it("hãng và mẫu không được rỗng hay chỉ khoảng trắng", () => {
    expect(checkVehicle(draft({ make: "" }))).toContain("MAKE_REQUIRED");
    expect(checkVehicle(draft({ make: "   " }))).toContain("MAKE_REQUIRED");
    expect(checkVehicle(draft({ model: "" }))).toContain("MODEL_REQUIRED");
  });

  it("status chỉ nhận ba giá trị của DANH MỤC", () => {
    for (const status of VEHICLE_STATUSES) {
      expect(checkVehicle(draft({ status }))).toEqual([]);
    }
    // `available` là giá trị mà CHECK `vehicles_status_valid` sinh ra để chặn:
    // status là trạng thái danh mục, KHÔNG phải rảnh/bận.
    expect(checkVehicle(draft({ status: "available" as never }))).toContain("STATUS_INVALID");
  });
});

describe("checkVehicle — nhiều lỗi cùng lúc", () => {
  /**
   * Trả MẢNG chứ không phải `{ok:false, reason}` như pattern 3 của repo, và đây
   * là chỗ chứng minh vì sao: một form sửa xe hiện MỌI trường sai cùng lúc. Trả
   * lỗi đầu tiên thì người dùng sửa một trường, bấm Lưu, nhận lỗi kế tiếp, lặp
   * lại năm lần cho một biểu mẫu.
   */
  it("gom hết, không dừng ở lỗi đầu", () => {
    const errors = checkVehicle({
      slug: "SAI",
      make: "",
      model: "",
      engineCc: 0,
      pricePerDay: -1,
      deposit: -1,
      status: "available" as never,
    });
    expect(errors).toHaveLength(7);
  });
});

describe("checkPhotoAlt", () => {
  it("nhận mô tả thật", () => {
    expect(checkPhotoAlt("Honda CB500X 471cc màu đỏ, nhìn nghiêng bên phải")).toEqual([]);
  });

  it("từ chối rỗng và toàn khoảng trắng", () => {
    expect(checkPhotoAlt("")).toContain("ALT_EMPTY");
    expect(checkPhotoAlt("   ")).toContain("ALT_EMPTY");
  });

  // Không phân biệt hoa thường — CHECK ở DB dùng `!~*`, toán tử KHÔNG phân biệt
  // hoa thường. Bỏ cờ `i` ở JS là hai cửa lệch nhau đúng ở `IMG_2481.JPG`.
  const filenames = [
    "IMG_2481.jpg",
    "IMG_2481.JPG",
    "DSC_00012.jpeg",
    "a.png",
    "x.WEBP",
    "b.tif",
    "c.tiff",
    "d.heic",
  ];
  for (const alt of filenames) {
    it(`từ chối tên file "${alt}"`, () => {
      expect(checkPhotoAlt(alt)).toContain("ALT_IS_FILENAME");
    });
  }

  // Luật chặn ĐUÔI, không chặn chuỗi ".jpg" ở giữa câu — mô tả nhắc tới tên file
  // vẫn là mô tả.
  it("cho qua khi đuôi ảnh nằm giữa câu", () => {
    expect(checkPhotoAlt("Ảnh gốc honda.jpg đã được thay bằng ảnh mới")).toEqual([]);
  });

  // Bản đầu của CHECK này ép `length >= 10` và đã bị gỡ: nó chặn nhầm mô tả ngắn
  // hợp lệ trong khi vẫn cho lọt `DSC_00012.jpeg`. Đừng dựng lại luật độ dài.
  it("KHÔNG có luật độ dài tối thiểu", () => {
    expect(checkPhotoAlt("ảnh probe")).toEqual([]);
  });
});

describe("VEHICLE_PATTERNS — hợp đồng với Directus", () => {
  /**
   * Directus nhận luật dưới dạng filter-rule `_regex`, tức một CHUỖI. Nếu chuỗi
   * đó và hàm mà form dùng không phải một, thì "validate y chang ở hai cửa" chỉ
   * là lời hứa. Ca này là chỗ lời hứa đó thành thứ đo được.
   */
  it("regex slug dạng chuỗi cho cùng kết luận với checkVehicle", () => {
    const re = new RegExp(VEHICLE_PATTERNS.slug);
    for (const slug of ["honda-cb500x-01", "a1", "Honda-X", "honda_x", "", "honda--x"]) {
      const byPattern = re.test(slug);
      const byFunction = !checkVehicle(draft({ slug })).includes("SLUG_FORMAT");
      expect(byPattern).toBe(byFunction);
    }
  });

  it("regex tên file dạng chuỗi cho cùng kết luận với checkPhotoAlt", () => {
    const re = new RegExp(VEHICLE_PATTERNS.photoFilename, "i");
    for (const alt of ["IMG_2481.JPG", "mô tả thật", "a.png", "honda.jpg ở giữa"]) {
      const byPattern = re.test(alt);
      const byFunction = checkPhotoAlt(alt).includes("ALT_IS_FILENAME");
      expect(byPattern).toBe(byFunction);
    }
  });
});

describe("VEHICLE_PATTERNS.photoAltValid — cho engine KHÔNG nhận cờ", () => {
  /**
   * Đo trên Directus 11 ngày 2026-09-07: filter-rule `_regex` của nó chạy bằng
   * engine JS (negative lookahead hoạt động), nhưng KHÔNG có chỗ truyền cờ. Nên
   * `photoFilename` + cờ `i` — thứ `checkPhotoAlt` dùng — không diễn đạt được ở
   * đó, và hệ quả đã đo: `IMG_2481.jpg` bị Directus chặn đúng, còn
   * `IMG_2481.JPG` LỌT QUA Directus rồi đâm vào CHECK của Postgres, hiện ra
   * dưới dạng một câu SQL thô.
   *
   * `photoAltValid` là luật đó viết ở dạng KHỚP-LÀ-HỢP-LỆ và tự mang tính không
   * phân biệt hoa thường trong chính regex.
   */
  it("khớp ⟺ checkPhotoAlt cho qua — kể cả đuôi VIẾT HOA và viết lẫn lộn", () => {
    // KHÔNG cờ `i`: đó chính là điều kiện đang được kiểm.
    const re = new RegExp(VEHICLE_PATTERNS.photoAltValid);
    const corpus = [
      "Honda CB500X 471cc màu đỏ, nhìn nghiêng bên phải",
      "ảnh probe",
      "Ảnh gốc honda.jpg đã được thay bằng ảnh mới",
      "IMG_2481.jpg",
      "IMG_2481.JPG",
      "IMG_2481.JpG",
      "a.PNG",
      "x.WeBp",
      "b.TIFF",
      "c.HEIC",
      "d.tif",
      "",
      "   ",
    ];
    for (const alt of corpus) {
      expect(re.test(alt), `alt: ${JSON.stringify(alt)}`).toBe(checkPhotoAlt(alt).length === 0);
    }
  });
});

describe("VEHICLE_STATUS_LABEL", () => {
  it("đủ ba trạng thái, nhãn khác nhau đôi một", () => {
    const labels = VEHICLE_STATUSES.map((s) => VEHICLE_STATUS_LABEL[s]);
    expect(labels).toHaveLength(3);
    expect(new Set(labels).size).toBe(3);
    // Nhãn không được là chính mã trạng thái — đó là dấu hiệu ai đó thêm trạng
    // thái mới rồi để `satisfies` tự điền bằng cách gõ lại mã.
    for (const s of VEHICLE_STATUSES) expect(VEHICLE_STATUS_LABEL[s]).not.toBe(s);
  });
});

describe("tra cứu từ chuỗi thô", () => {
  /**
   * Hai hàm này tồn tại để phía frontend KHÔNG phải viết `status as VehicleStatus`.
   * `status` và mã luật tới từ mạng dưới dạng `string`; ép kiểu chúng thành union
   * là khẳng định về dữ liệu mình không kiểm soát — đúng thứ luật "không dùng `as`
   * ở frontend" của repo cấm.
   */
  it("vehicleStatusLabel trả nhãn cho giá trị hợp lệ, trả lại nguyên chuỗi cho giá trị lạ", () => {
    for (const s of VEHICLE_STATUSES) {
      expect(vehicleStatusLabel(s)).toBe(VEHICLE_STATUS_LABEL[s]);
    }
    // KHÔNG ném và KHÔNG trả rỗng: một trạng thái lạ vẫn phải đọc được trên màn
    // hình, nếu không người dùng thấy một ô trống và không biết vì sao.
    expect(vehicleStatusLabel("available")).toBe("available");
    expect(vehicleStatusLabel("")).toBe("");
  });

  it("vehicleRuleMessage trả câu cho mã có thật, null cho mã lạ", () => {
    expect(vehicleRuleMessage("SLUG_FORMAT")).toBe(VEHICLE_MESSAGES.SLUG_FORMAT);
    expect(vehicleRuleMessage("ALT_IS_FILENAME")).toBe(VEHICLE_MESSAGES.ALT_IS_FILENAME);
    expect(vehicleRuleMessage("KHONG_CO_MA_NAY")).toBeNull();
  });
});

describe("VEHICLE_MESSAGES", () => {
  it("mọi luật đều có câu tiếng Việt, không luật nào câm", () => {
    for (const [rule, message] of Object.entries(VEHICLE_MESSAGES)) {
      expect(message.trim().length).toBeGreaterThan(0);
      expect(message).not.toBe(rule);
    }
  });
});
