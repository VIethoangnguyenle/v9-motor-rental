import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { CustomerEditForm } from "../components/customers/customer-edit-form";
import { CustomerRentalHistory } from "../components/customers/customer-rental-history";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { connectionFailed, customerDetailQuery, customerRentalsQuery } from "../lib/customers";
import { errorMessage } from "../lib/errors";

/**
 * Chi tiết một khách hàng: hồ sơ (sửa được) + lịch sử thuê xe. KHÔNG có xoá —
 * xem comment ở `POST /customers/:id` (`apps/api/src/routes/rentals.ts`) cho
 * lý do đầy đủ (`rentals.customer_id` là `ON DELETE RESTRICT`, và "ẩn/gộp
 * khách chưa từng thuê" là quyết định nghiệp vụ chưa ai chốt).
 */
export function CustomerDetailPage() {
  const { id } = useParams({ from: "/protected/customers/$id" });
  const backSearch = useSearch({ strict: false });
  const qc = useQueryClient();

  const detail = useQuery(customerDetailQuery(id));
  const rentals = useQuery(customerRentalsQuery(id));

  // Hai query độc lập nên hỏng độc lập: mất mạng lúc mở trang thì cả hai cùng
  // hỏng, nhưng API sập một nửa thì chỉ một cái. Phân loại riêng từng cái.
  // Vì sao `isError` một mình không đủ: `lib/customers.ts`.
  const detailOffline = connectionFailed(detail);
  const rentalsOffline = connectionFailed(rentals);

  /**
   * Ba cache cần làm mới sau khi sửa: chính hồ sơ này, trang danh sách (tên/
   * số điện thoại/ghi chú vừa đổi phải hiện đúng khi quay lại `/customers`),
   * và ô tìm tự động của form lên đơn (`["customers", q]` ở `lib/rentals.ts`)
   * — phòng khi đúng khách này đang được tìm ở đó. `invalidateQueries` so
   * khớp theo TIỀN TỐ mặc định, nên `["customers-list"]`/`["customers"]` khớp
   * mọi entry đang mở của mỗi query, không cần biết đúng `q`/`page` nào.
   */
  function handleSaved(): void {
    void qc.invalidateQueries({ queryKey: ["customer", id] });
    void qc.invalidateQueries({ queryKey: ["customers-list"] });
    void qc.invalidateQueries({ queryKey: ["customers"] });
  }

  // `<div>`, không `<main>` — `AppShell` đã có một `<main>` bọc ngoài rồi (xem
  // comment cùng lý do ở `pages/stats-page.tsx`).
  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/customers"
        search={{ q: backSearch.q ?? "", page: backSearch.page ?? 1 }}
        className="flex min-h-11 items-center self-start text-sm text-muted underline-offset-2 hover:underline"
      >
        ← Khách hàng
      </Link>

      {detail.isPending && <p className="text-sm text-muted">Đang tải…</p>}

      {/* `live="polite"` + không còn `<div>` bọc — cùng lý do đã ghi ở
          `customers-list-page.tsx`. */}
      {detail.data?.ok === false && !detailOffline && (
        <Alert tone="error" live="polite">
          {errorMessage(detail.data.value, "Không tải được khách hàng")}
        </Alert>
      )}

      {detailOffline && (
        <div className="flex flex-col items-start gap-2">
          <Alert tone="error" live="polite">
            Không kết nối được máy chủ.
          </Alert>
          <Button type="button" variant="ghost" onClick={() => void detail.refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {detail.data?.ok && (
        // `<div>` chứ không phải fragment `<>...</>` — nhưng KHÔNG phải vì
        // fragment làm hỏng `gap`: fragment trong suốt với DOM, con của nó vẫn
        // là con trực tiếp của flex cha nên `gap-4` vốn đã áp đúng. (Bản nháp
        // của đợt này ghi ngược điều đó; giữ lại đính chính ở đây để người sau
        // không "sửa lại cho đúng" theo hướng sai.)
        //
        // Lý do thật: khối này là một NHÓM có nhịp riêng — hồ sơ khách rồi tới
        // lịch sử thuê. Cho nó container riêng thì sau này đổi nhịp bên trong
        // không phải đụng nhịp của cả trang, và không phải quay lại `mt-*`.
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-bold text-ink">{detail.data.customer.fullName}</h1>

          <div className="max-w-md rounded-card border border-border card-pad">
            <CustomerEditForm customer={detail.data.customer} onSaved={handleSaved} />
          </div>

          <h2 className="text-lg font-semibold">Lịch sử thuê xe</h2>

          {rentals.isPending && <p className="text-sm text-muted">Đang tải…</p>}
          {rentals.data?.ok === false && !rentalsOffline && (
            <Alert tone="error" live="polite">
              {errorMessage(rentals.data.value, "Không tải được lịch sử")}
            </Alert>
          )}

          {rentalsOffline && (
            <div className="flex flex-col items-start gap-2">
              <Alert tone="error" live="polite">
                Không kết nối được máy chủ.
              </Alert>
              <Button type="button" variant="ghost" onClick={() => void rentals.refetch()}>
                Thử lại
              </Button>
            </div>
          )}
          {rentals.data?.ok && <CustomerRentalHistory rentals={rentals.data.rentals} />}
        </div>
      )}
    </div>
  );
}
