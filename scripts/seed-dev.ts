#!/usr/bin/env bun
/**
 * Dữ liệu mẫu cho môi trường DEV: đội xe, khách, đơn thuê, yêu cầu thuê.
 *
 *   bun run seed:dev
 *
 * ⚠️ **CHỈ chạy ở dev.** Script tự chặn khi `NODE_ENV=production`, nhưng hàng rào
 * thật là bạn: nó ghi thẳng vào database đang trỏ tới trong `DATABASE_URL`.
 *
 * **Chạy lại được nhiều lần.** Mọi thứ script tạo đều mang tiền tố `dev-` (slug
 * xe) hoặc số điện thoại dải `09990000xx`, và mỗi lần chạy nó xoá sạch nhóm đó
 * rồi tạo lại. Nó KHÔNG đụng dữ liệu nào khác — nếu bạn đã có xe thật trong
 * Directus, chúng ở nguyên đó.
 *
 * **Ảnh là ảnh MẪU, và trên mặt ảnh có ghi như vậy.** Chúng mang dòng chữ
 * "ANH MAU - DEV ONLY" đỏ ngay giữa khung. Đây không phải trang trí: đợt review
 * 2026-09-01 tìm ra một tấm ảnh test nằm trong Directus mang đúng tên xe và đúng
 * alt mô tả, và không có cách nào phân biệt nó với ảnh thật ngoài việc mở ra
 * nhìn. Ảnh mẫu tự khai báo mình là mẫu thì cái bẫy đó không lặp lại.
 *
 * Cần `ffmpeg` để sinh ảnh (script `scripts/seed-dev-images.sh`), và Directus
 * đang chạy để upload — ảnh xe phục vụ qua `/assets/:id` của Directus, không
 * phải qua MinIO trực tiếp.
 */
import { SQL } from "bun";

const DEV_SLUG_PREFIX = "dev-";
const DEV_PHONE_PREFIX = "09990000";
/** Tiền tố `title` của ảnh do script này upload — dùng để dọn lần chạy trước. */
const SEED_TITLE_PREFIX = "[MẪU DEV]";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa được set — copy .env.example thành .env");
if (process.env.NODE_ENV === "production") {
  throw new Error("seed-dev KHÔNG chạy ở production");
}

const directusUrl = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "http://localhost:8055";
const adminEmail = process.env.DIRECTUS_ADMIN_EMAIL;
const adminPassword = process.env.DIRECTUS_ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) {
  throw new Error("Thiếu DIRECTUS_ADMIN_EMAIL/PASSWORD — cần để upload ảnh mẫu");
}

const sql = new SQL(url);

/**
 * Lấy hàng đầu tiên của một câu query, có kiểu.
 *
 * `Bun.SQL` trả `any` cho kết quả — nó không biết cột nào ra kiểu gì, và không
 * có cách nào để nó biết. Gom việc ép kiểu vào ĐÚNG MỘT hàm thay vì rải `as`
 * khắp file: một chỗ để đọc, một chỗ để sai. Cùng lối `directus-setup.ts` gom
 * ép kiểu JSON vào `request<T>()`.
 */
async function queryOne<T>(query: Promise<unknown>): Promise<T | undefined> {
  const rows = (await query) as T[];
  return rows[0];
}

/**
 * Nửa đêm giờ VN của ngày cách hôm nay `offset` ngày, cộng `hours` giờ.
 *
 * `hours` tồn tại cho đúng một ca, nhưng là ca quan trọng: một đơn **quá hạn
 * trả** phải có `ends_at` nằm trong QUÁ KHỨ mà thanh vẫn giao với cửa sổ lịch
 * đang xem. Cửa sổ mặc định bắt đầu từ nửa đêm hôm nay, và biên là `[start, end)`
 * — nên `ends_at` đúng bằng nửa đêm hôm nay thì KHÔNG giao, và thanh đỏ đặc
 * "xe còn ngoài đường quá hạn" biến mất khỏi màn hình người đang test. Cho nó
 * vài giờ sau nửa đêm thì vừa quá hạn, vừa nhìn thấy.
 */
function day(offset: number, hours = 0): Date {
  const now = new Date();
  const vnMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), -7, 0, 0, 0),
  );
  return new Date(vnMidnight.getTime() + offset * 86_400_000 + hours * 3_600_000);
}

async function directusToken(): Promise<string> {
  const res = await fetch(`${directusUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (!res.ok) throw new Error(`Directus login hỏng: HTTP ${String(res.status)}`);
  const body = (await res.json()) as { data: { access_token: string } };
  return body.data.access_token;
}

/**
 * Xoá ảnh mẫu của lần seed trước.
 *
 * ⚠️ KHÔNG bỏ bước này. Bản đầu của script chỉ dọn Postgres rồi upload ảnh mới,
 * và Directus tích thêm 6 file mỗi lần chạy — đo được: 2 lần chạy ra 14 file.
 * Hàng `vehicle_photos` cũ đã bị xoá nên không truy vấn nào còn trỏ tới chúng:
 * đúng dạng **rác vô hình** mà `services/photos.ts` cảnh báo, chỉ khác kho.
 *
 * Lọc theo tiền tố `title` chứ không theo tên file: tên file có thể trùng với
 * ảnh thật của shop, còn `[MẪU DEV]` thì chỉ script này đặt.
 */
async function cleanOldSeedImages(token: string): Promise<number> {
  const res = await fetch(
    `${directusUrl}/files?limit=-1&fields=id,title&filter[title][_starts_with]=${encodeURIComponent(SEED_TITLE_PREFIX)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Không liệt kê được file Directus: HTTP ${String(res.status)}`);
  const body = (await res.json()) as { data: { id: string }[] };
  if (body.data.length === 0) return 0;

  const del = await fetch(`${directusUrl}/files`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body.data.map((f) => f.id)),
  });
  if (!del.ok) throw new Error(`Không xoá được file cũ: HTTP ${String(del.status)}`);
  return body.data.length;
}

async function uploadImage(token: string, path: string, title: string): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Thiếu ảnh mẫu ${path} — chạy scripts/seed-dev-images.sh trước`);
  }
  const form = new FormData();
  form.append("title", title);
  form.append(
    "file",
    new File([await file.arrayBuffer()], path.split("/").pop() ?? "x.png", {
      type: "image/png",
    }),
  );
  const res = await fetch(`${directusUrl}/files`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Upload ${title} hỏng: HTTP ${String(res.status)}`);
  const body = (await res.json()) as { data: { id: string } };
  return body.data.id;
}

const FLEET = [
  {
    slug: "dev-honda-cb500x",
    make: "Honda",
    model: "CB500X",
    year: 2022,
    cc: 471,
    odo: 12_400,
    color: "Đỏ",
    price: 450_000,
    deposit: 5_000_000,
    img: "cb500x.png",
    status: "published",
  },
  {
    slug: "dev-kawasaki-z900",
    make: "Kawasaki",
    model: "Z900",
    year: 2021,
    cc: 948,
    odo: 21_800,
    color: "Xanh lá",
    price: 900_000,
    deposit: 10_000_000,
    img: "z900.png",
    status: "published",
  },
  {
    slug: "dev-yamaha-mt07",
    make: "Yamaha",
    model: "MT-07",
    year: 2023,
    cc: 689,
    odo: 6_100,
    color: "Xám nhám",
    price: 700_000,
    deposit: 8_000_000,
    img: "mt07.png",
    status: "published",
  },
  {
    slug: "dev-honda-rebel-500",
    make: "Honda",
    model: "Rebel 500",
    year: 2020,
    cc: 471,
    odo: 30_500,
    color: "Đen mờ",
    price: 500_000,
    deposit: 5_000_000,
    img: "rebel500.png",
    status: "published",
  },
  {
    slug: "dev-bmw-g310gs",
    make: "BMW",
    model: "G310GS",
    year: 2022,
    cc: 313,
    odo: 9_900,
    color: "Trắng",
    price: 550_000,
    deposit: 6_000_000,
    img: "g310gs.png",
    status: "published",
  },
  // Xe NHÁP: cố ý để kiểm rằng nó KHÔNG hiện trên apps/web và KHÔNG nhận được
  // yêu cầu thuê (`createRentalRequest` trả VEHICLE_NOT_AVAILABLE).
  {
    slug: "dev-ducati-scrambler",
    make: "Ducati",
    model: "Scrambler 800",
    year: 2019,
    cc: 803,
    odo: 42_000,
    color: "Vàng",
    price: 850_000,
    deposit: 9_000_000,
    img: "scrambler.png",
    status: "draft",
  },
] as const;

const CUSTOMERS = [
  { name: "Trần Minh Huy", phone: `${DEV_PHONE_PREFIX}01` },
  { name: "Nguyễn Thu Hà", phone: `${DEV_PHONE_PREFIX}02` },
  { name: "Lê Quốc Bảo", phone: `${DEV_PHONE_PREFIX}03` },
  { name: "Phạm Anh Tuấn", phone: `${DEV_PHONE_PREFIX}04` },
] as const;

async function main(): Promise<void> {
  const imgDir = `${import.meta.dirname}/../.tmp-seed-images`;

  console.warn("① dọn dữ liệu dev cũ…");
  // Thứ tự theo FK: ảnh → đơn → yêu cầu → xe → khách.
  await sql`DELETE FROM rental_photos WHERE rental_id IN (
    SELECT r.id FROM rentals r JOIN vehicles v ON v.id = r.vehicle_id
    WHERE v.slug LIKE ${`${DEV_SLUG_PREFIX}%`})`;
  await sql`DELETE FROM rentals WHERE vehicle_id IN (
    SELECT id FROM vehicles WHERE slug LIKE ${`${DEV_SLUG_PREFIX}%`})`;
  await sql`DELETE FROM rental_requests WHERE vehicle_id IN (
    SELECT id FROM vehicles WHERE slug LIKE ${`${DEV_SLUG_PREFIX}%`})`;
  await sql`DELETE FROM vehicle_photos WHERE vehicle_id IN (
    SELECT id FROM vehicles WHERE slug LIKE ${`${DEV_SLUG_PREFIX}%`})`;
  await sql`DELETE FROM vehicles WHERE slug LIKE ${`${DEV_SLUG_PREFIX}%`}`;
  await sql`DELETE FROM customers WHERE phone LIKE ${`${DEV_PHONE_PREFIX}%`}`;

  console.warn("② upload ảnh mẫu lên Directus…");
  const token = await directusToken();
  const removed = await cleanOldSeedImages(token);
  if (removed > 0) console.warn(`   (đã xoá ${String(removed)} ảnh mẫu của lần seed trước)`);

  console.warn("③ tạo đội xe…");
  const vehicleIds = new Map<string, string>();
  for (const v of FLEET) {
    const fileId = await uploadImage(
      token,
      `${imgDir}/${v.img}`,
      `${SEED_TITLE_PREFIX} ${v.make} ${v.model}`,
    );
    const row = await queryOne<{ id: string }>(sql`
      INSERT INTO vehicles (slug, make, model, year, engine_cc, odo_km, color, plate,
                            description, price_per_day, deposit, status, sort)
      VALUES (${v.slug}, ${v.make}, ${v.model}, ${v.year}, ${v.cc}, ${v.odo}, ${v.color},
              ${`59X1-${String(v.cc).padStart(3, "0")}.00`},
              ${`Xe mẫu dùng cho môi trường dev. ${v.make} ${v.model} ${String(v.cc)}cc, đã chạy ${v.odo.toLocaleString("vi-VN")} km.`},
              ${v.price}, ${v.deposit}, ${v.status}, ${FLEET.indexOf(v)})
      RETURNING id`);
    if (!row) throw new Error(`Không tạo được xe ${v.slug}`);
    const id = row.id;
    vehicleIds.set(v.slug, id);
    // alt mô tả THẬT (loại xe, phân khối, tình trạng) — PRODUCT.md §Accessibility,
    // và CHECK `vehicle_photos_alt_meaningful` từ chối alt là tên file.
    await sql`
      INSERT INTO vehicle_photos (vehicle_id, file_id, alt, sort)
      VALUES (${id}, ${fileId},
              ${`Ảnh mẫu dev: ${v.make} ${v.model} ${String(v.cc)}cc màu ${v.color.toLowerCase()}, nhìn nghiêng`}, 0)`;
  }

  console.warn("④ tạo khách hàng…");
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) {
    const row = await queryOne<{ id: string }>(
      sql`INSERT INTO customers (full_name, phone) VALUES (${c.name}, ${c.phone}) RETURNING id`,
    );
    if (!row) throw new Error(`Không tạo được khách ${c.name}`);
    customerIds.push(row.id);
  }

  console.warn("⑤ tạo đơn thuê…");
  const owner = await queryOne<{ id: string }>(
    sql`SELECT id FROM staff_users WHERE role = 'OWNER' AND status = 'ACTIVE' LIMIT 1`,
  );
  if (!owner) throw new Error("Chưa có OWNER nào — chạy `bun run staff:bootstrap` trước");
  const ownerId = owner.id;

  // Trải đủ trạng thái để lịch, doanh thu và danh sách "cần chú ý" đều có gì để xem.
  const RENTALS = [
    // Đã trả — sinh doanh thu cho "tháng này".
    {
      slug: "dev-honda-cb500x",
      cust: 0,
      from: -9,
      to: -6,
      total: 1_350_000,
      status: "COMPLETED",
      handed: -9,
      returned: -6,
    },
    // Đang thuê — hiện trên lịch là thanh đặc.
    {
      slug: "dev-kawasaki-z900",
      cust: 1,
      from: -1,
      to: 2,
      total: 2_700_000,
      status: "ONGOING",
      handed: -1,
      returned: null,
    },
    // Quá hạn TRẢ — xe còn ngoài đường, tô đỏ ĐẶC. `endHours: 2` để `ends_at`
    // rơi vào 02:00 hôm nay: đã quá hạn, mà vẫn nằm trong cửa sổ lịch.
    {
      slug: "dev-yamaha-mt07",
      cust: 2,
      from: -4,
      to: -1,
      endHours: 2,
      total: 2_800_000,
      status: "ONGOING",
      handed: -4,
      returned: null,
    },
    // Đã đặt, chưa tới ngày.
    {
      slug: "dev-honda-rebel-500",
      cust: 3,
      from: 3,
      to: 6,
      total: 1_500_000,
      status: "BOOKED",
      handed: null,
      returned: null,
    },
    // Quá hạn LẤY xe — BOOKED đã qua ngày hẹn, tô đỏ viền.
    {
      slug: "dev-bmw-g310gs",
      cust: 0,
      from: -2,
      to: 1,
      total: 1_650_000,
      status: "BOOKED",
      handed: null,
      returned: null,
    },
  ] as const;

  for (const r of RENTALS) {
    await sql`
      INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, status,
                           handed_over_at, returned_at, total_amount, deposit_amount,
                           created_by, note, delivery_address)
      VALUES (${vehicleIds.get(r.slug)}, ${customerIds[r.cust]},
              ${day(r.from)}, ${day(r.to + 1, "endHours" in r ? r.endHours : 0)}, ${r.status},
              ${r.handed === null ? null : day(r.handed)},
              ${r.returned === null ? null : day(r.returned)},
              ${r.total}, 5000000, ${ownerId},
              ${"Đơn mẫu dev"}, ${"Khách sạn Rex, 141 Nguyễn Huệ, Q1"})`;
  }

  console.warn("⑥ tạo yêu cầu thuê từ web…");
  const REQUESTS = [
    {
      slug: "dev-kawasaki-z900",
      name: "Vũ Hoàng Nam",
      phone: `${DEV_PHONE_PREFIX}05`,
      from: 5,
      days: 3,
      status: "NEW",
      note: "Có bằng A2, muốn nhận xe buổi sáng.",
    },
    {
      slug: "dev-honda-cb500x",
      name: "Đỗ Thanh Mai",
      phone: `${DEV_PHONE_PREFIX}06`,
      from: 8,
      days: 2,
      status: "NEW",
      note: null,
    },
    {
      slug: "dev-yamaha-mt07",
      name: "Bùi Đức Long",
      phone: `${DEV_PHONE_PREFIX}07`,
      from: 2,
      days: 5,
      status: "CONTACTED",
      note: "Đã gọi, khách xác nhận lấy xe chiều thứ 6.",
    },
  ] as const;

  for (const q of REQUESTS) {
    const start = day(q.from).toISOString().slice(0, 10);
    await sql`
      INSERT INTO rental_requests (vehicle_id, full_name, phone, start_date, days,
                                   delivery_address, note, status, handled_by, handled_at)
      VALUES (${vehicleIds.get(q.slug)}, ${q.name}, ${q.phone}, ${start}, ${q.days},
              ${"Khách sạn Liberty, 265 Phạm Ngũ Lão, Q1"}, ${q.note}, ${q.status},
              ${q.status === "NEW" ? null : ownerId},
              ${q.status === "NEW" ? null : new Date()})`;
  }

  const count = await queryOne<Record<string, string>>(sql`
    SELECT (SELECT count(*) FROM vehicles WHERE slug LIKE ${`${DEV_SLUG_PREFIX}%`}) AS xe,
           (SELECT count(*) FROM customers WHERE phone LIKE ${`${DEV_PHONE_PREFIX}%`}) AS khach,
           (SELECT count(*) FROM rentals) AS don,
           (SELECT count(*) FROM rental_requests) AS yeucau`);
  console.warn("✓ xong:", count);
  await sql.close();
}

await main();
