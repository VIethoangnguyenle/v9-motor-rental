#!/usr/bin/env bun
/**
 * Tạo chủ shop đầu tiên. Không có script này thì hệ thống tự khoá chính nó lúc
 * mới dựng: ai đăng ký cũng ra PENDING, mà chỉ OWNER mới duyệt được.
 *
 * Chạy lại nhiều lần vô hại — cùng khuôn với scripts/directus-setup.ts.
 *
 *   STAFF_OWNER_EMAIL=chu@shop.vn bun run staff:bootstrap
 *
 * ⚠️ `supertokens-node` bị ghim ở HAI chỗ: `package.json` gốc (cho file này) và
 * `apps/api/package.json`. Bun không hoist dep của workspace lên root, mà
 * `scripts/` không phải workspace — nên không khai ở root thì cả lúc chạy lẫn lúc
 * typecheck đều không resolve được. Hệ quả phải nhớ: **nâng version ở `apps/api`
 * thì nâng cả ở root**. Quên thì script này nói chuyện với core bằng SDK cũ, và
 * không có lint hay CI nào báo.
 *
 * ⚠️ `supertokens.init()` dưới đây CỐ Ý đơn giản hơn của `apps/api/src/plugins/auth.ts`
 * (không `formFields`, không tắt API reset). Vô hại vì ta gọi thẳng
 * `EmailPassword.signUp()` — tức đi dưới tầng HTTP, nơi các override đó mới có tác
 * dụng. Nhưng nếu `apps/api` thêm recipe mới (email verification chẳng hạn) thì
 * đây là chỗ thứ hai phải nhớ, và cũng là chỗ lệch trong im lặng.
 */
import { SQL } from "bun";
import supertokens from "supertokens-node";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";

const email = process.env.STAFF_OWNER_EMAIL;
if (!email) throw new Error("Thiếu STAFF_OWNER_EMAIL — xem .env.example");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Thiếu DATABASE_URL — xem .env.example");

const matKhau = process.env.STAFF_OWNER_PASSWORD ?? "DoiMatKhauNgay!1";
const hoTen = process.env.STAFF_OWNER_NAME ?? "Chủ shop";

// `exactOptionalPropertyTypes` (bật ở scripts/ qua tsconfig.base.json) từ chối gán
// thẳng `apiKey: string | undefined` vào field khai `apiKey?: string` — khác `T`
// và `T | undefined`. Bỏ khoá hẳn khi thiếu, theo đúng idiom đã dùng ở
// scripts/directus-setup.ts (khối `headers` trong hàm `call`).
const supertokensApiKey = process.env.SUPERTOKENS_API_KEY;

supertokens.init({
  framework: "custom",
  supertokens: {
    connectionURI: process.env.SUPERTOKENS_CONNECTION_URI ?? "http://localhost:3567",
    ...(supertokensApiKey === undefined ? {} : { apiKey: supertokensApiKey }),
  },
  appInfo: {
    appName: "V9 Motor Rental",
    apiDomain: process.env.API_DOMAIN ?? "http://localhost:3001",
    websiteDomain: process.env.STAFF_APP_URL ?? "http://localhost:3003",
    apiBasePath: "/auth",
    websiteBasePath: "/auth",
  },
  recipeList: [EmailPassword.init(), Session.init()],
});

const users = await supertokens.listUsersByAccountInfo("public", { email });
let userId = users[0]?.id;

if (userId) {
  console.warn(`User SuperTokens đã tồn tại: ${userId}`);
} else {
  const created = await EmailPassword.signUp("public", email, matKhau);
  if (created.status !== "OK") throw new Error(`Tạo user thất bại: ${created.status}`);
  userId = created.user.id;
  console.warn(`Đã tạo user SuperTokens: ${userId}`);
  console.warn(`Mật khẩu tạm: ${matKhau} — ĐỔI NGAY sau lần đăng nhập đầu.`);
}

const sql = new SQL(databaseUrl);

try {
  await sql`
    INSERT INTO staff_users (id, email, full_name, role, status, approved_at)
    VALUES (${userId}, ${email}, ${hoTen}, 'OWNER', 'ACTIVE', now())
    ON CONFLICT (id) DO UPDATE
      SET role = 'OWNER', status = 'ACTIVE', updated_at = now()
  `;
} catch (e) {
  // `ON CONFLICT (id)` chỉ bắt trùng ID. Nếu staff_users đã có một hàng với CÙNG
  // email nhưng KHÁC id (ví dụ user SuperTokens cũ bị xoá rồi tạo lại — id sinh
  // mới mỗi lần signUp), câu trên vi phạm UNIQUE(email) thay vì rơi vào nhánh
  // UPDATE. Bắt đúng ca đó và trả lời dễ hiểu, không để lộ ra một lỗi Postgres
  // thô. `.errno` mới là SQLSTATE thật — `.code` của Bun.SQL luôn là
  // "ERR_POSTGRES_SERVER_ERROR" (xem CLAUDE.md gốc).
  const err = e as { errno?: string; constraint?: string };
  if (err.errno === "23505" && err.constraint === "staff_users_email_unique") {
    throw new Error(
      `staff_users đã có một hàng khác với email ${email} (id cũ khác id SuperTokens ` +
        `vừa dùng: ${userId}). Có thể user SuperTokens cũ đã bị xoá rồi tạo lại. ` +
        `Xoá hoặc cập nhật thủ công hàng cũ trong staff_users rồi chạy lại:\n` +
        `  DELETE FROM staff_users WHERE email = '${email}' AND id <> '${userId}';`,
      { cause: e },
    );
  }
  throw e;
} finally {
  await sql.close();
}

console.warn(`OWNER sẵn sàng: ${email}`);
