function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường bắt buộc: ${name} — xem .env.example`);
  return v;
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
} as const;
