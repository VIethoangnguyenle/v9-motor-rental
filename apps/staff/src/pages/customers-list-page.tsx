import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CustomerTable } from "../components/customers/customer-table";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { TextField } from "../components/ui/text-field";
import { CUSTOMERS_PAGE_SIZE, customersListQuery } from "../lib/customers";
import { shouldResyncSearchText } from "../lib/customers-search";
import { errorMessage } from "../lib/errors";

/**
 * Màn danh sách khách hàng. `q` rỗng CỐ Ý trả về trang đầu tiên của TOÀN BỘ
 * khách hàng — đảo ngược với ô tìm tự động của form lên đơn
 * (`components/rentals/rental-form.tsx`, dùng `customersQuery` ở
 * `lib/rentals.ts`, `q` rỗng → không gọi gì cả). Hai nhu cầu khác nhau: form
 * cần "chưa gõ gì thì đừng đổ cả bảng vào dropdown"; màn này cần "duyệt được
 * toàn bộ khách hàng". Xem lý lẽ đầy đủ ở route `GET /customers/list`
 * (`apps/api/src/routes/rentals.ts`).
 */
export function CustomersListPage() {
  // `strict: false` chứ không `customersListRoute.useSearch()` — cùng lý do
  // `login-page.tsx` và `rental-calendar.tsx:299` làm vậy: import route vào
  // page dựng ra chu trình module.
  const search = useSearch({ strict: false });
  const navigate = useNavigate({ from: "/customers" });

  // Dot access, không type-guard: `validateCustomersSearch` ở route đã lọc rồi.
  // Cùng idiom `rental-calendar.tsx:300` (`search.view ?? DEFAULT_VIEW`).
  const q = search.q ?? "";
  const page = search.page ?? 1;

  const [searchText, setSearchText] = useState(q);

  // `q` đổi TỪ BÊN NGOÀI (Back/Forward của trình duyệt, hay nút "← Khách hàng"
  // của trang chi tiết) trong khi component KHÔNG unmount: `useState(q)` chỉ
  // chạy lúc mount nên `searchText` sẽ cũ, và effect debounce bên dưới sẽ thấy
  // `next !== q` rồi ghi giá trị CŨ ngược lại URL — đá hỏng chính nút Back mà
  // task này sinh ra để sửa. Đồng bộ ngay trong lúc render (khuôn "adjusting
  // state when props change" của React) chứ không bằng một useEffect thứ hai:
  // effect chạy SAU khi paint nên ô nhập sẽ nháy một khung hình giá trị cũ.
  // Giới hạn đã biết, KHÔNG sửa: `shouldResyncSearchText` không phân biệt được
  // "`q` đổi vì Back/Forward" với "`q` đổi vì chính debounce ở dưới vừa
  // navigate". Router commit location trong `startTransition`, nên nếu người
  // dùng gõ tiếp đúng trong khoảng ~1 frame giữa lúc `navigate()` gọi và lúc
  // React commit `search.q` mới, resync này sẽ đè chữ vừa gõ bằng giá trị VỪA
  // commit (cũ hơn). Rất khó gặp khi gõ tay thật, và tự lành ở nhịp debounce
  // kế tiếp — không đáng để đổi thiết kế.
  const [lastQ, setLastQ] = useState(q);
  if (shouldResyncSearchText(q, lastQ)) {
    setLastQ(q);
    setSearchText(q);
  }

  // Debounce 300ms — cùng ngưỡng với ô tìm khách hàng ở `rental-form.tsx`.
  // Ghi vào URL thay vì vào state: Back trả về đúng từ khoá trước đó.
  // Đổi từ khoá thì QUAY VỀ trang 1 — giữ `page` cũ dễ ra một trang trống nếu
  // kết quả mới có ít hơn `page * pageSize` dòng.
  //
  // `replace: true` CHỈ ở đây, không ở hai nút phân trang bên dưới: mỗi lần
  // debounce chốt là một lần đồng bộ Ô GÕ, không phải một hành động điều
  // hướng có chủ ý — gõ rời rạc ("ng", nghỉ, "uyen", nghỉ) mà push thì mỗi
  // nhịp nghỉ đẻ ra một history entry, Back phải bấm nhiều lần mới thoát khỏi
  // một phiên gõ. Bấm "Trước"/"Sau →" thì khác: đó LÀ hành động rời rạc, có
  // chủ ý, xứng đáng một điểm dừng riêng trong lịch sử — cùng khuôn nút
  // prev/next của lịch (`rental-calendar.tsx`).
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim();
      if (next !== q) void navigate({ search: { q: next, page: 1 }, replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, q, navigate]);

  const query = useQuery(customersListQuery(q, page));

  const total = query.data?.ok ? query.data.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE));

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">Khách hàng</h1>

      <div className="mt-4 max-w-sm">
        <TextField
          label="Tìm khách hàng (tên hoặc số điện thoại)"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Để trống để xem tất cả"
        />
      </div>

      {query.data?.ok === false && (
        <div className="mt-3">
          <Alert tone="error">{errorMessage(query.data.value, "Không tải được danh sách")}</Alert>
        </div>
      )}

      <CustomerTable rows={query.data?.ok ? query.data.customers : []} listSearch={{ q, page }} />

      {query.isPending && <p className="mt-3 text-sm text-muted">Đang tải…</p>}
      {query.data?.ok && query.data.customers.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          {q === "" ? "Chưa có khách hàng nào." : "Không tìm thấy khách hàng nào khớp."}
        </p>
      )}

      {query.data?.ok && total > CUSTOMERS_PAGE_SIZE && (
        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => void navigate({ search: { q, page: Math.max(1, page - 1) } })}
          >
            ← Trước
          </Button>
          <span className="text-sm text-muted">
            Trang {page}/{totalPages} · {total} khách hàng
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => void navigate({ search: { q, page: Math.min(totalPages, page + 1) } })}
          >
            Sau →
          </Button>
        </div>
      )}
    </main>
  );
}
