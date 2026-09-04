import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { normalizePhone } from "@v9/shared/domain/phone";
import {
  SHOP_TIMEZONE,
  availableTransitions,
  type RentalStatus,
} from "@v9/shared/domain/rental";
import { EvidenceAxis } from "../components/rentals/evidence-axis";
import { useLayoutVariant } from "../hooks/use-layout-variant";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Icon } from "../components/ui/icon";
import { Skeleton } from "../components/ui/skeleton";
import { errorMessage } from "../lib/errors";
import { changeRentalStatus } from "../lib/rentals";
import { rentalsQueueQuery, type RentalQueueRow } from "../lib/rentals-list";
import {
  GROUP_LABEL,
  STATUS_LABEL,
  TRANSITION_LABEL,
  rentalChipClass,
  statusIconOf,
} from "../lib/rental-status";

/**
 * Giờ hẹn, theo đồng hồ SHOP. Cùng lý lẽ mọi `Intl.DateTimeFormat` khác trong
 * app: nhân viên đang đứng ở TP.HCM đọc con số này cho khách nghe, nên nó phải
 * là giờ shop chứ không phải giờ của thiết bị — một cái tablet mua ở nước ngoài
 * chưa đổi múi giờ sẽ nói sai giờ hẹn giao xe.
 */
const WHEN_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Mốc mà nhóm hàng đợi đang nói tới, và câu gọi tên việc phải làm.
 *
 * CÙNG luật `whenOf` ở `customer-table.tsx` và `SORT_AT` ở `services/rentals-list.ts`:
 * `ONGOING` hỏi "bao giờ phải trả xe" (`endsAt`), còn lại hỏi "bao giờ tới lấy"
 * (`startsAt`). Ba chỗ cùng một câu hỏi thì phải cùng một cột; đây không phải
 * định nghĩa thứ tư mà là chỗ dùng thứ ba của cùng một luật.
 */
function dutyOf(rental: RentalQueueRow): { readonly verb: string; readonly at: Date } {
  return rental.status === "ONGOING"
    ? { verb: "Nhận lại", at: new Date(rental.endsAt) }
    : { verb: "Giao", at: new Date(rental.startsAt) };
}

/**
 * Màn **Hiện trường** — hình dạng riêng cho việc làm ngoài đường.
 *
 * `PRODUCT.md` §Operating Context: shop mang xe tới khách sạn khách, không bắt
 * khách tới cửa hàng. Nghĩa là phần lớn thời gian nhân viên dùng app này họ đang
 * đứng cạnh một chiếc xe, một tay, ngoài nắng, và việc trước mặt là GHI BẰNG
 * CHỨNG — không phải đọc bảng.
 *
 * Vì vậy màn này không phải bản thu nhỏ của `/rentals`. Ở đó dữ liệu dẫn dắt
 * (hàng đợi, sổ cái, phân trang, tìm kiếm); ở đây VIỆC dẫn dắt: một trục dọc
 * theo độ gấp, và đúng một đơn mở ra mang toàn bộ hành động. Danh sách vẫn là
 * `rentalsQueueQuery` — cùng một nguồn, cùng một thứ tự gấp, không có định nghĩa
 * "gấp" thứ hai sinh ra ở đây.
 *
 * Đơn đang mở nằm ở `?rental=` chứ không ở `useState`: xem `lib/field-search.ts`.
 */
export function FieldPage() {
  const variant = useLayoutVariant();
  // `strict: false` chứ không `fieldRoute.useSearch()` — import route vào page
  // dựng ra chu trình module, cùng lý do `rentals-page.tsx` và `customers-list-page.tsx`.
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Trang 1 và chỉ trang 1: hàng đợi đã sắp theo độ gấp, nên việc gấp nhất luôn
  // ở đây. Màn này cố ý KHÔNG có phân trang — nhân viên đứng ngoài đường không
  // lật trang, và một danh sách phải lật để tìm việc gấp thì đã hỏng từ trước.
  const queue = useQuery(rentalsQueueQuery(1));

  /**
   * Vừa ghi nhận xong một việc trong phiên này. Chặn việc TỰ MỞ đơn kế tiếp.
   *
   * Không có nó thì: bấm "Đã nhận lại xe" → đơn rời hàng đợi (server chỉ giữ
   * `ONGOING`/`BOOKED`) → danh sách refetch → `rows[0]` là một đơn KHÁC → trên
   * điện thoại thẻ nở tại chỗ, nên một nút không quay lại được của một đơn khác
   * trượt vào đúng toạ độ ngón tay vừa bấm. Người dùng bấm hai lần liên tiếp là
   * ghi nhận nhầm một đơn họ chưa từng nhìn.
   */
  const [justDone, setJustDone] = useState<string | null>(null);
  const [openSeq, setOpenSeq] = useState(0);

  const rows: readonly RentalQueueRow[] = queue.data?.ok ? queue.data.rentals : [];
  const requested = typeof search.rental === "string" ? search.rental : "";
  const asked = requested !== "" ? (rows.find((r) => r.id === requested) ?? null) : null;

  /**
   * `?rental=` trỏ vào thứ không có trong hàng đợi — đơn vừa xong, đơn của ngày
   * khác, đơn nằm ngoài trang 1 (màn này chỉ đọc trang 1, xem `docs/DEBT.md`),
   * hoặc một chuỗi rác.
   *
   * KHÔNG dựng màn lỗi: người tới đây bằng link cũ vẫn cần làm việc của hôm nay.
   * Nhưng cũng KHÔNG đánh tráo trong im lặng — bản đầu của màn này làm vậy, và
   * hệ quả là người dùng xin đơn X, nhận đơn Y, không một chữ nào nói, còn URL
   * vẫn nói X nên F5 lặp lại đúng lời nói sai đó.
   */
  const missed = requested !== "" && asked === null;
  const open = asked ?? (justDone === null ? (rows[0] ?? null) : null);

  const change = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: RentalStatus }) => {
      const r = await changeRentalStatus(id, to);
      if (!r.ok) {
        throw new Error(
          r.code === "INVALID_TRANSITION"
            ? "Đơn vừa được đổi trạng thái ở nơi khác. Tải lại rồi thử lại."
            : errorMessage(r.value, "Không đổi được trạng thái đơn"),
        );
      }
      return { id, to };
    },
    onSuccess: async ({ id, to }) => {
      const row = rows.find((r) => r.id === id);
      setJustDone(
        `${TRANSITION_LABEL[to]} — ${row ? `${row.vehicleMake} ${row.vehicleModel}` : "đơn vừa chọn"}.`,
      );
      // Xoá `?rental=` để URL thôi trỏ vào một đơn có thể vừa rời hàng đợi.
      void navigate({ to: "/field", search: { rental: "" }, replace: true });
      // Cùng hai khoá mà `rental-detail-sheet.tsx` làm bay, và cùng lý do:
      // `handedOverAt` vừa đặt là mốc ghi nhận doanh thu, nên thống kê đọc lệch
      // nếu chỉ làm bay `["rentals"]`.
      await queryClient.invalidateQueries({ queryKey: ["rentals"] });
      await queryClient.invalidateQueries({ queryKey: ["stats-summary"] });
    },
  });

  /**
   * `replace`: mở lần lượt sáu việc rồi bấm Back sáu lần để thoát là một cái bẫy
   * của riêng điện thoại. Chỗ đứng vẫn ở URL (F5 không mất), chỉ là nó không xếp
   * chồng lịch sử.
   */
  const openDuty = (id: string): void => {
    setJustDone(null);
    // Đếm LẦN MỞ, không phải cờ boolean: mở đơn A, đóng, mở lại A — cùng một id
    // nên một cờ đã bật không khởi động lại việc trao tiêu điểm. Cùng lý lẽ
    // `changeCount` ở `rental-detail-sheet.tsx`.
    setOpenSeq((n) => n + 1);
    void navigate({ to: "/field", search: { rental: id }, replace: true });
  };

  if (queue.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-48" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  if (queue.data && !queue.data.ok) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="m-0 text-xl font-bold text-ink">Hiện trường</h1>
        <Alert tone="error" live="polite">
          {errorMessage(queue.data.value, "Không tải được việc của hôm nay.")}
        </Alert>
        <Button type="button" variant="ghost" onClick={() => void queue.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-xl font-bold text-ink">Hiện trường</h1>
        <p className="m-0 text-sm text-muted">
          {rows.length === 0
            ? "Không còn việc nào trong bảy ngày tới."
            : `${String(rows.length)} việc đang chờ, gấp nhất ở trên cùng.`}
        </p>
      </header>

      {change.error && <Alert tone="error">{change.error.message}</Alert>}

      {/*
        Việc vừa ghi nhận xong. `live="polite"` vì đây là kết quả của một hành
        động không quay lại được: người dùng bàn phím và trình đọc màn hình phải
        nghe được nó đã xảy ra, không chỉ thấy danh sách ngắn đi một dòng.
      */}
      {justDone !== null && (
        <Alert tone="info" live="polite">
          {justDone} Chọn việc tiếp theo bên dưới.
        </Alert>
      )}

      {/* Xem `missed` — nói ra thay vì đánh tráo trong im lặng. */}
      {missed && (
        <Alert tone="info" live="polite">
          Không thấy đơn đó trong việc của bảy ngày tới.
          {open === null ? "" : " Đang mở việc gấp nhất."}
        </Alert>
      )}

      {rows.length === 0 ? (
        <EmptyField />
      ) : variant === "mobile" ? (
        /*
         * Điện thoại: việc đang mở nở ra TẠI CHỖ của nó trong danh sách, nên
         * trục dọc của cả màn hình vẫn là một trục liền — thứ tự độ gấp không bị
         * cắt làm đôi. Một cột, không có chỗ cho hình dạng nào khác.
         */
        <DutyList
          rows={rows}
          openId={open?.id ?? null}
          inlineOpen
          openSeq={openSeq}
          pending={change.isPending}
          onChange={(id, to) => change.mutate({ id, to })}
          onOpen={openDuty}
        />
      ) : (
        /*
         * Tablet và desktop: danh sách bên trái, việc đang mở bên phải.
         *
         * KHÔNG phải để "tận dụng chỗ trống". Đo ở 820px trước khi sửa: một cột
         * đơn kéo nút "Chụp giấy tờ" ra 1160px — một vùng chạm rộng bằng nửa
         * mét ngón tay, và mắt phải đi hết bề ngang mới tới nhãn. Cột phải bị
         * chặn bề rộng là thứ đang sửa lỗi đó; chỗ trống chỉ là hệ quả.
         *
         * `items-start` để cột trái không bị kéo cao bằng cột phải, và
         * `minmax(0,…)` ở cả hai cột vì `1fr` mặc định là `minmax(auto,1fr)` —
         * nội dung không co được (biển số, địa chỉ giao) sẽ đẩy lưới rộng ra
         * ngoài khung nhìn thay vì tự xuống dòng.
         */
        <div className="grid grid-cols-[minmax(0,18rem)_minmax(0,1fr)] items-start gap-4">
          <DutyList
            rows={rows}
            openId={open?.id ?? null}
            inlineOpen={false}
            openSeq={openSeq}
            pending={change.isPending}
            onChange={(id, to) => change.mutate({ id, to })}
            onOpen={openDuty}
          />
          {open !== null && (
            <OpenDuty
              rental={open}
              openSeq={openSeq}
              pending={change.isPending}
              onChange={(to) => change.mutate({ id: open.id, to })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Danh sách việc theo độ gấp.
 *
 * `inlineOpen` quyết định việc đang mở nở ra tại chỗ (điện thoại) hay chỉ được
 * đánh dấu là đang chọn (tablet/desktop, nơi nó hiện ở cột bên phải). Một prop
 * `boolean` chứ không hai component: hai bản sẽ lệch nhau ở thứ tự và ở luật
 * "gấp nhất trên cùng", mà đó đúng là thứ duy nhất danh sách này phải giữ đúng.
 */
function DutyList({
  rows,
  openId,
  inlineOpen,
  openSeq,
  pending,
  onChange,
  onOpen,
}: {
  readonly rows: readonly RentalQueueRow[];
  readonly openId: string | null;
  readonly inlineOpen: boolean;
  readonly openSeq: number;
  readonly pending: boolean;
  readonly onChange: (id: string, to: RentalStatus) => void;
  readonly onOpen: (id: string) => void;
}) {
  return (
    /*
     * `role="list"` đi kèm `list-none`, không phải thừa: WebKit BỎ vai trò `list`
     * của một danh sách có `list-style: none`, nên VoiceOver thôi đọc "danh sách
     * N mục". `apps/staff` là PWA chạy chính trên điện thoại, tức phần lớn người
     * dùng trình đọc màn hình ở đây đang ở đúng engine đó.
     */
    <ol role="list" className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((rental) => (
        <li key={rental.id}>
          {inlineOpen && openId === rental.id ? (
            <OpenDuty
              rental={rental}
              openSeq={openSeq}
              pending={pending}
              onChange={(to) => onChange(rental.id, to)}
            />
          ) : (
            <ClosedDuty
              rental={rental}
              selected={openId === rental.id}
              onOpen={() => onOpen(rental.id)}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Việc đang mở: mọi thứ cần để làm xong nó, không phải cuộn đi đâu.
 *
 * Thứ tự dọc là thứ tự nhân viên cần: xe nào và ở đâu → gọi được cho khách →
 * bằng chứng còn thiếu → ghi nhận đã xong. Nút ghi nhận đứng CUỐI vì nó là việc
 * sau cùng, và vì nó không quay lại được.
 */
function OpenDuty({
  rental,
  openSeq,
  pending,
  onChange,
}: {
  readonly rental: RentalQueueRow;
  /**
   * Tăng mỗi lần người dùng CHỦ Ý mở một việc. Thẻ xin tiêu điểm khi nó đổi, và
   * chỉ khi đó.
   *
   * Cần vì mở một việc trên điện thoại làm `ClosedDuty` (chính cái nút đang giữ
   * tiêu điểm) bị gỡ khỏi cây và `OpenDuty` thế chỗ — tiêu điểm rơi về `<body>`,
   * nên người dùng bàn phím bị ném về đầu trang và trình đọc màn hình không nghe
   * thấy gì đã xảy ra.
   *
   * KHÔNG lấy tiêu điểm ở lần vẽ đầu (`openSeq` khởi tạo 0 và effect bỏ qua giá
   * trị đó): lúc mới vào trang, việc gấp nhất tự mở mà không ai bấm gì — cướp
   * tiêu điểm khi đó là cướp của chính thanh điều hướng.
   */
  readonly openSeq: number;
  readonly pending: boolean;
  readonly onChange: (to: RentalStatus) => void;
}) {
  const now = new Date();
  const duty = dutyOf(rental);
  const phone = rental.customerPhone ?? "";
  const shape = {
    status: rental.status,
    startsAt: new Date(rental.startsAt),
    endsAt: new Date(rental.endsAt),
  };
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (openSeq === 0) return;
    cardRef.current?.focus();
  }, [openSeq]);

  /**
   * Bước chuyển được PHÉP, hỏi domain chứ không tự suy từ `status`.
   *
   * `availableTransitions` là nơi duy nhất biết luật; đoán ở đây ("BOOKED thì
   * hiện Đã giao xe") biên dịch được cho tới ngày luật đổi, và ngày đó nút vẫn
   * mời người dùng đi một đường server trả 409. Cùng chú thích
   * `rental-detail-sheet.tsx` đã ghi.
   *
   * Bỏ `CANCELLED` khỏi màn này: huỷ đơn là việc của bàn giấy, không phải việc
   * làm khi đang đứng cạnh xe, và một nút huỷ đặt cạnh nút "đã giao xe" trên màn
   * 360px là chờ một cú chạm nhầm không quay lại được. Nó vẫn nằm nguyên ở sheet
   * chi tiết trong `/rentals`.
   */
  const forward = availableTransitions(rental.status).filter((to) => to !== "CANCELLED");

  return (
    <article
      ref={cardRef}
      // `tabIndex={-1}`: nhận được tiêu điểm bằng mã, nhưng KHÔNG chen vào
      // thứ tự Tab — thẻ không phải một control.
      tabIndex={-1}
      className="flex flex-col gap-3 rounded-card border border-accent bg-surface card-pad"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-card px-2 py-0.5 text-xs font-semibold ${rentalChipClass(
              shape,
              now,
            )}`}
          >
            <Icon name={statusIconOf(shape, now)} size="sm" />
            {STATUS_LABEL[rental.status]}
          </span>
          {/*
            Nhóm hàng đợi ("Chưa lấy xe", "Quá hạn trả") là câu trả lời cho "vì
            sao việc này đứng đầu", và server đã tính sẵn nó. Chip trạng thái nói
            đơn ĐANG ở đâu; nhãn nhóm nói vì sao nó GẤP — hai câu khác nhau, và
            trên màn hiện trường thì câu thứ hai mới là câu người dùng tới để hỏi.
          */}
          <span className="text-sm font-semibold text-ink">{GROUP_LABEL[rental.group]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm tabular-nums text-ink-soft">
            {duty.verb} {WHEN_FMT.format(duty.at)}
          </span>
        </div>

        <h2 className="m-0 text-lg font-bold text-ink">
          {rental.vehicleMake} {rental.vehicleModel}
          {rental.vehiclePlate !== null && (
            <span className="ml-2 text-base font-semibold tabular-nums text-ink-soft">
              {rental.vehiclePlate}
            </span>
          )}
        </h2>
        <p className="m-0 text-sm text-ink-soft">{rental.customerName ?? "Khách chưa có tên"}</p>

        {rental.deliveryAddress !== null && rental.deliveryAddress !== "" && (
          // Địa chỉ giao là thứ RIÊNG của bối cảnh này: ở `/rentals` nó nằm sâu
          // trong sheet, còn ở đây nó là thứ nhân viên đọc trước khi lên xe.
          <p className="m-0 text-sm text-ink-soft">Giao tại: {rental.deliveryAddress}</p>
        )}
      </div>

      {phone !== "" && <ContactRow phone={phone} />}

      <div className="border-t border-border pt-3">
        <EvidenceAxis rentalId={rental.id} status={rental.status} />
      </div>

      {forward.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {forward.map((to) => (
            <Button
              key={to}
              type="button"
              pending={pending}
              onClick={() => onChange(to)}
              className="w-full justify-center"
            >
              {TRANSITION_LABEL[to]}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * Gọi và nhắn Zalo cho khách.
 *
 * `PRODUCT.md` ghi shop chạy bằng Zalo nhiều hơn email, và critique màn Khách
 * hàng chấm mục "khớp với đời thật" 2/4 đúng vì số điện thoại ở đó là **chữ
 * trần** — không `tel:`, không `zalo.me/`. Ở màn này thiếu nó còn đắt hơn: nhân
 * viên tới nơi hẹn mà không thấy khách thì việc đầu tiên là gọi, và chép tay một
 * dãy 10 số giữa lúc đó là chỗ dễ gõ sai nhất trong ngày.
 *
 * `normalizePhone` của domain chứ không tự cắt chuỗi: nó là nơi duy nhất biết
 * dạng số Việt Nam, và `tel:` với `zalo.me/` đều cần dạng đã chuẩn hoá.
 */
function ContactRow({ phone }: { readonly phone: string }) {
  const normalized = normalizePhone(phone);

  /*
   * `normalizePhone` trả `null` cho số không đúng dạng Việt Nam. Ca này KHÔNG
   * dựng link: `tel:` với một chuỗi rác mở trình quay số rồi để nhân viên bấm
   * gọi vào hư không, tức lỗi chỉ lộ ra sau khi đã tốn một cuộc gọi. Hiện số thô
   * để họ tự đọc và tự gõ vẫn trung thực hơn một cái nút nói dối.
   *
   * Không phải nhánh chết: `customers` chỉ ép dạng qua CHECK `customers_phone_normalized`
   * cho cột đã chuẩn hoá, còn dữ liệu cũ nhập tay trước ràng buộc đó vẫn còn.
   */
  if (normalized === null) {
    return <p className="m-0 text-sm text-muted">Số điện thoại lưu sai dạng: {phone}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {/*
        `<a>` chứ không `<Button onClick={location.href=…}>`: đây là điều hướng
        ra ngoài app, nên nó phải giữ được cú nhấn-giữ để copy số, và phải đọc ra
        là link với trình đọc màn hình.

        `min-h-11` khớp đúng ngưỡng chạm 44px mà `ui/button.tsx` và `app-nav.tsx`
        đã áp — hai kích cỡ chạm khác nhau trong cùng một hàng là đúng thứ
        `DEBT.md` đang ghi nợ ở `ToggleGroup`.
      */}
      <a
        href={`tel:${normalized}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-card border border-border-strong px-3 text-sm font-semibold text-ink transition-colors duration-150 active:bg-canvas"
      >
        <Icon name="phone" />
        <span className="tabular-nums">Gọi {normalized}</span>
      </a>
      <a
        href={`https://zalo.me/${normalized}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-card border border-border-strong px-3 text-sm font-semibold text-ink transition-colors duration-150 active:bg-canvas"
      >
        Zalo
      </a>
    </div>
  );
}

/** Việc chưa mở: đúng một dòng đọc lướt, và cả dòng là vùng chạm. */
function ClosedDuty({
  rental,
  selected,
  onOpen,
}: {
  readonly rental: RentalQueueRow;
  /**
   * Đang là việc hiện ở cột bên phải (chỉ xảy ra ở tablet/desktop). Viền accent
   * chứ không nền accent: dòng này vẫn phải đọc được như mọi dòng khác, và một
   * mảng màu đặc ở đây sẽ tranh chấp với chip trạng thái nằm ngay trong nó —
   * cùng lý lẽ `rental-status.ts` ghi khi chọn viền cho `PICKUP_OVERDUE`.
   */
  readonly selected: boolean;
  readonly onOpen: () => void;
}) {
  const now = new Date();
  const duty = dutyOf(rental);
  const shape = {
    status: rental.status,
    startsAt: new Date(rental.startsAt),
    endsAt: new Date(rental.endsAt),
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full min-h-11 items-center gap-3 rounded-card border bg-surface card-pad text-left transition-colors duration-150 active:bg-canvas ${
        selected ? "border-accent" : "border-border"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-card ${rentalChipClass(shape, now)}`}
      >
        <Icon name={statusIconOf(shape, now)} size="sm" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-ink">
          {rental.vehicleMake} {rental.vehicleModel}
        </span>
        <span className="truncate text-xs tabular-nums text-muted">
          {duty.verb} {WHEN_FMT.format(duty.at)} · {rental.customerName ?? "khách chưa có tên"}
        </span>
      </span>
      <Icon name="chevron-right" className="shrink-0 text-muted" />
    </button>
  );
}

/**
 * Không còn việc nào.
 *
 * Nói ra ĐIỀU KIỆN sinh ra màn hình này thay vì "chưa có gì": hàng đợi chỉ nhìn
 * bảy ngày tới (`QUEUE_HORIZON_DAYS`), nên trống ở đây KHÔNG có nghĩa shop không
 * có đơn nào — và một nhân viên mới đọc "chưa có dữ liệu" sẽ tưởng app hỏng.
 */
function EmptyField() {
  return (
    <div className="flex max-w-prose flex-col items-start gap-2 rounded-card border border-border bg-surface-sunken card-pad">
      <p className="m-0 text-sm text-ink">
        Không có xe nào phải giao hoặc nhận lại trong bảy ngày tới.
      </p>
      <p className="m-0 text-sm text-muted">
        Đơn đặt xa hơn bảy ngày vẫn nằm ở màn Đơn thuê và trên Lịch.
      </p>
    </div>
  );
}
