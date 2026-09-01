import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { isPublicRoute, staffGuard } from "../plugins/staff-guard";
import { requests } from "./requests";

/**
 * Topology GIỐNG `index.ts`: guard nối vào app gốc, route nghiệp vụ là plugin
 * riêng nối sau. Không phải chi tiết thừa — `staffGuard` dựa vào `as: "global"`
 * để vượt ranh giới plugin, và một fixture gắn route thẳng lên cùng chuỗi sẽ
 * xanh kể cả khi cơ chế đó hỏng. Cùng lý lẽ đã ghi ở `staff.test.ts`.
 */
const app = new Elysia().use(staffGuard).use(requests);

const call = (path: string, init?: RequestInit) =>
  app.handle(new Request(`http://localhost${path}`, init));

const postJson = (path: string, body: unknown) =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * ⚠️ File này canh ĐÚNG MỘT cạnh, và là cạnh đắt nhất trong đợt yêu cầu thuê:
 * `POST /requests` phải công khai, mọi route `/requests*` khác thì KHÔNG.
 *
 * Cạnh đó nằm ở một ký tự trong `plugins/staff-guard.ts`:
 *
 *     { method: "POST", pattern: /^\/requests$/ }
 *                                          ^ neo cuối
 *
 * Bỏ neo `$` thì `POST /requests/:id/status` cũng khớp danh sách công khai, và
 * bất kỳ ai trên internet đóng được yêu cầu của shop — không lỗi, không log,
 * chỉ là các yêu cầu lặng lẽ chuyển sang CLOSED. `tsc` không thấy, lint không
 * thấy, và test service cũng không: chúng gọi thẳng hàm, không đi qua guard.
 *
 * ⚠️ Đi qua HTTP KHÔNG kiểm được cạnh này, và bản đầu của file này đã sai đúng
 * chỗ đó. Handler `POST /requests/:id/status` có nhánh phòng thủ
 * `if (!staff) return 401` mang CÙNG `code` guard trả, nên khi guard cho lọt thì
 * response vẫn 401 và test HTTP vẫn xanh. Đã đo thật: bỏ `$` khỏi pattern rồi
 * chạy lại, cả 7 ca HTTP vẫn xanh — test cũ không đo được thứ nó tuyên bố đo.
 *
 * Nên cạnh được khoá bằng `isPublicRoute`, hàm thuần phơi từ chính guard. Đo lại
 * sau khi sửa: bỏ `$` thì khối "danh sách công khai" bên dưới ĐỎ.
 */
describe("danh sách công khai — hỏi thẳng guard, không qua HTTP", () => {
  it("POST /requests công khai", () => {
    expect(isPublicRoute("POST", "/requests")).toBe(true);
  });

  /**
   * Ca giữ cái neo `$`. Bỏ neo thì ca này đỏ — đó là toàn bộ lý do nó tồn tại.
   */
  it("POST /requests/:id/status KHÔNG công khai", () => {
    expect(isPublicRoute("POST", "/requests/11111111-1111-4111-8111-111111111111/status")).toBe(
      false,
    );
  });

  it("không method nào khác được công khai trên /requests", () => {
    expect(isPublicRoute("GET", "/requests")).toBe(false);
    expect(isPublicRoute("GET", "/requests/count-new")).toBe(false);
    expect(isPublicRoute("DELETE", "/requests")).toBe(false);
  });

  it("không có tiền tố lạ nào lọt", () => {
    expect(isPublicRoute("POST", "/requests-admin")).toBe(false);
    expect(isPublicRoute("POST", "/x/requests")).toBe(false);
  });
});

describe("ranh giới công khai của /requests (qua HTTP)", () => {
  it("POST /requests KHÔNG cần session — khách trên apps/web không có tài khoản", async () => {
    const res = await postJson("/requests", {
      vehicleSlug: "ztest-route-khong-co-xe-nay",
      fullName: "Khách vãng lai",
      phone: "0912009999",
      startDate: "2026-10-01",
      days: 2,
    });

    // 404 = đã QUA guard và tới handler (xe không tồn tại). Điều đang khoá là
    // "không phải 401", không phải việc tạo được yêu cầu — fixture cố ý dùng
    // slug không có thật để test này không ghi hàng nào vào database.
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "VEHICLE_NOT_AVAILABLE" });
  });

  it("POST /requests/:id/status ĐÒI session — đây là cạnh mà neo `$` giữ", async () => {
    const res = await postJson("/requests/11111111-1111-4111-8111-111111111111/status", {
      to: "CLOSED",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "NOT_AUTHENTICATED" });
  });

  it("GET /requests đòi session — danh sách yêu cầu là dữ liệu nội bộ", async () => {
    const res = await call("/requests");
    expect(res.status).toBe(401);
  });

  it("GET /requests/count-new đòi session", async () => {
    const res = await call("/requests/count-new");
    expect(res.status).toBe(401);
  });
});

describe("schema chặn rác ở đường công khai", () => {
  it("từ chối thân request thiếu trường, KHÔNG chạm database", async () => {
    const res = await postJson("/requests", { fullName: "thiếu hết" });
    expect(res.status).toBe(422);
  });

  it("từ chối `days` ngoài trần ngay ở schema", async () => {
    const res = await postJson("/requests", {
      vehicleSlug: "bat-ky",
      fullName: "A",
      phone: "0912009999",
      startDate: "2026-10-01",
      days: 999,
    });
    expect(res.status).toBe(422);
  });

  it("từ chối chuỗi quá dài — endpoint không auth cần trần độ dài", async () => {
    const res = await postJson("/requests", {
      vehicleSlug: "bat-ky",
      fullName: "A".repeat(201),
      phone: "0912009999",
      startDate: "2026-10-01",
      days: 2,
    });
    expect(res.status).toBe(422);
  });
});
