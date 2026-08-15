-- `period` là cột SINH, không ghi tay được. Nếu ghi tay được thì nó lệch được với
-- starts_at/ends_at, và khi đó exclusion constraint dưới đây đang bảo vệ MỘT
-- KHOẢNG THỜI GIAN KHÁC với khoảng người dùng nhìn thấy — hàng rào vẫn đứng đó,
-- vẫn chạy, và bảo vệ nhầm thứ.
--
-- Biên '[)' khớp `overlaps()` của @v9/shared: đơn kết thúc đúng lúc đơn sau bắt
-- đầu thì KHÔNG chồng nhau.
ALTER TABLE "rentals"
  ADD COLUMN "period" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

-- Hàng rào chống đặt trùng THẬT. Không phải một câu SELECT kiểm trước khi INSERT
-- — câu đó luôn thua race condition, còn cái này thì không.
--
-- Extension btree_gist bật từ migration 0000 chính là để `vehicle_id WITH =` đứng
-- cạnh `period WITH &&` trong cùng một index GiST.
--
-- Mệnh đề WHERE: đơn đã huỷ không chặn chỗ. `transition()` ở @v9/shared cấm
-- ONGOING -> CANCELLED, nên một đơn CANCELLED không bao giờ là đơn đã giao xe.
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_no_overlap"
  EXCLUDE USING gist ("vehicle_id" WITH =, "period" WITH &&)
  WHERE (status <> 'CANCELLED');
