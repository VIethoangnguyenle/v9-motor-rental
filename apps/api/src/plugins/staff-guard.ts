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

interface Phien {
  readonly userId: string;
  /**
   * `iat` của access token, đơn vị **giây** (chuẩn JWT — đã làm tròn xuống).
   * `null` = token không mang `iat` đọc được; xem `tokenDaBiThuHoi`.
   */
  readonly iatGiay: number | null;
}

/**
 * Thời điểm cấp token, lấy CỤC BỘ — không một byte nào bay sang SuperTokens core.
 *
 * `getAccessTokenPayload()` là hàm **đồng bộ**, thân nó đúng một dòng
 * `return this.userDataInAccessToken` (`supertokens-node/lib/build/recipe/session/sessionClass.js`).
 * Một hàm trả về đồng bộ thì không thể vừa đi một vòng mạng — đó là bằng chứng
 * mạnh hơn mọi lời hứa trong tài liệu.
 *
 * ⚠️ Đừng đổi sang `session.getTimeCreated()` dù tên nó đúng nghĩa hơn: hàm đó
 * `await getSessionInformation()`, tức **một lời gọi sang core cho mỗi request
 * được bảo vệ** (cùng file, ngay bên dưới). Nó phá đúng cái lý lẽ khiến ta không
 * dùng `checkDatabase: true` ngay từ đầu.
 *
 * Với access token v3+ thì payload CHÍNH LÀ claim JWT (`userData = payload`, xem
 * `accessToken.js`), nên `iat` nằm ngay trên đó và `validateAccessTokenStructure`
 * đã bắt buộc nó là `number` trước khi session được dựng.
 */
function docIat(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) return null;
  if (!("iat" in payload) || typeof payload.iat !== "number") return null;
  return payload.iat;
}

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
async function docSession(request: Request): Promise<Phien | null> {
  try {
    const session = await Session.getSession(
      toPreParsedRequest(request),
      new CollectingResponse(),
      { sessionRequired: false },
    );
    if (!session) return null;
    return { userId: session.getUserId(), iatGiay: docIat(session.getAccessTokenPayload()) };
  } catch (e) {
    if (e instanceof Session.Error) return null;
    throw e;
  }
}

/**
 * Token này có nằm trước mốc thu hồi của chủ nó không?
 *
 * ⚠️ **PHẢI cắt mốc xuống GIÂY**, và phải so bằng `<` nghiêm ngặt. `iat` của JWT
 * tính bằng giây (đã làm tròn xuống) còn `now()` của Postgres có micro giây, nên
 * so thẳng sẽ đá văng chính người vừa đổi mật khẩu xong:
 *
 *   đóng dấu 10:00:00.500 · đăng nhập lại 10:00:00.900 · token mang iat=10:00:00
 *   → `iat < mốc` đúng → 401 ngay lần đăng nhập đầu tiên.
 *
 * Nói cách khác, bỏ phép cắt này biến "quên mật khẩu" thành tính năng không dùng
 * được — hỏng nặng hơn chính lỗ hổng nó vá. `staff-guard.test.ts` khoá ca đó bằng
 * một mốc lệch dưới một giây.
 *
 * Đánh đổi đã chấp nhận: token cấp trong CÙNG GIÂY với lúc đóng dấu thì sống sót.
 * Cửa sổ đó dưới một giây và không thu hẹp được — `iat` không có độ phân giải nào
 * nhỏ hơn để so. Làm tròn LÊN sẽ đóng cửa sổ đó nhưng đá văng mọi lần đăng nhập
 * lại trong cùng giây, tức đổi một lỗ nhỏ lấy một lỗi to hay gặp.
 *
 * `iatGiay === null` (payload không đọc được `iat`) thì HỎNG THEO CHIỀU ĐÓNG: chỉ
 * xảy ra khi hình dạng token đổi, và lúc đó "im lặng thôi kiểm tra" đúng là kiểu
 * suy thoái mà repo này đếm được bốn lần. Chỉ ảnh hưởng người ĐÃ bị thu hồi.
 */
export function tokenDaBiThuHoi(mocThuHoi: Date | null, iatGiay: number | null): boolean {
  if (mocThuHoi === null) return false;
  if (iatGiay === null) return true;
  return iatGiay < Math.floor(mocThuHoi.getTime() / 1000);
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
      return { staff: null, userId: null, iatGiay: null };
    }

    const phien = await docSession(request);
    if (phien === null) return { staff: null, userId: null, iatGiay: null };

    return { staff: await loadStaff(phien.userId), userId: phien.userId, iatGiay: phien.iatGiay };
  })
  .onBeforeHandle({ as: "global" }, ({ request, path, staff, userId, iatGiay, status }) => {
    const method = request.method.toUpperCase();
    if (khop(CONG_KHAI, method, path)) return;

    if (userId === null) return status(401, { message: "Chưa đăng nhập", code: "CHUA_DANG_NHAP" });

    /**
     * Thu hồi tức thì — đứng TRƯỚC mọi phép kiểm trạng thái bên dưới, kể cả
     * DISABLED, và trước cả ngoại lệ `/staff/me`.
     *
     * Thứ tự đó là một khẳng định về ngữ nghĩa, không phải tiện tay: token cấp
     * trước mốc thu hồi **không còn là credential**, nên đây là chuyện của tầng
     * xác thực và phải trả lời trước mọi câu hỏi về quyền. Hệ quả quan sát được:
     * người vừa bị khoá mà còn cầm token cũ nhận `401` chứ không phải
     * `403 DA_KHOA`; họ đăng nhập lại được (SuperTokens không biết `staff_users`),
     * và khi đó token mới nằm sau mốc nên `403 DA_KHOA` mới hiện ra — thông điệp
     * "tài khoản đã bị khoá" không mất, chỉ tới sau một vòng đăng nhập.
     *
     * **401 chứ KHÔNG phải 403**, và đây là toàn bộ lý do cơ chế này dùng được:
     * 401 là tín hiệu để interceptor của `supertokens-web-js` đi
     * `/auth/session/refresh`; refresh thất bại (core đã xoá session ở bước
     * `revokeSessions`) nên SDK dọn session và `apps/staff` đá người dùng về
     * `/dang-nhap`. Trả 403 thì SDK không refresh, session rác nằm lại trong
     * trình duyệt và người dùng kẹt ở màn lỗi.
     */
    if (tokenDaBiThuHoi(staff?.sessionsInvalidBefore ?? null, iatGiay)) {
      return status(401, {
        message: "Phiên đăng nhập đã hết hiệu lực — vui lòng đăng nhập lại",
        code: "PHIEN_HET_HIEU_LUC",
      });
    }

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
  /** `iat` của access token, tính bằng giây. Guard đã dùng xong; route hiếm khi cần. */
  readonly iatGiay: number | null;
}

/** Dùng trong route cần role cụ thể. Trả `null` khi đủ quyền. */
export function requireRole(staff: { role: StaffRole } | null, role: StaffRole) {
  if (!staff || staff.role !== role) {
    return { message: "Không đủ quyền", code: "THIEU_QUYEN" as const };
  }
  return null;
}
