-- Hai service ngoài (Directus, SuperTokens) dùng chung Postgres này nhưng KHÔNG được
-- đổi schema nghiệp vụ. Chặn ở tầng database chứ không bằng cấu hình của từng tool:
-- toggle trong UI là thứ người sau bật lại được và không để lại dấu vết trong repo.
-- Xem §3.2 và §4.2 của docs/plans/2026-08-05-round2-directus-staff-design.md.
--
-- Mật khẩu dưới đây là giá trị DEV. Prod phải đổi bằng ALTER ROLE ... PASSWORD,
-- và giá trị thật lấy từ DIRECTUS_DB_PASSWORD / SUPERTOKENS_DB_PASSWORD.

-- ── Directus ──────────────────────────────────────────────────────────────
-- Đọc/ghi DỮ LIỆU trong public, toàn quyền trong schema của riêng nó.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'directus_app') THEN
    CREATE ROLE directus_app LOGIN PASSWORD 'directus_dev_only';
  END IF;
END $$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS directus AUTHORIZATION directus_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO directus_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO directus_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO directus_app;
--> statement-breakpoint
-- Dòng này là thứ chặn "add field" trong UI Directus. Đừng xoá.
REVOKE CREATE ON SCHEMA public FROM directus_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO directus_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO directus_app;
--> statement-breakpoint

-- ── SuperTokens ───────────────────────────────────────────────────────────
-- KHÔNG cần đọc bảng nghiệp vụ. Không cấp gì trên public.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supertokens_app') THEN
    CREATE ROLE supertokens_app LOGIN PASSWORD 'supertokens_dev_only';
  END IF;
END $$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS supertokens AUTHORIZATION supertokens_app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA public FROM supertokens_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA supertokens TO supertokens_app;
