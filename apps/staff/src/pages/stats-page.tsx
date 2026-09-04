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
import { BrandMark } from "../components/ui/brand-mark";
import { Button } from "../components/ui/button";
import { Icon } from "../components/ui/icon";
import { Skeleton } from "../components/ui/skeleton";
import { useLayoutVariant } from "../hooks/use-layout-variant";
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
  const variant = useLayoutVariant();
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
    // dồn padding của cả hai lớp.
    //
    // Luật áp cho MỌI trang treo dưới `protectedLayoutRoute`, kể cả trang chỉ
    // có một form: đó là chỗ `/change-password` từng trượt, vì nó mượn
    // `ui/page-shell.tsx` — khung dành cho trang đứng NGOÀI shell.
    <div className="flex flex-col gap-4">
      {/*
        Khoá nhận diện, chỉ ở TRANG CHỦ.
        
        Không đặt vào `AppShell` để nó hiện trên mọi trang: đây là app vận hành,
        nhân viên mở nó hàng trăm lần mỗi ca và không cần được nhắc mình đang
        dùng phần mềm của ai ở mỗi màn hình. Trang chủ là cửa vào — và trên điện
        thoại, khi app được cài thành PWA, đây là thứ đầu tiên hiện ra sau màn
        khởi động.
        
        `text-ink-soft` chứ không `text-ink`: mark đứng TRÊN tiêu đề trang, nên
        nó không được cạnh tranh với "Thống kê" về độ đậm. Nhận diện ở đây là
        chỗ đứng, không phải tiêu đề.
      */}
      <div className="flex items-center gap-2 text-ink-soft">
        <BrandMark className="h-8 w-8 shrink-0" />
        {/* `tracking-wide` + `uppercase`: cùng khuôn nhãn của app (xem tiêu đề
            "DOANH THU" / "CẦN CHÚ Ý" ngay dưới), nên tên thương hiệu đọc ra là
            một nhãn chỗ-đứng chứ không phải một tiêu đề thứ hai. */}
        <span className="text-sm font-semibold tracking-wide uppercase">V9 Motor Rental</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Thống kê</h1>
        {/*
          Chỉ ở màn RỘNG. Bottom nav của điện thoại đã có ô hành động "Lên đơn"
          ở chính giữa và nó nằm trên MỌI trang, nên giữ nút này ở đây nữa là bày
          cùng một hành động hai lần trong một khung nhìn 390px.

          Không bỏ hẳn: sidebar của màn rộng KHÔNG có ô hành động nào, nên đây
          vẫn là đường vào "Lên đơn" duy nhất ở đó.
        */}
        {variant === "desktop" && (
          <Button type="button" onClick={() => setFormOpen(true)}>
            <Icon name="plus" />
            Lên đơn
          </Button>
        )}
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
