import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { AttentionList } from "../components/stats/attention-list";
import { RevenueCards } from "../components/stats/revenue-cards";
import type { CreatedRental } from "../components/rentals/rental-form";

/*
 * `RentalForm` chỉ mount khi người dùng bấm "+ Lên đơn", nhưng import tĩnh thì
 * nó vẫn nằm trong chunk vào cửa — 560 dòng cộng cả nhánh `@v9/shared/domain/money`
 * mà trang này không cần để vẽ ba thẻ doanh thu.
 *
 * `type CreatedRental` import RIÊNG bằng `import type`: nó bị xoá hoàn toàn lúc
 * biên dịch nên không kéo module về, còn trộn nó vào `lazy()` thì không khai
 * kiểu được.
 */
const RentalForm = lazy(() =>
  import("../components/rentals/rental-form").then((m) => ({ default: m.RentalForm })),
);
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { errorMessage } from "../lib/errors";
import { statsQuery } from "../lib/rentals";

/**
 * `YYYY-MM-DD` (giá trị thô của `<input type="date">`) → `DD/MM/YYYY`.
 *
 * Đổi chuỗi, KHÔNG dựng `Date` rồi format: `new Date("2026-09-20")` là nửa đêm
 * UTC, và mọi thao tác múi giờ sau đó chỉ tạo cơ hội lệch một ngày cho một giá
 * trị vốn đã là ngày-theo-lịch, không phải một mốc thời gian. Phần còn lại của
 * app hiện ngày kiểu Việt Nam; ô xác nhận này không nên là chỗ duy nhất hiện ISO.
 */
function toVnDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

export function StatsPage() {
  const { data, isPending } = useQuery(statsQuery);
  // Task 7: nút "+ Lên đơn" từng là placeholder `disabled`. `RentalForm` chỉ
  // mount khi mở — đóng lại (huỷ hoặc tạo xong) là dọn sạch state của form,
  // không phải tự reset tay từng field.
  const [formOpen, setFormOpen] = useState(false);
  // Xác nhận đơn vừa tạo. Trước đây không có gì ở đây và màn hình sau khi tạo
  // đơn giống hệt màn hình trước đó — xem chú thích `onCreated` ở `RentalForm`.
  const [created, setCreated] = useState<CreatedRental | null>(null);

  return (
    // `<div>`, không `<main>`: `AppShell` (`components/layout/app-shell.tsx`) đã
    // bọc `children` trong CHÍNH MỘT `<main>` (`page-gutter flex-1 py-4`) — một
    // `<main>` thứ hai lồng bên trong là hai landmark cho cùng nội dung, và cộng
    // dồn padding của cả hai lớp. `HealthPage`/`StaffListPage` cũ đã lỡ làm vậy;
    // không sửa lại chúng (ngoài phạm vi Task 3), nhưng trang MỚI thì không lặp.
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Thống kê</h1>
        <Button type="button" onClick={() => setFormOpen(true)}>
          + Lên đơn
        </Button>
      </div>

      {/* `fallback={null}`: `RentalForm` tự dựng lớp phủ của nó, nên một
          skeleton ở đây sẽ nằm CHÈN vào giữa trang chứ không nằm trong modal.
          Chunk này nhỏ và chỉ tải một lần cho cả phiên; khoảng lặng ngắn hơn
          nhịp mở modal. */}
      {formOpen && (
        <Suspense fallback={null}>
          <RentalForm onClose={() => setFormOpen(false)} onCreated={setCreated} />
        </Suspense>
      )}

      {/*
       * `live="polite"`, không `assertive`: người dùng vừa tự bấm "Tạo đơn" nên
       * họ đang chờ tin này — không cần cắt ngang trình đọc màn hình.
       *
       * Câu nói ĐỦ CỤ THỂ để tự kiểm: xe nào, khách nào, từ ngày nào tới ngày
       * nào. Một chữ "Đã lưu" trống rỗng không giúp người đứng cạnh khách xác
       * nhận rằng mình vừa lên đúng đơn.
       */}
      {created && (
        <Alert tone="info" live="polite">
          Đã tạo đơn: {created.vehicleLabel} · {created.customerName} ·{" "}
          {toVnDate(created.startDate)} → {toVnDate(created.endDate)}.{" "}
          <Link to="/calendar" search={{ view: "timeline", from: created.startDate }}>
            Xem trên lịch →
          </Link>
        </Alert>
      )}

      {/* Skeleton dựng đúng hình dạng thứ sắp thay nó: một hàng ba thẻ doanh
          thu (xếp dọc dưới `md`, ba cột từ `md` — khớp `RevenueCards`) rồi ba
          dòng "Cần chú ý". Một khối xám chung chung thì vẫn nhảy layout, chỉ là
          nhảy ít hơn. */}
      {isPending && (
        <>
          <p className="text-sm text-muted">Đang tải…</p>
          <section>
            <Skeleton className="h-4 w-24" />
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          </section>
          <section>
            <Skeleton className="h-4 w-24" />
            <div className="mt-2 flex flex-col gap-1">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          </section>
        </>
      )}

      {/*
       * `statsQuery` trả discriminated union thay vì ném lỗi (xem `lib/rentals.ts`).
       * Nhánh lỗi giữ cả `value` gốc, nên `errorMessage()` hiện đúng câu tiếng
       * Việt backend đã viết thay vì một câu chung chung đoán mò.
       */}
      {data && !data.ok && (
        <Alert tone="error">
          {errorMessage(data.value, "Không tải được số liệu thống kê. Thử tải lại trang.")}
        </Alert>
      )}

      {data?.ok && (
        <>
          <RevenueCards revenue={data.stats.revenue} />
          <AttentionList attention={data.stats.attention} />
        </>
      )}
    </div>
  );
}
