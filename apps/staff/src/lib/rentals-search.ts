/**
 * `validateSearch` cho `/rentals`, tách khỏi page có chủ ý — cùng lý do
 * `customers-search.ts`: `router.tsx` import file này, page cũng import nó, để
 * hàm trong page thì thành chu trình module.
 *
 * Giá trị lạ bị LỌC, không throw: `?mode=xyz` cho hàng đợi, không cho màn lỗi.
 * `from`/`to` giữ dạng CHUỖI `YYYY-MM-DD` — đó là giá trị thô của
 * `<input type="date">`, và dựng `Date` ở đây chỉ tạo cơ hội lệch một ngày cho
 * một thứ vốn là ngày-theo-lịch chứ không phải một mốc thời gian (cùng lý lẽ
 * `toVnDate` ở `stats-page.tsx`).
 */
export type RentalsMode = "queue" | "ledger";

export interface RentalsSearch {
  readonly mode: RentalsMode;
  readonly q: string;
  readonly page: number;
  readonly from: string;
  readonly to: string;
}

/** `YYYY-MM-DD` và không gì khác. Chuỗi lạ bị bỏ, không sửa chữa. */
function asDateString(v: unknown): string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

export function validateRentalsSearch(search: Record<string, unknown>): RentalsSearch {
  const rawPage = search["page"];
  const page =
    typeof rawPage === "number" && Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  return {
    mode: search["mode"] === "ledger" ? "ledger" : "queue",
    q: typeof search["q"] === "string" ? search["q"] : "",
    page,
    from: asDateString(search["from"]),
    to: asDateString(search["to"]),
  };
}

/**
 * Có `q` thì hàng đợi mất nghĩa — một hàng đợi đã lọc theo từ khoá không còn là
 * hàng đợi. Quyết định đó sống ở ĐÂY, một hàm thuần test được, chứ không nằm rải
 * trong JSX của trang: nó là luật, không phải điều kiện render.
 */
export function effectiveMode(s: RentalsSearch): RentalsMode {
  return s.q.trim().length > 0 ? "ledger" : s.mode;
}
