import { Link } from "@tanstack/react-router";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import type { CustomerListRow } from "../../lib/customers";
import type { CustomersSearch } from "../../lib/customers-search";
import { STATUS_LABEL, lastMomentOf, rentalChipClass } from "../../lib/rental-status";

interface CustomerTableProps {
  readonly rows: readonly CustomerListRow[];
  /** `q`/`page` đang xem, đi cùng sang trang chi tiết để nút back quay lại đúng đây. */
  readonly listSearch: CustomersSearch;
}

/**
 * Kiểu SUY RA từ chính dòng dữ liệu, không gõ lại: `activeRental` là hợp đồng
 * của `GET /customers/list`, và một bản sao thứ hai ở đây sẽ biên dịch được cho
 * tới ngày route đổi một field.
 */
type ActiveRental = NonNullable<CustomerListRow["activeRental"]>;

/**
 * Hai trạng thái ở đây hỏi HAI câu khác nhau, nên đọc hai cột mốc khác nhau:
 *
 * - `ONGOING` → "bao giờ khách phải trả xe" → `endsAt`.
 * - `BOOKED` → "bao giờ khách tới lấy xe" → `startsAt`.
 *
 * Đưa ngày trả cho một đơn chưa giao xe là trả lời sai câu hỏi bằng một con số
 * trông rất đúng. Lý lẽ đầy đủ ở `ActiveRental` (`apps/api/src/services/customers.ts`).
 *
 * `Record<ActiveRental["status"], …>` chứ không phải một `if`: thêm một trạng
 * thái vào `activeRental` phía API mà quên nhãn ở đây là LỖI BIÊN DỊCH, không
 * phải một ô trống lặng lẽ.
 */
const WHEN_LABEL: Record<ActiveRental["status"], string> = {
  ONGOING: "Trả",
  BOOKED: "Lấy",
};

/**
 * `ONGOING` đi qua `lastMomentOf`: `endsAt` là biên MỞ, nên đơn phải trả ngày
 * 28-08 lưu `endsAt = 29/08 00:00` và cột này từng in "Trả 00:00 29-08" — sai
 * một ngày, ở đúng cột mà `CustomerTable` tồn tại để trả lời. `startsAt` là biên
 * ĐÓNG nên `BOOKED` dùng thẳng, không lùi gì cả.
 *
 * Giờ vẫn hiện (xem `WHEN_FMT`) và vẫn là thông tin thật: `endsAt` không phải
 * lúc nào cũng nửa đêm, nên "Trả 23:59 28-08" và "Trả 01:59 29-08" là hai đơn
 * khác nhau, không phải cùng một đơn hiển thị hai kiểu.
 */
function whenOf(rental: ActiveRental): Date {
  return rental.status === "ONGOING" ? lastMomentOf(rental.endsAt) : rental.startsAt;
}

/**
 * Có GIỜ, không chỉ ngày — khác `customer-rental-history.tsx` (chỉ ngày, vì ở đó
 * là một khoảng đã đóng, đọc để đối chiếu). Ở đây nhân viên đang hỏi "bây giờ
 * thì sao", và "9h sáng nay" với "9h tối nay" là hai câu trả lời khác hẳn nhau.
 *
 * Ra "18:00 15-08" — GIỜ TRƯỚC, và gạch ngang chứ không phải gạch chéo. Cả hai
 * là do `vi-VN` quyết định, không phải lỗi: bỏ `year` thì Intl chuyển sang khuôn
 * `dd-MM`, đúng khuôn mà tiêu đề cột của `calendar-timeline.tsx` đang hiện. Đừng
 * "sửa" thành `15/08` bằng cách tự ghép chuỗi — làm vậy là bỏ luôn `SHOP_TIMEZONE`.
 */
const WHEN_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

/**
 * `<table>` 5 cột, cùng khuôn `staff-table.tsx`: `overflow-x-auto` bọc NGOÀI
 * khoanh vùng cuộn ngang vào đúng khối này, `min-w-[780px]` giữ đủ chỗ cho 5
 * cột đọc được mà không bóp chữ chồng nhau ở 375px — arbitrary value cho
 * WIDTH, spacing fence chỉ khoá p/m/gap nên không chặn giá trị này.
 *
 * 780px mua MẬT ĐỘ, không mua tính đúng đắn — đừng đọc nhầm hai thứ đó. Thứ
 * giữ mốc thời gian không bị gãy là `whitespace-nowrap` ở ô "Tình trạng", và nó
 * làm được việc đó ở cả 560px; còn `min-w` một mình thì KHÔNG — đo ở 780px mà
 * bỏ `whitespace-nowrap` thì mốc thời gian vẫn gãy làm hai và dòng cao 93px.
 * Cái 780px thực sự đổi là chiều cao dòng: 85px ở 680 xuống 73px ở 780, vì cột
 * "Ghi chú" đủ rộng để bớt xuống dòng. Với một bảng vận hành đọc lướt thì 12px
 * mỗi dòng là đáng, nhưng nó là mật độ chứ không phải sửa lỗi.
 *
 * "Ghi chú" cố ý KHÔNG `whitespace-nowrap`: nó là văn bản tự do, phải được
 * xuống dòng, và không được phép kéo giãn `min-width` của bảng theo ghi chú dài
 * nhất.
 *
 * ⚠️ ĐỪNG dùng "chiều rộng tự nhiên == `min-width`" làm dấu hiệu bị bóp — bản
 * đầu của comment này làm vậy và nó KHÔNG phân biệt được gì cả: với `w-full` +
 * `min-w-[N]`, dưới ngưỡng N thì bảng LUÔN render đúng N, cả khi thoải mái lẫn
 * khi chật. Muốn biết có bị bóp không thì đo thứ cụ thể: số dòng của một ô, hay
 * chiều cao dòng.
 *
 * Cột "Tình trạng" là lý do màn này tồn tại. Bốn cột cũ (tên · điện thoại · ghi
 * chú · số đơn) không trả lời được câu mà nhân viên mở màn này để hỏi giữa ca:
 * *khách này có đang giữ xe của mình không*. `rentalCount` đếm cả đơn từ năm
 * ngoái nên nó không phải câu trả lời.
 */
export function CustomerTable({ rows, listSearch }: CustomerTableProps) {
  // Đọc MỘT lần mỗi lần render rồi truyền tham số xuống `rentalChipClass` —
  // cùng khuôn `calendar-timeline.tsx`, không rải `Date.now()` trong JSX. Sai
  // lệch vài giây giữa các dòng vì không nhớ lại là chấp nhận được cho một màu
  // trạng thái; đây không phải phép tính tiền.
  const now = new Date();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-left text-sm">
        {/* Không render `<thead>` khi rỗng: một hàng tiêu đề lơ lửng trên khoảng
            trắng trông như bảng hỏng, trong khi trang đã có câu "Chưa có khách
            hàng nào." ngay bên dưới nói đúng chuyện gì đang xảy ra. */}
        {rows.length > 0 && (
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="card-pad">
                Họ tên
              </th>
              <th scope="col" className="card-pad">
                Điện thoại
              </th>
              <th scope="col" className="card-pad">
                Tình trạng
              </th>
              <th scope="col" className="card-pad">
                Ghi chú
              </th>
              <th scope="col" className="card-pad text-right">
                Số đơn
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border align-top">
              {/* `p-0` trên `<td>` + `card-pad block` trên chính `<a>`: trước đây
                  vùng bấm chỉ là line box của thẻ a (~20px cao), bấm trúng phần
                  padding của ô thì không kích hoạt link. Giờ cả ô là vùng bấm —
                  đáng kể trên điện thoại, và màn này chạy trên điện thoại.
                  Cả BA link của một dòng dùng CÙNG khuôn `flex min-h-11
                  items-start`: hộp bấm cao tối thiểu 44px, còn CHỮ neo ở mép
                  trên hộp. `items-center` là bản đầu và nó sai — nó dồn chữ vào
                  giữa hộp 44px, nên tên khách nằm cao hơn số điện thoại cùng
                  dòng 12px (đo được, không phải cảm giác). Neo mép trên còn
                  đúng cả khi một tên dài xuống hai dòng. */}
              <td className="p-0">
                <Link
                  to="/customers/$id"
                  params={{ id: row.id }}
                  search={listSearch}
                  className="card-pad flex min-h-11 items-start font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {row.fullName}
                </Link>
              </td>
              <td className="p-0">
                {/* Shop chạy bằng điện thoại và Zalo. Số điện thoại ở đây là một
                    HÀNH ĐỘNG, không phải dữ liệu để bôi đen copy bằng một tay
                    giữa lúc đang dắt xe. `min-h-11` (44px) là ngưỡng vùng chạm —
                    chữ `text-sm` một dòng chỉ cao ~20px.

                    KHÔNG có `flex-wrap` ở đây, và đó là toàn bộ chuyện: hai `<a>`
                    này là flex item, mà `flex-wrap` mặc định là `nowrap`, nên tự
                    chúng không thể rớt xuống dòng thứ hai vì hẹp. Bản nháp của
                    đợt này CÓ thêm `flex-wrap` và đo được "Zalo" rớt xuống dưới số
                    điện thoại 56px — nguyên nhân là chính cái class đó, KHÔNG phải
                    độ rộng cột (bỏ nó ra thì ở đúng 680px độ lệch về 0). Bản đầu
                    của comment này quy nhầm sang độ rộng và còn gán công cho
                    `whitespace-nowrap`, thứ ở đây hoàn toàn VÔ TÁC DỤNG: nó điều
                    khiển ngắt dòng của TEXT bên trong một ô, không điều khiển chỗ
                    đứng của flex item — bỏ nó ra, mọi số đo không đổi. Nên nó đã
                    được gỡ. `whitespace-nowrap` thật sự có việc ở ô "Tình trạng"
                    bên cạnh, nơi mốc thời gian là text nhiều token. */}
                <div className="card-pad flex items-start gap-3">
                  <a
                    href={`tel:${row.phone}`}
                    className="flex min-h-11 items-start text-ink underline-offset-2 hover:underline"
                  >
                    {row.phone}
                  </a>
                  {/* `zalo.me/<số>` nhận đúng số nội địa `0xxxxxxxxx` — chính là
                      dạng đã chuẩn hoá mà DB lưu (`normalizePhone`, CHECK
                      `customers_phone_normalized`). Không cắt số 0 hay ghép
                      `+84` ở đây: mọi biến đổi số điện thoại thuộc về
                      `@v9/shared/domain/phone`, không phải một template string
                      trong JSX.
                      `aria-label` vì chữ "Zalo" một mình lặp lại ở mọi dòng —
                      đọc màn hình sẽ nghe 20 lần "Zalo" mà không biết của ai. */}
                  <a
                    href={`https://zalo.me/${row.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Nhắn Zalo cho ${row.fullName}`}
                    className="flex min-h-11 items-start text-accent underline-offset-2 hover:underline"
                  >
                    Zalo
                  </a>
                </div>
              </td>
              <td className="card-pad">
                <div className="flex flex-col items-start gap-1">
                  {row.activeRental ? (
                    <>
                      <span
                        className={`inline-block rounded-card px-2 py-0.5 ${rentalChipClass(
                          row.activeRental,
                          now,
                        )}`}
                      >
                        {STATUS_LABEL[row.activeRental.status]}
                      </span>
                      {/* `whitespace-nowrap` — chỗ nó THỰC SỰ có tác dụng, khác
                          ô điện thoại bên cạnh: "Trả 15:06 02-09" là text nhiều
                          token nên gãy được, và gãy thì `tabular-nums` thành vô
                          nghĩa vì hai nửa một mốc thời gian không còn cùng dòng.
                          Đo: bỏ class này ở 780px → 2 dòng, dòng cao 93px thay vì
                          73px; giữ nó ở 560px → vẫn 1 dòng. Tức đây, không phải
                          `min-w`, mới là thứ giữ mốc thời gian liền mạch. */}
                      <span className="whitespace-nowrap text-muted tabular-nums">
                        {WHEN_LABEL[row.activeRental.status]}{" "}
                        {WHEN_FMT.format(whenOf(row.activeRental))}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                  {/* Thuộc về KHÁCH, không thuộc về đơn đang chạy — nên nằm
                      dòng riêng phía dưới, không dính vào chip. Hiện cả khi
                      khách không giữ xe nào: đó vẫn là thứ cần biết trước khi
                      nhận đơn tiếp theo. */}
                  {row.lateReturnCount > 0 && (
                    <span className="whitespace-nowrap text-muted tabular-nums">
                      trả trễ {row.lateReturnCount}×
                    </span>
                  )}
                </div>
              </td>
              <td className="card-pad text-muted">{row.note ?? "—"}</td>
              {/* `tabular-nums`: cột số canh phải mà chữ số rộng khác nhau thì
                  hàng đơn vị không thẳng cột, đọc lướt một cột số bị vấp. */}
              <td className="card-pad text-right tabular-nums">{row.rentalCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
