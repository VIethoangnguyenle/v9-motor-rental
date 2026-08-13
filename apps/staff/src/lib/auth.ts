import type { QueryClient } from "@tanstack/react-query";
import SuperTokens from "supertokens-web-js";
import EmailPassword from "supertokens-web-js/recipe/emailpassword";
import Session from "supertokens-web-js/recipe/session";

// Cùng fallback với `lib/api.ts` — hai giá trị này PHẢI bằng nhau, nếu không
// interceptor của SuperTokens không nhận ra request của Eden là request "cùng
// API" và bỏ qua nó (xem `initAuth` bên dưới). Đổi một chỗ thì đổi cả hai.
const apiDomain = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * `Session.init()` vá `window.fetch`: mọi request tới `apiDomain` được thêm
 * `credentials: "include"`, và khi access token hết hạn thì tự gọi
 * `/auth/session/refresh` rồi chạy lại request. Eden Treaty tra `fetch` từ
 * global scope ở MỖI lần gọi (`{ fetcher = fetch }` nằm trong thân proxy, không
 * phải bắt tham chiếu lúc import), nên `lib/api.ts` ăn theo mà không phải bọc
 * gì. Đó là lý do chọn `supertokens-web-js` thay vì tự fetch thẳng `/auth/*`.
 * §6 docs/plans/2026-08-10-staff-auth-design.md.
 *
 * ⚠️ Phải chạy TRƯỚC lần render đầu tiên (`main.tsx`). Gọi sau thì những request
 * bay ra trong lúc đó đi bằng `fetch` chưa vá — không cookie, không refresh — và
 * hỏng theo kiểu "thỉnh thoảng 401" chứ không nổ ra chỗ nào đọc được.
 */
export function initAuth() {
  SuperTokens.init({
    appInfo: { appName: "V9 Motor Rental", apiDomain, apiBasePath: "/auth" },
    recipeList: [EmailPassword.init(), Session.init()],
  });
}

/**
 * `signIn`/`signUp` trả discriminated union thay vì ném — cùng pattern 3 của
 * repo (xem CLAUDE.md gốc). Màn hình chỉ việc hiện `message`, không phải đọc
 * `status` của SuperTokens ở năm chỗ khác nhau.
 */
export async function signIn(email: string, matKhau: string) {
  const res = await EmailPassword.signIn({
    formFields: [
      { id: "email", value: email },
      { id: "password", value: matKhau },
    ],
  });

  if (res.status === "OK") return { ok: true as const };
  if (res.status === "WRONG_CREDENTIALS_ERROR") {
    return { ok: false as const, message: "Email hoặc mật khẩu không đúng" };
  }
  if (res.status === "FIELD_ERROR") {
    return { ok: false as const, message: res.formFields.map((f) => f.error).join(" · ") };
  }
  return { ok: false as const, message: "Không đăng nhập được, thử lại sau" };
}

export async function signUp(input: {
  email: string;
  matKhau: string;
  hoTen: string;
  soDienThoai: string;
}) {
  const res = await EmailPassword.signUp({
    formFields: [
      { id: "email", value: input.email },
      { id: "password", value: input.matKhau },
      { id: "hoTen", value: input.hoTen },
      { id: "soDienThoai", value: input.soDienThoai },
    ],
  });

  if (res.status === "OK") return { ok: true as const };
  if (res.status === "FIELD_ERROR") {
    // Thông điệp của SuperTokens (mật khẩu yếu, email sai định dạng, email đã
    // dùng) — hiện nguyên văn thay vì nuốt thành "thử lại sau".
    return { ok: false as const, message: res.formFields.map((f) => f.error).join(" · ") };
  }
  return { ok: false as const, message: "Không đăng ký được, thử lại sau" };
}

/**
 * Nhận `QueryClient` qua tham số chứ không import singleton — cùng lý lẽ với
 * `createAppRouter`: hai `QueryClient` là hai cache, và dọn nhầm cache thì không
 * có lỗi nào ở đâu.
 *
 * `qc.clear()` không phải chi tiết nhỏ: `Session.signOut()` chỉ xoá session, còn
 * `["me"]` và `["staff-users"]` nằm lại trong memory — người kế tiếp đăng nhập
 * trên cùng tab đọc được dữ liệu của người trước cho tới lần refetch.
 *
 * Đổi CHỮ KÝ thay vì dặn dò: mọi chỗ gọi buộc phải truyền, do compiler ép.
 *
 * `finally` chứ không phải hai câu tuần tự — dễ bị "đơn giản hoá" lại sai:
 * `Session.signOut()` NÉM được (mạng lỗi, server đã xoá session rồi mới trả
 * 5xx, `STGeneralError`, …). Đường 401 SDK tự nuốt, không ném — các đường ném
 * còn lại thì KHÔNG chứng minh được session còn sống: `fetch` ném cả khi
 * request chưa kịp rời máy (DNS hỏng, connection refused), lúc đó session còn
 * nguyên. Coi như đã chết vẫn là phía an toàn: `apps/staff` không có global
 * handler nào dọn hộ 401 (đã kiểm), và đoán sai chiều ngược lại chỉ tốn một
 * lần refetch dữ liệu của chính người đó.
 */
export const signOut = async (qc: QueryClient) => {
  try {
    await Session.signOut();
  } finally {
    qc.clear();
  }
};
export const hasSession = () => Session.doesSessionExist();
