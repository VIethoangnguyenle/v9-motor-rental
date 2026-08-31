-- Tìm kiếm khách hàng KHÔNG phân biệt hoa/thường và KHÔNG phân biệt dấu.
--
-- Trước migration này `listCustomers`/`searchCustomers` dùng `LIKE '%term%'` trên
-- text thô: Postgres LIKE phân biệt hoa thường và không biết gì về dấu, nên nhân
-- viên gõ "nguyen" hoặc "trần" không ra "Nguyễn" — và màn hình trả về câu RẤT tự
-- tin "Không tìm thấy khách hàng nào khớp."
--
-- Cùng LỚP lỗi với hai chỗ đã chuẩn hoá trước đó, nhưng đừng nhầm nguồn: `phone`
-- được ép chuẩn từ migration `0009` (`customers_phone_normalized`) cộng
-- `normalizePhone` ở @v9/shared, còn `email` so không phân biệt hoa thường là
-- `0011` (`staff_users_email_lower_idx`). `full_name` không được cái nào — đây
-- là chỗ trám nốt.
--
-- ⚠️ File này là output của `db:generate` (phần `ALTER TABLE "rentals"` ở cuối)
-- được MỞ RỘNG TAY bằng ba câu đầu. Giữ nguyên văn phần generate:
-- `meta/0012_snapshot.json` sinh cùng lúc với nó và là thứ lần `db:generate` sau
-- đem đi so — sửa tay câu ALTER mà không sửa snapshot là cách tạo ra một
-- migration "ma" ở lần generate kế tiếp.
--
-- `CREATE EXTENSION` và `CREATE FUNCTION` thì drizzle-kit không sinh được, hết
-- cách. `CREATE INDEX` bên dưới thì KHÔNG cùng loại đó: drizzle nhiều khả năng
-- diễn đạt được nó — `index().using(method, ...)` nhận `SQL`, và snapshot `0011`
-- cho thấy index trên biểu thức serialise được (`isExpression: true`). Chưa thử
-- nên không kết luận là không thể. Nó nằm ngoài file schema vì lý do khác: nó
-- phụ thuộc `f_unaccent` phải tồn tại TRƯỚC, mà thứ tự câu lệnh trong file
-- generate là do drizzle-kit quyết, không phải do mình.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- `unaccent()` KHÔNG immutable — đo trên PG 17, CẢ HAI overload đều STABLE
-- (`unaccent(regdictionary,text)` và `unaccent(text)`, `provolatile = 's'`), nên
-- Postgres từ chối nó thẳng trong biểu thức index. Wrapper dưới đây khai
-- IMMUTABLE, nghĩa là nó là một LỜI KHẲNG ĐỊNH chồng lên một hàm STABLE, không
-- phải một sự thật được chứng minh. Lời khẳng định đó là chuẩn mực (chính tài
-- liệu Postgres chỉ cách này) nhưng vẫn là lời khẳng định.
--
-- Ghim `'public.unaccent'::regdictionary` mua được ĐÚNG một thứ: kết quả không
-- còn phụ thuộc `search_path` hay cấu hình text-search của phiên. Nó KHÔNG mua
-- được bất biến thật. `ALTER TEXT SEARCH DICTIONARY public.unaccent (RULES=...)`
-- — hoặc thay file `unaccent.rules` rồi reload — vẫn đổi kết quả, và khi đó
-- index GIN bên dưới thành RÁC cho tới khi `REINDEX`.
--
-- Đã ĐO, không suy đoán (toàn bộ trong một transaction rồi ROLLBACK): đổi rules
-- cho `ễ` → `zz`, rồi CÙNG MỘT câu truy vấn cho HAI đáp án — đi qua index ra 0
-- hàng, ép seqscan ra 1 hàng. Sai theo hướng THIẾU hàng (false negative), không
-- phải thừa: bitmap heap scan có bước Recheck tính lại biểu thức từ heap nên
-- ứng viên sai bị lọc, nhưng hàng ĐÚNG thì không bao giờ được đưa vào danh sách
-- ứng viên. Ghi ở docs/DEBT.md vì không có gì trong repo ép luật này.
CREATE FUNCTION public.f_unaccent(text) RETURNS text
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
