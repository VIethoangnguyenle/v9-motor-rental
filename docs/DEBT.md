# Nợ đã biết

Tách khỏi `docs/ARCHITECTURE.md` vì đây là danh sách việc-phải-làm, không phải luật. Trộn hai loại lại là
cách một danh sách như thế này biến mất khỏi tầm nhìn.

Không cái nào dưới đây tự báo. Roadmap ở [`ROADMAP.md`](ROADMAP.md).

## Nợ của đợt auth

Năm chỗ dưới đây **đã biết là thiếu** khi đợt auth land, không phải phát hiện sau — **cả năm đã
đóng**. Dòng thứ năm, "tên hàm tiếng Việt/Anh lẫn lộn", đã **đóng**: đợt sửa 2026-08-13 đổi toàn bộ
định danh `apps/api/src/services/` sang tiếng Anh. Luật đặt tên giờ sống ở root
[`ARCHITECTURE.md`](ARCHITECTURE.md), mục "Định danh tiếng Anh, nội dung tiếng Việt". Đợt trả nợ 2026-08-18
đóng thêm hai dòng:

- ~~"Email so sánh phân biệt hoa thường"~~ — **đóng**, migration `0011` (`db:custom`, viết tay):
  `DROP CONSTRAINT staff_users_email_unique` + `CREATE UNIQUE INDEX staff_users_email_lower_idx ON
staff_users (lower(email))`; `findStaffByEmail` giờ so `lower(...)` ở **cả hai vế**, khớp đúng
  biểu thức của index nên vẫn đi qua index chứ không full scan. Cố ý **không** dọn trùng lặp trước
  khi tạo index — DB dev đã kiểm 0 hàng ở `GROUP BY lower(email) HAVING count(*) > 1`; nếu môi
  trường khác có trùng, migration **nổ lúc chạy** là hành vi muốn có (gộp ngầm hai hồ sơ trùng
  lower-email là quyết định nghiệp vụ, không phải việc một migration tự động nên tự làm). Chứng
  minh bằng test mới: tìm ra hồ sơ khi gõ khác hoa/thường, và DB từ chối insert một hồ sơ trùng
  chỉ khác hoa/thường.
- ~~"Không ai dọn mã hết hạn"~~ — **đóng**, `createResetCode` giờ thêm một `DELETE` toàn cục
  (`used_at IS NULL AND expires_at < now()`) ngay trong transaction đang mở, chạy mỗi khi bất kỳ ai
  xin mã mới — cố ý **không** khoanh theo user xin mã (bước UPDATE liền trước đã tự dọn mã cũ chưa
  dùng của chính người đó; khoanh theo user thì hàng của người chỉ xin đúng một lần rồi không quay
  lại sẽ không bao giờ được dọn). Không có scheduler trong repo (`docs/ARCHITECTURE.md`) nên dọn ăn theo
  đường ghi đã có sẵn thay vì cron riêng. Chứng minh bằng test mới: mã hết hạn **chưa dùng** của
  người B biến mất khỏi bảng (không chỉ bị đánh dấu đã dùng) khi người A xin mã; và trên DB dev
  thật — hai hàng rác có sẵn từ đợt auth trước tự biến mất khi bộ test chạy qua `createResetCode`.

Hai dòng còn lại của bảng cũ — phạm vi khác hẳn hai dòng trên (rate limit + timing oracle, không
đụng gì tới email/dọn mã) — đóng trong đợt trả nợ **bảo mật** 2026-08-18, nhánh
`feat/auth-hardening`:

- ~~**Timing oracle ~190×** ở `/staff/password-reset/request`~~ — **đóng**.
  `requestPasswordReset` (`apps/api/src/services/password-reset.ts`) gộp hai nhánh "có email"/
  "không có email" của route thành MỘT hàm và băm argon2id ở **CẢ HAI** — nhánh không tìm thấy băm
  một hằng số cố định (`DUMMY_HASH_INPUT`), **KHÔNG** băm email người gọi gửi lên, vì chi phí
  argon2id không được phụ thuộc bất cứ gì kẻ gọi kiểm soát được. `routes/staff.ts` gọi hàm này
  thay vì tự rẽ nhánh `findStaffByEmail` rồi CÓ ĐIỀU KIỆN mới `createResetCode` — chính hình dạng
  cũ đã sinh ra oracle.

  **Không verify được qua HTTP ở dev**: SMTP chưa cấu hình nên route trả `EMAIL_NOT_CONFIGURED`
  (503) TRƯỚC khi chạm tầng service — đo qua route cho ra hai số gần bằng nhau vì lý do SAI (cả
  hai đều rẻ như nhau, không phải vì đã băm đều). Verify ở TẦNG SERVICE thay vào đó
  (`services/password-reset.test.ts`, describe `requestPasswordReset — xoá timing oracle`): 7 mẫu
  xen kẽ mỗi nhánh, so bằng MEDIAN (không phải mean, để một mẫu ngoại lệ không kéo lệch kết luận).
  Đo **TRƯỚC** khi sửa (script riêng, tái hiện đúng hình dạng cũ ở tầng service — `findStaffByEmail`
  rồi CÓ ĐIỀU KIỆN mới băm — 8 mẫu mỗi nhánh, cùng máy dev): found median 117,4 ms · notFound
  median 2,4 ms · tỉ lệ **≈49×** — cùng bậc độ lớn với ~190× ghi ở trên (số đo khác do điểm đo và
  tải máy khác nhau — route thật trước khi có nhánh 503 sớm, so với gọi thẳng service — không đổi
  bản chất). Đo **SAU** khi sửa, nhiều lần chạy: tỉ lệ dao động 1,00×–1,11×; test khoá ngưỡng
  **< 3×**, biên độ rộng vì argon2id (~115 ms) giờ chiếm áp đảo cả hai nhánh.

- ~~**Không có rate limit theo IP** trên `/staff/password-reset/request` và `/auth/signup`~~ —
  **đóng**. Một fixed-window limiter TRONG TIẾN TRÌNH (`apps/api/src/plugins/rate-limit.ts`,
  không Redis — root `CLAUDE.md`: "không có Redis trong dự án này") áp hai ngưỡng khác nhau: **5
  lần/15 phút/IP** cho route xin mã, **5 lần/giờ/IP** cho `/auth/signup`; request vượt ngưỡng nhận
  `429 RATE_LIMITED` TRƯỚC khi chạm argon2/SuperTokens — không băm, không ghi hàng `PENDING` nào.

  IP đọc khác nhau tuỳ **môi trường** (`getClientIp`, cùng file), không tuỳ việc header có mặt hay
  không: **production** tin `X-Forwarded-For`, lấy phần tử **CUỐI** — `compose.prod.yaml` không
  publish port nào cho `api` (chỉ `caddy` nghe 80/443), và `reverse_proxy` của Caddy (mặc định,
  không `header_up` nào ghi đè trong `Caddyfile`) NỐI THÊM địa chỉ nó thấy vào **cuối** header thay
  vì ghi đè, nên client tự chèn một IP giả ở **đầu** không thắng được hop cuối cùng — hop đó luôn
  là Caddy. **Dev** đọc socket address thật qua `Server.requestIP()` (Bun), bỏ qua
  `X-Forwarded-For` hoàn toàn — `compose.yaml` (dev) không chạy service `api` (`apps/api` chạy
  thẳng trên host qua `bun run dev`), không proxy nào đứng trước để tin.

  Hai giới hạn thật của một limiter trong tiến trình được viết thẳng trong comment của file, không
  giấu: **mất trạng thái khi restart** container, và **đếm theo TỪNG tiến trình** — chấp nhận được
  vì `compose.prod.yaml` hôm nay chỉ chạy đúng **một** container `api` (không `deploy.replicas`);
  thêm container thứ hai mà không đổi gì ở đây thì ngưỡng hiệu lực nhân đôi, và đó là lúc phải
  chuyển sang một kho đếm dùng chung (Redis) — không sớm hơn.

  Chứng minh bằng test: `plugins/rate-limit.test.ts` khoá bộ đếm thuần (cho qua đúng `max` lần,
  chặn lần kế, IP khác không bị ăn theo, mở lại sau khi cửa sổ hết hạn) VÀ hành vi đọc IP ở cả hai
  môi trường — nhánh production chạy trong **tiến trình con thật** (`NODE_ENV=production`, cùng kỹ
  thuật `auth.test.ts` dùng cho `cookieDomain`) để canh đúng việc lấy phần tử cuối của
  `X-Forwarded-For` khi client tự chèn một IP giả ở đầu. Khớp nối tới route thật được khoá thêm ở
  `routes/staff.test.ts` (`POST /staff/password-reset/request` → 429 ở lần thứ 6 trong 15 phút) và
  `plugins/auth.test.ts` (`POST /auth/signup` → 429 ở lần thứ 6 trong một giờ).

  ⚠️ Phát hiện giữa chừng, đáng ghi lại vì nó là chính lớp lỗi "bun test chạy mọi file trong MỘT
  tiến trình" mà `apps/api/CLAUDE.md` (bẫy ①) đã cảnh báo cho DB, giờ lộ thêm ở state trong bộ
  nhớ: `passwordResetLimiter`/`signupLimiter` là singleton cấp MODULE, và bucket `"unknown"` (mọi
  request trong `bun test` — không `.listen()` thật, không `NODE_ENV=production`) bị **chia sẻ**
  giữa `auth.test.ts` và `staff-guard-revocation.test.ts` (file kia cũng gọi `/auth/signup` thật
  qua `createActiveStaff`). Bài test rate limit đầu tiên bào cạn bucket rồi để nguyên như vậy làm
  ba bài của `staff-guard-revocation.test.ts` nhận nhầm `429` — đã đo thật lúc viết (không suy
  luận): `expect(...).toMatchObject({status:"OK"})` nhận `{code:"RATE_LIMITED"}`. Sửa bằng
  `.reset()` cả **trước lẫn sau** bài test rate limit trong cả hai file gọi route thật.

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

**Đo lại 2026-08-18 (không đổi gì trong `eslint.config.js`):** version cài vẫn y hệt lần trước —
`eslint-plugin-boundaries@7.1.0` + `@boundaries/elements@3.1.0` (khớp `package.json`, `bun.lock`,
và `node_modules/.../package.json` thật). Dựng lại probe độc lập, không đụng repo: thư mục ngoài
git, symlink `node_modules` từ repo (để dùng đúng bản plugin đang cài), một `eslint.config.mjs`
tối giản chỉ khai một element `pattern: "packages/shared/src/index.ts"` — cùng hình dạng single-file
element đang dùng thật ở đây.

- Với `partialMatch: false`: lint đúng file `packages/shared/src/index.ts` vẫn nổ
  `boundaries/no-unknown-files` ("File does not match any file pattern and does not belong to any
  known element"). Plugin còn tự in cảnh báo xác nhận đúng cơ chế bị nghi ngay trước lỗi:
  `"Element patterns match folders, not individual files... Affected patterns:
["packages/shared/src/index.ts"]"`.
- Đổi target sang `packages/shared/src/index.ts/nested.ts` (coi `index.ts` như một **thư mục**) thì
  lint sạch — đúng cơ chế comment cũ mô tả: `partialMatch: false` chỉ khớp phần tử **bên trong**
  đường dẫn coi như thư mục, không bao giờ khớp chính file đó.
- Đối chứng phương pháp đo: cùng probe, đổi lại `mode: "full"` trên đúng pattern đó → lint sạch
  hoàn toàn (chỉ còn cảnh báo deprecated), xác nhận setup probe đúng và tương phản là thật, không
  phải lỗi cấu hình probe.

**Kết luận: vẫn chưa chuyển được — giữ `mode: "full"` nguyên trạng, không đổi `eslint.config.js`.**
Một manh mối mới, chưa từng ghi trước đây: cảnh báo runtime của plugin trỏ tới `boundaries/files`
— một **rule/setting khác**, phân loại theo file thay vì theo element (`FilesDescriptor` trong
`@boundaries/elements`, không dùng chung cơ chế `boundaries/elements` + `boundaries/dependencies`
đang ép ở đây). README của plugin không còn nhắc `partialMatch`/`mode` một dòng nào — tài liệu duy
nhất còn lại là thông điệp cảnh báo runtime. `boundaries/files` **có thể** là hướng thật để gỡ nợ
này, nhưng đổi sang nó là đổi cả cơ chế phân loại (file descriptor thay vì element descriptor),
kéo theo việc phải viết lại các policy `boundaries/dependencies` đang trỏ vào các type
`shared-root`/`api-root`/`shared-client`/`api-infra` — không phải một đổi 1-dòng như debt này giả
định ban đầu. Để lại làm một đợt riêng, không thử trong lần đo này.

## ~~Chặn deploy: Directus đang cầm credential ROOT của MinIO ở prod~~ — đóng ở tầng mã, còn một bước người trên VPS

`compose.prod.yaml` từng truyền `STORAGE_S3_KEY: ${MINIO_ROOT_USER}` và
`STORAGE_S3_SECRET: ${MINIO_ROOT_PASSWORD}` — tức là service phơi ra internet nhiều nhất lại giữ
đúng cái khoá mở được **mọi** bucket, kể cả `checkins` (ảnh tình trạng xe lúc bàn giao, thứ dùng
làm bằng chứng khi tranh chấp). Một lỗ hổng trong Directus thành quyền toàn bộ object storage.

`.env.example` từng chỉ có câu cảnh báo đúng chỗ đó mà **không ép được gì** — đúng ví dụ của mục
"ranh giới repo ép vs cấu hình local" trong `../CLAUDE.md`: một dòng comment không phải hàng rào.
Đợt trả nợ 2026-08-18 (nhánh `feat/auth-hardening`) thay comment bằng một cơ chế thật.

**Đã chứng minh trong dev** (đo thật, không suy đoán):

- Policy JSON scoped đúng bucket `vehicles`, không có `s3:*`, sống ở
  [`scripts/directus-minio-policy.json`](../scripts/directus-minio-policy.json) — hai statement:
  `s3:ListBucket` trên `arn:aws:s3:::vehicles`, `s3:GetObject`/`s3:PutObject`/`s3:DeleteObject`
  trên `arn:aws:s3:::vehicles/*`.
- Tạo policy + user `directus-app` gắn policy đó trên MinIO **dev** bằng `mc` (mượn image
  `minio/mc` qua `docker compose run`, không cần cài gì trên máy):

  ```bash
  docker compose run --rm -v "$(pwd)/scripts:/policies:ro" --entrypoint sh minio-init -c "
    mc alias set local http://minio:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD &&
    mc admin policy create local directus-vehicles-only /policies/directus-minio-policy.json &&
    mc admin user add local directus-app '<secret>' &&
    mc admin policy attach local directus-vehicles-only --user directus-app
  "
  ```

- **Chiều dương** — key ghi/đọc/list được `vehicles`: `mc cp`, `mc cat`, `mc ls` bằng alias trỏ
  key `directus-app` đều thành công trên `scoped/vehicles/...`.
- **Chiều âm** — đúng trọng tâm của việc chứng minh policy, vì một policy cấp thừa quyền trông
  giống hệt policy đúng cho tới khi ai đó kiểm chiều này: `mc ls scoped/checkins/` →
  `mc: <ERROR> Unable to list folder. Access Denied.`; `mc cp ... scoped/checkins/...` →
  `mc: <ERROR> Failed to copy ... Insufficient permissions to access this path
http://minio:9000/checkins/...`. Cả hai lỗi đều đúng dạng từ chối quyền, không phải lỗi kết nối.
- Dọn sạch user/policy/object thử khỏi MinIO dev sau khi đo — không để lại trạng thái test.

`compose.prod.yaml` giờ đọc `DIRECTUS_S3_KEY`/`DIRECTUS_S3_SECRET` thay vì `MINIO_ROOT_*` —
**không có mặc định rơi về root**: để trống thì Directus không xác thực được với MinIO, thất bại
rõ ràng lúc chạy thay vì âm thầm cấp thừa quyền. `.env.example` có hai biến mới (comment ra, giải
thích tại sao) thay cho câu cảnh báo cũ. Dev **cố ý giữ nguyên** dùng `MINIO_ROOT_*` trong
`compose.yaml` — dev không phơi ra internet và volume vứt đi được, đúng như debt gốc đã chấp nhận.

**Chưa chứng minh được, vì VPS chưa tồn tại** (KHÔNG lạc quan hoá thành "đã xong"): áp đúng quy
trình trên lên MinIO **thật** trên VPS — tạo policy, tạo access key thật, kiểm cả hai chiều trên
đó, rồi điền `DIRECTUS_S3_KEY`/`SECRET` vào `.env` thật của VPS. Thủ tục copy-paste đầy đủ, đã thử
nguyên văn trên dev (không phải suy đoán) ở
[`docs/runbooks/minio-directus-scoped-key.md`](runbooks/minio-directus-scoped-key.md); trạng thái
và pointer cũng có ở `.claude/skills/v9-deploy/SKILL.md`. **Không còn chặn ở tầng mã**, nhưng
Directus trên VPS sẽ không upload/đọc được ảnh cho tới khi bước người này chạy — liệt là một mục
trong "Còn thiếu trước lần deploy đầu" của skill đó, không còn là "⛔ chặn cứng".

## Nợ sinh ra từ Plan A (đợt `customers` + `rentals`)

Cả ba đều **đã biết lúc land**, không phải phát hiện sau. Một còn lại — hai đã đóng trong đợt trả
nợ 2026-08-18, xem "Đã đóng trong Plan A" bên dưới cho cách chứng minh.

| Nợ                                                | Hậu quả nếu bỏ qua                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Giá và cọc nhập tay, không có chính sách tính** | `total_amount` là số nhân viên gõ. Gõ nhầm một số 0 là doanh thu sai một bậc, và `CHECK >= 0` không bắt được. Form ở Plan C phải cảnh báo khi lệch quá xa `price_per_day × số ngày`; chính sách tính giá thật là một đợt riêng. |

### Đã đóng trong Plan A

- ~~"Chưa test Eden Treaty thật sự bọc lỗi API thành `res.error.value`"~~ — **vẫn còn**, Plan A không
  chạm frontend. Giữ nguyên ở mục trên.
- ~~Ranh giới `components/ui/` chưa được lint ép~~ — **đã đóng trong Plan B** (Task 9,
  2026-08-16): xem mục "Nợ phát hiện sau khi land — review Phase 2" ở trên, đoạn ghi cách chứng
  minh bằng probe thật (rule `boundaries/dependencies`) thay vì chỉ đọc code.
- ~~"`stats.test.ts` xoá TOÀN BỘ bảng `rentals`" ở `beforeEach`~~ — **đóng trong đợt trả nợ
  2026-08-18**: `getStatsSummary` giờ nhận `filter.createdBy` tuỳ chọn (mặc định `undefined` = toàn
  shop, đúng đường gọi thật ở `routes/stats.ts`); `stats.test.ts` lọc mọi lời gọi theo
  `createdBy = staffId` (seed riêng, tiền tố `ztest-tk-`), và `beforeEach` chỉ còn xoá đúng hàng của
  file này thay vì cả bảng. Chứng minh bằng psql: chèn tay một đơn thuê thật (không mang tiền tố
  test), chạy `bun test` đầy đủ (219 pass / 0 fail), hàng vẫn còn nguyên sau đó.
- ~~"Bốn literal trạng thái đơn thuê có BA bản sao"~~ — **đóng trong đợt trả nợ 2026-08-18**: bản
  trong DB giờ có hàng rào, không còn là bản duy nhất không được ép. `RENTAL_STATUSES` là tuple
  runtime mới ở `@v9/shared/domain/rental`; `RentalStatus` giờ dẫn xuất từ nó
  (`(typeof RENTAL_STATUSES)[number]`) thay vì khai union rời, để có một giá trị runtime đem so với
  `CHECK` constraint của DB. Test hàng rào ở `apps/api/src/services/rentals.test.ts` (chỗ duy nhất
  được chạm cả `db` lẫn `shared-domain` theo eslint boundaries) đọc trực tiếp
  `pg_get_constraintdef('rentals_status_valid')` từ Postgres đang chạy, parse các literal
  `'X'::text`, so với `RENTAL_STATUSES`. Chứng minh hàng rào có hiệu lực: thêm tạm `"EXTENDED"` vào
  `RENTAL_STATUSES` (không đụng migration) làm test đỏ đúng chỗ, in rõ literal thừa; đã revert.

## Nợ sinh ra từ đợt màn hình Khách hàng

- **Đổi rules của `unaccent` là đổi ngầm kết quả tìm khách — phải `REINDEX`.** `f_unaccent` (migration
  `0012`) khai `IMMUTABLE` chồng lên `unaccent()` vốn **STABLE** — đo trên PG 17: cả hai overload
  (`unaccent(regdictionary,text)` và `unaccent(text)`) đều `provolatile = 's'`. Ghim
  `'public.unaccent'::regdictionary` chỉ gỡ được phụ thuộc vào `search_path` và cấu hình
  text-search của phiên; nó **không** làm hàm bất biến thật. Lời khai `IMMUTABLE` đúng **chừng nào
  rules của dictionary `public.unaccent` không đổi**. Ai chạy
  `ALTER TEXT SEARCH DICTIONARY public.unaccent (RULES = ...)`, hoặc thay file `unaccent.rules` rồi
  reload, **bắt buộc** phải `REINDEX INDEX customers_full_name_search_idx` ngay sau đó.

  Không làm thì index giữ trigram tính theo rules CŨ và tìm kiếm **thiếu hàng một cách im lặng**.
  Đã đo, không phải suy đoán (trong một transaction rồi ROLLBACK): đổi rules cho `ễ` → `zz` xong,
  **cùng một câu truy vấn cho hai đáp án** — đi qua index ra 0 hàng, ép seqscan ra 1 hàng. Sai theo
  hướng THIẾU (false negative) chứ không thừa: bitmap heap scan có bước Recheck tính lại biểu thức
  từ heap nên ứng viên sai bị lọc, nhưng hàng đúng không bao giờ được đưa vào danh sách ứng viên —
  tức triệu chứng là "khách có thật mà tìm không ra", đúng cái lỗi migration `0012` sinh ra để vá.

  **Không có gì trong repo ép luật này**: không migration nào chạy lại, không test nào bắt được, và
  màn hình vẫn trả về câu tự tin "Không tìm thấy khách hàng nào khớp." Cùng hạng với luật CodeGraph
  ở [`ARCHITECTURE.md`](ARCHITECTURE.md) — quy ước trong tài liệu, không phải hàng rào.

- **Không có chức năng gộp hồ sơ khách trùng** — quyết định 2026-08-31, không phải bỏ sót.
  `customers.phone` là `UNIQUE` nên hồ sơ trùng chỉ xảy ra khi MỘT người dùng hai số khác nhau; và
  từ khi tìm kiếm bỏ dấu (migration `0012`), nhân viên tìm ra hồ sơ cũ thay vì tạo mới. Lập trường
  đã có tiền lệ thành văn ở migration `0011`: _gộp ngầm hai hồ sơ là quyết định nghiệp vụ, không
  phải thứ một migration tự động nên tự ý làm._
  **Điều kiện mở lại:** xuất hiện ca trùng thật (hai hồ sơ, hai số, cùng một người).

- **Ba cột `rentals.document_type` / `document_returned_at` / `delivery_address` chưa có writer** —
  cố ý. Chúng là hợp đồng dữ liệu cho luồng bàn giao xe, sẽ được ghi khi màn bàn giao được dựng.
  **Điều kiện đóng:** màn bàn giao land.

- **Ô tìm khách không escape `%` và `_`** — gõ `%` khớp toàn bộ khách hàng. Có sẵn từ trước
  migration `0012`, **không** phải hồi quy. Đã đo và kết luận là **nhiễu, không phải lỗ hổng**:
  chuỗi đi qua bind parameter nên không phải injection; `OWNER`/`STAFF` vốn đã xem được toàn bộ
  khách nên không rò gì; `searchCustomers` có `.limit(20)` và `listCustomers` chặn `pageSize ≤ 50`
  nên không kéo sập được gì; pattern luôn kết thúc bằng `%` nên `\\` không gây 500.
  Đường rủi ro thật duy nhất: nhân viên lỡ gõ `%` ở ô tìm của form lên đơn, thấy danh sách trông
  hợp lý nhưng sai người, rồi gắn nhầm khách vào đơn.
  **Nếu sửa:** `term.replace(/[\\%_]/g, "\\$&")` + `ESCAPE '\\'`, và nhớ nó đổi nhẹ cách trích trigram.

- **`updateCustomer` xoá trắng `note` khi caller bỏ qua field** — `note: input.note ?? null`
  (`services/customers.ts`) là semantic PUT, trong khi route khai `note: t.Optional(...)`
  (`routes/rentals.ts`). Client nào gửi thiếu `note` sẽ xoá ghi chú cũ mà không định làm vậy.
  Hôm nay `customer-edit-form.tsx` luôn gửi đủ ba field nên chưa phát tác.
  **Điều kiện phải sửa:** ngay khi có caller thứ hai của `POST /customers/:id`.

- **Không có index trên `rentals.customer_id`** — `rentals` hiện chỉ có `rentals_pkey`,
  `rentals_no_overlap`, `rentals_revenue_idx`. Ba truy vấn của màn Khách hàng (`counts`, `actives`,
  `listRentalsForCustomer`) đều seq scan toàn bảng. Khoanh-theo-trang giảm số hàng **trả về**,
  không giảm số hàng **quét** — comment biện minh page-scoping bằng lý do hiệu năng đang nói quá.
  Vô hại ở quy mô hiện tại. **Điều kiện sửa:** khi `rentals` vượt ~vài chục nghìn hàng.

- **Năm file còn nguyên điểm mù "nuốt lỗi truyền tải"** — `lib/rentals.ts`, `rental-calendar.tsx`,
  `rental-form.tsx`, `stats-page.tsx`, `staff-list-page.tsx`. Eden Treaty **nuốt** rejection của
  `fetch` và trả `{ error: EdenFetchError(503, exception) }`, nên `isError` là nhánh chết ở khắp
  nơi, và các màn đó hiện câu fallback chung chung không kèm đường thử lại. `connectionFailed()`
  (`lib/customers.ts`) đã export, dùng lại được. Chúng cũng còn dùng `assertive` cho banner tải,
  cắt ngang trình đọc màn hình vô cớ — `Alert` đã có prop `live` để sửa.

- **API chết thì đăng xuất.** `protectedLayoutRoute.beforeLoad` gọi `hasSession()` vốn cần API, nên
  nhân viên F5 đúng lúc API chớp tắt sẽ bị đá về `/login` chứ không phải màn có nút thử lại. Điều
  này giới hạn hẳn giá trị của nhánh lỗi vừa thêm: nó chỉ cứu được ca "trang đang mở sẵn, API chết,
  refetch nổ".

- **`isPickupOverdue` nhìn thấy được nhưng không được đếm ở đâu.** `stats.ts` đếm `overdue` chỉ bằng
  `isOverdue`, và `attention-list.tsx` render nó thành "N xe quá hạn chưa trả" rồi link sang
  `/calendar`. Đơn quá hẹn lấy giờ hiện đỏ-viền trên lịch nhưng không nằm trong con số nào. Đã đỡ
  hơn trước (trước là vừa vô hình vừa không đếm), và cách tô khác nhau nên hai thứ không còn mâu
  thuẫn nhau. **Muốn xử lý thật** thì cần một dòng riêng trong `attention-list.tsx` kèm một count
  thứ hai trong `stats.ts`.

- **`.claude/CLAUDE.md` chưa được track.** Root `CLAUDE.md` nói rõ file này **phải được commit,
  đừng đẩy vào `.gitignore`** — có track thì lần `codegraph install --refresh` sau hiện ra thành
  diff review được. Hiện nó là untracked, tức mọi lần upgrade lại mọc ra một file lạ. Ngoài phạm vi
  đợt này nên **không tự commit**; nêu để người quyết.

---

## Nợ sinh ra từ đợt hệ thị giác (2026-09-01/02)

- ~~**`apps/staff` không có một test component nào**~~ ✅ **đóng** (đợt màn hình hẹp, 2026-09-03).
  Đã cài `happy-dom` (`@happy-dom/global-registrator`) + `@testing-library/react`, nạp qua
  `preload` của `bunfig.toml` → `apps/staff/test-setup.ts`, không import lẻ ở từng file test —
  tránh đúng lớp lỗi "một file quên import thì đỏ mà không có gợi ý là do thiếu DOM giả".

  **Số đo chính xác: 5 file**, không phải 6 như số đầu đợt nghiệm thu (`grep -rl
"@testing-library" apps/staff/src --include="*.test.ts*"`): `ui/modal.test.tsx`,
  `ui/button.test.tsx`, `rentals/calendar-timeline.test.tsx`, `staff/staff-table.test.tsx`,
  `hooks/use-layout-variant.test.ts`.

  Bộ test hết phụ thuộc thứ tự chạy: `@testing-library/react` tự móc `cleanup()` vào `afterEach`
  của framework test tại **thời điểm module init**, mà `bun test` chỉ init module đó MỘT LẦN cho
  cả tiến trình — hai file component chạy chung một lệnh thì panel của lần render trước còn kẹt
  trong DOM sang test sau. Đo trực tiếp trên `modal.test.tsx`
  (`document.querySelectorAll("[data-panel]").length` ở đầu test 2): chạy một mình → 1 panel (tự
  dọn, ăn may); chạy chung với `use-layout-variant.test.ts`, bất kể thứ tự trước/sau → 2 panel
  (không dọn) — triệu chứng bắt sống được: `modal.test.tsx` đỏ ở ca "footer nằm NGOÀI vùng cuộn" vì
  `querySelector("[data-panel]")` bắt nhầm panel của lần render trước. `test-setup.ts` giờ tự gọi
  `afterEach(cleanup)`, và nạp `@testing-library/react` bằng `import()` **động** chứ không tĩnh —
  import tĩnh bị hoist lên trước `GlobalRegistrator.register()`, làm mọi test dùng `screen` đỏ
  đồng loạt vì `document` chưa tồn tại lúc `@testing-library/dom` chốt singleton.

  ⚠️ **Không đọc thành "đã đóng lại" bảy đột biến bên dưới.** Đây là hạ tầng mới có, không phải kết
  quả đo lại: 5 file trên nhắm layout footer/scroll của `Modal`, ngưỡng chạm của `Button`,
  `ScrollHint`, hình dạng bảng/thẻ của `StaffTable`, và breakpoint của `useLayoutVariant` — không
  file nào chạm logic đóng/mở + hoạt ảnh mà bảng đột biến gốc dưới đây canh. Năm đột biến đó **vẫn
  chưa được đo lại** với hạ tầng mới; giữ nguyên bảng làm bằng chứng vì sao hạ tầng này cần thiết.

  Đây không phải suy đoán. Vòng review gộp chạy **bảy đột biến, cả bảy đều xanh** trên `bun test` +
  `typecheck` + `lint`:

  | Đột biến                                                | Hỏng gì thật                                                             |
  | ------------------------------------------------------- | ------------------------------------------------------------------------ |
  | xoá `closeRef.current = close`                          | **sheet không bao giờ tự đóng** sau khi đổi trạng thái                   |
  | bỏ `pointer-events: none` ở `dialog`                    | cú bấm 180ms sau khi đóng rơi vào lớp mờ đang tan                        |
  | lọc `transitionend` theo `"transform"` thay `"opacity"` | mọi lần đóng trễ 400ms                                                   |
  | cleanup không `clearTimeout`                            | timer nổ sau unmount: `onChanged` hai lần + `close()` vào dialog đã chết |
  | xoá hẳn `transition: transform` của panel               | mất hiệu ứng ra, **không gì bắt được**                                   |

  Hai đột biến còn lại (`--duration-panel` 900ms phá trần 400ms · `BEAT_MS` lệch `@utility`) **đã
  được đóng** bằng `lib/motion-budget.test.ts` — hàng rào đọc-file kiểu `spacing-fence`, ~40 dòng.
  Năm cái trên thì cần hạ tầng test DOM — hạ tầng giờ có, phép đo lại thì chưa.

  **Đừng đọc "498 test xanh" thành "chuyển động được canh".**

- ~~**`ui/modal.tsx` không sống sót qua StrictMode**~~ ✅ **đóng ở `ed9e760`.** `dialog.close()`
  **xếp hàng** sự kiện `close`; StrictMode chạy cleanup rồi mount lại, và sự kiện đã xếp hàng rơi vào
  `handleClose` của lần mount thứ hai, bị đọc thành "người dùng đóng". Có từ trước đợt này (xác nhận
  ở `ebbb443`); bản build không bị, nên **CI không bao giờ kêu** — nó chặn `vite dev` thôi, tức chặn
  đúng vòng lặp phát triển trên cả ba lớp phủ.

  Sửa bằng `if (el.open) return;` ở đầu `handleClose` — đọc **số đo** của DOM thay vì giữ một cờ
  "vừa tháo": một boolean sống qua hai lần chạy effect còn phải lo nó kẹt `true` khi sự kiện không
  tới. Đo: lúc mount lại, sự kiện xếp hàng gặp `open === true`; mọi lần đóng thật gặp `false`, vì
  `close()` gỡ `open` trước khi xếp hàng.

  ⚠️ **Không có test nào canh.** `Modal` và ba chỗ gọi đều "no tests found within 3 caller hops"; lỗi
  chỉ lộ dưới StrictMode trong trình duyệt thật. Hồi quy sau này vẫn phải bắt bằng tay — thuộc món nợ
  test DOM ở trên.

- ~~**`bun run format:check` đỏ trên `main`**~~ ✅ **đóng.** `main` (`819ba41`) đỏ 19 file; đợt này
  tình cờ chữa 2 (agent chạy prettier lên file nó đụng), rồi `820c204` chạy nốt 17 file còn lại —
  thuần hình thức, `typecheck` + 439 test + `eslint` xanh sau khi chạy.

  Một file **không** chữa được bằng `bun run format`, và đó là nợ do **chính đợt này** tạo ra:
  `docs/plans/2026-09-01-staff-visual-system-plan.md` làm prettier chạy vòng vô tận. Nguyên nhân đo
  được: đoạn nối tiếp dưới mục `- [ ]` của Task 4b thụt 6 dấu cách, mà prettier chuẩn hoá đoạn nối
  tiếp của list item về cột 2 — nên mỗi lần `--write` nó thêm 4 dấu cách và `--check` đỏ ngay sau
  đó, md5 đổi qua cả ba lần chạy liên tiếp. Chuẩn hoá 9 dòng về 2 dấu cách (`b126d23`) là hết.

  ⚠️ **Bài học chung**: `bun run format` không phải lúc nào cũng chữa được `format:check`. Khi hai
  cái bất đồng, đừng kết luận prettier hỏng — tìm cấu trúc markdown làm nó dao động.

- ⚠️ **`t.File({ type })` của Elysia kiểm ĐUÔI TÊN FILE, không kiểm nội dung.** Đo 2026-09-02 (Bun
  1.3.10 / elysia 1.4.29) qua một app mang đúng schema của route thật, ảnh WebP thật sinh bằng PIL:

  | byte gửi | tên file      | khai `Content-Type` | server đọc ra   | HTTP |
  | -------- | ------------- | ------------------- | --------------- | ---- |
  | WebP     | `avatar`      | `image/webp`        | `""`            | 422  |
  | WebP     | `avatar.webp` | `image/webp`        | `image/webp`    | 200  |
  | JPEG     | `avatar`      | `image/jpeg`        | `image/jpeg`    | 200  |
  | JPEG     | `x.png`       | `image/png`         | **`image/png`** | 200  |

  Ba điều đọc ra từ bảng: lời khai `Content-Type` của người gửi **bị bỏ qua hoàn toàn**; có đuôi thì
  **đuôi thắng byte**; không đuôi mới rơi xuống một bước đoán từ byte, và bước đó **không có WebP**.

  Hệ quả: hàng rào này chống nhầm lẫn, **không** chống người cố tình — gửi byte bất kỳ dưới tên
  `x.png` là qua. Mức độ thấp và có chủ ý: bucket riêng tư, trần 1 MB, mỗi người chỉ ghi được ô của
  chính mình, và đường XSS đóng bằng chỗ khác — `image/svg+xml` không nằm trong `TYPE_EXTENSION` của
  `@v9/shared/domain/avatar`, nên không khoá nào mang đuôi `.svg` và `readStaffAvatar` không bao giờ
  trả `Content-Type` đó. **Nợ ở đây là chú thích, không phải hành vi**: đừng để ai đọc `t.File({ type })`
  rồi tưởng nội dung file đã được kiểm.

  ⚠️ **Mục nợ KHÔNG được viết**: bản đầu của đợt avatar kết luận "Bun đoán kiểu từ byte, bảng đoán
  không có WebP, nên `routes/handover.ts` cũng không nhận được ảnh WebP". Quan sát có thật (mọi lần
  gửi đều 422) nhưng nguyên nhân sai — file thử **không có đuôi**. `handover.ts` nhận WebP bình
  thường: ảnh bàn giao đến từ `<input type="file">`, luôn mang tên thật kèm đuôi. Đừng đi tìm con bug
  đó. Hàng rào `apps/staff/src/lib/avatar-filename.test.ts` giữ đuôi tên file khỏi rơi lại.

## ⛔ CI `verify` đỏ — workflow thiếu service MinIO

**Có sẵn từ trước đợt này**, không phải hồi quy: `819ba41` (HEAD của `main` lúc đo) và mọi run trước
đó đều fail ở bước `Run bun test`.

Nguyên nhân: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) dựng Postgres dưới `services:`
nhưng **không dựng MinIO**, trong khi vẫn đặt `MINIO_ENDPOINT: http://localhost:9000`. Mọi test chạm
object storage vì thế chết ở CI trong khi xanh ở máy dev — đúng lớp "xanh ở đây, đỏ ở kia" mà không
ai nhìn vì không ai đọc log CI của một job vốn đã đỏ.

Đo 2026-09-02 bằng hai worktree, cùng một điều kiện (`MINIO_ENDPOINT` trỏ cổng không ai nghe), để
tách bạch cái có sẵn với cái đợt này thêm vào:

| cây               | pass | **fail** | những bài nào                                                                         |
| ----------------- | ---- | -------- | ------------------------------------------------------------------------------------- |
| `main` (819ba41)  | 372  | **6**    | `addRentalPhoto` ×2 · `readRentalPhoto` · `deleteRentalPhoto` ×2 · `listRentalPhotos` |
| nhánh (`0befb5b`) | 472  | **12**   | 6 bài trên **+ 6 bài avatar** (`setStaffAvatar` ×4 · `deleteStaffAvatar` ×2)          |

Đợt avatar **không tạo ra** món nợ này nhưng **nhân đôi** nó, vì `services/avatar.ts` dùng chung
bucket `checkins` với ảnh bàn giao và test của nó ghi/đọc byte thật — có chủ ý: một test avatar
không chạm MinIO thì không chứng minh được ca THAY ảnh dọn đúng object cũ, mà đó là ca dễ sai nhất
của file đó.

**Cách trả**: thêm MinIO vào `services:` của job `verify` và tạo sẵn hai bucket `vehicles`,
`checkins` trước bước `bun test`. Ảnh `minio/minio` không chạy được thẳng dưới `services:` (khối đó
không nhận `command`, mà entrypoint của ảnh cần `server /data`); hai đường đã biết là dùng ảnh
`bitnami/minio` với `MINIO_DEFAULT_BUCKETS=vehicles,checkins`, hoặc `docker run -d` MinIO như một
step thường rồi `mc mb`. **Chưa đo đường nào** — GitHub Actions không chạy thử ở máy được, nên việc
này cần vài vòng đẩy để chỉnh.

⚠️ Đến khi trả xong, **`bun test` xanh ở máy KHÔNG có nghĩa CI sẽ xanh**, và ngược lại `verify` đỏ
không còn phân biệt được "hỏng thật" với "thiếu MinIO". Đó mới là giá đắt nhất của món nợ này: một
cổng đỏ thường trực là một cổng không ai đọc nữa.

## Nợ sinh ra từ đợt nghiệm thu 11 task màn hình hẹp `apps/staff` (2026-09-03)

Đo lại toàn bộ bằng probe vendor ở `apps/staff/scripts/mobile-probe/`, hạ tầng đang chạy sẵn
(postgres/minio/supertokens/directus qua docker, `api` :3001, `staff` :3003, Chrome CDP :9222).
`modal-submit-hit.mjs --self-test` chạy trước tiên và PASS (chèn lớp che 30% đáy nút bên trong
`<dialog>` → báo trượt đúng 10/25 điểm; gỡ lớp che → 0/25 trở lại) — probe được tin trước khi dùng
số nó trả ra.

- ⚠️ Sheet chi tiết đơn còn **3/7** hành động dưới nếp gấp (`sheet-actions.mjs`, cả 390 lẫn 360px:
  `chưa cuộn: 3/7 [Thêm ảnh(15/25),Thêm ảnh(25/25),Thêm ảnh(25/25)]`), cả ba đều là nút "Thêm ảnh"
  của `HandoverPhotos` — có ba `PhotoKind` (DOCUMENT, HANDOVER, RETURN), không phải hai như bảng
  đếm đầu đợt. Nút "Thêm ảnh" của bước **nhận lại xe** (RETURN, đứng cuối cùng) nằm dưới cùng — mà
  `PRODUCT.md` (dòng 101) gọi ảnh bàn giao là "Bằng chứng bảo vệ cả hai phía." Ràng buộc cứng của
  đợt này — hai nút trạng thái "Đã giao xe"/"Huỷ đơn" ra khỏi vùng cuộn — đã đạt (không nút trạng
  thái nào còn trong danh sách trượt).

- ⚠️ Đầu trang Lịch còn chiếm **168px/780px (22%)** chiều cao màn hình ở 390px (`calendar-
geometry.mjs`), chưa đạt mốc 15% ban đầu. Đòn bẩy trong phạm vi đã cạn: `ToggleGroup` là flex
  item không xẻ được, cần trọn ~150px, nên toolbar buộc phải xuống hai hàng
  (`rental-calendar.tsx:246`). Hai lựa chọn còn lại đều là quyết định **sản phẩm**, không phải kỹ
  thuật:
  1. sửa `apps/staff/src/components/ui/toggle-group.tsx` — dùng chung ba trang
     (`rental-calendar.tsx`: Timeline|Tháng, `requests-page.tsx`: bốn trạng thái), đổi ở đây ảnh
     hưởng cả ba;
  2. ẩn tiêu đề "Lịch" trên mobile — `app-nav.tsx` (bottom nav) đã gắn nhãn "Lịch" cho tab đang mở
     (`{ kind: "link", label: "Lịch", to: "/calendar", ... }`) nên tiêu đề trang dư thừa ở màn hẹp.

- ⚠️ `--veh-col` (`calendar-timeline.tsx:167`) **không đơn điệu** qua breakpoint: base (áp dụng ở
  390px) `7.5rem` = 120px > `md:7rem` = 112px < `xl:8.125rem` = 130px — cột xe ở tablet (`md`) hẹp
  hơn ở điện thoại, rồi lại rộng hơn ở desktop (`xl`). Đo trực tiếp `getBoundingClientRect().width`
  của ô sticky ở 390px ra đúng 120px, khớp `--veh-col` base — số đo, không phải đọc CSS suy ra.
  Không mất dữ liệu: hàng rào #7 đã bỏ `truncate` nên tên xe xuống dòng thay vì cắt (`vehicle-
column.mjs`: cả 6 xe "cần 119px ✅", không xe nào cụt) — chỉ bất nhất **hình ảnh** giữa ba
  breakpoint.

- ⚠️ `ToggleGroup` (`ui/toggle-group.tsx`) dùng `gap-2` (8px) giữa các pill 44px của chính nó,
  trong khi toolbar bọc ngoài ở `rental-calendar.tsx:431` dùng `gap-1` (4px) cho cùng một hàng,
  cùng loại target chạm — hai khoảng cách khác nhau trong cùng một cụm điều khiển liền kề.

- ⚠️ `ScrollHint` (`calendar-timeline.tsx`) có **vùng chết ~1px**: biên `- 1` trong phép so sánh
  (`el.scrollLeft + el.clientWidth < el.scrollWidth - 1`) cố ý tránh nhấp nháy sub-pixel, nhưng
  đồng thời tạo một khoảng mà hint tắt dù còn đúng 1px chưa cuộn tới. Không ca test nào exercise
  trực tiếp biên đó: ba ca trong `calendar-timeline.test.tsx` dùng happy-dom, nơi
  `clientWidth`/`scrollWidth` là số nguyên đặt tay (`356/942/0`, `356/942/586`, `1024/1024/0`) —
  không ca nào đặt lệch đúng quanh biên `-1`. Xác nhận hai chiều bật/tắt vẫn đúng bằng CDP tay trên
  trang thật: `data-more` đi từ `"true"` (chưa cuộn) xuống `"false"` (`scrollLeft = scrollWidth`).

- ⚠️ Nhánh hình-dạng-thẻ của `staff-table.mjs` giả định `#main` chỉ chứa đúng **một `<ul>`**
  (`main.querySelector('ul')`) — đúng hôm nay (`/staff` ở 390px chỉ có danh sách thẻ nhân viên,
  probe đo ra "số thẻ: 2 · nút trong thẻ: 3 · nằm trong khung nhìn: 3"), nhưng sẽ đo nhầm nếu có
  widget `<ul>` khác được thêm lên cùng trang sau này — probe chọn `<ul>` đầu tiên trong DOM, không
  nhất thiết là danh sách thẻ nhân viên.

- ⚠️ Bằng chứng "`MIN_EDGE_PX=3` không làm mù probe ở góc bo tròn 6px" (đo tay: cách mép 1px thỉnh
  thoảng vẫn trượt, 2px luôn trúng) vẫn là **tường thuật** trong comment của `modal-submit-hit.mjs`
  và `sheet-actions.mjs`, không có script tự chạy lại được đi kèm — khác hẳn `modal-submit-hit.mjs
--self-test` (chèn/gỡ lớp che, khẳng định hai chiều, thoát mã khác 0 nếu sai). Script minh hoạ
  riêng cho `MIN_EDGE_PX` tạm thời không commit.

- ⚠️ **Phát hiện thêm ngoài danh sách trên** (không do đợt này gây ra, đo được trong lúc nghiệm
  thu): dòng tổng kết của `vehicle-column.mjs` in cứng chuỗi `"(đang cấp 88px)"` và trừ `88` trong
  phép tính "what-if" (`wrap.scrollWidth+(max-88)`) — hai con số **viết chết trong mã probe**, không
  đọc từ DOM. `--veh-col` thật ở 390px hiện là 120px (đo ở trên), không phải 88px, nên hai dòng này
  đang báo sai kể từ khi cột xe được nới rộng. Không ảnh hưởng phán quyết ✅/⚠️ của từng dòng (tính
  trực tiếp từ `need`/`has` đo sống), chỉ hai dòng tóm tắt bên dưới nó — cùng lớp lỗi "probe mù
  không báo lỗi" mà `README.md` của thư mục này liệt kê, thêm một ca thứ tư chưa được liệt vào đó.

  **Chưa xử lý** tại thời điểm đợt sửa cuối 2026-09-04 — hai con số `88` vẫn còn nguyên trong
  `vehicle-column.mjs:42,44`. Giữ nguyên mục này thay vì đóng, để lần sau chạm probe này biết còn
  nợ.

- ✅ **Cổng cuối, cả bốn đã xanh** — đóng bởi ba commit ngay sau khi mục này được ghi lần đầu:
  `84c7b90` (eslint ignores), `63fc84c` (tsconfig include + sửa 40 lỗi/16 cảnh báo thật),
  `e19e0dd` (prettier). Ghi lại cấu hình đã thêm và vì sao, để lần sau chạm `eslint.config.js` hay
  `tsconfig.json` biết tiền lệ đã có:
  - `.claude/skills/impeccable/**` (thư mục cài bằng `npx impeccable install`, đã có trong
    `.gitignore` từ trước) thêm vào `ignores` của `eslint.config.js`. Không có dòng này, `bun run
lint` trần trụi ăn thêm hơn 2700 lỗi của code do trình cài bên thứ ba sinh ra — không thuộc mã
    nguồn repo — chôn mất 40 lỗi thật của đợt này. Không đụng năm skill `v9-*` (viết tay, đang
    track) dưới cùng thư mục cha.
  - `apps/staff/test-setup.ts` thêm vào `include` của `apps/staff/tsconfig.json` (cùng chỗ với
    `vite.config.ts`, cùng tiền lệ "tooling file ở root package, không phải code ứng dụng"). Thiếu
    dòng này thì `parserOptions.projectService` không tìm thấy file thuộc dự án TS nào, ném lỗi
    parse `no-undef` giả.
  - Một khối `languageOptions.globals` riêng cho `apps/staff/scripts/**/*.mjs` (Node 22 chạy ngoài
    trình duyệt, không khớp block globals nào có sẵn) — thay vì rải `eslint-disable` từng dòng cho
    `fetch`/`WebSocket`/`setTimeout`/`console`/`process`/`Buffer`.
  - 16 cảnh báo `no-console` đi kèm (`console.log` trong 6 file `.mjs` trên) sửa bằng
    `console.warn`, theo đúng convention output-report đã có ở `scripts/seed-dev.ts`,
    `packages/db/scripts/migrate.ts`, `apps/api/scripts/bench.ts` — không tắt rule.
  - `./node_modules/.bin/prettier --write` cho 6 file `.mjs` trên (chưa từng qua prettier) cộng
    `DESIGN.md` (lệch format từ trước đợt này, gộp luôn vì cùng lệnh). **Không đụng**
    `.serena/project.yml` — file MCP Serena tự sinh lại, không phải nguồn do người viết, ngoài
    phạm vi đợt gate-fix.

  Đo tại đỉnh nhánh: `bun run typecheck` + `bun test` (498 pass / 0 fail / 47 file) +
  `bun run lint` (0 vấn đề) + `prettier --check .` (chỉ còn `.serena/project.yml` lệch, cố ý bỏ
  qua như trên) — bốn cổng xanh.

**Bài học công cụ đo — lặp lại lần thứ ba trong đợt này, nên là một LỚP lỗi, không phải ba sự cố
riêng lẻ:** `modal-submit-hit.mjs` từng chốt cứng toạ độ (nút dời chỗ → báo miss vô nghĩa),
`staff-table.mjs` từng chỉ soi `<table>` (hết bảng thì trả sớm, thành no-op), `vehicle-column.mjs`
từng chọn ô theo class `truncate` (bỏ class thì `rows=[]`). Cả ba đã sửa, nhưng mục "phát hiện
thêm" ở trên (chuỗi `"88px"` viết chết) là ca thứ tư của đúng lớp này: **mỗi lần hình dạng DOM đổi,
một probe cũ có thể trở nên mù mà không báo lỗi gì** — nó vẫn thoát mã 0, vẫn in ra một dòng trông
hợp lệ, chỉ là số hoặc điều kiện bên trong không còn khớp thực tế. Bản sao của bài học "công cụ đo
cũng phải bị đo" mà `docs/ROADMAP.md` đã ghi từ đợt hệ thị giác — lần này lộ ra ở phép đo hình học
DOM thay vì đếm class Tailwind, cùng nguyên nhân gốc: tin một con số vì nó _có vẻ_ được đo, mà không
kiểm proof nó còn đang đo đúng thứ nó tuyên bố.

## Nợ phát hiện thêm — đợt sửa cuối 2026-09-04

Bốn món chưa được ghi ở đâu trước đó, phát hiện khi review 26 commit của nhánh này.

- ⚠️ **Bug #2 (bảng `Nhân viên`) chỉ đóng dưới 768px — đúng ngay chỗ Task 10 đã sửa cho lịch.**
  `useLayoutVariant` đổi sang hình bảng ở `min-width: 768px`. Ở cửa sổ 768px: sidebar
  `md:w-[168px]` (`app-shell.tsx:61`) + `page-gutter` 1.25rem mỗi bên ở `≥768px`
  (`index.css:241`, `= 40px` hai bên) → vùng nội dung thật ≈ `768 - 168 - 40 = 560px`, trong khi
  bảng là `min-w-[640px]` (`staff-table.tsx:63`) → tràn ~80px, và cột hành động (cuối bảng) là cột
  bị đẩy ra ngoài khung nhìn trước tiên. Dải hỏng kéo dài tới cửa sổ ≈848px (điểm mà vùng nội dung
  vừa đúng 640px) — **ba kích thước iPad dọc phổ biến 768/810/834 nằm TRỌN trong dải đó**.

  Không phải hồi quy của đợt này — hành vi này có từ trước. Nhưng đây đúng LOẠI sai lầm mà Task 10
  đã sửa cho lịch (đo bề rộng CỬA SỔ trong khi ràng buộc thật là bề rộng VÙNG NỘI DUNG, xem
  `use-layout-variant.ts` và chú thích "vì sao ở đây dùng cửa sổ là ĐÚNG" — đúng cho hình dạng
  trang, sai cho bảng vì bảng bị sidebar ăn bớt chỗ). `staff-table.mjs` chỉ probe ở 390 và 1280px
  (`staff-table.mjs:25`) nên cả hai đều lọt qua dải hỏng. Cách kiểm rẻ: thêm bề rộng 834 vào mảng
  `W` của probe.

- ⚠️ **Lịch có thể bắn hai `GET /rentals` mỗi lần mount ở ≥768px — suy luận từ code, CHƯA ĐO.**
  `useCalendarDayCount` (`rental-calendar.tsx:180`) đọc `gridRef.current` trong `getSnapshot`; lần
  render đầu ref còn `null` nên hàm trả cứng `7` (`rental-calendar.tsx:193`) → `gridWindow` tính từ
  7 ngày → `rentalsQuery(gridWindow.from, gridWindow.to)` bắn ngay với `queryKey` đó. Sau khi mount,
  `ResizeObserver` đo được bề rộng lưới thật, `dayCountForWidth` trả về số khác (10 hoặc 14 ở
  ≥768px) → `gridWindow` đổi → `queryKey` đổi → React Query bắn round hai, kết quả round đầu bị
  vứt.

  Mâu thuẫn với chính lý lẽ ở `calendar-timeline.tsx:33–39`: đoạn đó loại bỏ phương án "component tự
  báo số ngày ưa thích lên cho parent" **VÌ** nó tạo đúng một round-trip y hệt (mount sai số ngày →
  báo lên → parent fetch lại đúng khoảng → mount lại). Cách đã chọn tưởng tránh được round-trip đó
  nhưng tái tạo lại nó ở một chỗ khác — `getSnapshot` trả `7` khi `gridRef.current` còn `null` thay
  vì trả thẳng giá trị đúng ngay từ đầu.

  Kiểm rẻ, chưa làm: mở tab Network khi vào `/calendar` ở 1280px, đếm số request `GET /rentals`
  ngay sau khi trang mount.

- ⚠️ **Minor T2 — `Modal` áp `flex flex-col` cho CẢ HAI nhánh (có/không `footer`).** Nhánh không
  `footer` (`ui/modal.tsx:338`) đổi hành vi layout của panel từ block sang flex column so với trước
  khi có `footer`, dù `children(close)` được render y hệt cũ. Hôm nay tương đương với ba caller
  hiện có (`app-nav.tsx`, `rental-form.tsx`, `rental-detail-sheet.tsx`) vì mỗi caller đều bọc nội
  dung trong đúng MỘT `<div>` gốc, nên flex-col chỉ có một item và không đổi gì thấy được. Test hiện
  có chỉ kiểm className panel _chứa_ `overflow-y-auto`, không kiểm layout của children — không gác
  được ca này. Bẫy ngủ: một caller tương lai không truyền `footer` mà `children` trả về nhiều phần
  tử anh em (không bọc trong một root) sẽ lệch layout theo hướng flex column ngoài ý muốn.

- ⚠️ **Minor T4 — `clamp(v, MIN_EDGE_PX, size - MIN_EDGE_PX)` đảo chiều nếu cạnh nhỏ hơn
  `2 * MIN_EDGE_PX`.** Ở `modal-submit-hit.mjs:58,62–63` và `sheet-actions.mjs` tương tự,
  `MIN_EDGE_PX = 3`; nếu `r.width` hoặc `r.height < 6`, `lo (= 3) > hi (= size - 3)`, và
  `clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)` trả về `hi` thay vì `lo` — điểm quét bị
  kéo lệch khỏi phía "cách mép ít nhất 3px" mà biến này định bảo đảm. Không xảy ra hôm nay:
  `min-h-11` (44px) áp toàn cục cho mọi phần tử tương tác nên không có nút nào nhỏ hơn 6px. Nhưng
  đây là một giả định ngầm không có guard — không có `assert`/comment nào ở chỗ khai `MIN_EDGE_PX`
  nói rõ nó chỉ đúng khi cạnh phần tử ≥ 6px.

Và sửa hai chỗ đã có: mục "`apps/staff` không có một test component nào" (đợt hệ thị giác) đã ghi
đúng **5 file**, không phải 6 như số đầu đợt nghiệm thu — xác nhận lại bằng `grep -rl
"@testing-library" apps/staff/src --include="*.test.ts*" | wc -l` ra đúng `5`, không cần sửa gì
thêm ở đó. Mục chuỗi `"88px"` viết chết trong `vehicle-column.mjs` xem ghi chú "Chưa xử lý" ngay
phía trên trong mục nợ đợt nghiệm thu 11 task.

## Nợ sinh ra từ đợt màn hình Đơn thuê (`staff-rentals-surface`, 2026-09-04)

- ⚠️ **`+07:00` viết cứng trong `toApiFrom`/`toApiTo` (`apps/staff/src/lib/rentals-list.ts`)** thay
  vì suy từ `SHOP_TIMEZONE`. Cố ý: `SHOP_TIMEZONE` là tên vùng IANA (`Asia/Ho_Chi_Minh`), không phải
  một độ lệch, và đổi tên vùng thành độ lệch trong trình duyệt cần `Intl` — quá nặng cho hai hàm
  chuyển `YYYY-MM-DD` sang mốc `date-time`. Việt Nam không có DST nên `+07:00` là hằng số đúng hôm
  nay, nhưng nợ vẫn còn: đổi múi giờ shop (nếu có chi nhánh ngoài VN) sẽ không tự phản ánh vào đây.
