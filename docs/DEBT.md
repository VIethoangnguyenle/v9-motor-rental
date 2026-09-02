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

- ⛔ **`apps/staff` không có một test component nào**, và repo không cài `happy-dom`/`jsdom`/
  `@testing-library`. Nghĩa là toàn bộ logic **đóng lớp phủ, nhịp hoạt ảnh, và chuyển động** của đợt
  này nằm ngoài mọi hàng rào tự động.

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
  Năm cái trên thì cần hạ tầng test DOM, đó là món nợ này.

  **Đừng đọc "439 test xanh" thành "chuyển động được canh".**

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
