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
 * So sánh NÔNG theo tập khoá mong muốn: chỉ những khoá script này quan tâm, để việc ai
 * đó chỉnh thêm icon/width trong UI không biến mỗi lần chạy thành một lần ghi đè.
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

// ── 3. Interface cho các cột đã có ────────────────────────────────────────
const fields: { collection: string; field: string; meta: Meta }[] = [
  {
    collection: "vehicles",
    field: "status",
    meta: {
      interface: "select-dropdown",
      // Ba giá trị này PHẢI khớp CHECK `vehicles_status_valid` trong DB. Lệch một chữ
      // thì nhân viên bấm Lưu và nhận một lỗi Postgres không giải thích gì.
      options: {
        choices: [
          { text: "Nháp", value: "draft" },
          { text: "Đang đăng", value: "published" },
          { text: "Lưu trữ", value: "archived" },
        ],
      },
      note: "Trạng thái DANH MỤC, không phải rảnh/bận. Chỉ `published` mới lên web. Xe bảo dưỡng dài ngày thì chuyển về `draft`.",
      width: "half",
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
      note: "Mô tả CHIẾC XE trong ảnh: loại xe, phân khối, tình trạng. KHÔNG phải tên file. Ví dụ: Honda CB500X 500cc màu đỏ, nhìn nghiêng bên phải. (PRODUCT.md §Accessibility)",
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

const filePermShape: Meta = { fields: ["*"], permissions: {}, validation: {} };
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
