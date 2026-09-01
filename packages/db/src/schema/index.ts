/**
 * `rentals.period` (tstzrange) và constraint `rentals_no_overlap` sống trong
 * migration viết tay `0010`, không trong file schema — drizzle-kit không sinh
 * được cột GENERATED kiểu range lẫn EXCLUDE constraint. Extension `btree_gist`
 * đã bật từ migration `0000` chính là để câu đó chạy được.
 *
 * Biên của `period` là `[start, end)`, khớp `overlaps()` trong @v9/shared. Đổi
 * biên ở một bên mà quên bên kia sinh ra lỗi booking chỉ lộ lúc chạy thật.
 */
export { vehiclePhotos, vehicles } from "./vehicles";
export { passwordResetCodes, staffUsers } from "./staff";
export { customers, rentals } from "./rentals";
export { rentalRequests } from "./rental-requests";
export { rentalPhotos } from "./rental-photos";
