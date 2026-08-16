import { useQuery } from "@tanstack/react-query";
import { AttentionList } from "../components/stats/attention-list";
import { RevenueCards } from "../components/stats/revenue-cards";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { statsQuery } from "../lib/rentals";

export function StatsPage() {
  const { data, isPending } = useQuery(statsQuery);

  return (
    // `<div>`, không `<main>`: `AppShell` (`components/layout/app-shell.tsx`) đã
    // bọc `children` trong CHÍNH MỘT `<main>` (`page-gutter flex-1 py-4`) — một
    // `<main>` thứ hai lồng bên trong là hai landmark cho cùng nội dung, và cộng
    // dồn padding của cả hai lớp. `HealthPage`/`StaffListPage` cũ đã lỡ làm vậy;
    // không sửa lại chúng (ngoài phạm vi Task 3), nhưng trang MỚI thì không lặp.
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Thống kê</h1>
        {/*
         * Placeholder chưa nối hành động — form lên đơn là Task 7 của Plan C.
         * `disabled` để không hứa một cú bấm không làm gì (không lặng lẽ vô
         * dụng — người bấm biết ngay là nó chưa hoạt động).
         */}
        <Button type="button" disabled title="Form lên đơn chưa xây — Task 7">
          + Lên đơn
        </Button>
      </div>

      {isPending && <p className="text-sm text-muted">Đang tải…</p>}

      {/*
       * `statsQuery` trả discriminated union thay vì ném lỗi (xem `lib/rentals.ts`),
       * cùng khuôn `meQuery`: KHÔNG giữ lại text lỗi gốc từ backend, chỉ giữ `code`
       * — nên ở đây hiện một câu chung chung thay vì `errorMessage()`. Chấp nhận
       * được vì lỗi tải thống kê không phải chỗ người dùng cần biết CHÍNH XÁC vì
       * sao, chỉ cần biết "thử lại".
       */}
      {data && !data.ok && (
        <Alert tone="error">Không tải được số liệu thống kê. Thử tải lại trang.</Alert>
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
