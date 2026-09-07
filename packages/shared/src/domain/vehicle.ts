/**
 * Luật hợp lệ của một chiếc xe và của văn bản thay thế cho ảnh xe.
 *
 * Đây là NGUỒN SỰ THẬT DUY NHẤT cho những luật đó, và nó tồn tại vì hệ này có
 * hai cửa ghi vào cùng một bảng: form `apps/staff` và Data Studio của Directus.
 * Trước file này, mỗi cửa tự biết luật theo cách riêng — `scripts/directus-setup.ts`
 * chép tay ba giá trị `status` kèm một comment tự nhắc "PHẢI khớp CHECK trong
 * DB", còn `slug` thì chỉ có một dòng gợi ý và không chặn gì.
 *
 * Phân vai giữa ba tầng, đừng lẫn:
 *
 *  • **CHECK trong Postgres là hàng rào thật.** Không ai vòng được, kể cả `psql`.
 *  • **File này là luật viết một lần**, để hai cửa nói CÙNG một câu.
 *  • **Directus `validation` và form staff là lời giải thích.** Chúng chạy ở tầng
 *    ứng dụng, nên không được coi là hàng rào — giá trị của chúng là biến một lỗi
 *    Postgres thô thành câu người đọc hiểu, TRƯỚC khi người dùng bấm Lưu.
 *
 * `src/domain/**` KHÔNG được import bất cứ gì. Đừng thêm import vào file này.
 */

export const VEHICLE_STATUSES = ["draft", "published", "archived"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

/**
 * Nhãn tiếng Việt của ba trạng thái danh mục.
 *
 * Ở domain chứ không ở từng nơi hiển thị: chủ shop đi qua lại giữa Data Studio
 * của Directus và `apps/staff`, nên hai màn hình gọi cùng một trạng thái bằng
 * hai từ khác nhau là một cách làm người dùng tưởng đó là hai thứ. Cùng lý lẽ
 * `ROLE_LABEL`/`STATUS_LABEL` của `apps/staff` đã đặt cho vai trò nhân viên.
 */
export const VEHICLE_STATUS_LABEL = {
  draft: "Nháp",
  published: "Đang đăng",
  archived: "Lưu trữ",
} as const satisfies Record<VehicleStatus, string>;

export type VehicleRule =
  | "SLUG_FORMAT"
  | "MAKE_REQUIRED"
  | "MODEL_REQUIRED"
  | "ENGINE_CC_POSITIVE"
  | "PRICE_NON_NEGATIVE"
  | "DEPOSIT_NON_NEGATIVE"
  | "STATUS_INVALID";

export type PhotoAltRule = "ALT_EMPTY" | "ALT_IS_FILENAME";

/**
 * Regex ở dạng CHUỖI, không phải `RegExp`.
 *
 * Directus nhận luật qua filter-rule (`{ slug: { _regex: "…" } }`), tức nó cần
 * một chuỗi. Giữ chuỗi làm dạng gốc rồi dựng `RegExp` từ nó — chứ không giữ
 * `RegExp` rồi đọc `.source` — để thứ Directus nhận và thứ hàm bên dưới dùng là
 * đúng một giá trị, không phải hai bản dịch của nhau.
 *
 * Cả hai chuỗi chép NGUYÊN VĂN từ CHECK trong `packages/db/src/schema/vehicles.ts`:
 * `vehicles_slug_format` và vế thứ hai của `vehicle_photos_alt_meaningful`.
 * Chúng là hai bản của cùng một luật, nên phải có test neo chúng vào nhau —
 * xem `packages/db/src/vehicles-schema.test.ts`.
 */
const PHOTO_FILENAME_SOURCE = "\\.(jpe?g|png|webp|avif|gif|heic|heif|bmp|tiff?)$";

/**
 * Viết lại một regex sao cho nó KHÔNG phân biệt hoa thường mà không cần cờ `i`:
 * mỗi chữ cái thành một lớp hai ký tự, `g` → `[gG]`.
 *
 * Tồn tại vì có engine nhận regex mà không có chỗ truyền cờ — filter-rule
 * `_regex` của Directus là một (đo 2026-09-07). Đây là cách duy nhất diễn đạt
 * "không phân biệt hoa thường" cho những engine đó mà vẫn giữ MỘT nguồn luật.
 *
 * Ký tự đứng sau `\` được chép nguyên: `\.` là dấu chấm theo nghĩa đen, còn một
 * lớp dựng sẵn như `\d` mà bị bung thành `[dD]` sẽ đổi nghĩa hoàn toàn.
 */
function anyCase(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i] as string;
    if (c === "\\") {
      out += c + (source[i + 1] ?? "");
      i += 1;
      continue;
    }
    const lower = c.toLowerCase();
    const upper = c.toUpperCase();
    out += lower === upper ? c : `[${lower}${upper}]`;
  }
  return out;
}

export const VEHICLE_PATTERNS = {
  /** Khớp = slug hợp lệ. Chỉ có chữ thường nên không cần bản không-cờ riêng. */
  slug: "^[a-z0-9]+(-[a-z0-9]+)*$",

  /** Khớp = CHUỖI TRÔNG NHƯ TÊN FILE. Cần cờ `i` — xem `photoAltValid` nếu không có cờ. */
  photoFilename: PHOTO_FILENAME_SOURCE,

  /**
   * Khớp = ALT HỢP LỆ. Dạng khẳng định, và tự mang tính không phân biệt hoa
   * thường, nên dùng được ở engine không nhận cờ.
   *
   * Hai lookahead diễn đạt đúng hai luật của `checkPhotoAlt`: `(?=[\s\S]*\S)`
   * là "có ít nhất một ký tự không phải khoảng trắng", `(?![\s\S]*…)` là "không
   * kết thúc bằng đuôi file ảnh". `[\s\S]` chứ không `.` — `.` không khớp xuống
   * dòng, nên một alt có xuống dòng sẽ bị từ chối ở đây trong khi DB nhận, tức
   * một chỗ lệch mới ngay trong thứ sinh ra để xoá chỗ lệch.
   */
  photoAltValid: `^(?=[\\s\\S]*\\S)(?![\\s\\S]*${anyCase(PHOTO_FILENAME_SOURCE)})[\\s\\S]*$`,
} as const;

const SLUG = new RegExp(VEHICLE_PATTERNS.slug);

/**
 * Cờ `i` là BẮT BUỘC, không phải cho chắc: CHECK ở DB dùng `!~*`, toán tử KHÔNG
 * phân biệt hoa thường. Bỏ cờ này thì hai cửa lệch nhau đúng tại `IMG_2481.JPG`
 * — Directus cho qua, Postgres từ chối, và người dùng nhận một lỗi thô ở đúng ca
 * mà cả cơ chế này sinh ra để tránh.
 */
const PHOTO_FILENAME = new RegExp(VEHICLE_PATTERNS.photoFilename, "i");

export const VEHICLE_MESSAGES = {
  SLUG_FORMAT: "Mã xe chỉ gồm chữ thường, số và dấu gạch ngang. Ví dụ: honda-cb500x-01",
  MAKE_REQUIRED: "Chưa nhập hãng xe",
  MODEL_REQUIRED: "Chưa nhập mẫu xe",
  ENGINE_CC_POSITIVE: "Phân khối phải lớn hơn 0",
  PRICE_NON_NEGATIVE: "Giá một ngày phải là số nguyên đồng, không âm",
  DEPOSIT_NON_NEGATIVE: "Tiền cọc phải là số nguyên đồng, không âm",
  STATUS_INVALID: "Trạng thái chỉ nhận: nháp, đang đăng, lưu trữ",
  ALT_EMPTY: "Ảnh cần một câu mô tả — người dùng trình đọc màn hình chỉ có câu này",
  ALT_IS_FILENAME: "Mô tả ảnh không được là tên file. Hãy tả xe: loại, phân khối, màu, góc chụp",
} as const satisfies Record<VehicleRule | PhotoAltRule, string>;

export interface VehicleDraft {
  readonly slug: string;
  readonly make: string;
  readonly model: string;
  readonly engineCc: number;
  readonly pricePerDay: number;
  readonly deposit: number;
  readonly status: VehicleStatus;
}

const blank = (s: string): boolean => s.trim().length === 0;

/**
 * `Number.isInteger` đi kèm `>= 0` trong CÙNG một luật, dù DB chia chúng ở hai
 * tầng: CHECK `vehicles_money_nonneg` lo vế không-âm, còn vế số-nguyên do KIỂU
 * CỘT `integer` lo. Người dùng không cần biết ranh giới đó — với họ chỉ có một
 * câu "tiền là số nguyên đồng, không âm", và VND vốn không có đơn vị phụ.
 */
const isVnd = (n: number): boolean => Number.isInteger(n) && n >= 0;

/**
 * Trả MẢNG mọi luật bị vi phạm, cố ý KHÁC pattern 3 của repo
 * (`{ok:true} | {ok:false, reason}`): một form sửa xe phải hiện hết trường sai
 * cùng lúc. Dừng ở lỗi đầu tiên bắt người dùng sửa một trường, bấm Lưu, rồi gặp
 * lỗi kế tiếp — lặp bảy lần cho một biểu mẫu bảy trường.
 *
 * Mảng rỗng nghĩa là hợp lệ.
 */
export function checkVehicle(draft: VehicleDraft): VehicleRule[] {
  const rules: VehicleRule[] = [];

  if (!SLUG.test(draft.slug)) rules.push("SLUG_FORMAT");
  if (blank(draft.make)) rules.push("MAKE_REQUIRED");
  if (blank(draft.model)) rules.push("MODEL_REQUIRED");
  if (!Number.isInteger(draft.engineCc) || draft.engineCc <= 0) rules.push("ENGINE_CC_POSITIVE");
  if (!isVnd(draft.pricePerDay)) rules.push("PRICE_NON_NEGATIVE");
  if (!isVnd(draft.deposit)) rules.push("DEPOSIT_NON_NEGATIVE");
  if (!(VEHICLE_STATUSES as readonly string[]).includes(draft.status)) rules.push("STATUS_INVALID");

  return rules;
}

/**
 * Hai luật, không một: "có nội dung" và "không phải tên file". Chúng bắt hai ca
 * khác nhau và cần hai câu nhắc khác nhau.
 *
 * ⚠️ Không luật nào ở đây phát hiện được ảnh SAI NỘI DUNG. Một tấm ảnh bảng màu
 * kiểm tra mang alt "Honda CB500X 471cc màu đỏ" qua được cả hai — và đó là ca đã
 * xảy ra thật trong repo này (`honda-cb500x-01.png`). Đấy là việc của người đăng
 * ảnh, không có ràng buộc kỹ thuật nào thay được.
 */
export function checkPhotoAlt(alt: string): PhotoAltRule[] {
  const rules: PhotoAltRule[] = [];

  if (blank(alt)) rules.push("ALT_EMPTY");
  if (PHOTO_FILENAME.test(alt)) rules.push("ALT_IS_FILENAME");

  return rules;
}

/**
 * Nhãn cho một `status` đến từ MẠNG, tức một `string` chưa được thu hẹp.
 *
 * Tồn tại để phía gọi không phải viết `VEHICLE_STATUS_LABEL[status as VehicleStatus]`:
 * `as` ở đó là khẳng định về dữ liệu mình không kiểm soát, và nếu API một ngày
 * trả giá trị lạ thì phép ép kiểu im lặng cho ra `undefined` giữa JSX.
 *
 * Giá trị lạ trả lại NGUYÊN CHUỖI, không trả rỗng và không ném: người dùng cần
 * đọc được thứ gì đó trên màn hình để báo lại, còn một ô trống thì không nói gì.
 */
export function vehicleStatusLabel(status: string): string {
  const known = VEHICLE_STATUSES.find((s) => s === status);
  return known === undefined ? status : VEHICLE_STATUS_LABEL[known];
}

/** Câu tiếng Việt cho một mã luật đến từ mạng; `null` nếu không nhận ra mã đó. */
export function vehicleRuleMessage(rule: string): string | null {
  return rule in VEHICLE_MESSAGES ? VEHICLE_MESSAGES[rule as keyof typeof VEHICLE_MESSAGES] : null;
}
