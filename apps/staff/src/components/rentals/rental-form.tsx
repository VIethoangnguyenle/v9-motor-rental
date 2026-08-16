import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ApiErrorCode } from "@v9/api";
import { formatVnd, roundVnd } from "@v9/shared/domain/money";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import { api } from "../../lib/api";
import { errorCode, errorMessage } from "../../lib/errors";
import {
  customersQuery,
  fleetQuery,
  vehiclePricesQuery,
  type Customer,
  type FleetVehicle,
} from "../../lib/rentals";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { SubmitButton } from "../ui/submit-button";
import { TextField } from "../ui/text-field";

/**
 * Task 7, Plan C — form lên đơn. Modal tự đóng gói toàn bộ chrome (overlay +
 * dialog), cùng khuôn sheet "Thêm" ở `components/layout/app-nav.tsx`
 * (`fixed inset-0` + nút nền + `role="dialog"`), để nơi gọi (`stats-page.tsx`)
 * chỉ cần một state boolean, không phải tự dựng lớp phủ.
 *
 * ⚠️ File này KHÔNG import `@v9/shared` (barrel) — chỉ hai subpath domain, cùng
 * lý do đã ghi ở đầu `rental-calendar.tsx`.
 */

// ── Ngày (giờ VN) người dùng gõ → instant gửi API ───────────────────────────
//
// Bản RIÊNG của file này, cùng KỸ THUẬT `zonedMidnightOf` ở `rental-calendar.tsx`
// (Intl + tự tra lệch múi giờ tại đúng thời điểm cần, KHÔNG hardcode "+7 giờ" —
// Asia/Ho_Chi_Minh không có DST nhưng đây vẫn là cách đúng), phục vụ MỤC ĐÍCH
// khác (ngày gõ trong form, không phải neo lịch) nên không dùng chung — xem lý
// lẽ "hai bản độc lập, không phải bản sao lười" ở đầu `rental-calendar.tsx`.
// Cũng không cần validate lại hình dạng như `parseYmd` ở đó: `<input type="date">`
// đã đảm bảo `value` luôn là "YYYY-MM-DD" hợp lệ hoặc chuỗi rỗng, không phải
// text người dùng gõ tự do qua URL.

function tzOffsetMsAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** "YYYY-MM-DD" → 00:00 giờ VN của đúng ngày đó, dịch thành instant UTC thật. */
function vnMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guessMs = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return new Date(guessMs - tzOffsetMsAt(new Date(guessMs)));
}

/** Cộng NGUYÊN ngày dương lịch (thuần, không phụ thuộc múi giờ) rồi trả "YYYY-MM-DD". */
function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(next.getUTCFullYear())}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * `startDate`/`endDate` là hai NGÀY người dùng gõ, hiểu theo nghĩa BAO GỒM CẢ
 * HAI ĐẦU — "từ 20/8 đến 22/8" nghĩa là xe bận đúng ba ngày 20, 21, 22, khớp
 * cách lịch vẽ một đơn trải dài nhiều Ô NGÀY liên tiếp. API/DB dùng biên NỬA
 * MỞ `[startsAt, endsAt)` (`packages/shared/src/domain/interval.ts`), nên
 * `endsAt` PHẢI là 00:00 giờ VN của ngày SAU `endDate`, không phải chính
 * `endDate`:
 *
 *   endsAt = vnMidnight(endDate)                    → SAI, off-by-one: đơn
 *            "hết hạn" đúng lúc `endDate` bắt đầu, tức ngày cuối khách còn
 *            giữ xe lại hiện RẢNH trên lịch.
 *   endsAt = vnMidnight(addDaysYmd(endDate, 1))      → ĐÚNG: `endDate` nằm
 *            trọn trong `[startsAt, endsAt)`.
 *
 * `startsAt` giữ nguyên 00:00 giờ VN của `startDate` — khớp cách `zonedMidnightOf`
 * của lịch đặt biên ô ngày, nên "số ngày" tính từ đây luôn khớp số ô hiện trên lịch.
 */
function toApiRange(startDate: string, endDate: string): { startsAt: Date; endsAt: Date } {
  return { startsAt: vnMidnight(startDate), endsAt: vnMidnight(addDaysYmd(endDate, 1)) };
}

function dayCount(startDate: string, endDate: string): number {
  const { startsAt, endsAt } = toApiRange(startDate, endDate);
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000);
}

function vehicleLabel(v: FleetVehicle): string {
  return v.plate ? `${v.make} ${v.model} — ${v.plate}` : `${v.make} ${v.model}`;
}

/**
 * Giữ `code` bên cạnh `message` — `createRental.error` (từ `useMutation`) chỉ
 * còn là một `Error` trần với `.message`, và JSX cần biết ĐÂY LÀ `RENTAL_OVERLAP`
 * để thêm đường dẫn xem lịch, không chỉ hiện chữ.
 */
class RentalApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode | null,
  ) {
    super(message);
  }
}

export function RentalForm({ onClose }: { readonly onClose: () => void }) {
  const qc = useQueryClient();

  // Đóng bằng phím Esc — chi phí rẻ, cùng kiểu vẫn thấy ở sheet "Thêm" của
  // `app-nav.tsx` (đóng bằng nút nền `absolute inset-0`); Esc là lối tắt thêm,
  // không thay thế nút đó.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const fleet = useQuery(fleetQuery);
  const vehiclePrices = useQuery(vehiclePricesQuery);

  const [vehicleId, setVehicleId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("0");
  const [note, setNote] = useState("");

  // ── Khách hàng: tìm hoặc tạo nhanh ───────────────────────────────────────
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [reusedExisting, setReusedExisting] = useState(false);
  const [customerMode, setCustomerMode] = useState<"search" | "create">("search");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Debounce 300ms — tránh gọi `/customers?q=` ở MỖI phím gõ.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const customerResults = useQuery({
    ...customersQuery(debouncedSearch),
    enabled: debouncedSearch.length > 0,
  });

  function selectCustomer(c: Customer, reused: boolean): void {
    setCustomer(c);
    setReusedExisting(reused);
    setSearchText("");
    setDebouncedSearch("");
  }

  function clearCustomer(): void {
    setCustomer(null);
    setReusedExisting(false);
    setCustomerMode("search");
  }

  /**
   * Yêu cầu #2: `409 CUSTOMER_EXISTS` mang theo `existing` — DÙNG nó, không
   * chỉ báo lỗi rồi bắt gõ lại. Nhánh 409 vì vậy không `throw`: với người dùng
   * đây KHÔNG PHẢI một lỗi, mà là "server vừa tự chọn hộ khách hàng đúng" —
   * `onSuccess` chạy, chỉ khác cờ `reused` để hiện một dòng thông báo nhỏ.
   */
  const createCustomer = useMutation({
    mutationFn: async () => {
      const res = await api.customers.post({ fullName: newFullName, phone: newPhone });
      if (res.error) {
        if (res.error.status === 409) {
          return { customer: res.error.value.existing, reused: true };
        }
        throw new Error(errorMessage(res.error.value, "Không tạo được khách hàng"));
      }
      return { customer: res.data, reused: false };
    },
    onSuccess: ({ customer: c, reused }) => {
      selectCustomer(c, reused);
      setNewFullName("");
      setNewPhone("");
    },
  });

  // ── Cảnh báo giá gõ nhầm (DEBT.md) — CẢNH BÁO, KHÔNG CHẶN ──────────────────
  const selectedVehicle = fleet.data?.ok
    ? fleet.data.vehicles.find((v) => v.id === vehicleId)
    : undefined;
  const priceRef = selectedVehicle
    ? (vehiclePrices.data ?? []).find((v) => v.slug === selectedVehicle.slug)
    : undefined;
  const days =
    startDate !== "" && endDate !== "" && endDate >= startDate ? dayCount(startDate, endDate) : 0;
  const totalNum = Number(totalAmount);
  const expectedTotal = priceRef && days > 0 ? priceRef.pricePerDay * days : null;
  // Lệch quá 3× ở MỘT trong hai chiều — số gõ nhầm thường lệch cả CHỤC lần
  // (thiếu/thừa một số 0), 3× đã đủ rộng để không làm phiền giá đặc biệt hợp lệ
  // (giảm giá thuê dài ngày, phụ thu dịp lễ) mà vẫn bắt được lỗi gõ nhầm thật.
  const priceLooksOff =
    expectedTotal !== null &&
    expectedTotal > 0 &&
    totalAmount !== "" &&
    Number.isFinite(totalNum) &&
    (totalNum > expectedTotal * 3 || totalNum < expectedTotal / 3);

  // ── Tạo đơn ───────────────────────────────────────────────────────────────
  const createRental = useMutation({
    mutationFn: async () => {
      // Phòng thủ KIỂU, không phải luồng thật: nút bấm không gọi được mutate
      // này khi thiếu khách hoặc thiếu xe (xem `handleSubmit` bên dưới).
      if (!customer) throw new RentalApiError("Chưa chọn khách hàng", null);
      if (vehicleId === "") throw new RentalApiError("Chưa chọn xe", null);

      const { startsAt, endsAt } = toApiRange(startDate, endDate);
      const res = await api.rentals.post({
        vehicleId,
        customerId: customer.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        totalAmount: roundVnd(totalNum),
        depositAmount: roundVnd(Number(depositAmount)),
        note: note.trim() === "" ? null : note.trim(),
      });
      if (res.error) {
        throw new RentalApiError(
          errorMessage(res.error.value, "Không tạo được đơn thuê"),
          errorCode(res.error.value),
        );
      }
    },
    onSuccess: () => {
      // Yêu cầu #4: khớp lịch VÀ thống kê ngay. `invalidateQueries` so khớp
      // theo TIỀN TỐ mặc định — `["rentals"]` khớp mọi entry
      // `["rentals", from, to]` đang mở trên `rental-calendar.tsx`, không cần
      // biết đúng khoảng nào đang hiển thị.
      void qc.invalidateQueries({ queryKey: ["rentals"] });
      void qc.invalidateQueries({ queryKey: ["stats-summary"] });
      onClose();
    },
  });

  const overlapError =
    createRental.error instanceof RentalApiError && createRental.error.code === "RENTAL_OVERLAP";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    // Mọi ràng buộc KHÁC (chọn xe, hai ngày, tổng tiền ≥ 0) đã đi qua `required`/
    // `min` của chính input — trình duyệt chặn submit trước khi tới đây. Khách
    // hàng là ô DUY NHẤT không phải input gốc nên không có ràng buộc HTML nào
    // canh; khu vực "Khách hàng" ở trên hiện rõ khi còn trống, nên chỉ cần bỏ
    // qua lặng lẽ ở đây thay vì một câu cảnh báo trùng lặp.
    if (!customer) return;
    createRental.mutate();
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lên đơn thuê xe"
        className="absolute inset-x-0 top-0 mx-auto mt-6 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-border bg-surface card-pad"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Lên đơn thuê xe</h2>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="Đóng">
            ✕
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Select
              label="Xe"
              required
              disabled={fleet.isPending}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">{fleet.isPending ? "Đang tải…" : "— Chọn xe —"}</option>
              {fleet.data?.ok &&
                fleet.data.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
            </Select>
            {fleet.data?.ok === false && (
              <Alert tone="error">{errorMessage(fleet.data.value, "Không tải được đội xe")}</Alert>
            )}
          </div>

          {/* ── Khách hàng ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-ink">Khách hàng</span>

            {customer ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3 rounded-card border border-border px-3 py-2">
                  <span className="text-sm text-ink">
                    {customer.fullName} · {customer.phone}
                  </span>
                  <Button type="button" variant="ghost" onClick={clearCustomer}>
                    Đổi
                  </Button>
                </div>
                {reusedExisting && (
                  <p className="text-sm text-muted">
                    Khách hàng này đã có trong hệ thống — đã dùng hồ sơ có sẵn.
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted">Chọn hoặc tạo khách hàng trước khi lên đơn.</p>

                {customerMode === "search" ? (
                  <div className="flex flex-col gap-2">
                    <TextField
                      label="Tìm khách (tên hoặc số điện thoại)"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="vd. Trần Văn A hoặc 0912 345 678"
                    />

                    {customerResults.isFetching && <p className="text-sm text-muted">Đang tìm…</p>}

                    {customerResults.data?.ok === false && (
                      <Alert tone="error">
                        {errorMessage(customerResults.data.value, "Không tìm được khách hàng")}
                      </Alert>
                    )}

                    {customerResults.data?.ok &&
                      customerResults.data.customers.length === 0 &&
                      debouncedSearch.length > 0 &&
                      !customerResults.isFetching && (
                        <p className="text-sm text-muted">Không tìm thấy khách hàng nào khớp.</p>
                      )}

                    {customerResults.data?.ok && customerResults.data.customers.length > 0 && (
                      <ul className="flex flex-col gap-1">
                        {customerResults.data.customers.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => selectCustomer(c, false)}
                              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-card border border-border px-3 text-left text-sm text-ink hover:bg-canvas"
                            >
                              <span>
                                {c.fullName} · {c.phone}
                              </span>
                              <span aria-hidden className="text-muted">
                                Chọn
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <Button type="button" variant="ghost" onClick={() => setCustomerMode("create")}>
                      + Khách hàng mới
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <TextField
                      label="Họ và tên"
                      required
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                    />
                    <TextField
                      label="Số điện thoại"
                      required
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                    {createCustomer.error && (
                      <Alert tone="error">{createCustomer.error.message}</Alert>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        disabled={
                          createCustomer.isPending ||
                          newFullName.trim() === "" ||
                          newPhone.trim() === ""
                        }
                        onClick={() => createCustomer.mutate()}
                      >
                        {createCustomer.isPending ? "Đang tạo…" : "Tạo & chọn khách hàng"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setCustomerMode("search")}
                      >
                        ← Quay lại tìm
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Ngày ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-3">
              <TextField
                label="Từ ngày"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <TextField
                label="Đến ngày"
                type="date"
                required
                min={startDate || undefined}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {startDate !== "" && endDate !== "" && endDate < startDate && (
              <p className="text-sm text-status-overdue">
                Ngày kết thúc phải từ ngày bắt đầu trở đi.
              </p>
            )}
            {days > 0 && <p className="text-sm text-muted">{days} ngày thuê.</p>}
          </div>

          {/* ── Tiền ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            <TextField
              label="Tổng tiền (đ)"
              type="number"
              required
              min="0"
              step="1000"
              inputMode="numeric"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
            />
            <TextField
              label="Tiền cọc (đ)"
              type="number"
              required
              min="0"
              step="1000"
              inputMode="numeric"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </div>

          {/* Yêu cầu #3: CẢNH BÁO, không chặn — shop có quyền tính giá đặc biệt. */}
          {priceLooksOff && priceRef && expectedTotal !== null && (
            <Alert tone="warning">
              Tổng tiền {formatVnd(roundVnd(totalNum))} lệch nhiều so với giá niêm yết (
              {formatVnd(priceRef.pricePerDay)}/ngày × {days} ngày ≈ {formatVnd(expectedTotal)}).
              Kiểm tra lại có gõ nhầm số 0 không — vẫn lên đơn được nếu đây là giá đặc biệt.
            </Alert>
          )}

          <TextField
            label="Ghi chú (không bắt buộc)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/*
           * Yêu cầu #1: `409 RENTAL_OVERLAP` phải nói đúng chuyện đã xảy ra.
           * `errorMessage()` đã đọc đúng câu tiếng Việt backend viết
           * ("Xe này đã có đơn trong khoảng thời gian đó") — không viết lại một
           * bản khác ở đây. Thêm đúng MỘT thứ: đường dẫn xem lịch, để chủ shop
           * nhìn thấy đơn đang chồng thay vì chỉ đọc một câu báo lỗi.
           */}
          {createRental.error && (
            <Alert tone="error">
              {createRental.error.message}
              {overlapError && (
                <>
                  {" "}
                  <Link
                    to="/calendar"
                    search={{ view: "timeline", from: startDate }}
                    className="underline"
                  >
                    Xem lịch xe này →
                  </Link>
                </>
              )}
            </Alert>
          )}

          <SubmitButton pending={createRental.isPending} pendingLabel="Đang tạo đơn…">
            Tạo đơn
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
