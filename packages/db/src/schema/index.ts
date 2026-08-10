/**
 * `customers` và `rentals` CỐ Ý chưa tồn tại — đợt này chỉ dựng danh mục xe,
 * xem §2 của docs/plans/2026-08-10-fleet-catalogue-design.md.
 *
 * Khi bảng `rentals` ra đời, migration của nó phải kèm:
 *
 *   ALTER TABLE rentals ADD CONSTRAINT rentals_no_overlap
 *     EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);
 *
 * với `period` kiểu tstzrange dùng biên [start, end) — khớp overlaps() trong @v9/shared.
 * Extension btree_gist đã được bật sẵn ở migration 0000 để dòng trên chạy được.
 */
export { vehiclePhotos, vehicles } from "./vehicles";
export { passwordResetCodes, staffUsers } from "./staff";
