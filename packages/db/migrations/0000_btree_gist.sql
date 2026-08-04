-- Bật btree_gist để exclusion constraint có thể so sánh cột vô hướng (vehicle_id)
-- bằng toán tử `=` cùng lúc với cột range (period) bằng `&&`.
-- Không có extension này, `EXCLUDE USING gist (vehicle_id WITH =, ...)` sẽ báo lỗi
-- "data type uuid has no default operator class for access method gist".
CREATE EXTENSION IF NOT EXISTS btree_gist;
