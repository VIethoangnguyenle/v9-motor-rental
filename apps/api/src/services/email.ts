import { createTransport } from "nodemailer";
import { env } from "../env";

/**
 * Chỗ DUY NHẤT trong repo biết SMTP là gì.
 *
 * `nodemailer` khai TRỰC TIẾP trong `apps/api/package.json`, dù nó cũng có mặt như
 * dependency bắc cầu của `supertokens-node`. Xài ké dep bắc cầu là vỡ ở một lần nâng
 * version nào đó mà không ai đoán được — và lúc đó thứ hỏng là đường gửi mã đặt lại
 * mật khẩu, tức là hỏng đúng lúc có người đang cần nó. §5.3 design doc.
 *
 * `transport` là `null` khi chưa cấu hình SMTP: thiếu credential thì app VẪN CHẠY,
 * chỉ có đường gửi mail là đóng (route trả 503 CHUA_CAU_HINH_EMAIL). Đường cứu của
 * OWNER — đọc sáu số qua Zalo — không đi qua file này, nên nó vẫn dùng được.
 */
const transport = env.smtp
  ? createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      // 465 là SMTPS (TLS ngay từ đầu); 587 là STARTTLS, nodemailer tự nâng cấp.
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.password },
    })
  : null;

export const emailDaCauHinh = transport !== null;

export async function guiMaDatLaiMatKhau(to: string, ma: string): Promise<void> {
  // Kiểm cả `env.smtp` chứ không chỉ `transport`: TypeScript không suy được rằng
  // `transport !== null` kéo theo `env.smtp !== null`, và `from` nằm ở `env.smtp`.
  if (!transport || !env.smtp) throw new Error("SMTP chưa cấu hình");
  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject: "Mã đặt lại mật khẩu — V9 Motor Rental",
    text: [
      `Mã đặt lại mật khẩu của bạn là: ${ma}`,
      "",
      "Mã có hiệu lực trong 10 phút và chỉ dùng được một lần.",
      "Nếu bạn không yêu cầu đặt lại mật khẩu, bỏ qua email này.",
    ].join("\n"),
  });
}
