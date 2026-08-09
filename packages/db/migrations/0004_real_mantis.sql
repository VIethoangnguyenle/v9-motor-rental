-- `vehicles.updated_at` là NOT NULL DEFAULT now(), nhưng cho tới migration này
-- KHÔNG có gì ghi vào nó sau lúc INSERT: cột đứng yên bằng `created_at` vĩnh viễn
-- trong khi trông như một nguồn sự thật. `apps/web` là site SSG/ISR nên sớm muộn
-- sẽ có người lấy nó làm `lastmod` của sitemap — và lúc đó cột sai này biến thành
-- một lời nói dối gửi thẳng cho Google.
--
-- Vì sao TRIGGER chứ không phải code ứng dụng: Directus ghi THẲNG vào Postgres
-- bằng role `directus_app` (xem 0001_service_roles.sql), không đi qua `apps/api`.
-- Mọi giải pháp ở tầng app — hook của Elysia, `$onUpdate` của Drizzle — đều bị
-- con đường đó đi vòng qua. Cùng lý lẽ với CHECK của `status`: ràng buộc nào phải
-- luôn đúng thì đặt ở tầng database.
--
-- Vì sao `now()` chứ không phải `clock_timestamp()`: `now()` là timestamp của
-- TRANSACTION, nên mọi hàng bị sửa trong cùng một transaction mang đúng một mốc
-- thời gian — khớp với `DEFAULT now()` của `created_at`, và đọc ra đúng nghĩa
-- "những hàng này đổi cùng một lúc". Hệ quả cần biết khi viết test: sửa một hàng
-- NGAY SAU khi insert nó trong CÙNG transaction thì `updated_at == created_at`,
-- không phải vì trigger không chạy. Test ở `src/vehicles-schema.test.ts` xử lý
-- bằng cách insert hàng với `created_at` lùi về quá khứ.
--
-- Hàm để tên chung (`set_updated_at`) chứ không gắn vào riêng `vehicles`: các bảng
-- sau (`customers`, `rentals`) dùng lại được, chỉ cần thêm CREATE TRIGGER.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER vehicles_set_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
