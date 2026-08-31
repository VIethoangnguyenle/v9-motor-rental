-- Tìm kiếm khách hàng KHÔNG phân biệt hoa/thường và KHÔNG phân biệt dấu.
--
-- Trước migration này `listCustomers`/`searchCustomers` dùng `LIKE '%term%'` trên
-- text thô: Postgres LIKE phân biệt hoa thường và không biết gì về dấu, nên nhân
-- viên gõ "nguyen" hoặc "trần" không ra "Nguyễn" — và màn hình trả về câu RẤT tự
-- tin "Không tìm thấy khách hàng nào khớp." Cùng lớp lỗi với email phân biệt
-- hoa thường đã đóng ở migration 0011; ở đó bài học đã được áp cho `phone`
-- (chuẩn hoá cả đường đọc lẫn đường ghi) nhưng `full_name` thì lọt.
--
-- ⚠️ Ba câu SQL dưới đây VIẾT TAY: drizzle-kit không sinh được `CREATE EXTENSION`,
-- `CREATE FUNCTION`, lẫn index trên biểu thức có opclass. Phần `ALTER TABLE
-- rentals` ở cuối file thì do `db:generate` sinh — giữ nguyên văn nó, vì
-- `meta/0012_snapshot.json` được sinh cùng lúc và là thứ lần `db:generate` sau
-- so sánh với. Sửa tay câu ALTER mà không sửa snapshot là cách tạo ra một
-- migration "ma" ở lần generate kế tiếp.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- unaccent() do extension cung cấp là STABLE, KHÔNG phải IMMUTABLE — nó tra một
-- dictionary mà người ta đổi được lúc chạy. Postgres vì vậy TỪ CHỐI nó trong
-- biểu thức index. Wrapper dưới đây ghim regdictionary thành hằng nên nó
-- immutable THẬT, không phải khai bừa cho qua planner rồi để index sai lặng lẽ.
CREATE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint

-- GIN + gin_trgm_ops, KHÔNG phải btree. btree không phục vụ được `LIKE '%term%'`
-- (wildcard đứng đầu) — chép nguyên mẫu expression-btree của 0011 sang đây sẽ
-- tạo ra một index không bao giờ được dùng: tốn ghi, tốn dung lượng, và tạo ảo
-- giác đã tối ưu.
--
-- Biểu thức phải khớp CHÍNH XÁC biểu thức trong câu WHERE của
-- `fullNameMatches()` (apps/api/src/services/customers.ts), nếu không planner
-- bỏ qua index. Đó là bài học của 0011.
CREATE INDEX customers_full_name_search_idx
  ON customers USING gin (f_unaccent(lower(full_name)) gin_trgm_ops);--> statement-breakpoint

-- Giấy tờ tùy thân shop đang giữ, và địa chỉ giao xe. Cả hai thuộc LƯỢT THUÊ
-- chứ không thuộc khách: giấy tờ được giữ cho một đơn rồi trả lại (vòng đời
-- khớp handed_over_at/returned_at đã có), và khách du lịch đổi chỗ ở mỗi chuyến
-- nên một địa chỉ mặc định trên `customers` sẽ nói dối.
--
-- CỐ Ý KHÔNG có `document_number`: câu hỏi vận hành duy nhất thật sự cần là
-- "đơn này shop còn giữ giấy gì", và trả lời được nó không cần lưu số CCCD của
-- mọi khách từng thuê vào Postgres lẫn mọi bản backup. Bằng chứng đối chiếu khi
-- tranh chấp là ẢNH CHỤP (MinIO), cùng chỗ với ảnh tình trạng xe.
--
-- ⚠️ Ba cột này CHƯA CÓ AI GHI VÀO cho tới khi luồng bàn giao xe được dựng.
-- Đó là hợp đồng dữ liệu cho đợt sau, không phải cột bị quên.
ALTER TABLE "rentals" ADD COLUMN "document_type" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "document_returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_document_type_valid" CHECK ("rentals"."document_type" IS NULL OR "rentals"."document_type" IN ('CCCD', 'PASSPORT'));--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_document_return_needs_type" CHECK ("rentals"."document_returned_at" IS NULL OR "rentals"."document_type" IS NOT NULL);
