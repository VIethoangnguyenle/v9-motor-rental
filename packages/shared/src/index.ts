export { formatVnd, roundVnd, type Vnd } from "./domain/money";
export { overlaps, type Interval } from "./domain/interval";
export {
  canApprove,
  canChangeRole,
  canDisable,
  type Permission,
  type StaffActor,
  type StaffDenyReason,
  type StaffRole,
  type StaffStatus,
} from "./domain/staff";
export {
  RENTAL_STATUSES,
  SHOP_TIMEZONE,
  isOverdue,
  isPickupOverdue,
  revenueAt,
  toInterval,
  transition,
  type RentalStatus,
  type TransitionResult,
} from "./domain/rental";
export { normalizePhone } from "./domain/phone";
export {
  VEHICLE_MESSAGES,
  VEHICLE_PATTERNS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABEL,
  checkPhotoAlt,
  checkVehicle,
  vehicleRuleMessage,
  vehicleStatusLabel,
  type PhotoAltRule,
  type VehicleDraft,
  type VehicleRule,
  type VehicleStatus,
} from "./domain/vehicle";
export { PHOTO_CONTENT_TYPES } from "./domain/rental-photo";
