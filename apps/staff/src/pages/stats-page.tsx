import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AttentionList } from "../components/stats/attention-list";
import { RevenueCards } from "../components/stats/revenue-cards";
import { RentalForm } from "../components/rentals/rental-form";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { errorMessage } from "../lib/errors";
import { statsQuery } from "../lib/rentals";

export function StatsPage() {
  const { data, isPending } = useQuery(statsQuery);
  // Task 7: nút "+ Lên đơn" từng là placeholder `disabled`. `RentalForm` chỉ
  // mount khi mở — đóng lại (huỷ hoặc tạo xong) là dọn sạch state của form,
  // không phải tự reset tay từng field.
  const [formOpen, setFormOpen] = useState(false);

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

      {formOpen && <RentalForm onClose={() => setFormOpen(false)} />}

      {isPending && <p className="text-sm text-muted">Đang tải…</p>}

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
