/**
 * Khoảng thời gian nửa mở: [start, end).
 * Biên này CỐ Ý khớp với tstzrange mặc định của Postgres, vì exclusion constraint
 * chống double-booking dùng đúng ngữ nghĩa đó. Đổi biên ở đây mà không đổi ở DB
 * sẽ sinh ra lỗi booking chỉ lộ ra lúc chạy thật.
 * Xem §4.1 và §8.2 của docs/plans/2026-08-04-scaffolding-design.md.
 */
export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

function assertValid(i: Interval): void {
  if (i.end.getTime() < i.start.getTime()) {
    throw new Error(
      `end phải >= start, nhận được start=${i.start.toISOString()} end=${i.end.toISOString()}`,
    );
  }
}

function isEmpty(i: Interval): boolean {
  return i.start.getTime() === i.end.getTime();
}

export function overlaps(a: Interval, b: Interval): boolean {
  assertValid(a);
  assertValid(b);
  if (isEmpty(a) || isEmpty(b)) return false;
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}
