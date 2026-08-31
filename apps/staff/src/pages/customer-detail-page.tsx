import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { CustomerEditForm } from "../components/customers/customer-edit-form";
import { CustomerRentalHistory } from "../components/customers/customer-rental-history";
import { Alert } from "../components/ui/alert";
import { customerDetailQuery, customerRentalsQuery } from "../lib/customers";
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

  return (
    <main className="p-6">
      <Link
        to="/customers"
        search={{ q: backSearch.q ?? "", page: backSearch.page ?? 1 }}
        className="text-sm text-muted underline-offset-2 hover:underline"
      >
        ← Khách hàng
      </Link>

      {detail.isPending && <p className="mt-3 text-sm text-muted">Đang tải…</p>}

      {detail.data?.ok === false && (
        <div className="mt-3">
          <Alert tone="error">{errorMessage(detail.data.value, "Không tải được khách hàng")}</Alert>
        </div>
      )}

      {detail.data?.ok && (
        <>
          <h1 className="mt-1 text-xl font-bold">{detail.data.customer.fullName}</h1>

          <div className="mt-4 max-w-md rounded-card border border-border card-pad">
            <CustomerEditForm customer={detail.data.customer} onSaved={handleSaved} />
          </div>

          <h2 className="mt-6 text-lg font-semibold">Lịch sử thuê xe</h2>

          {rentals.isPending && <p className="mt-3 text-sm text-muted">Đang tải…</p>}
          {rentals.data?.ok === false && (
            <div className="mt-3">
              <Alert tone="error">
                {errorMessage(rentals.data.value, "Không tải được lịch sử")}
              </Alert>
            </div>
          )}
          {rentals.data?.ok && <CustomerRentalHistory rentals={rentals.data.rentals} />}
        </>
      )}
    </main>
  );
}
