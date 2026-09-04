import { keepPreviousData } from "@tanstack/react-query";
import type { ApiErrorCode } from "@v9/api";
import { api } from "./api";
import { errorCode } from "./errors";
import type { CalendarRental } from "./rentals";
import type { RentalsSearch } from "./rentals-search";

/** Cùng số với `CUSTOMERS_PAGE_SIZE` — hai màn danh sách không có lý do nhảy trang khác nhịp nhau. */
export const RENTALS_PAGE_SIZE = 20;

/**
 * SUY ra từ chính `response` schema của API, khuôn `CustomerListRow` ở
 * `lib/customers.ts`. Gõ tay hai interface này là dựng bản sao thứ hai của hợp
 * đồng API — nó biên dịch được cho tới ngày route đổi một field.
 */
export type RentalQueueRow = NonNullable<
  Awaited<ReturnType<typeof api.rentals.queue.get>>["data"]
>["rentals"][number];

export type RentalLedgerRow = NonNullable<
  Awaited<ReturnType<typeof api.rentals.ledger.get>>["data"]
>["rentals"][number];

/**
 * ⚠️ Hai hàm dưới đây tồn tại CHỈ để ép kiểm lúc BIÊN DỊCH; không đường chạy nào
 * gọi chúng.
 *
 * `RentalDetailSheet` nhận `rental: CalendarRental` (hình dạng của `GET /rentals`),
 * còn hai màn mới trả hàng RỘNG HƠN (thêm xe, thêm `group`). Sheet chạy được mà
 * không phải sửa một dòng nào — nhưng đó là một tính chất CẤU TRÚC dễ vỡ trong
 * im lặng: bỏ một field khỏi row schema phía API thì lỗi nổ ra ở `pages/
 * rentals-page.tsx`, cách xa chỗ thật sự sai. Ép ở đây thì nó nổ ngay tại hợp
 * đồng. Cùng khuôn `_statusSchemaMatchesDomain` ở `apps/api/src/routes/rentals.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ép kiểm lúc biên dịch, không đọc lúc chạy.
const _queueRowFitsSheet: (row: RentalQueueRow) => CalendarRental = (row) => row;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ép kiểm lúc biên dịch, không đọc lúc chạy.
const _ledgerRowFitsSheet: (row: RentalLedgerRow) => CalendarRental = (row) => row;

export type RentalsQueueResult =
  | {
      ok: true;
      rentals: RentalQueueRow[];
      total: number;
      groupCounts: NonNullable<
        Awaited<ReturnType<typeof api.rentals.queue.get>>["data"]
      >["groupCounts"];
    }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

export type RentalsLedgerResult =
  | { ok: true; rentals: RentalLedgerRow[]; total: number; collectedAmount: number }
  | { ok: false; code: ApiErrorCode | null; value: unknown };

/**
 * `keepPreviousData` và nhánh lỗi giữ CẢ `value` gốc: hai quyết định đã có lý lẽ
 * đầy đủ ở `lib/customers.ts` và `lib/rentals.ts` — đọc ở đó, đừng chép lại vào
 * đây. Hệ quả phải nhớ khi đọc trang: từ lần tải thứ hai `isPending` luôn false,
 * `isFetching` là chỉ báo tải duy nhất còn nghĩa.
 */
export const rentalsQueueQuery = (page: number) => ({
  queryKey: ["rentals", "queue", page] as const,
  placeholderData: keepPreviousData,
  queryFn: async (): Promise<RentalsQueueResult> => {
    const res = await api.rentals.queue.get({ query: { page, pageSize: RENTALS_PAGE_SIZE } });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, ...res.data };
  },
});

/**
 * `from`/`to` là `YYYY-MM-DD` ở URL nhưng API nhận `date-time`. Đổi ở ĐÂY, một
 * chỗ, và đổi bằng cách ghim giờ shop tường minh: `new Date("2026-09-04")` là
 * nửa đêm **UTC**, tức 07:00 giờ VN — một sổ cái lọc "từ 04/09" sẽ bỏ sót mọi
 * đơn bắt đầu trong bảy tiếng đầu ngày.
 *
 * `to` cộng trọn một ngày vì người dùng chọn "đến 06/09" nghĩa là **hết** ngày
 * 06/09, còn `tstzrange(...,'[)')` có biên phải MỞ. Đây đúng cùng cái bẫy biên
 * mở mà `lastMomentOf` đã đóng ở chiều hiển thị.
 */
function toApiFrom(ymd: string): string | undefined {
  return ymd ? new Date(`${ymd}T00:00:00+07:00`).toISOString() : undefined;
}

function toApiTo(ymd: string): string | undefined {
  if (!ymd) return undefined;
  const end = new Date(`${ymd}T00:00:00+07:00`);
  end.setDate(end.getDate() + 1);
  return end.toISOString();
}

export const rentalsLedgerQuery = (s: RentalsSearch) => ({
  queryKey: ["rentals", "ledger", s.q, s.page, s.from, s.to] as const,
  placeholderData: keepPreviousData,
  queryFn: async (): Promise<RentalsLedgerResult> => {
    const res = await api.rentals.ledger.get({
      query: {
        q: s.q,
        page: s.page,
        pageSize: RENTALS_PAGE_SIZE,
        ...(toApiFrom(s.from) === undefined ? {} : { from: toApiFrom(s.from) }),
        ...(toApiTo(s.to) === undefined ? {} : { to: toApiTo(s.to) }),
      },
    });
    if (res.error) return { ok: false, code: errorCode(res.error.value), value: res.error.value };
    return { ok: true, ...res.data };
  },
});
