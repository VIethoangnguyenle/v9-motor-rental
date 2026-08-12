# Nợ đã biết

Tách khỏi `CLAUDE.md` vì đây là danh sách việc-phải-làm, không phải luật. Trộn hai loại lại là
cách một danh sách như thế này biến mất khỏi tầm nhìn.

Không cái nào dưới đây tự báo. Roadmap ở [`ROADMAP.md`](ROADMAP.md).

## Nợ của đợt auth

Năm chỗ dưới đây **đã biết là thiếu** khi đợt auth land, không phải phát hiện sau.

| Nợ                                                                                     | Hậu quả nếu bỏ qua                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Không có rate limit theo IP** trên `/staff/password-reset/request` và `/auth/signup` | `Bun.password.hash` là argon2id **64 MB, ~115 ms mỗi lời gọi** (đo trên máy dev: `m=65536,t=2`, hash 115,3 ms) — và nó nằm trên một endpoint công khai. Vài chục request/giây ghim CPU và ăn sạch RAM của một VPS đơn. Bản sửa TOCTOU của `kiemTraMa` đã cắt phần lớn (mã cạn lượt **không còn** chạy argon2), nhưng mỗi lần xin mã mới vẫn mua được 5 lượt verify. `/auth/signup` thì đẩy việc băm sang SuperTokens core và để lại một hàng `PENDING` cho mỗi request. |
| **Email so sánh phân biệt hoa thường**                                                 | `staff_users` khai `UNIQUE(email)` trên text thô, và `timStaffTheoEmail` so bằng `=`. `supertokens-node` chỉ `.trim()` form field (`emailpassword/api/utils.js`), không hạ hoa thường. Nhân viên gõ khác hoa thường → không tìm thấy → route trả 200 chung chung (cố ý, để không lộ email) → **không bao giờ nhận được mã, và không có gì để chẩn đoán**. Sửa đúng: `UNIQUE INDEX ON staff_users (lower(email))` + chuẩn hoá **cả** đường ghi lẫn đường đọc.            |
| **Timing oracle ~190×** ở `/staff/password-reset/request`                              | Email không tồn tại trả về sau đúng một `SELECT` (đo: p95 0,61 ms); email có thật tốn thêm ~115 ms vì `taoMaDatLaiMatKhau` băm mã. Thân response giống hệt nhau, đồng hồ thì không — đúng cái mà "luôn trả 200" sinh ra để giấu.                                                                                                                                                                                                                                        |
| **Không ai dọn mã hết hạn**                                                            | Hàng `used_at IS NULL` đã quá `expires_at` nằm lại vĩnh viễn. Chúng làm phình đúng `password_reset_codes_active_idx` — partial index đó tồn tại **nhờ giả định** tập này gần như luôn rỗng (xem comment trong `packages/db/src/schema/staff.ts`).                                                                                                                                                                                                                       |
| **Tên hàm tiếng Việt/Anh lẫn lộn trong `apps/api/src/services/`**                      | `vehicles.ts` và `staff.ts` đặt tên tiếng Anh (`listPublishedVehicles`, `approveStaff`), `password-reset.ts` đặt tiếng Việt (`taoMaDatLaiMatKhau`, `kiemTraMa`). Cả hai quy ước đều ổn; **trộn thì không** — người sau phải đoán mỗi lần gọi một service. Cần chốt một hướng rồi đổi một lượt, không sửa lẻ tẻ.                                                                                                                                                         |

## Nợ phát hiện sau khi land — review Phase 2

Không có ở lần land đầu, lộ ra khi review Phase 2 của đợt auth (fix bug người bị khoá bị đá về đăng
nhập không kèm lý do).

| Nợ                                                                                                                                                          | Hậu quả nếu bỏ qua                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chưa test Eden Treaty thật sự bọc lỗi API thành `res.error.value` đúng hình `{ message, code }`**                                                         | `meQuery.queryFn` (`apps/staff/src/lib/me.ts`) giả định khi `GET /staff/me` lỗi, Eden đặt đúng thân JSON vào `res.error.value`. `lib/loi.ts` giờ có test (`loi.test.ts`) chứng minh chắc phần PARSE thân đó, nhưng không test nào chạy Eden client THẬT chống lại một response lỗi thật để xác nhận việc BỌC đúng như giả định — test của `apps/api` chỉ chứng minh server phát đúng JSON lên dây, không chứng minh Eden nhận và gói lại y hệt phía trình duyệt. Nếu một bản Eden sau đổi cách bọc `res.error.value`, `maLoi` âm thầm trả `null` cho MỌI lỗi, `decideEntry` rơi hết về nhánh chung ("lỗi không rõ, đừng đăng xuất"), và người bị khoá quay lại đúng con bug Phase 2 vừa sửa — bị đá về đăng nhập không kèm lý do. Xảy ra với `tsc` xanh và toàn bộ unit test xanh, vì không test nào chạm Eden thật. |
| **`eslint-plugin-boundaries` không phân lớp bên trong `frontend`, nên "`components/ui/` không biết domain" chỉ là quy ước, không phải hàng rào công cụ ép** | `eslint.config.js` khai đúng một type `frontend` khớp `apps/{web,staff}/**`; `frontend → frontend` được cho phép vô điều kiện, không có sub-type nào tách `ui/` khỏi `auth/`/`staff/`/`layout/`/`pages/`. Luật ở `apps/staff/CLAUDE.md` — `ui/` không được `import lib/api`, không được biết `Me` hay `StaffRole` — chỉ sống bằng kỷ luật đọc code, không bằng lint. Người đầu tiên vội tay import `lib/api` (hay `Me`) vào một component trong `ui/` sẽ biên dịch sạch, `bun run lint` xanh, và hai tầng component — đích của cả đợt tách này — lặng lẽ sụp về một tầng, không có gì báo. Sửa đòi thêm sub-type + luật riêng cho `ui/` trong `eslint.config.js`, nghĩa là chạy lại bốn probe của skill `v9-fences` và đọc tên luật trong output; đợt tách component này cố ý để ngoài phạm vi.                      |

## ⚠️ Nợ có hạn — phải trả trước một mốc cụ thể

`mode` trong `eslint.config.js` đã deprecated ở `eslint-plugin-boundaries` v7, và nó
in cảnh báo mỗi lần lint. Bản thay là `partialMatch: false`. Phải chuyển **trước** khi nâng
boundaries lên major kế tiếp, vì mục "hàng rào phải được probe" của `../CLAUDE.md` ghi rõ: xoá `mode: "full"`
làm hàng rào **im lặng** ngừng hoạt động. Nếu một bản major xoá `mode` mà chưa chuyển, hàng rào tự
tắt và mọi thứ vẫn exit 0 — đúng kiểu suy thoái đã xảy ra bốn lần trong dự án này. Chuyển xong phải
chạy lại cả ba probe và **đọc tên luật**, không nhìn exit code.

## ⚠️ Chặn deploy: Directus đang cầm credential ROOT của MinIO ở prod

`compose.prod.yaml` truyền `STORAGE_S3_KEY: ${MINIO_ROOT_USER}` và
`STORAGE_S3_SECRET: ${MINIO_ROOT_PASSWORD}` — tức là service phơi ra internet nhiều nhất lại giữ
đúng cái khoá mở được **mọi** bucket, kể cả `checkins` (ảnh tình trạng xe lúc bàn giao, thứ dùng
làm bằng chứng khi tranh chấp). Một lỗ hổng trong Directus thành quyền toàn bộ object storage.

`.env.example` đã có câu cảnh báo đúng chỗ đó, và nó **không ép được gì** — đây chính là ví dụ của
mục "ranh giới repo ép vs cấu hình local" trong `../CLAUDE.md`: một dòng comment không phải hàng rào.

Trước khi stack chạm VPS thật: tạo **access key MinIO riêng cho Directus**, policy giới hạn đúng
bucket `vehicles`, rồi trỏ `STORAGE_S3_KEY`/`STORAGE_S3_SECRET` vào cặp key đó. Ở dev thì dùng
root vẫn chấp nhận được — dev không phơi ra internet và volume vứt đi được.
