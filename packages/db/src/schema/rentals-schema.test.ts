import { describe, expect, it } from "bun:test";
import { SQL } from "bun";

import { setupDb } from "../test-support";

const { inRollback } = setupDb();

// Mọi thứ chạy trong transaction rồi ROLLBACK, nên không hàng nào commit vào DB dev.
// ⚠️ Trong callback chỉ được dùng `tx`. Chạm client ngoài là ghi NGOÀI transaction.

let vehicleId: string;
let customerId: string;
let staffId: string;

/** Dựng dữ liệu phụ thuộc bên trong một transaction đã cho. */
async function seed(tx: Parameters<Parameters<typeof inRollback>[0]>[0]) {
  const [v] = await tx<{ id: string }[]>`
    INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit)
    VALUES (${`ztest-rental-${crypto.randomUUID()}`}, 'Honda', 'CB500X', 471, 500000, 5000000)
    RETURNING id`;
  const [c] = await tx<{ id: string }[]>`
    INSERT INTO customers (full_name, phone)
    VALUES ('Khách test', ${`0${Math.floor(900000000 + Math.random() * 99999999)}`})
    RETURNING id`;
  const [s] = await tx<{ id: string }[]>`
    INSERT INTO staff_users (id, email, full_name, role, status)
    VALUES (${`ztest-${crypto.randomUUID()}`}, ${`ztest-${crypto.randomUUID()}@example.com`}, 'NV test', 'OWNER', 'ACTIVE')
    RETURNING id`;
  if (!v || !c || !s) throw new Error("seed(): INSERT không trả hàng nào");
  vehicleId = v.id;
  customerId = c.id;
  staffId = s.id;
}

const AUG = (d: number, h = 0) =>
  `2026-08-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00+07:00`;

/**
 * Guard bằng `instanceof SQL.PostgresError` thay cho ép kiểu cấu trúc
 * `(e as { errno?: string })`: ép kiểu vẫn biên dịch IM LẶNG nếu hình dạng lỗi
 * đổi — đúng kiểu hỏng mà `vehicles-schema.test.ts` đã cảnh báo và
 * `packages/db/CLAUDE.md` nhắc lại ở mục `.code` vs `.errno`. Lỗi không phải
 * `PostgresError` thì ném lại nguyên văn thay vì nuốt một lỗi lạ.
 */
function asPgError(e: unknown): InstanceType<typeof SQL.PostgresError> {
  if (!(e instanceof SQL.PostgresError)) throw e;
  return e;
}

describe("rentals — hàng rào chống đặt trùng", () => {
  it("chèn được đơn đầu tiên", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      const [r] = await tx<{ id: string; status: string }[]>`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})
        RETURNING id, status`;
      expect(r?.status).toBe("BOOKED");
    });
  });

  // ĐÂY là lý do test này tồn tại. Không có Postgres thật thì không gì chứng minh
  // được điều dưới đây, và mọi tầng phía trên đang tin vào nó.
  it("TỪ CHỐI đơn thứ hai chồng thời gian trên cùng một xe, với SQLSTATE 23P01", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})`;

      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      // ⚠️ try/catch bọc CẢ LỜI GỌI `tx.savepoint(...)`, không bọc câu lệnh bên
      // trong callback: nếu bắt lỗi ngay trong callback thì callback coi như
      // "thành công" và `savepoint()` sẽ RELEASE (commit) một sub-transaction đã
      // bị Postgres đánh dấu aborted — chính RELEASE đó nổ với `25P02`
      // "current transaction is aborted", một lỗi khác hẳn thứ đang test. Khớp
      // đúng mẫu của `vehicles-schema.test.ts` / `btree-gist.test.ts`.
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
            VALUES (${vehicleId}, ${customerId}, ${AUG(15)}, ${AUG(20)}, 2500000, ${staffId})`;
        });
      } catch (e) {
        caught = asPgError(e);
      }

      expect(caught).not.toBeNull();
      const err = caught!;
      // ⚠️ SQLSTATE nằm ở `.errno`, KHÔNG phải `.code` — `.code` luôn là
      // "ERR_POSTGRES_SERVER_ERROR". Assertion này khoá luật đó lại cho
      // `services/rentals.ts` ở Task 9.
      expect(err.errno).toBe("23P01");
      expect(err.code).toBe("ERR_POSTGRES_SERVER_ERROR");
      // Không chỉ SQLSTATE: khẳng định đúng TÊN constraint, để một exclusion
      // constraint khác (nếu sau này có) không thể làm test này xanh nhầm lý do.
      expect(err.constraint).toBe("rentals_no_overlap");
    });
  });

  it("CHO PHÉP đơn chạm biên — kết thúc đúng lúc đơn sau bắt đầu", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})`;
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(17)}, ${AUG(20)}, 1500000, ${staffId})
        RETURNING id`;
      expect(r?.id).toBeDefined();
    });
  });

  it("đơn ĐÃ HUỶ không chặn chỗ", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'CANCELLED')`;
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})
        RETURNING id`;
      expect(r?.id).toBeDefined();
    });
  });

  it("hai XE KHÁC NHAU thuê cùng lúc thì không sao", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      const [v2] = await tx<{ id: string }[]>`
        INSERT INTO vehicles (slug, make, model, engine_cc, price_per_day, deposit)
        VALUES (${`ztest-rental-${crypto.randomUUID()}`}, 'Kawasaki', 'Z900', 948, 900000, 10000000)
        RETURNING id`;
      if (!v2) throw new Error("INSERT vehicles không trả hàng nào");
      await tx`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId})`;
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
        VALUES (${v2.id}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 4500000, ${staffId})
        RETURNING id`;
      expect(r?.id).toBeDefined();
    });
  });
});

describe("rentals — CHECK constraint", () => {
  /**
   * ⚠️ `starts_at == ends_at`, KHÔNG `starts_at > ends_at`. Đã thử ca đảo ngược
   * trước (17 → 12) và nó KHÔNG rơi vào CHECK này: cột sinh `period` được tính
   * TRƯỚC khi CHECK chạy, và `tstzrange(lower, upper, '[)')` với `lower > upper`
   * tự nổ ở tầng constructor với SQLSTATE `22000` ("range lower bound must be
   * less than or equal to range upper bound") — `rentals_period_valid` không
   * bao giờ được chạm tới. Hai mốc BẰNG NHAU cho `period` rỗng hợp lệ (không lỗi
   * ở constructor) và để đúng `rentals_period_valid` (`ends_at > starts_at`) là
   * ràng buộc duy nhất từ chối hàng này — xác nhận bằng thực nghiệm trực tiếp
   * trên Postgres trước khi khoá lại thành assertion.
   */
  it("từ chối ends_at == starts_at (CHECK, không phải lỗi range constructor)", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(12)}, 2500000, ${staffId})`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_period_valid");
    });
  });

  // Hàng này mà lọt được thì nó BIẾN MẤT khỏi báo cáo doanh thu thay vì gây lỗi.
  it("từ chối ONGOING mà không có handed_over_at", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'ONGOING')`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_ongoing_has_handover");
    });
  });

  it("từ chối trạng thái không có trong danh sách", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'AVAILABLE')`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_status_valid");
    });
  });

  // Chiều nguy hiểm hơn: hàng này KHÔNG biến mất khỏi báo cáo, nó được ĐẾM VÀO
  // doanh thu — vì truy vấn thống kê lọc `handed_over_at IS NOT NULL` mà không
  // kiểm trạng thái.
  it("từ chối đơn CANCELLED mang dấu giao xe", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status, handed_over_at)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'CANCELLED', ${AUG(12, 9)})`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_handover_only_when_out");
    });
  });

  it("từ chối trả xe trước khi giao xe", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, status, handed_over_at, returned_at)
            VALUES (${vehicleId}, ${customerId}, ${AUG(12)}, ${AUG(17)}, 2500000, ${staffId}, 'COMPLETED', ${AUG(15, 9)}, ${AUG(13, 9)})`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_return_after_handover");
    });
  });
});

describe("customers — CHECK số điện thoại", () => {
  it("từ chối số chưa chuẩn hoá", async () => {
    await inRollback(async (tx) => {
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`INSERT INTO customers (full_name, phone) VALUES ('X', '+84912345678')`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("customers_phone_normalized");
    });
  });
});

describe("rentals — CHECK giấy tờ", () => {
  it("từ chối document_type lạ", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, document_type)
            VALUES (${vehicleId}, ${customerId}, now(), now() + interval '1 day', 500000, ${staffId}, 'GIAY_PHEP_LAI_XE')`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_document_type_valid");
    });
  });

  it("từ chối 'đã trả' một thứ chưa từng giữ", async () => {
    await inRollback(async (tx) => {
      await seed(tx);
      let caught: InstanceType<typeof SQL.PostgresError> | null = null;
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO rentals (vehicle_id, customer_id, starts_at, ends_at, total_amount, created_by, document_returned_at)
            VALUES (${vehicleId}, ${customerId}, now(), now() + interval '1 day', 500000, ${staffId}, now())`;
        });
      } catch (e) {
        caught = asPgError(e);
      }
      expect(caught?.errno).toBe("23514");
      expect(caught?.constraint).toBe("rentals_document_return_needs_type");
    });
  });
});
