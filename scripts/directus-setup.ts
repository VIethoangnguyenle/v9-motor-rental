#!/usr/bin/env bun
/**
 * Cấu hình Directus cho danh mục đội xe — §4.5 của
 * docs/plans/2026-08-10-fleet-catalogue-design.md.
 *
 * Chạy: `bun run directus:setup`. **Chạy lại bao nhiêu lần cũng vô hại** — mỗi bước
 * kiểm-trước-khi-làm, lần chạy thứ hai không đổi gì và exit 0. Đó là tiêu chí #1b của
 * design doc, không phải chi tiết làm đẹp: một script cấu hình chỉ chạy đúng trên
 * database trắng sẽ hỏng đúng vào lần dựng lại môi trường — lúc không ai còn nhớ nó
 * tồn tại.
 *
 * ⚠️ Vì sao có script này thay vì bấm trong UI: Directus chạy bằng role `directus_app`,
 * role đó KHÔNG có DDL trên schema `public` (migration 0001_service_roles.sql). Nên
 * Directus KHÔNG tạo được field mới, KHÔNG tạo được quan hệ (`POST /relations` luôn
 * phát `ALTER TABLE ... ADD CONSTRAINT`), và KHÔNG xoá được collection. Cả ba đều chết
 * ở cùng một câu của Postgres: `must be owner of table`. Hàng rào đó là chủ ý — đường
 * đi vòng ĐÚNG là khai quan hệ bằng metadata trong schema `directus`, xem bước 4.
 *
 * ⚠️ Hai chỗ khác với mô tả trong design doc §7.1, đã đo lại trên Directus 11.17.4:
 *
 *  1. Nhận bảng có sẵn phải dùng `PATCH /collections/<tên>`, KHÔNG phải
 *     `POST /collections`. `createOne` của Directus từ chối thẳng khi tên đã có trong
 *     `Object.keys(schema.collections)` — mà mọi bảng vật lý trong `public` đều nằm
 *     trong đó: `Collection "vehicles" already exists`, HTTP 400. `updateOne` thì
 *     upsert: không có dòng metadata thì nó `createOne` vào `directus_collections`,
 *     có rồi thì update. Đúng thao tác "nhận bảng có sẵn", và vẫn không đụng DDL.
 *  2. `GET /fields/<collection>` KHÔNG phải cách kiểm tra bảng đã được nhận hay chưa —
 *     với token admin nó trả 200 kèm `meta: null` cho bảng chưa nhận. Tín hiệu đúng là
 *     `GET /collections/<tên>` → `meta === null` nghĩa là chưa nhận.
 */
import { SQL } from "bun";
import {
  VEHICLE_MESSAGES,
  VEHICLE_PATTERNS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABEL,
} from "@v9/shared/domain/vehicle";

// ── Env ───────────────────────────────────────────────────────────────────
const directusUrl = (
  process.env.DIRECTUS_URL ??
  process.env.NEXT_PUBLIC_DIRECTUS_URL ??
  "http://localhost:8055"
).replace(/\/+$/, "");
const adminEmail = process.env.DIRECTUS_ADMIN_EMAIL;
const adminPassword = process.env.DIRECTUS_ADMIN_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name} — copy .env.example thành .env`);
  }
  return value;
}

// ── In ra ─────────────────────────────────────────────────────────────────
let changed = 0;

/** `+` = vừa đổi thứ gì đó · `·` = đã đúng sẵn, không làm gì. */
function step(changedNow: boolean, label: string, detail: string): void {
  if (changedNow) changed += 1;
  process.stdout.write(`${changedNow ? "+" : "·"} ${label} — ${detail}\n`);
}

// ── REST ──────────────────────────────────────────────────────────────────
let token = "";

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${directusUrl}${path}`, {
    method,
    headers: {
      ...(token === "" ? {} : { Authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, text: await res.text() };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { status, text } = await call(method, path, body);
  if (status < 200 || status >= 300) {
    throw new Error(`${method} ${path} → HTTP ${status}\n${text}`);
  }
  // 204 No Content (ví dụ /utils/cache/clear) trả thân rỗng — `JSON.parse("")` ném
  // `Unexpected EOF`, một lỗi trông như Directus hỏng chứ không như "không có gì để đọc".
  if (text.trim() === "") return undefined as T;
  return (JSON.parse(text) as { data: T }).data;
}

type Meta = Record<string, unknown>;

/**
 * So sánh NÔNG theo đúng tập khoá script KHAI: chỉ khoá có trong `desired` mới được
 * đối chiếu — nhưng mọi khoá trong đó thì **đều bị áp lại** khi lệch.
 *
 * ⚠️ `icon` và `width` NẰM TRONG tập đó (xem bước 2 và 3), nên ai nới `width` của một
 * field trong UI sẽ bị hoàn nguyên ở lần chạy sau. Đó là chủ ý — hoàn nguyên drift là
 * việc script này sinh ra để làm — nhưng phải nói đúng, vì bản trước của comment này
 * hứa ngược lại và runbook chép theo.
 *
 * Thứ thật sự sống sót là khoá script KHÔNG khai: `readonly`, `color`, `hidden`,
 * `group`, `translations`, `sort`… Đã đo cả hai chiều trên Directus 11.17.4:
 * `width: full` → về `half`; `icon` → về `two_wheeler`; `readonly: true` và
 * `color: "#FF0000"` thì còn nguyên.
 */
function drift(actual: Meta | null, desired: Meta): string[] {
  if (actual === null) return Object.keys(desired);
  return Object.keys(desired).filter(
    (k) => JSON.stringify(actual[k] ?? null) !== JSON.stringify(desired[k] ?? null),
  );
}

// ── 1. Đăng nhập ──────────────────────────────────────────────────────────
const login = await api<{ access_token: string }>("POST", "/auth/login", {
  email: required("DIRECTUS_ADMIN_EMAIL", adminEmail),
  password: required("DIRECTUS_ADMIN_PASSWORD", adminPassword),
});
token = login.access_token;
step(false, "đăng nhập", `${directusUrl} với ${adminEmail ?? ""}`);

// ── 2. Nhận hai bảng có sẵn ───────────────────────────────────────────────
const collections: { name: string; meta: Meta }[] = [
  {
    name: "vehicles",
    meta: {
      icon: "two_wheeler",
      note: "Danh mục xe cho thuê. MỘT bản ghi = MỘT CHIẾC cụ thể (biển số riêng, ODO riêng, ảnh của chính nó), không phải một mẫu xe.",
      display_template: "{{make}} {{model}} — {{slug}}",
      sort_field: "sort",
    },
  },
  {
    name: "vehicle_photos",
    meta: {
      icon: "photo_library",
      note: "Ảnh xe. Sửa trong form của từng chiếc (khối Ảnh), không cần mở collection này.",
      display_template: "{{alt}}",
      sort_field: "sort",
    },
  },
];

for (const c of collections) {
  const probe = await call("GET", `/collections/${c.name}`);
  if (probe.status !== 200) {
    throw new Error(
      `Không đọc được collection "${c.name}" (HTTP ${probe.status}). ` +
        `Bảng public.${c.name} đã tồn tại chưa? Chạy \`bun run db:migrate\` trước.\n${probe.text}`,
    );
  }
  const current = (JSON.parse(probe.text) as { data: { meta: Meta | null } }).data;
  const diff = drift(current.meta, c.meta);
  if (diff.length === 0) {
    step(false, `collection ${c.name}`, "đã nhận, metadata đúng sẵn");
    continue;
  }
  await api("PATCH", `/collections/${c.name}`, { meta: c.meta });
  step(
    true,
    `collection ${c.name}`,
    current.meta === null ? "nhận bảng có sẵn (chỉ metadata)" : `cập nhật: ${diff.join(", ")}`,
  );
}

/**
 * ── Luật hợp lệ: một nguồn, ba nơi thi hành ──────────────────────────────
 *
 * `validation` và `validation_message` dưới đây SINH TỪ `@v9/shared/domain/vehicle`,
 * không gõ tay. Cùng module đó là thứ form của `apps/staff` dùng, nên hai cửa ghi
 * vào bảng `vehicles` nói cùng một luật và cùng một câu.
 *
 * Đã đo trên Directus 11, 2026-09-07:
 *
 *  • `_regex` CÓ hiệu lực ở tầng API, không phải chỉ trang trí trong UI: `POST
 *    /items/vehicles` với slug sai bị từ chối 400 `FAILED_VALIDATION`.
 *  • Engine là JS, KHÔNG phải POSIX của Postgres — negative lookahead chạy được.
 *    Đó là điều kiện để luật `alt` (một phủ định) diễn đạt được ở đây.
 *  • KHÔNG có chỗ truyền cờ regex. Vì vậy field `alt` dùng
 *    `VEHICLE_PATTERNS.photoAltValid`, bản tự gói tính không-phân-biệt-hoa-thường
 *    vào trong regex. Bản `photoFilename` + cờ `i` sẽ để lọt `IMG_2481.JPG` —
 *    đã đo, và nó rơi xuống CHECK của Postgres thành một câu SQL thô.
 *  • `validation_message` được LƯU nhưng KHÔNG xuất hiện trong thân lỗi REST:
 *    API trả câu mặc định ("Value doesn't have the correct format") kèm
 *    `extensions.type = "regex"`. Suy luận, chưa mở trình duyệt kiểm: Data Studio
 *    mới là nơi đọc `validation_message` và hiện nó cạnh ô nhập. Đó cũng là đối
 *    tượng duy nhất của cấu hình này — `apps/staff` lấy câu thông báo thẳng từ
 *    `VEHICLE_MESSAGES`, không đi qua Directus.
 *
 * ⚠️ Cả ba luật ở đây là LỜI GIẢI THÍCH, không phải hàng rào: chúng chạy ở tầng
 * ứng dụng của Directus. Hàng rào là CHECK trong Postgres. Một ngoại lệ đã đo và
 * đáng nhớ: với TIỀN, Postgres KHÔNG phải hàng rào — số lẻ không bị từ chối mà bị
 * làm tròn im lặng (xem `apps/api/src/services/vehicle-rules-parity.test.ts`).
 * Ở đó lớp domain là thứ duy nhất đứng giữa.
 */

// ── 3. Interface cho các cột đã có ────────────────────────────────────────
const fields: { collection: string; field: string; meta: Meta }[] = [
  {
    collection: "vehicles",
    field: "status",
    meta: {
      interface: "select-dropdown",
      // Danh sách giá trị SINH TỪ `VEHICLE_STATUSES`, không gõ tay. Bản trước chép
      // ba chuỗi vào đây kèm một comment tự nhắc "PHẢI khớp CHECK trong DB" — tức
      // luật được thi hành bằng trí nhớ người. Giờ thêm/bớt một trạng thái ở domain
      // là chỗ này đi theo, và `drift()` phát hiện Directus còn giữ bản cũ.
      //
      // Nhãn cũng lấy từ domain: chủ shop đi qua lại giữa Data Studio và
      // `apps/staff`, nên hai màn gọi cùng một trạng thái bằng hai từ là cách
      // làm người dùng tưởng đó là hai thứ khác nhau.
      options: {
        choices: VEHICLE_STATUSES.map((value) => ({ text: VEHICLE_STATUS_LABEL[value], value })),
      },
      note: "Trạng thái DANH MỤC, không phải rảnh/bận. Chỉ `published` mới lên web. Xe bảo dưỡng dài ngày thì chuyển về `draft`.",
      width: "half",
      validation: { status: { _in: [...VEHICLE_STATUSES] } },
      validation_message: VEHICLE_MESSAGES.STATUS_INVALID,
    },
  },
  {
    collection: "vehicles",
    field: "slug",
    meta: {
      interface: "input",
      options: { trim: true, placeholder: "honda-cb500x-01" },
      note: "chữ thường, số và dấu gạch ngang. Ví dụ: honda-cb500x-01",
      width: "half",
      validation: { slug: { _regex: VEHICLE_PATTERNS.slug } },
      validation_message: VEHICLE_MESSAGES.SLUG_FORMAT,
    },
  },
  {
    collection: "vehicles",
    field: "plate",
    meta: {
      interface: "input",
      note: "Nội bộ — không hiển thị trên web",
      width: "half",
    },
  },
  {
    collection: "vehicles",
    field: "description",
    meta: { interface: "input-multiline" },
  },
  {
    collection: "vehicle_photos",
    field: "file_id",
    meta: {
      // `special: ["file"]` là thứ khiến Directus render bộ chọn file thay vì ô nhập
      // uuid. Cặp với dòng quan hệ ở bước 4 — thiếu một trong hai thì không expand.
      special: ["file"],
      interface: "file-image",
      note: "Ảnh trong thư viện file của Directus. Web dựng URL /assets/{id}?key=web từ id này.",
    },
  },
  {
    collection: "vehicle_photos",
    field: "alt",
    meta: {
      interface: "input",
      // 471cc, KHÔNG phải 500cc: CB500X là 471cc thật (bản ghi seed, vehicles.test.ts
      // và runbook đều ghi 471). Đây là câu dạy nhân viên viết alt trung thực — sai số
      // ngay trong ví dụ mẫu thì nó dạy đúng thói quen bịa thông số.
      note: "Mô tả CHIẾC XE trong ảnh: loại xe, phân khối, tình trạng. KHÔNG phải tên file. Ví dụ: Honda CB500X 471cc màu đỏ, nhìn nghiêng bên phải. (PRODUCT.md §Accessibility)",
      // `photoAltValid` — dạng KHẲNG ĐỊNH (khớp = hợp lệ), không phải
      // `photoFilename` + phủ định. Hai lý do, cả hai đã đo trên Directus 11
      // ngày 2026-09-07:
      //
      //  1. `_regex` chỉ có nghĩa "phải khớp"; không có toán tử phủ định cho nó.
      //  2. Directus KHÔNG có chỗ truyền cờ regex. Dùng `photoFilename` (vốn cần
      //     cờ `i`) thì `IMG_2481.jpg` bị chặn đúng còn `IMG_2481.JPG` LỌT QUA
      //     Directus rồi đâm vào CHECK `vehicle_photos_alt_meaningful`, hiện ra
      //     dưới dạng một câu SQL thô — đúng thứ cơ chế này sinh ra để tránh.
      //     `photoAltValid` gói tính không-phân-biệt-hoa-thường vào trong chính
      //     regex nên không cần cờ.
      //
      // Engine của Directus là JS, không phải POSIX của Postgres — negative
      // lookahead trong `photoAltValid` chạy được, đã đo.
      validation: { alt: { _regex: VEHICLE_PATTERNS.photoAltValid } },
      validation_message: `${VEHICLE_MESSAGES.ALT_EMPTY} · ${VEHICLE_MESSAGES.ALT_IS_FILENAME}`,
    },
  },
];

for (const f of fields) {
  const probe = await call("GET", `/fields/${f.collection}/${f.field}`);
  if (probe.status !== 200) {
    throw new Error(
      `Không đọc được field ${f.collection}.${f.field} (HTTP ${probe.status})\n${probe.text}`,
    );
  }
  const current = (JSON.parse(probe.text) as { data: { meta: Meta | null } }).data;
  const diff = drift(current.meta, f.meta);
  if (diff.length === 0) {
    step(false, `field ${f.collection}.${f.field}`, "interface đúng sẵn");
    continue;
  }
  await api("PATCH", `/fields/${f.collection}/${f.field}`, { meta: f.meta });
  step(true, `field ${f.collection}.${f.field}`, `đặt: ${diff.join(", ")}`);
}

// ── 4a. Field alias `vehicles.photos` ─────────────────────────────────────
// Alias field KHÔNG có cột trong DB, nên `POST /fields` với `type: "alias"` và KHÔNG
// kèm khoá `schema` chỉ ghi một dòng vào `directus.directus_fields` — không DDL, không
// `must be owner of table`. Đây là nửa đầu của O2M; nửa sau là dòng quan hệ ở 4b với
// `one_field = 'photos'`. Thiếu field alias thì gallery không hiện trên form xe; thiếu
// `one_field` thì field alias hiện ra nhưng rỗng vĩnh viễn.
const photosAliasMeta: Meta = {
  special: ["o2m"],
  interface: "list-o2m",
  options: { template: "{{alt}}", enableSelect: false },
  note: "Ảnh của chiếc xe này. Kéo thả để đổi thứ tự — thứ tự này là thứ tự hiện trên web.",
};
{
  const probe = await call("GET", "/fields/vehicles/photos");
  if (probe.status === 200) {
    const current = (JSON.parse(probe.text) as { data: { meta: Meta | null } }).data;
    const diff = drift(current.meta, photosAliasMeta);
    if (diff.length === 0) {
      step(false, "field vehicles.photos (alias O2M)", "đã có, metadata đúng sẵn");
    } else {
      await api("PATCH", "/fields/vehicles/photos", { meta: photosAliasMeta });
      step(true, "field vehicles.photos (alias O2M)", `cập nhật: ${diff.join(", ")}`);
    }
  } else if (probe.status === 403 || probe.status === 404) {
    await api("POST", "/fields/vehicles", {
      field: "photos",
      type: "alias",
      meta: photosAliasMeta,
    });
    step(true, "field vehicles.photos (alias O2M)", "tạo mới (alias, không có cột trong DB)");
  } else {
    throw new Error(`Không đọc được field vehicles.photos (HTTP ${probe.status})\n${probe.text}`);
  }
}

// ── 4b. Hai dòng quan hệ, chèn thẳng bằng SQL ─────────────────────────────
// `POST /relations` của Directus LUÔN phát `ALTER TABLE ... ADD CONSTRAINT` — không có
// chế độ chỉ-metadata — nên nó chết với `must be owner of table`. Chèn thẳng vào
// `directus.directus_relations` (schema mà role Directus toàn quyền) cho ra một quan hệ
// chạy đầy đủ với `schema: null`: Directus KHÔNG cần foreign key ở tầng DB để expand.
type RelationRow = {
  id: number;
  one_collection: string | null;
  one_field: string | null;
  sort_field: string | null;
  one_deselect_action: string;
};

const relations: {
  manyCollection: string;
  manyField: string;
  oneCollection: string;
  oneField: string | null;
  sortField: string | null;
  /**
   * `vehicle_photos.vehicle_id` là NOT NULL, nên gỡ một ảnh khỏi form xe mà `nullify`
   * thì Postgres từ chối. `delete` mới là hành vi đúng — và khớp `ON DELETE CASCADE`
   * đã có trên FK thật.
   */
  deselect: "nullify" | "delete";
  label: string;
}[] = [
  {
    manyCollection: "vehicle_photos",
    manyField: "file_id",
    oneCollection: "directus_files",
    oneField: null,
    sortField: null,
    deselect: "nullify",
    label: "vehicle_photos.file_id → directus_files (M2O)",
  },
  {
    manyCollection: "vehicle_photos",
    manyField: "vehicle_id",
    oneCollection: "vehicles",
    oneField: "photos",
    sortField: "sort",
    deselect: "delete",
    label: "vehicle_photos.vehicle_id → vehicles (O2M, one_field=photos)",
  },
];

const sql = new SQL(required("DATABASE_URL", databaseUrl));

for (const r of relations) {
  const rows = await sql<RelationRow[]>`
    SELECT id, one_collection, one_field, sort_field, one_deselect_action
    FROM directus.directus_relations
    WHERE many_collection = ${r.manyCollection} AND many_field = ${r.manyField}
  `;

  const existing = rows[0];
  if (existing === undefined) {
    await sql`
      INSERT INTO directus.directus_relations
        (many_collection, many_field, one_collection, one_field, sort_field, one_deselect_action)
      VALUES (${r.manyCollection}, ${r.manyField}, ${r.oneCollection}, ${r.oneField},
              ${r.sortField}, ${r.deselect})
    `;
    step(true, `quan hệ ${r.label}`, "chèn dòng directus_relations");
    continue;
  }

  const stale =
    existing.one_collection !== r.oneCollection ||
    existing.one_field !== r.oneField ||
    existing.sort_field !== r.sortField ||
    existing.one_deselect_action !== r.deselect;

  if (!stale) {
    step(false, `quan hệ ${r.label}`, "đã có, đúng sẵn");
    continue;
  }

  await sql`
    UPDATE directus.directus_relations
    SET one_collection = ${r.oneCollection}, one_field = ${r.oneField},
        sort_field = ${r.sortField}, one_deselect_action = ${r.deselect}
    WHERE id = ${existing.id}
  `;
  step(true, `quan hệ ${r.label}`, "sửa lại dòng directus_relations cho khớp");
}

// ── 5. Quyền công khai: đọc directus_files, và KHÔNG gì khác ──────────────
// JSON đi ra qua apps/api, nên Directus chỉ cần phơi đúng byte ảnh. Không cấp quyền nào
// trên `vehicles`/`vehicle_photos` — §4.3 design doc. Directus 11 gắn quyền vào
// *policy*, không gắn vào role: policy Public là policy nối với dòng `directus_access`
// có cả `role` lẫn `user` NULL.
const publicAccess = await api<{ policy: string }[]>(
  "GET",
  "/access?filter%5Brole%5D%5B_null%5D=true&filter%5Buser%5D%5B_null%5D=true&fields=policy&limit=1",
);
const publicPolicy = publicAccess[0]?.policy;
if (publicPolicy === undefined) {
  throw new Error("Không tìm thấy policy Public (directus_access với role và user đều NULL)");
}

// `fields` KHÔNG phải `["*"]`, và đây là chỗ dễ nới ra cho "đỡ phiền" nhất trong file này.
// Cấp `*` thì `GET /files` công khai trả cả `filename_disk`, `storage`, `uploaded_by`
// (uuid tài khoản back-office) và `tus_data` cho bất kỳ ai — đo thật, không phải lo xa.
// Danh sách dưới đây đã đo là ĐỦ để `/assets/<uuid>?key=web` phục vụ một file HOÀN TOÀN
// MỚI (chưa có entry cache) mà không cần token. `filename_download` có mặt chỉ để
// Content-Disposition còn tên file tử tế — bỏ nó thì trình duyệt lưu về thành uuid.
const filePermShape: Meta = {
  fields: [
    "id",
    "type",
    "title",
    "description",
    "filename_download",
    "width",
    "height",
    "filesize",
    "focal_point_x",
    "focal_point_y",
    "modified_on",
  ],
  permissions: {},
  validation: {},
};
const filePerms = await api<(Meta & { id: number })[]>(
  "GET",
  `/permissions?filter%5Bpolicy%5D%5B_eq%5D=${publicPolicy}` +
    `&filter%5Bcollection%5D%5B_eq%5D=directus_files&filter%5Baction%5D%5B_eq%5D=read`,
);
const filePerm = filePerms[0];
if (filePerm === undefined) {
  await api("POST", "/permissions", {
    policy: publicPolicy,
    collection: "directus_files",
    action: "read",
    ...filePermShape,
  });
  step(true, "quyền Public đọc directus_files", "tạo permission");
} else {
  // Kiểm cả NỘI DUNG chứ không chỉ sự tồn tại: một permission bị ai đó thu hẹp field hay
  // gắn thêm filter trong UI vẫn "tồn tại", và /assets sẽ hỏng trong im lặng trong khi
  // script báo xanh — đúng kiểu kiểm-chứng-giả mà repo này đã dính bốn lần.
  const permDrift = drift(filePerm, filePermShape);
  if (permDrift.length === 0) {
    step(false, "quyền Public đọc directus_files", `đã có (id ${String(filePerm.id)})`);
  } else {
    await api("PATCH", `/permissions/${String(filePerm.id)}`, filePermShape);
    step(true, "quyền Public đọc directus_files", `sửa lại: ${permDrift.join(", ")}`);
  }
}

// ── 5b. Tài khoản máy cho apps/api ────────────────────────────────────────
/**
 * `apps/api` cần ghi được file vào Directus, vì `apps/web` phục vụ ảnh xe qua
 * `/assets/<fileId>?key=web` — một file không có hàng trong `directus_files` sẽ
 * hiện ra là ảnh vỡ trên trang công khai. Ghi thẳng vào MinIO không phải đường
 * lùi: khoá `API_S3_KEY` cố ý chỉ mở bucket `checkins`, và đã đo là `Access
 * Denied` trên `vehicles`.
 *
 * Tài khoản này KHÔNG phải admin. Cùng lý lẽ đã đóng món nợ "Directus cầm
 * credential ROOT của MinIO" (`docs/DEBT.md`): một service phơi ra internet
 * không được cầm khoá mở mọi thứ. Policy dưới đây cấp đúng bốn hành động trên
 * đúng một collection.
 *
 * Token đọc từ `DIRECTUS_API_TOKEN` chứ không sinh ngẫu nhiên: script phải chạy
 * lại được bao nhiêu lần cũng ra cùng kết quả, mà một token sinh mới mỗi lần
 * chạy sẽ làm `apps/api` mất quyền ngay sau lần chạy thứ hai.
 */
const apiToken = process.env.DIRECTUS_API_TOKEN;
if (apiToken === undefined || apiToken.trim() === "") {
  throw new Error(
    "Thiếu DIRECTUS_API_TOKEN — apps/api dùng nó để đẩy ảnh xe lên Directus. Xem .env.example",
  );
}

const API_POLICY = "api-files";
const API_ROLE = "api";
/**
 * `example.com` chứ không phải một domain thật hay `.local`: RFC 2606 giữ
 * `example.com` cho đúng mục đích này, và không ai gửi được mail tới nó. Đã thử
 * `api@v9.local` trước — Directus từ chối bằng `FAILED_VALIDATION` vì `.local`
 * không qua được bộ kiểm email của nó.
 */
const API_USER_EMAIL = "apps-api@example.com";

interface Named {
  id: string;
  name: string;
}

const policies = await api<Named[]>(
  "GET",
  `/policies?filter%5Bname%5D%5B_eq%5D=${encodeURIComponent(API_POLICY)}&fields=id,name&limit=1`,
);
let apiPolicyId = policies[0]?.id;
if (apiPolicyId === undefined) {
  const created = await api<Named>("POST", "/policies", {
    name: API_POLICY,
    icon: "cloud_upload",
    description: "Cho apps/api đẩy và xoá ảnh xe. KHÔNG cấp quyền nào ngoài directus_files.",
    // Cả hai đều `false` CÓ CHỦ Ý: `admin_access` bỏ qua mọi permission bên dưới,
    // `app_access` mở Data Studio cho tài khoản máy. Không thứ nào cần.
    admin_access: false,
    app_access: false,
  });
  apiPolicyId = created.id;
  step(true, `policy ${API_POLICY}`, "tạo mới");
} else {
  step(false, `policy ${API_POLICY}`, "đã có");
}

/**
 * Bốn hành động trên `directus_files`, không hơn.
 *
 * `fields: ["*"]` ở đây KHÁC với permission Public ở bước 5 và khác có lý do:
 * đây là tài khoản NỘI BỘ ghi file, nó cần đặt được mọi cột Directus tự điền lúc
 * upload. Permission Public thì phơi ra internet, nên ở đó `*` là lỗ hổng.
 */
for (const action of ["create", "read", "update", "delete"] as const) {
  const found = await api<{ id: number }[]>(
    "GET",
    `/permissions?filter%5Bpolicy%5D%5B_eq%5D=${apiPolicyId}` +
      `&filter%5Bcollection%5D%5B_eq%5D=directus_files` +
      `&filter%5Baction%5D%5B_eq%5D=${action}&fields=id&limit=1`,
  );
  if (found[0] !== undefined) {
    step(false, `quyền ${API_POLICY} ${action} directus_files`, "đã có");
    continue;
  }
  await api("POST", "/permissions", {
    policy: apiPolicyId,
    collection: "directus_files",
    action,
    fields: ["*"],
    permissions: {},
    validation: {},
  });
  step(true, `quyền ${API_POLICY} ${action} directus_files`, "tạo permission");
}

const roles = await api<Named[]>(
  "GET",
  `/roles?filter%5Bname%5D%5B_eq%5D=${encodeURIComponent(API_ROLE)}&fields=id,name&limit=1`,
);
let apiRoleId = roles[0]?.id;
if (apiRoleId === undefined) {
  const created = await api<Named>("POST", "/roles", {
    name: API_ROLE,
    icon: "smart_toy",
    description: "Tài khoản máy. Không dành cho người.",
  });
  apiRoleId = created.id;
  step(true, `role ${API_ROLE}`, "tạo mới");
} else {
  step(false, `role ${API_ROLE}`, "đã có");
}

const access = await api<{ id: string }[]>(
  "GET",
  `/access?filter%5Brole%5D%5B_eq%5D=${apiRoleId}&filter%5Bpolicy%5D%5B_eq%5D=${apiPolicyId}&fields=id&limit=1`,
);
if (access[0] === undefined) {
  await api("POST", "/access", { role: apiRoleId, policy: apiPolicyId });
  step(true, `gắn ${API_POLICY} vào role ${API_ROLE}`, "chèn directus_access");
} else {
  step(false, `gắn ${API_POLICY} vào role ${API_ROLE}`, "đã gắn");
}

const users = await api<{ id: string; token: string | null; role: string | null }[]>(
  "GET",
  `/users?filter%5Bemail%5D%5B_eq%5D=${encodeURIComponent(API_USER_EMAIL)}&fields=id,token,role&limit=1`,
);
const apiUser = users[0];
if (apiUser === undefined) {
  await api("POST", "/users", {
    email: API_USER_EMAIL,
    role: apiRoleId,
    status: "active",
    token: apiToken,
    first_name: "apps",
    last_name: "api",
  });
  step(true, `tài khoản máy ${API_USER_EMAIL}`, "tạo mới, gắn token");
} else {
  /**
   * Directus trả token dưới dạng đã che (`**********`) khi đọc, nên KHÔNG so
   * được giá trị. Bản đầu của bước này vì thế cứ PATCH mỗi lần chạy — và nó phá
   * hợp đồng ghi ở đầu file: lần chạy thứ hai phải không đổi gì.
   *
   * Cách kiểm đúng là THỬ DÙNG token: gọi `/users/me` bằng chính nó. Đây còn là
   * phép kiểm mạnh hơn so giá trị — nó xác nhận token đang thật sự mở được cửa,
   * chứ không chỉ xác nhận một chuỗi nằm đúng chỗ trong bảng.
   */
  const probe = await fetch(`${directusUrl}/users/me?fields=id,status`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const usable =
    probe.status === 200 &&
    (JSON.parse(await probe.text()) as { data: { id: string; status: string } }).data.id ===
      apiUser.id;

  if (usable && apiUser.role === apiRoleId) {
    step(false, `tài khoản máy ${API_USER_EMAIL}`, "token dùng được, role đúng");
  } else {
    await api("PATCH", `/users/${apiUser.id}`, {
      role: apiRoleId,
      status: "active",
      token: apiToken,
    });
    step(
      true,
      `tài khoản máy ${API_USER_EMAIL}`,
      usable ? "sửa lại role" : "đặt lại token theo .env",
    );
  }
}

// ── 6. Chặn transform tuỳ ý ───────────────────────────────────────────────
// `/assets` công khai mà cho `?width=` tự do là một vòi CPU miễn phí cho bot: mỗi tổ hợp
// kích thước là một lần resize và một entry cache mới. §4.4 design doc.
const desiredSettings: Meta = {
  storage_asset_transform: "presets",
  storage_asset_presets: [
    {
      key: "web",
      fit: "inside",
      width: 2000,
      height: null,
      quality: 80,
      withoutEnlargement: true,
      format: null,
    },
  ],
};
const currentSettings = await api<Meta>(
  "GET",
  "/settings?fields=storage_asset_transform,storage_asset_presets",
);
const settingsDiff = drift(currentSettings, desiredSettings);
if (settingsDiff.length === 0) {
  step(false, "settings ảnh", "storage_asset_transform=presets + preset `web` đúng sẵn");
} else {
  await api("PATCH", "/settings", desiredSettings);
  step(true, "settings ảnh", `đặt: ${settingsDiff.join(", ")}`);
}

// ── 7. Xoá cache schema ───────────────────────────────────────────────────
// LUÔN chạy, kể cả khi không có gì đổi. Sau một lần chèn thẳng vào `directus_relations`,
// Directus vẫn phục vụ schema cũ trong bộ nhớ cho tới khi cache bị xoá hoặc container
// restart — quan hệ trông như trơ ra, và người sau đi debug nhầm chỗ. Xoá cache không
// phải một thay đổi cấu hình, nên nó không tính vào bộ đếm bên dưới.
await api("POST", "/utils/cache/clear");
step(false, "cache schema", "đã xoá (luôn chạy)");

await sql.close();

process.stdout.write(
  changed === 0
    ? "\nKhông có gì phải đổi — Directus đã đúng cấu hình.\n"
    : `\n${String(changed)} thay đổi đã áp dụng.\n`,
);
