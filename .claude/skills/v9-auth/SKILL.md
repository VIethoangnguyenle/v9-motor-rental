---
name: v9-auth
description: Quyết định kiến trúc về danh tính nhân viên trong v9-rental (SuperTokens + public.staff_users). Dùng trước khi đề xuất bất cứ thay đổi nào chạm auth, role, session, đăng ký/duyệt nhân viên, quên mật khẩu, hoặc trước khi thêm FK tới nhân viên vào schema mới như rentals/customers. Đây là ADR, không phải hướng dẫn implement.
---

# Danh tính nhân viên — quyết định và bất biến

Chi tiết implement (bảng mã lỗi đầy đủ, `CollectingResponse`, `resolve` vs `.state()`, thứ tự hai
lời gọi thu hồi, cạm bẫy cắt-xuống-giây) ở [`apps/api/CLAUDE.md`](../../../apps/api/CLAUDE.md) —
file đó tự nạp khi làm việc trong `apps/api`. Skill này giữ **lý do**, thứ không gắn với thư mục
nào.

Thiết kế đầy đủ: `docs/plans/2026-08-10-staff-auth-design.md`.

## Năm quyết định ràng buộc mọi đề xuất sau này

**① Danh tính chia đôi có chủ ý.** SuperTokens giữ đúng hai thứ — mật khẩu và session. Role,
trạng thái duyệt và hồ sơ nằm ở `public.staff_users`, nơi **migration làm chủ**.

Lý do quyết định nhất không phải tiện tay: `rentals` phải trả lời "ai chốt đơn, ai bàn giao xe",
tức một FK tới hàng nhân viên. FK sang `supertokens.*` là buộc dữ liệu nghiệp vụ vào schema **do
tool khác làm chủ và tự đổi mỗi lần nâng version** — đúng thứ migration `0001` tách ba vùng ra để
tránh. Lý do thứ hai: khoá tài khoản phải có hiệu lực **ngay**; nhét role vào claim của token thì
rẻ hơn nhưng nhân viên nghỉ việc vẫn vào được tới lúc token hết hạn.

Đánh đổi theo chiều ngược lại: `staff_users.email` là **bản sao**, nguồn sự thật vẫn ở
SuperTokens — đổi email nhân viên phải đồng bộ hai nơi.

**② Mặc định chặn.** Route không nằm trong danh sách công khai thì đòi session hợp lệ **và** hồ sơ
`ACTIVE`. Route nghiệp vụ đợt sau **quên khai là bị chặn**, không phải lọt. Hai danh sách chứ
không phải một — gộp lại là hỏng một trong hai đầu.

**③ Tự đăng ký → `PENDING` → OWNER duyệt.** `createPendingStaff` cố ý **không nhận** `role`/`status`
làm tham số, nên không ai tự chọn được quyền của mình. Hệ quả: hệ thống tự khoá chính nó lúc mới
dựng, nên OWNER đầu tiên tạo bằng script — không phải bằng một luật "người đăng ký đầu tiên thành
OWNER" sống mãi mãi để phục vụ đúng một lần dùng.

```bash
STAFF_OWNER_EMAIL=chu@shop.vn bun run staff:bootstrap   # chạy lại nhiều lần vô hại
```

**④ Quên mật khẩu bằng mã 6 số, không phải link.** Hai đường vào (SMTP của shop; OWNER phát mã
đọc qua Zalo) dùng chung một bảng và một đường xác minh. Cần cả hai: nhân viên mất quyền vào email
thì đường thứ nhất vô dụng, và thiếu SMTP là trạng thái mặc định của một prod mới dựng.

Ngoài production mã **luôn** là `999999`. Điều kiện là **`NODE_ENV`**, KHÔNG phải "SMTP chưa cấu
hình" — thiếu config là mặc định của prod mới dựng; nếu thiếu config bật được mã cố định thì hàng
rào tự tắt đúng lúc nó cần nhất. `apps/api/src/env.ts` **ném lúc khởi động** nếu `AUTH_DEV_OTP`
xuất hiện ở `NODE_ENV=production`.

**⑤ `apps/web` không dùng auth.** Khách gửi yêu cầu thuê không cần tài khoản — bắt đăng nhập chỉ
làm giảm số yêu cầu nhận được, mà yêu cầu chính là thứ web sinh ra để tạo. Directus giữ hệ tài
khoản riêng; hai nơi đăng nhập là **chấp nhận có ý thức**.

## Bất biến dễ vỡ nhất

**Hễ thu hồi session thì phải đóng dấu `sessions_invalid_before`.**
`revokeAllSessionsForUser` giết refresh token nhưng **không** giết access token đang cầm — nó là
JWT tự xác thực cục bộ. Hiện có đúng hai chỗ gọi cặp này: `doiMatKhauBangMa` và `disableStaff`.
**Thêm chỗ thứ ba mà quên đóng dấu là thủng lại y như cũ, và không có gì báo.**

## Kiểm nhanh khi API đang chạy

```bash
curl -s localhost:3001/staff/me          # 401 NOT_AUTHENTICATED  — guard đang phủ
curl -s localhost:3001/health            # 200 {"status":"ok"} — công khai
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/khong-ton-tai   # 404 — đối chứng bắt buộc
```

Dòng cuối không thừa: Elysia trả **404 trước** khi `onBeforeHandle` chạy, nên `/staff/me` ra 404
nghĩa là **route chưa đăng ký**, không phải guard đang chặn. Chỉ **401** mới chứng minh cả hai vế.

⚠️ Kiểm bằng `curl` thì phải gửi `-H 'st-auth-mode: cookie'`, nếu không SuperTokens rơi về header
mode và không có `Set-Cookie` nào — trông y hệt một bug adapter. Và đọc **body**, đừng đọc status
code: sai mật khẩu vẫn là `200` kèm `{"status":"WRONG_CREDENTIALS_ERROR"}`.
