import { Elysia } from "elysia";
import Session from "supertokens-node/recipe/session";
import { CollectingResponse } from "supertokens-node/framework/custom";
import type { StaffRole } from "@v9/shared/domain/staff";
import { loadStaff, type StaffUser } from "../services/staff";
import { toPreParsedRequest } from "./auth";

interface RouteMatcher {
  readonly method: string;
  readonly pattern: RegExp;
}

/**
 * MẶC ĐỊNH CHẶN. Route nào không khớp danh sách dưới đây thì đòi session hợp lệ
 * và hồ sơ ACTIVE. Gõ sai một mục thì route đó BỊ CHẶN, không phải lọt — sai
 * theo chiều an toàn. §4 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * Route nghiệp vụ của đợt sau (`rentals`, `customers`) quên khai ở đây là bị
 * chặn. Đó là điểm của cả plugin này: không ai phải NHỚ bật bảo vệ.
 */
const CONG_KHAI: readonly RouteMatcher[] = [
  { method: "*", pattern: /^\/auth\// },
  { method: "GET", pattern: /^\/health/ },
  { method: "GET", pattern: /^\/vehicles(\/|$)/ }, // apps/web SSG cần
  { method: "POST", pattern: /^\/staff\/password-reset\/(request|confirm)$/ },
];

/**
 * Cần session, nhưng KHÔNG đòi ACTIVE. Đúng một mục, và phải đúng một mục: màn
 * "chờ duyệt" phải đọc được chính trạng thái của mình, nếu không người dùng chỉ
 * thấy màn hình trắng không giải thích được vì sao họ vào không được.
 *
 * DISABLED vẫn bị chặn ở đây — người bị khoá không cần một màn hình giải thích,
 * họ cần không vào được.
 */
const CAN_SESSION_KHONG_CAN_ACTIVE: readonly RouteMatcher[] = [
  { method: "GET", pattern: /^\/staff\/me$/ },
];

const khop = (list: readonly RouteMatcher[], method: string, path: string): boolean =>
  list.some((r) => (r.method === "*" || r.method === method) && r.pattern.test(path));

/**
 * Đọc session mà KHÔNG ném. `sessionRequired: false` chỉ lo trường hợp "không có
 * token gì cả"; token hết hạn hoặc hỏng thì `getSession` vẫn ném `Session.Error`
 * (`TRY_REFRESH_TOKEN` / `UNAUTHORISED`). Để nó bay ra ngoài thì Elysia trả 500,
 * mà 500 không phải tín hiệu để `supertokens-web-js` đi refresh — 401 mới là.
 * Nên: lỗi session của SuperTokens = coi như chưa đăng nhập; mọi lỗi khác ném
 * tiếp, vì nuốt chúng ở đây sẽ biến sự cố hạ tầng thành "bạn chưa đăng nhập".
 *
 * `CollectingResponse` hứng header refresh của SuperTokens; ta cố ý không trả nó
 * về — 401 đã đủ để interceptor phía client đi gọi `/auth/session/refresh`.
 */
async function docSession(request: Request): Promise<string | null> {
  try {
    const session = await Session.getSession(
      toPreParsedRequest(request),
      new CollectingResponse(),
      { sessionRequired: false },
    );
    return session ? session.getUserId() : null;
  } catch (e) {
    if (e instanceof Session.Error) return null;
    throw e;
  }
}

/**
 * ⚠️ KHÔNG dùng `.state()` cho danh tính người gọi. `store` của Elysia là MỘT
 * object dùng chung cho cả tiến trình, không phải per-request — hai request đồng
 * thời sẽ ghi đè lên nhau và request này đọc ra nhân viên của request kia. Đó là
 * lỗ hổng phân quyền, và nó chỉ lộ ra khi có tải, nên không test đơn lẻ nào bắt
 * được.
 *
 * `resolve` mới là thứ chạy per-request và bơm được vào context của handler.
 * Vòng đời Elysia: transform → derive/resolve → beforeHandle, nên `staff` đã sẵn
 * sàng khi hook chặn chạy, và cả hai dùng chung ĐÚNG MỘT lần đọc DB.
 *
 * `as: "global"` là thứ làm cho hàng rào áp lên cả route đăng ký ở instance khác
 * sau `.use(staffGuard)`. Đổi thành "scoped"/mặc định thì guard chỉ còn bảo vệ
 * chính plugin này — tức là không bảo vệ gì, và không có gì báo lỗi.
 */
export const staffGuard = new Elysia({ name: "staff-guard" })
  .resolve({ as: "global" }, async ({ request, path }) => {
    // Thoát sớm cho route công khai: KHÔNG chạm DB. `/health` có perf budget
    // p95 < 5ms và không được phép mọc thêm một query vì đợt này.
    if (khop(CONG_KHAI, request.method.toUpperCase(), path)) {
      return { staff: null, userId: null };
    }

    const userId = await docSession(request);
    if (userId === null) return { staff: null, userId: null };

    return { staff: await loadStaff(userId), userId };
  })
  .onBeforeHandle({ as: "global" }, ({ request, path, staff, userId, status }) => {
    const method = request.method.toUpperCase();
    if (khop(CONG_KHAI, method, path)) return;

    if (userId === null) return status(401, { message: "Chưa đăng nhập", code: "CHUA_DANG_NHAP" });

    // DISABLED bị chặn ở MỌI route cần session, kể cả nhánh "chờ duyệt" bên dưới.
    if (staff?.status === "DISABLED") {
      return status(403, { message: "Tài khoản đã bị khoá", code: "DA_KHOA" });
    }

    // Nhánh thứ hai: có session là đủ. PENDING và "chưa có hồ sơ" đi qua để
    // route trả về đúng trạng thái đó — màn hình chờ duyệt cần đọc được chính
    // lý do nó đang bị chặn.
    if (khop(CAN_SESSION_KHONG_CAN_ACTIVE, method, path)) return;

    // Có session nhưng thiếu hàng = lớp bù trừ của signUpPOST đã hỏng (§2.1
    // design doc). Trả 403 có mã riêng thay vì crash — người dùng thấy được lý
    // do, OWNER tìm ra được dấu vết.
    if (!staff) return status(403, { message: "Tài khoản chưa có hồ sơ", code: "CHUA_CO_HO_SO" });
    if (staff.status === "PENDING") {
      return status(403, { message: "Tài khoản đang chờ duyệt", code: "CHO_DUYET" });
    }
  });

/** Kiểu của thứ `staffGuard` bơm vào context — route dùng để khai tham số. */
export interface StaffContext {
  readonly staff: StaffUser | null;
  readonly userId: string | null;
}

/** Dùng trong route cần role cụ thể. Trả `null` khi đủ quyền. */
export function requireRole(staff: { role: StaffRole } | null, role: StaffRole) {
  if (!staff || staff.role !== role) {
    return { message: "Không đủ quyền", code: "THIEU_QUYEN" as const };
  }
  return null;
}
