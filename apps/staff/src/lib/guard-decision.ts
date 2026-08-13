/**
 * Quyết định "được vào hay bị đá đi đâu" — hàm THUẦN, tách khỏi router có chủ ý.
 *
 * Lỗi cũ (§1.1 design doc) là lỗi THỨ TỰ NHÁNH: `if (!me)` đứng trước nhánh
 * DISABLED nên nhánh đó không bao giờ chạy, và không có gì báo vì `apps/staff`
 * không có một test nào. Rút ra đây thì thứ tự đó test được bằng 7 ca.
 *
 * ⚠️ File này CHỈ được `import type`, không import giá trị. Import `./me` ở dạng
 * giá trị sẽ kéo theo Eden client và `@v9/api` vào lúc chạy, và test thuần sẽ
 * phải dựng cả hợp đồng API để chạy một hàm không chạm mạng. Cùng lý lẽ với luật
 * "`src/domain/**` không được import bất cứ gì" của `packages/shared`.
 */
import type { Me, MeResult } from "./me";

// Danh sách RUNTIME là nguồn sự thật, kiểu suy ra từ nó — không phải ngược lại.
// `validateSearch` ở `router.tsx` lặp qua mảng này để lọc query string; nếu kiểu
// đứng một mình (chỉ trong type-level) thì thêm một thành viên ở đây không ép
// được `router.tsx` cập nhật theo — `tsc` xanh, còn giá trị mới bị lọc mất và
// người dùng thấy trang đăng nhập trắng trơn, không banner, không lỗi.
export const LOGIN_REASONS = ["disabled", "no-profile", "password-changed"] as const;
export type LoginReason = (typeof LOGIN_REASONS)[number];

/**
 * Union literal chứ không phải `string`: `redirect({ to })` của TanStack Router
 * nhận đường dẫn đã biết kiểu, truyền một `string` tuỳ ý vào là lỗi biên dịch.
 */
export type RedirectTarget = "/login" | "/pending-approval";

export type EntryDecision =
  | { type: "allow"; me: Me }
  | { type: "redirect"; to: RedirectTarget }
  | { type: "signOutThenRedirect"; to: "/login"; reason: LoginReason };

const LOGIN = "/login" as const;

export function decideEntry(hasSession: boolean, result: MeResult | null): EntryDecision {
  if (!hasSession || !result) return { type: "redirect", to: LOGIN };

  if (!result.ok) {
    // Chỉ đăng xuất khi server NÓI RÕ tài khoản không dùng được nữa. `code === null`
    // gộp cả mạng chết — huỷ session hợp lệ vì wifi chớp là hỏng theo chiều sai.
    if (result.code === "DA_KHOA") {
      return { type: "signOutThenRedirect", to: LOGIN, reason: "disabled" };
    }
    if (result.code === "CHUA_CO_HO_SO") {
      return { type: "signOutThenRedirect", to: LOGIN, reason: "no-profile" };
    }
    return { type: "redirect", to: LOGIN };
  }

  if (result.me.status === "PENDING") return { type: "redirect", to: "/pending-approval" };
  if (result.me.status === "DISABLED") {
    return { type: "signOutThenRedirect", to: LOGIN, reason: "disabled" };
  }
  return { type: "allow", me: result.me };
}
