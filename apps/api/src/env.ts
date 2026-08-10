function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường bắt buộc: ${name} — xem .env.example`);
  return v;
}

/**
 * `Number("abc")` trả NaN chứ không ném — và một cổng NaN chỉ lộ ra lúc listen
 * hoặc lúc gửi mail đầu tiên, tức là muộn nhất có thể. File này tồn tại để hỏng
 * sớm, nên ép nó hỏng ở đây.
 */
function requiredPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Biến môi trường ${name} phải là số cổng hợp lệ, nhận được "${raw}"`);
  }
  return parsed;
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * ⚠️ Mã đặt lại mật khẩu cố định chỉ tồn tại ngoài production, và điều kiện là
 * NODE_ENV — KHÔNG phải "SMTP chưa cấu hình". Thiếu config là trạng thái mặc
 * định của một prod mới dựng; nếu thiếu config bật được mã cố định thì cả shop
 * mở bằng sáu con số. §5.2 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * Ném ở đây chứ không cảnh báo: một dòng comment trong .env.example không ép
 * được gì, còn app không khởi động thì ép được.
 */
if (isProduction && process.env.AUTH_DEV_OTP) {
  throw new Error(
    "AUTH_DEV_OTP có mặt ở NODE_ENV=production. Đây là cấu hình chỉ dành cho dev — gỡ nó ra.",
  );
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: requiredPort("API_PORT", 3001),
  host: process.env.API_HOST ?? "0.0.0.0",
  minio: {
    endpoint: required("MINIO_ENDPOINT"),
    bucketVehicles: required("MINIO_BUCKET_VEHICLES"),
    bucketCheckins: required("MINIO_BUCKET_CHECKINS"),
  },
  apiDomain: process.env.API_DOMAIN ?? "http://localhost:3001",
  staffAppUrl: process.env.STAFF_APP_URL ?? "http://localhost:3003",
  /**
   * Domain gốc ở prod (`v9.example.com`), dùng DUY NHẤT để đặt `cookieDomain`
   * cho session — xem `plugins/auth.ts`.
   *
   * **Cố ý KHÔNG `required()`.** Dev không có biến này và không được có: ở dev
   * staff `:3003` và api `:3001` cùng `localhost`, mà cổng không tính vào
   * "site", nên cookie đã đi bình thường rồi. Ép nó tồn tại là bắt mọi máy dev
   * khai một domain không có thật.
   *
   * `?.trim() ||` chứ không phải `??`: compose expand `${ROOT_DOMAIN}` của một
   * biến chưa đặt thành **chuỗi rỗng**, không phải "không có biến". `??` sẽ để
   * lọt `""` và sinh ra `cookieDomain: "."` — một domain vô nghĩa mà trình
   * duyệt lặng lẽ vứt cookie, tức là đăng nhập hỏng ở prod mà không lỗi ở đâu.
   */
  rootDomain: process.env.ROOT_DOMAIN?.trim() || null,
  supertokens: {
    connectionUri: required("SUPERTOKENS_CONNECTION_URI"),
    apiKey: required("SUPERTOKENS_API_KEY"),
  },
  isProduction,
  /** Chỉ dùng khi !isProduction. Mặc định 999999, đổi được để test nhiều mã. */
  devOtp: process.env.AUTH_DEV_OTP ?? "999999",
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: requiredPort("SMTP_PORT", 587),
        user: required("SMTP_USER"),
        password: required("SMTP_PASSWORD"),
        from: required("SMTP_FROM"),
      }
    : null,
} as const;
