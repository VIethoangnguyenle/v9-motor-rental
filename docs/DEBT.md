# Nợ đã biết

Tách khỏi `CLAUDE.md` vì đây là danh sách việc-phải-làm, không phải luật. Trộn hai loại lại là
cách một danh sách như thế này biến mất khỏi tầm nhìn.

Không cái nào dưới đây tự báo. Roadmap ở [`ROADMAP.md`](ROADMAP.md).

## Nợ của đợt auth

Bốn chỗ dưới đây **đã biết là thiếu** khi đợt auth land, không phải phát hiện sau. (Từng là năm —
dòng thứ năm, "tên hàm tiếng Việt/Anh lẫn lộn", đã **đóng**: đợt sửa 2026-08-13 đổi toàn bộ định
danh `apps/api/src/services/` sang tiếng Anh. Luật đặt tên giờ sống ở root
[`CLAUDE.md`](../CLAUDE.md), mục "Định danh tiếng Anh, nội dung tiếng Việt".)

| Nợ                                                                                     | Hậu quả nếu bỏ qua                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Không có rate limit theo IP** trên `/staff/password-reset/request` và `/auth/signup` | `Bun.password.hash` là argon2id **64 MB, ~115 ms mỗi lời gọi** (đo trên máy dev: `m=65536,t=2`, hash 115,3 ms) — và nó nằm trên một endpoint công khai. Vài chục request/giây ghim CPU và ăn sạch RAM của một VPS đơn. Bản sửa TOCTOU của `verifyCode` đã cắt phần lớn (mã cạn lượt **không còn** chạy argon2), nhưng mỗi lần xin mã mới vẫn mua được 5 lượt verify. `/auth/signup` thì đẩy việc băm sang SuperTokens core và để lại một hàng `PENDING` cho mỗi request. |
| **Email so sánh phân biệt hoa thường**                                                 | `staff_users` khai `UNIQUE(email)` trên text thô, và `findStaffByEmail` so bằng `=`. `supertokens-node` chỉ `.trim()` form field (`emailpassword/api/utils.js`), không hạ hoa thường. Nhân viên gõ khác hoa thường → không tìm thấy → route trả 200 chung chung (cố ý, để không lộ email) → **không bao giờ nhận được mã, và không có gì để chẩn đoán**. Sửa đúng: `UNIQUE INDEX ON staff_users (lower(email))` + chuẩn hoá **cả** đường ghi lẫn đường đọc.              |
| **Timing oracle ~190×** ở `/staff/password-reset/request`                              | Email không tồn tại trả về sau đúng một `SELECT` (đo: p95 0,61 ms); email có thật tốn thêm ~115 ms vì `createResetCode` băm mã. Thân response giống hệt nhau, đồng hồ thì không — đúng cái mà "luôn trả 200" sinh ra để giấu.                                                                                                                                                                                                                                            |
| **Không ai dọn mã hết hạn**                                                            | Hàng `used_at IS NULL` đã quá `expires_at` nằm lại vĩnh viễn. Chúng làm phình đúng `password_reset_codes_active_idx` — partial index đó tồn tại **nhờ giả định** tập này gần như luôn rỗng (xem comment trong `packages/db/src/schema/staff.ts`).                                                                                                                                                                                                                        |

## Nợ phát hiện sau khi land — review Phase 2

Không có ở lần land đầu, lộ ra khi review Phase 2 của đợt auth (fix bug người bị khoá bị đá về đăng
nhập không kèm lý do). Từng có bốn dòng — dòng "`eslint-plugin-boundaries` không phân lớp bên
trong `frontend`" đã **đóng**: Plan B Task 9 (2026-08-16) thêm element type `frontend-ui`
(`apps/staff/src/components/ui/**`, khai **trước** `frontend` trong `boundaries/elements` —
`eslint.config.js` có comment giải thích vì sao thứ tự này bắt buộc) và policy
`frontend-ui → frontend-ui` (không cho `shared-domain`/`shared-client` như `frontend` được).

Đóng bằng **probe thật, không phải đọc code**: inject `import { api } from "../../lib/api"` **có
dùng** (data attribute trong JSX — unused import thì chết ở `@typescript-eslint/no-unused-vars`
trước khi `boundaries` kịp nhìn, xem skill `v9-fences`) vào `components/ui/alert.tsx` →
`bun x eslint` nổ đúng rule **`boundaries/dependencies`**, thông điệp literal: `There is no policy
allowing dependencies from elements of type "frontend-ui" to elements of type "frontend"`. Chiều
ngược lại — `pages/staff-list-page.tsx` import `Alert` từ `ui/` — vẫn **im**, chứng minh hai tầng
component (đích của đợt tách) không bị khoá luôn cả chiều hợp lệ.

Một bug thật lộ ra giữa chừng, đáng ghi lại vì nó là chính lớp lỗi tài liệu này đang chống:
`eslint-plugin-boundaries` mặc định `elements-single-match: true` (repo này không override), nên
hai pattern FOLDER-mode chồng nhau (`frontend-ui` và `frontend` cùng khớp file trong `ui/`)
**không** dồn cả hai type vào `element.types` như một comment cũ trong `eslint.config.js` từng
khẳng định — descriptor khai trước mà khớp trước thắng tuyệt đối, file trong `ui/` chỉ mang
**một** type. Hệ quả: chiều `pages → ui/` gãy ngay khi thêm policy mới, cho tới khi probe bắt được
và `"frontend-ui"` được thêm vào `anyOf` của policy `frontend → ...`. Xem comment `CORRECTED
2026-08-16` trong `eslint.config.js` — sửa đúng chỗ comment cũ nói sai, không xoá nó, để lần sau
đọc thấy vì sao.

| Nợ                                                                                                                                                           | Hậu quả nếu bỏ qua                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chưa test Eden Treaty thật sự bọc lỗi API thành `res.error.value` đúng hình `{ message, code }`**                                                          | `meQuery.queryFn` (`apps/staff/src/lib/me.ts`) giả định khi `GET /staff/me` lỗi, Eden đặt đúng thân JSON vào `res.error.value`. `lib/errors.ts` giờ có test (`errors.test.ts`) chứng minh chắc phần PARSE thân đó, nhưng không test nào chạy Eden client THẬT chống lại một response lỗi thật để xác nhận việc BỌC đúng như giả định — test của `apps/api` chỉ chứng minh server phát đúng JSON lên dây, không chứng minh Eden nhận và gói lại y hệt phía trình duyệt. Nếu một bản Eden sau đổi cách bọc `res.error.value`, `errorCode` âm thầm trả `null` cho MỌI lỗi, `decideEntry` rơi hết về nhánh chung ("lỗi không rõ, đừng đăng xuất"), và người bị khoá quay lại đúng con bug Phase 2 vừa sửa — bị đá về đăng nhập không kèm lý do. Xảy ra với `tsc` xanh và toàn bộ unit test xanh, vì không test nào chạm Eden thật.                                                                                                                                                                                                                                                                                                  |
| **`mcp__serena__rename_symbol` và `mcp__serena__find_referencing_symbols` báo sai — mà root `CLAUDE.md` bắt buộc dùng cái thứ hai trước khi đổi tên export** | Hai lần đo được trong đợt này. `rename_symbol` báo THÀNH CÔNG khi đổi tên một page component, nhưng chỉ sửa đúng khai báo — import và chỗ dùng ở file gọi bị bỏ sót im lặng, để lại một cái tên cũ đang được import thứ đã không còn tồn tại dưới tên đó. `find_referencing_symbols` trả về **KHÔNG một tham chiếu nào** cho một hàm service đang đổi tên (thật ra **25 lần dùng trên 8 file** — tên cũ/mới xem bảng đổi tên §6.3 của `docs/plans/2026-08-13-staff-auth-fix-design.md`) và cho một type kết quả cùng đợt — phải bỏ qua, quay lại dùng grep làm nguồn sự thật thay. Root `CLAUDE.md` (mục Serena) ghi: bắt buộc `find_referencing_symbols` **trước khi** đổi tên hay đổi signature của exported function/shared type — nhưng công cụ đó có thể nói "không ai phụ thuộc" cho một thứ có hàng chục nơi phụ thuộc thật, nên một lần đổi tên dựa một mình vào lời nó nói có thể land dở dang mà không có gì báo, y hệt lớp lỗi mà cả tài liệu này đang chống. Đọc luật đó thành "kiểm bằng Serena **VÀ** grep" cho tới khi hiểu rõ vì sao hai công cụ này báo sai — đừng tin một mình "0 reference" hay "rename OK". |

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

## Nợ sinh ra từ Plan A (đợt `customers` + `rentals`)

Cả ba đều **đã biết lúc land**, không phải phát hiện sau.

| Nợ | Hậu quả nếu bỏ qua |
| -- | ------------------ |
| **`stats.test.ts` xoá TOÀN BỘ bảng `rentals`** ở `beforeEach` | `getStatsSummary` tổng hợp trên cả bảng và không nhận bộ lọc nào, nên một hàng lạ làm mọi assertion số học sai — đó là lý do phải xoá sạch. Chấp nhận được **chỉ vì** `rentals` là bảng mới và DB dev chưa giữ đơn thật. Ngày đầu tiên ai đó nhập một đơn thật vào DB dev để xem thử, `bun test` sẽ **xoá mất nó** và không hỏi gì. Sửa đúng: cho `getStatsSummary` nhận bộ lọc, hoặc chuyển test sang database riêng. |
| **Bốn literal trạng thái đơn thuê có BA bản sao** | `CHECK rentals_status_valid` (Postgres) · `RentalStatus` (`@v9/shared`) · `statusSchema` (TypeBox ở `routes/rentals.ts`). Hai bản sau nay đã có liên kết ở tầng kiểu (`StatusSetsMatch` trong `routes/rentals.ts`) nên lệch nhau là lỗi biên dịch. **Bản trong DB thì không được ép gì** — thêm một trạng thái vào domain mà quên sửa migration thì `INSERT` chết lúc chạy, không phải lúc build. |
| **Giá và cọc nhập tay, không có chính sách tính** | `total_amount` là số nhân viên gõ. Gõ nhầm một số 0 là doanh thu sai một bậc, và `CHECK >= 0` không bắt được. Form ở Plan C phải cảnh báo khi lệch quá xa `price_per_day × số ngày`; chính sách tính giá thật là một đợt riêng. |

### Đã đóng trong Plan A

- ~~"Chưa test Eden Treaty thật sự bọc lỗi API thành `res.error.value`"~~ — **vẫn còn**, Plan A không
  chạm frontend. Giữ nguyên ở mục trên.
- ~~Ranh giới `components/ui/` chưa được lint ép~~ — **đã đóng trong Plan B** (Task 9,
  2026-08-16): xem mục "Nợ phát hiện sau khi land — review Phase 2" ở trên, đoạn ghi cách chứng
  minh bằng probe thật (rule `boundaries/dependencies`) thay vì chỉ đọc code.
