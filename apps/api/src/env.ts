function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường bắt buộc: ${name} — xem .env.example`);
  return v;
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
  port: Number(process.env.API_PORT ?? 3001),
  host: process.env.API_HOST ?? "0.0.0.0",
  minio: {
    endpoint: required("MINIO_ENDPOINT"),
    bucketVehicles: required("MINIO_BUCKET_VEHICLES"),
    bucketCheckins: required("MINIO_BUCKET_CHECKINS"),
  },
  apiDomain: process.env.API_DOMAIN ?? "http://localhost:3001",
  staffAppUrl: process.env.STAFF_APP_URL ?? "http://localhost:3003",
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
        port: Number(process.env.SMTP_PORT ?? 587),
        user: required("SMTP_USER"),
        password: required("SMTP_PASSWORD"),
        from: required("SMTP_FROM"),
      }
    : null,
} as const;
