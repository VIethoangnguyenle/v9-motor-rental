import { describe, expect, it } from "bun:test";

/**
 * Hàng rào cho MỘT tính chất, và là tính chất mà không cổng nào khác chạm tới:
 * **tên file gửi kèm avatar phải mang đuôi suy từ `blob.type`.**
 *
 * Vì sao nó cần một hàng rào riêng: `apps/api` xác định kiểu file gửi lên bằng
 * ĐUÔI TÊN FILE, và chỉ khi tên không có đuôi mới rơi xuống bước đoán từ byte —
 * bước đó không nhận WebP. Đo 2026-09-02 (Bun 1.3.10 / elysia 1.4.29, ảnh WebP
 * thật sinh bằng PIL, gửi qua đúng `t.File({ type })` của route):
 *
 *   byte WebP, tên `avatar`      → 422
 *   byte WebP, tên `avatar.webp` → 200
 *
 * Đổi tên về `"avatar"` là **mọi lần đổi ảnh trả 422 trên production**, trong khi
 * typecheck, lint và cả 480 test còn lại vẫn xanh: không đường test nào của repo
 * đi qua multipart. Bản đầu của `uploadAvatar` đúng là gửi tên trần `"avatar"`,
 * kèm một chú thích khẳng định "tên file không có ý nghĩa gì ở đây".
 *
 * ⚠️ Đây là hàng rào ĐỌC NGUỒN, cùng khuôn `motion-budget.test.ts` — nó canh
 * hình dạng của code, không canh hành vi lúc chạy. Nó tồn tại vì `apps/staff`
 * chưa có hạ tầng test DOM/mạng (`docs/DEBT.md`). Có hạ tầng đó rồi thì thay bài
 * này bằng một bài gửi thật và xoá nó đi.
 *
 * ⚠️ **Phải bóc chú thích trước khi quét.** Chính docstring của `uploadAvatar` và
 * `AVATAR_ENCODE_TYPE` chứa cả chuỗi `"avatar"` lẫn `avatar.webp` để giải thích
 * ca hỏng — một bộ quét ngây thơ sẽ đọc phải ví dụ trong chú thích và xanh trên
 * một file đã hỏng thật. Đúng cái bẫy `theme-tokens.test.ts` đã cắn một lần.
 */

const SOURCE = await Bun.file(new URL("./avatar.ts", import.meta.url)).text();

/** Bóc block comment và line comment; xem cảnh báo ở docstring trên. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("hàng rào: tên file khi gửi avatar", () => {
  it("bóc chú thích thật sự có tác dụng — nếu không, bài dưới xanh rỗng", () => {
    // Hai chuỗi này CHỈ có trong chú thích. Còn thấy chúng nghĩa là bước bóc
    // hỏng, và mọi khẳng định bên dưới đang đọc ví dụ thay vì đọc code.
    expect(CODE).not.toContain("byte WebP");
    expect(CODE).not.toContain("t.File");
    // Và phải còn lại code thật, không phải bóc sạch thành chuỗi rỗng.
    expect(CODE).toContain("export async function uploadAvatar");
  });

  it("gửi tên có đuôi, KHÔNG phải tên trần", () => {
    const call = /new File\(\s*\[blob\]\s*,\s*([^,]+),/.exec(CODE);
    expect(call).not.toBeNull();

    const nameArg = call![1]!.trim();
    // Phải là template literal có nội suy, chứ không phải một chuỗi cố định.
    expect(nameArg).toMatch(/^`[^`]*\$\{[^}]+\}[^`]*`$/);
    expect(nameArg).toContain("${extension}");
  });

  it("đuôi suy từ blob.type qua bảng của domain, không gõ bảng thứ hai", () => {
    // `extensionForAvatarType` là bảng mà SERVER tra khi dựng object key. Gõ lại
    // một bảng riêng ở client là hai bảng sẽ lệch.
    expect(CODE).toContain("extensionForAvatarType(blob.type)");
    expect(CODE).toMatch(/from "@v9\/shared\/domain\/avatar"/);
  });

  it("gán cứng một đuôi là hỏng ca toBlob rơi về PNG — cấm luôn hình dạng đó", () => {
    // `toBlob` rơi về PNG khi trình duyệt không encode nổi định dạng đang xin.
    // `avatar.webp` gán cứng khi đó là byte PNG mang đuôi WebP, và server tin đuôi.
    expect(CODE).not.toMatch(/new File\(\s*\[blob\]\s*,\s*["'`]avatar\.[a-z]+["'`]/);
    expect(CODE).not.toMatch(/new File\(\s*\[blob\]\s*,\s*["'`]avatar["'`]/);
  });
});
