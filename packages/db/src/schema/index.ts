/**
 * Business schema (vehicles, customers, rentals) CỐ Ý chưa tồn tại.
 * Phiên scaffold không tạo bảng nghiệp vụ nào — xem §2 của design doc.
 *
 * Khi bảng `rentals` ra đời, migration của nó phải kèm:
 *
 *   ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap
 *     EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);
 *
 * với `period` kiểu tstzrange dùng biên [start, end) — khớp overlaps() trong @v9/shared.
 * Extension btree_gist đã được bật sẵn ở migration 0000 để dòng trên chạy được.
 */
export {};
