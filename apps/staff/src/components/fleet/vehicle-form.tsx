import { useState } from "react";
import {
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABEL,
  vehicleRuleMessage,
} from "@v9/shared/domain/vehicle";
import { RULE_FIELD, type VehicleBody } from "../../lib/fleet-admin";
import { Alert } from "../ui/alert";
import { Select } from "../ui/select";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

/**
 * Form một chiếc xe, dùng cho CẢ tạo mới lẫn sửa.
 *
 * Một form chứ không hai: mười ba ô giống hệt nhau ở hai đường, và hai bản là
 * hai bản trôi được — thêm một cột vào bảng `vehicles` rồi chỉ sửa một bên là
 * ca đã xảy ra ở nhiều repo.
 *
 * ⚠️ Form KHÔNG tự kiểm luật. Nó gửi đi rồi hiện `rules` mà server trả về, và
 * `rules` đó do `checkVehicle` ở `@v9/shared/domain/vehicle` sinh ra — cùng module
 * mà Directus lấy `validation`. Nhân bản luật vào đây là dựng bản thứ tư, và bản
 * ở client là bản dễ trôi nhất vì không có test nào của DB neo nó lại.
 *
 * Cái form CÓ làm là dịch mã luật thành DẤU trên đúng ô (`RULE_FIELD`), để người
 * dùng không phải tự dò xem câu lỗi nói về ô nào.
 */

/** Giá trị thô của form — mọi ô là chuỗi, kể cả ô số. */
export interface VehicleFormValues {
  slug: string;
  make: string;
  model: string;
  engineCc: string;
  pricePerDay: string;
  deposit: string;
  status: string;
  plate: string;
  year: string;
  odoKm: string;
  color: string;
  description: string;
  sort: string;
}

export const EMPTY_VALUES: VehicleFormValues = {
  slug: "",
  make: "",
  model: "",
  engineCc: "",
  pricePerDay: "",
  deposit: "",
  status: "draft",
  plate: "",
  year: "",
  odoKm: "",
  color: "",
  description: "",
  sort: "",
};

/**
 * Ô số rỗng → `null` cho cột nullable, `0` cho cột NOT NULL.
 *
 * `Number("")` là `0`, không phải `NaN` — nên một ô để trống sẽ lặng lẽ thành số
 * không nếu đi thẳng qua `Number()`. Với `engineCc` điều đó biến "chưa nhập" thành
 * "0 phân khối", và server từ chối bằng câu nói về phân khối chứ không về việc bỏ
 * trống. Tách hai hàm để chỗ gọi phải chọn, thay vì nhớ.
 */
const intOrNull = (raw: string): number | null => {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const intOrZero = (raw: string): number => intOrNull(raw) ?? 0;
const textOrNull = (raw: string): string | null => (raw.trim() === "" ? null : raw.trim());

export function toBody(v: VehicleFormValues): VehicleBody {
  return {
    slug: v.slug.trim(),
    make: v.make,
    model: v.model,
    // `intOrZero` cho ba cột NOT NULL: gửi `null` đi thì Elysia từ chối bằng 422
    // schema — một lỗi nói về kiểu, không nói về việc bỏ trống. Gửi 0 thì
    // `checkVehicle` từ chối bằng câu tiếng Việt đúng trường.
    engineCc: intOrZero(v.engineCc),
    pricePerDay: intOrZero(v.pricePerDay),
    deposit: intOrZero(v.deposit),
    // `find` trên `VEHICLE_STATUSES` đã cho đúng union — không ép kiểu. Giá trị
    // lạ (ai đó sửa DOM) rơi về `draft`, tức hỏng theo chiều ĐÓNG: xe không lên
    // web, thay vì lên web mang một trạng thái không ai khai.
    status: VEHICLE_STATUSES.find((x) => x === v.status) ?? "draft",
    plate: textOrNull(v.plate),
    year: intOrNull(v.year),
    odoKm: intOrNull(v.odoKm),
    color: textOrNull(v.color),
    description: textOrNull(v.description),
    sort: intOrNull(v.sort),
  };
}

/** Mã luật → câu tiếng Việt, gắn vào đúng ô. Lấy từ domain, không viết câu mới. */
function errorsByField(rules: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    const field = RULE_FIELD[rule];
    const message = vehicleRuleMessage(rule);
    if (field !== undefined && message !== null) out[field] = message;
  }
  return out;
}

export function VehicleForm({
  initial,
  submitLabel,
  pending,
  error,
  rules,
  onSubmit,
}: {
  readonly initial: VehicleFormValues;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly rules: readonly string[];
  readonly onSubmit: (values: VehicleFormValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const fieldErrors = errorsByField(rules);

  const set = (key: keyof VehicleFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      {/*
        Banner chỉ hiện câu KHÔNG gắn được vào ô nào (409 trùng mã xe, 409 mốc cũ,
        502 kho ảnh). Lỗi đã có dấu trên ô thì lặp lại ở đây là bắt người dùng đọc
        cùng một câu hai lần rồi tự ghép chúng lại với nhau.
      */}
      {error !== null && Object.keys(fieldErrors).length === 0 && (
        <Alert tone="error">{error}</Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Mã xe (slug)"
          value={values.slug}
          onChange={set("slug")}
          error={fieldErrors["slug"]}
          placeholder="honda-cb500x-01"
          autoComplete="off"
        />
        <Select
          label="Trạng thái"
          value={values.status}
          onChange={(e) => {
            setValues((v) => ({ ...v, status: e.target.value }));
          }}
          error={fieldErrors["status"]}
        >
          {VEHICLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {VEHICLE_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <TextField
          label="Hãng"
          value={values.make}
          onChange={set("make")}
          error={fieldErrors["make"]}
        />
        <TextField
          label="Mẫu"
          value={values.model}
          onChange={set("model")}
          error={fieldErrors["model"]}
        />
        {/*
          `inputMode="numeric"` chứ không `type="number"`: bàn phím số trên điện
          thoại mà không kèm nút tăng/giảm, không cuộn-đổi-giá-trị khi lăn chuột
          trên desktop (một cách sửa nhầm giá rất dễ xảy ra và im lặng), và không
          để trình duyệt tự chèn dấu phân cách theo locale.
        */}
        <TextField
          label="Phân khối (cc)"
          value={values.engineCc}
          onChange={set("engineCc")}
          error={fieldErrors["engineCc"]}
          inputMode="numeric"
        />
        <TextField label="Biển số (nội bộ)" value={values.plate} onChange={set("plate")} />
        <TextField
          label="Giá một ngày (₫)"
          value={values.pricePerDay}
          onChange={set("pricePerDay")}
          error={fieldErrors["pricePerDay"]}
          inputMode="numeric"
        />
        <TextField
          label="Tiền cọc (₫)"
          value={values.deposit}
          onChange={set("deposit")}
          error={fieldErrors["deposit"]}
          inputMode="numeric"
        />
        <TextField label="Đời xe" value={values.year} onChange={set("year")} inputMode="numeric" />
        <TextField
          label="ODO (km)"
          value={values.odoKm}
          onChange={set("odoKm")}
          inputMode="numeric"
        />
        <TextField label="Màu" value={values.color} onChange={set("color")} />
        <TextField
          label="Thứ tự hiện trên web"
          value={values.sort}
          onChange={set("sort")}
          inputMode="numeric"
        />
      </div>

      <TextField label="Mô tả" value={values.description} onChange={set("description")} />

      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Đang lưu…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
