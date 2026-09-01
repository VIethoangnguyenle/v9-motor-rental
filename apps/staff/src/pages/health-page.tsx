import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function HealthPage() {
  const { data, error, isPending } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.get();
      if (res.error) throw new Error(JSON.stringify(res.error.value));
      return res.data;
    },
  });

  // `<div>`, không `<main>` — `AppShell` đã có một `<main>` bọc ngoài (xem
  // comment cùng lý do ở `pages/stats-page.tsx`).
  return (
    <div className="flex flex-col gap-4 font-mono">
      <h1 className="text-xl font-bold text-ink">Chẩn đoán</h1>
      <p className="text-ink">
        API health:{" "}
        <strong>{isPending ? "đang tải…" : error ? `lỗi: ${error.message}` : data.status}</strong>
      </p>
      {/*
       * Câu cũ ở đây là "Chưa có chức năng nghiệp vụ nào. Xem CLAUDE.md." — nó
       * đúng vào lúc trang này còn nằm ở `/`, và đã SAI từ khi Thống kê chiếm
       * chỗ đó: app nay có đủ bốn tính năng `ARCHITECTURE.md` liệt kê. Một câu
       * sai trên màn chẩn đoán là thứ tệ nhất có thể để ở màn chẩn đoán.
       *
       * Vai trò thật của trang, chép từ chính comment `healthRoute` ở
       * `router.tsx`: bằng chứng end-to-end rẻ nhất rằng guard chạy VÀ `/health`
       * phía API tới được.
       */}
      <p className="text-sm text-muted">
        Trang chẩn đoán, không lên thanh điều hướng. Nó nằm dưới nhánh được bảo vệ nên hiện được
        dòng trên nghĩa là guard đã chạy và API tới được.
      </p>
    </div>
  );
}
