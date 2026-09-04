import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { RentalStatus } from "@v9/shared/domain/rental";
import { RentalLedger } from "../components/rentals/rental-ledger";
import { RentalQueue } from "../components/rentals/rental-queue";
import { RentalDetailSheet } from "../components/rentals/rental-detail-sheet";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { ToggleGroup } from "../components/ui/toggle-group";
import { TextField } from "../components/ui/text-field";
import { connectionFailed } from "../lib/customers";
import { shouldResyncSearchText } from "../lib/customers-search";
import { errorMessage } from "../lib/errors";
import { STATUS_LABEL } from "../lib/rental-status";
import { fleetQuery } from "../lib/rentals";
import { RENTALS_PAGE_SIZE, rentalsLedgerQuery, rentalsQueueQuery } from "../lib/rentals-list";
import { effectiveMode, type RentalsMode } from "../lib/rentals-search";

const MODES: readonly { value: RentalsMode; label: string }[] = [
  { value: "queue", label: "Hàng đợi" },
  { value: "ledger", label: "Sổ cái" },
];

export function RentalsPage() {
  // `strict: false` chứ không `rentalsRoute.useSearch()` — import route vào page
  // dựng ra chu trình module, cùng lý do `customers-list-page.tsx` làm vậy.
  const search = useSearch({ strict: false });
  const navigate = useNavigate({ from: "/rentals" });

  const mode = search.mode === "ledger" ? "ledger" : "queue";
  const q = search.q ?? "";
  const page = search.page ?? 1;
  const from = search.from ?? "";
  const to = search.to ?? "";
  const current = { mode, q, page, from, to } as const;
  const shown = effectiveMode(current);

  const [searchText, setSearchText] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  if (shouldResyncSearchText(q, lastQ)) {
    setLastQ(q);
    setSearchText(q);
  }

  // Debounce 300ms, ghi vào URL với `replace: true` — cùng ngưỡng và cùng lý lẽ
  // `customers-list-page.tsx`: một nhịp debounce là đồng bộ Ô GÕ, không phải một
  // hành động điều hướng đáng có điểm dừng riêng trong lịch sử. Nút phân trang
  // thì ngược lại, nên nó `push`.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim();
      // Updater DẠNG HÀM, không phải object tĩnh: closure của timer chụp
      // `current` tại lúc đồng hồ được bấm, và `current` KHÔNG nằm trong deps
      // (xem lý do ngay dưới) — nếu người dùng đổi `mode`/`from`/`to` trong
      // đúng 300ms sau lần gõ cuối, một object tĩnh `{ ...current, q: next }`
      // sẽ ghi đè bằng bản `current` CŨ, âm thầm huỷ đúng thay đổi họ vừa làm.
      // `(prev) => ({ ...prev, ... })` đọc search THẬT tại lúc commit thay vì
      // bản đã chụp — cùng khuôn `rental-calendar.tsx:331,343,358` dùng cho
      // đúng lý do này (đã kiểm: `@tanstack/react-router@1.170.18` — bản repo
      // đang ghim — nhận `search` dạng hàm, ba chỗ đó đang chạy thật).
      if (next !== q) {
        void navigate({ search: (prev) => ({ ...prev, q: next, page: 1 }), replace: true });
      }
    }, 300);
    return () => clearTimeout(timer);
    // `current` dựng mới mỗi lần render nên KHÔNG đưa vào deps — nó sẽ làm effect
    // chạy lại mỗi render và reset đồng hồ debounce vĩnh viễn. Không cần
    // `eslint-disable`: repo này không bật `react-hooks/exhaustive-deps`
    // (không có trong `eslint.config.js`) — bản brief chép nguyên comment đó từ
    // một khuôn khác, và ở đây nó tự thành lỗi "định nghĩa luật không tồn tại".
  }, [searchText, q, navigate]);

  const queue = useQuery({ ...rentalsQueueQuery(page), enabled: shown === "queue" });
  const ledger = useQuery({ ...rentalsLedgerQuery(current), enabled: shown === "ledger" });
  const fleet = useQuery(fleetQuery);

  const active = shown === "queue" ? queue : ledger;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changed, setChanged] = useState<string | null>(null);

  // Banner "Đã cập nhật…" nói về MỘT đơn cụ thể — để nó sống mãi qua đổi chế
  // độ/từ khoá/trang/khoảng ngày là gán một xác nhận cho một ngữ cảnh người
  // dùng đã rời khỏi. Xoá khi ngữ cảnh xem đổi (đúng năm tham số quyết định
  // `queryKey` của `active` — `rentalsQueueQuery`/`rentalsLedgerQuery` ở
  // `lib/rentals-list.ts`); việc xoá khi MỞ đơn khác nằm ở `handleOpen` bên
  // dưới, cùng khuôn `rental-calendar.tsx` (`setChanged(null)` trước
  // `setSelectedId`). Không xoá khi tự đóng sheet: đó là lúc người dùng CẦN
  // thấy xác nhận nhất.
  useEffect(() => {
    setChanged(null);
  }, [mode, q, page, from, to]);

  function handleOpen(id: string): void {
    setChanged(null);
    setSelectedId(id);
  }

  const rows = active.data?.ok ? active.data.rentals : [];
  const total = active.data?.ok ? active.data.total : 0;
  const now = new Date();

  /*
   * GHIM bản đang mở, không suy thẳng từ danh sách — cùng lý do
   * `rental-calendar.tsx` đã ghi và cùng mức nguy hiểm: đổi trạng thái xong thì
   * refetch có thể làm đơn RƠI KHỎI trang hiện tại (hàng đợi lọc theo nhóm; một
   * đơn vừa "đã nhận lại xe" thành COMPLETED và biến mất hoàn toàn). Không ghim
   * thì sheet bị gỡ thẳng khỏi cây, không đi qua `dialog.close()`, và hiệu ứng
   * ra không chạy lấy một khung hình.
   *
   * `useRef`, KHÔNG `useState` ghi trong lúc render: `rental-calendar.tsx` đã
   * đo đúng lớp lỗi này (sheet biến mất ở t=620ms thay vì giữ tới ~780ms) và
   * chốt bằng `useRef` — chép nguyên khuôn đó, không dựng lại bằng `useState`.
   */
  const fresh = selectedId === null ? null : (rows.find((r) => r.id === selectedId) ?? null);
  const pinned = useRef(fresh);
  if (fresh !== null) pinned.current = fresh;
  const selected = selectedId === null ? null : pinned.current;

  const vehicles = fleet.data?.ok ? fleet.data.vehicles : [];
  const lastPage = Math.max(1, Math.ceil(total / RENTALS_PAGE_SIZE));

  return (
    // `<div>`, không `<main>` — `AppShell` đã bọc một `<main>` ngoài rồi (cùng
    // comment ở `stats-page.tsx`/`calendar-page.tsx`); thêm một `<main>` nữa là
    // hai landmark cho cùng một nội dung, cộng đệm nhân đôi.
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Đơn thuê</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          label="Chế độ xem"
          options={MODES}
          value={mode}
          onChange={(next) => void navigate({ search: { ...current, mode: next, page: 1 } })}
        />
        <TextField
          label="Tìm khách, số điện thoại hoặc biển số"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Tên khách, số điện thoại, hoặc biển số"
        />
      </div>

      {/* Gõ từ khoá thì hàng đợi mất nghĩa và trang tự chuyển sang sổ cái. NÓI RA
          điều đó, đừng để người dùng tự đoán vì sao nhóm biến mất.
          `shown !== mode` chứ không tự so `q.trim().length > 0 && mode === "queue"`:
          luật "có `q` thì hàng đợi mất nghĩa" đã sống ở `effectiveMode`
          (`rentals-search.ts`), viết lại điều kiện ở đây là dựng bản sao thứ
          hai của đúng luật đó, ngay trong JSX — hai bản sẽ lệch ngày luật đổi. */}
      {shown !== mode && (
        <Alert tone="info">Đang tìm trong tất cả đơn thuê, kể cả đơn đã trả và đã huỷ.</Alert>
      )}

      {changed && (
        <Alert tone="info" live="polite">
          {changed}
        </Alert>
      )}

      {active.isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      )}

      {/* `keepPreviousData` (`lib/rentals-list.ts`) giữ `status` là "success" ngay
          từ lần tải THỨ HAI, nên `isPending` không còn bật lại — đổi trang, đổi
          khoảng ngày, hay gõ tìm sau lần đầu đều không có gì báo đang tải nếu chỉ
          nhìn `isPending`. `isFetching` là chỉ báo còn nghĩa cho mọi lần sau đó,
          cùng khuôn `customers-list-page.tsx`. Loại trừ `isPending` để không in
          "Đang tải…" chồng lên khối `Skeleton` ở lần tải đầu. */}
      {active.isFetching && !active.isPending && (
        <p className="text-sm text-muted">Đang tải…</p>
      )}

      {connectionFailed(active) && (
        <div className="flex flex-col items-start gap-2">
          <Alert tone="error">Không kết nối được tới máy chủ.</Alert>
          <Button type="button" variant="ghost" onClick={() => void active.refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {!connectionFailed(active) && active.data && !active.data.ok && (
        <Alert tone="error">
          {errorMessage(active.data.value, "Không tải được danh sách đơn thuê.")}
        </Alert>
      )}

      {/* Hai câu RỖNG khác nhau, và sự khác nhau là có thật: ở hàng đợi, rỗng là
          TIN TỐT; ở sổ cái đã lọc, rỗng nghĩa là bộ lọc không khớp gì. */}
      {active.data?.ok && rows.length === 0 && (
        <p className="text-sm text-muted">
          {shown === "queue"
            ? "Không có đơn nào cần xử lý."
            : "Không có đơn nào khớp bộ lọc hiện tại."}
        </p>
      )}

      {active.data?.ok && rows.length > 0 && shown === "queue" && queue.data?.ok && (
        <RentalQueue
          rentals={queue.data.rentals}
          groupCounts={queue.data.groupCounts}
          now={now}
          onOpen={handleOpen}
        />
      )}

      {active.data?.ok && rows.length > 0 && shown === "ledger" && ledger.data?.ok && (
        <RentalLedger
          rentals={ledger.data.rentals}
          collectedAmount={ledger.data.collectedAmount}
          search={current}
          now={now}
          onRange={(nextFrom, nextTo) =>
            void navigate({ search: { ...current, from: nextFrom, to: nextTo, page: 1 } })
          }
          onOpen={handleOpen}
        />
      )}

      {total > RENTALS_PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          {/* `push`, không `replace`: bấm sang trang là hành động rời rạc, có chủ
              ý, xứng đáng một điểm dừng riêng trong lịch sử — cùng khuôn nút
              prev/next của lịch và của màn Khách hàng. */}
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => void navigate({ search: { ...current, page: page - 1 } })}
            className="min-h-11 rounded-card border border-border px-3 text-sm text-ink disabled:opacity-50"
          >
            Trước
          </button>
          <span className="text-sm text-muted tabular-nums">
            Trang {page}/{lastPage} · {total} đơn
          </span>
          <button
            type="button"
            disabled={page >= lastPage}
            onClick={() => void navigate({ search: { ...current, page: page + 1 } })}
            className="min-h-11 rounded-card border border-border px-3 text-sm text-ink disabled:opacity-50"
          >
            Sau →
          </button>
        </div>
      )}

      {selected && (
        <RentalDetailSheet
          rental={selected}
          vehicle={vehicles.find((v) => v.id === selected.vehicleId)}
          onClose={() => setSelectedId(null)}
          /* `onChanged` KHÔNG gỡ sheet — chỉ `onClose` mới được làm việc đó. Gỡ ở
             đây là gỡ `<dialog>` thẳng khỏi cây, không đi qua `dialog.close()`,
             tức mất hiệu ứng ra. Cùng luật `rental-calendar.tsx`. */
          onChanged={(next: RentalStatus) =>
            setChanged(`Đã cập nhật: ${STATUS_LABEL[next].toLowerCase()}.`)
          }
        />
      )}
    </div>
  );
}
