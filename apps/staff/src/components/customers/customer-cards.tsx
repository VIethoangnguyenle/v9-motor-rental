import { Link } from "@tanstack/react-router";
import { WHEN_FMT, WHEN_LABEL, whenOf } from "../../lib/customer-activity";
import type { CustomerListRow } from "../../lib/customers";
import type { CustomersSearch } from "../../lib/customers-search";
import { STATUS_LABEL, rentalChipClass } from "../../lib/rental-status";
import { Icon } from "../ui/icon";

interface CustomerCardsProps {
  readonly rows: readonly CustomerListRow[];
  /** `q`/`page` đang xem, đi cùng sang trang chi tiết để nút back quay lại đúng đây. */
  readonly listSearch: CustomersSearch;
}

/**
 * Hình dạng màn hẹp của danh sách khách hàng, thay `CustomerTable`.
 *
 * Vì sao không giữ bảng: `CustomerTable` khoanh vùng cuộn ngang bằng
 * `overflow-x-auto` + `min-w-[780px]`, nên ở 390px người dùng thấy đúng hai cột
 * đầu (họ tên, điện thoại). Cột **Tình trạng** — thứ mà JSDoc của bảng gọi là
 * "lý do màn này tồn tại", vì nó trả lời câu nhân viên mở màn này để hỏi giữa
 * ca: *khách này có đang giữ xe của mình không* — nằm ngoài khung nhìn. Tín hiệu
 * vận hành CÓ tồn tại và người dùng điện thoại không bao giờ thấy nó, trừ khi
 * biết là phải kéo ngang một cái bảng.
 *
 * Đo được, không phải suy: chụp `/customers` ở 390px chỉ có Họ tên · Điện thoại
 * · Zalo trong khung nhìn.
 *
 * Cùng khuôn `staff/staff-cards.tsx` — repo đã giải đúng bài này một lần cho
 * bảng nhân viên; đây là chỗ dùng thứ hai của cùng quyết định, không phải một
 * hướng mới.
 *
 * Thứ tự dọc trong thẻ là thứ tự câu hỏi: ai → đang giữ xe không → gọi thế nào.
 * `rentalCount` xuống cuối vì nó đếm cả đơn từ năm ngoái, tức không phải câu trả
 * lời cho câu hỏi giữa ca.
 */
export function CustomerCards({ rows, listSearch }: CustomerCardsProps) {
  // Đọc MỘT lần mỗi lần render rồi truyền xuống `rentalChipClass` — cùng khuôn
  // `CustomerTable` và `calendar-timeline.tsx`, không rải `Date.now()` trong JSX.
  const now = new Date();

  return (
    /* `role="list"` đi kèm `list-none`: WebKit bỏ vai trò `list` khi
       `list-style: none`, và app này chạy chính trên iOS. */
    <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-2 rounded-card border border-border bg-surface card-pad"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to="/customers/$id"
              params={{ id: row.id }}
              search={listSearch}
              className="flex min-h-11 items-center font-semibold text-ink underline-offset-2 hover:underline"
            >
              {row.fullName}
            </Link>

            {row.activeRental ? (
              <span
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-card px-2 py-0.5 text-xs font-semibold ${rentalChipClass(
                  row.activeRental,
                  now,
                )}`}
              >
                {STATUS_LABEL[row.activeRental.status]}
                {/* Mốc đi CÙNG chip chứ không xuống dòng riêng như ở bảng: trên
                    thẻ hẹp, một dòng "Trả 15:06 02-09" đứng một mình dưới chip
                    đọc ra như một thuộc tính rời, không như phần còn lại của
                    cùng một câu. `tabular-nums` vì đây là mốc thời gian. */}
                <span className="tabular-nums">
                  {WHEN_LABEL[row.activeRental.status]} {WHEN_FMT.format(whenOf(row.activeRental))}
                </span>
              </span>
            ) : (
              /* CHỮ, không phải dấu `—`: trên thẻ thì một gạch ngang trần không
                 có tiêu đề cột nào ở trên để giải nghĩa nó, nên nó đọc ra như dữ
                 liệu hỏng chứ không như "không giữ xe nào". */
              <span className="text-xs text-muted">Không giữ xe nào</span>
            )}
          </div>

          {/* Thuộc về KHÁCH, không thuộc về đơn đang chạy — nên đứng dòng riêng.
              Hiện cả khi khách không giữ xe: đó vẫn là thứ cần biết TRƯỚC khi
              nhận đơn tiếp theo, tức đúng lúc nhân viên đang nhìn màn này. */}
          {row.lateReturnCount > 0 && (
            <p className="m-0 text-xs tabular-nums text-warning">
              Đã trả trễ {row.lateReturnCount}×
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {/* Số điện thoại là HÀNH ĐỘNG, không phải dữ liệu để bôi đen copy
                bằng một tay giữa lúc đang dắt xe — cùng lý lẽ `CustomerTable` đã
                ghi. `min-h-11` là ngưỡng vùng chạm; chữ `text-sm` một dòng chỉ
                cao ~20px. */}
            <a
              href={`tel:${row.phone}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-card border border-border-strong px-3 text-sm text-ink transition-colors duration-150 active:bg-canvas"
            >
              <Icon name="phone" />
              <span className="tabular-nums">{row.phone}</span>
            </a>
            {/* `zalo.me/<số>` nhận đúng dạng nội địa `0xxxxxxxxx` mà DB lưu
                (CHECK `customers_phone_normalized`). Không cắt số 0 hay ghép
                `+84` ở đây — mọi biến đổi số điện thoại thuộc về
                `@v9/shared/domain/phone`, không phải một template string trong JSX.
                `aria-label` vì chữ "Zalo" một mình lặp ở mọi thẻ: trình đọc màn
                hình sẽ nghe 20 lần "Zalo" mà không biết của ai. */}
            <a
              href={`https://zalo.me/${row.phone}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Nhắn Zalo cho ${row.fullName}`}
              className="inline-flex min-h-11 items-center rounded-card border border-border-strong px-3 text-sm text-ink transition-colors duration-150 active:bg-canvas"
            >
              Zalo
            </a>
            <span className="ml-auto text-xs tabular-nums text-muted">
              {row.rentalCount} đơn
            </span>
          </div>

          {row.note !== null && row.note !== "" && (
            <p className="m-0 text-xs text-muted">{row.note}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
