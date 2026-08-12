# Sửa auth `apps/staff`, luật đặt tên, và tách component — design doc

Ngày 2026-08-13. Nối tiếp [`2026-08-10-staff-auth-design.md`](2026-08-10-staff-auth-design.md) —
doc đó là **bản ghi lịch sử của đợt auth** và **không được sửa**; doc này ghi đè phần nào thì nói rõ.

## 0. Tóm tắt cho người đọc vội

Đợt rà soát 2026-08-13 tìm ra ba lỗi trong luồng đăng nhập / đăng xuất / quên mật khẩu, cộng một
tính năng chưa có (đổi mật khẩu khi đã đăng nhập). Đợt này sửa cả bốn, và nhân đó chốt **hai quy
ước chưa từng được viết ra**: tên định danh bằng tiếng Anh, và frontend chia nhỏ thành component.

Sáu bước, tách được để review riêng. Bước sửa lỗi đứng **trước** mọi bước đổi tên — trộn một bug fix
vào một đợt rename 60 định danh thì không ai review nổi cái nào.

---

## 1. Ba lỗi được sửa — bằng chứng, không phải phỏng đoán

### 1.1 Nhánh `DISABLED` ở router là code chết

Người bị khoá đăng nhập xong bị đá về màn đăng nhập **không một lời giải thích**, và session không
bị dọn.

Chuỗi nhân quả, ba mắt xích đều đọc được:

| #   | Chỗ                                       | Điều gì xảy ra                                                                                                                         |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/api/src/plugins/staff-guard.ts:191` | `DISABLED` bị chặn **trước** ngoại lệ `/staff/me` — có chủ ý, comment ghi rõ. Nên `/staff/me` của người bị khoá luôn là `403 DA_KHOA`. |
| 2   | `apps/staff/src/lib/me.ts:29-33`          | `queryFn` gộp **mọi** `res.error` thành `null`. Mã lỗi bị vứt tại đây.                                                                 |
| 3   | `apps/staff/src/router.tsx:64`            | `if (!me) throw redirect({ to: "/dang-nhap" })` bắn trước, nên `router.tsx:67-72` không bao giờ chạy được.                             |

Hệ quả kéo theo: banner "Tài khoản của bạn đã bị khoá" (`dang-nhap.tsx:31`) và `validateSearch`
(`router.tsx:83`) là **UI chết** — không có đường nào tới được chúng. Và `await dangXuat()` ở nhánh
đó không chạy, nên session của người bị khoá nằm lại trong trình duyệt (vô hại vì API chặn, nhưng
trái với thiết kế).

Mã `CHUA_CO_HO_SO` (403, lớp bù trừ của `signUpPOST`) bị nuốt **cùng một kiểu** — cùng lỗ, sửa cùng lúc.

**Hai tài liệu đang mô tả sai hành vi thật**, phải sửa trong đợt này:

- `apps/staff/CLAUDE.md:107` kể nhánh này như đang chạy.
- `apps/api/src/plugins/staff-guard.ts:173` viết _"thông điệp 'đã bị khoá' không mất, chỉ tới sau một
  vòng đăng nhập"_ — API giữ đúng thông điệp đó, rồi frontend vứt đi.

Bằng chứng phía API là một test đã có và đang xanh:
`apps/api/src/plugins/staff-guard-thu-hoi.test.ts:280` khẳng định `code: "DA_KHOA"` sau khi đăng
nhập lại. Chạy 2026-08-13: 3 pass.

### 1.2 Không có màn đổi mật khẩu cho người đã đăng nhập

App có đúng 5 trang, không có `/doi-mat-khau`. Muốn đổi mật khẩu phải đi vòng qua `/quen-mat-khau`
— tức cần SMTP, hoặc phải xin OWNER phát mã. **Nhân viên không tự đổi được mật khẩu của mình.**

Đây cũng là lý do "đăng nhập lần đầu" không làm được: OWNER dựng bằng
`scripts/staff-bootstrap.ts` nhận mật khẩu tạm `DoiMatKhauNgay!1` (mặc định **nằm trong git**),
script chỉ `console.warn` "ĐỔI NGAY", và không có màn hình nào để đổi.

### 1.3 `dangXuat()` không dọn cache TanStack Query

`Session.signOut()` xoá session; `["me"]` và `["staff-users"]` vẫn nằm trong memory. `staleTime`
mặc định là 0 nên guard có refetch — rủi ro thấp, nhưng danh sách nhân viên của OWNER cũ còn trong
tab cho tới lần refetch.

Sửa bằng cách đổi **chữ ký**, không bằng cách dặn dò: `dangXuat(qc: QueryClient)` gọi
`qc.clear()` sau khi `Session.signOut()`. Nhận `QueryClient` qua tham số chứ không import singleton
— cùng lý lẽ với `createAppRouter` (`router.tsx:147`): hai `QueryClient` là hai cache, và guard dọn
nhầm cache thì không có lỗi nào ở đâu. Đổi chữ ký khiến cả bốn chỗ gọi (`router.tsx`, hai trang, và
trang đổi mật khẩu mới) **buộc** phải truyền nó vào, do compiler ép; component lấy từ
`useQueryClient()`, guard lấy từ `context.queryClient` vốn đã có sẵn.

---

## 2. Luật đặt tên

| Loại                           | Ngôn ngữ                            | Ví dụ                                      |
| ------------------------------ | ----------------------------------- | ------------------------------------------ |
| Component React                | **Anh**, PascalCase                 | `LoginForm`, `StaffTable`                  |
| Tên file                       | **Anh**, kebab-case, khớp component | `login-form.tsx`                           |
| Hàm · biến · type · hằng       | **Anh**                             | `signIn()`, `isSubmitting`, `MAX_ATTEMPTS` |
| URL route (cả hai frontend)    | **Anh**                             | `/login`, `/forgot-password`               |
| Mã lỗi trong hợp đồng API      | **Anh**                             | `ACCOUNT_DISABLED`                         |
| Comment · doc · chuỗi hiển thị | **Việt**                            | giữ nguyên                                 |

Dòng cuối không phải ngoại lệ tiện tay. Repo này có khoảng 2000 dòng comment tiếng Việt giải thích
_vì sao_, và `CLAUDE.md` gốc gọi tài liệu là "deliverable ngang hàng với code". UI thì `CLAUDE.md`
đã chốt "tiếng Việt trước, tiếng Anh sau". Dịch chúng là phá đúng thứ có giá trị nhất trong repo.

Luật này **đóng** dòng nợ "Tên hàm tiếng Việt/Anh lẫn lộn trong `apps/api/src/services/`" trong
[`../DEBT.md`](../DEBT.md), vốn ghi rõ: _"Cần chốt một hướng rồi đổi một lượt, không sửa lẻ tẻ."_

### ⚠️ Luật này KHÔNG ép được bằng máy

Không linter nào kiểm được "tên phải là tiếng Anh". Repo này đếm được **bốn lần** hàng rào suy thoái
im lặng, nên phải nói thẳng: đây là **quy ước trong tài liệu**, không phải ràng buộc do máy ép — đúng
loại "cấu hình local vs ranh giới repo ép" mà `CLAUDE.md` gốc phân biệt.

Ép được đúng một nửa (kebab-case tên file) bằng `filename-case` của `eslint-plugin-unicorn`. **Cố ý
để ngoài đợt này**: đụng `eslint.config.js` là phải chạy lại bốn probe của skill `v9-fences` và đọc
tên luật trong thông báo lỗi — một việc riêng, không ghép vào đây.

---

## 3. Cấu trúc component `apps/staff`

Hiện tại: **0 thư mục component**. Sáu file page, mỗi file tự dựng form, tự quản `dangGui`/`loi`,
tự viết `<label><input>`. `nhan-vien.tsx` 5.3K, `quen-mat-khau.tsx` 5.5K.

```
src/
  components/
    ui/         text-field.tsx · submit-button.tsx · alert.tsx · page-shell.tsx
    auth/       login-form.tsx · signup-form.tsx · request-code-form.tsx
                reset-password-form.tsx · change-password-form.tsx
    staff/      staff-table.tsx · staff-row-actions.tsx · reset-code-notice.tsx
    layout/     app-nav.tsx
  hooks/        use-me.ts
  lib/          api.ts · auth.ts · errors.ts · me.ts · guard-decision.ts
  pages/        login-page.tsx · signup-page.tsx · forgot-password-page.tsx
                change-password-page.tsx · pending-approval-page.tsx
                staff-list-page.tsx · health-page.tsx
  router.tsx · main.tsx
```

Ranh giới giữa hai tầng component: `ui/` **không biết gì về domain** (không import `lib/api`,
không biết `Me` hay `StaffRole` là gì) — đó là điều kiện để chúng dùng lại được ở bốn màn hình
nghiệp vụ sắp làm (lịch · thống kê · bàn giao · khách hàng).

**Bỏ state `dangGui`/`loi` cuộn tay, dùng `useMutation`.** Không phải abstraction mới:
`nhan-vien.tsx` đã dùng `useMutation` rồi, còn năm chỗ kia cuộn tay cùng một mẫu
(`setDangGui(true)` → await → `setDangGui(false)` → `setLoi(...)`). Đây là gom về pattern đã có
trong app, không phải thêm pattern thứ hai.

`AppNav` hiện chôn trong `health.tsx`. Tách ra thì `/staff` và `/change-password` cũng có nav —
hiện `/nhan-vien` đang tự chế một link "← Trang chủ" vì không có nav dùng chung.

---

## 4. Sửa lỗi 1.1 — rút quyết định của guard thành hàm thuần

### 4.1 `MeResult`: giữ mã lỗi thay vì nuốt

`lib/me.ts` đổi kiểu cache từ `Me | null` sang union:

```ts
export type MeResult = { ok: true; me: Me } | { ok: false; code: string | null };
```

Component **không** đọc union trực tiếp — chúng dùng hook `useMe()` trả `Me | null`, nên ba trang
đang viết `me?.role` không phải sửa gì. Một fetch, một cache, một nguồn sự thật: đúng ràng buộc mà
comment ở `me.ts:18-20` đặt ra và đợt này giữ nguyên.

`useMe(options?)` phải cho truyền tiếp option xuống `useQuery` — trang chờ duyệt đang dùng
`refetchInterval: 15_000` để tự nhảy khi OWNER bấm duyệt ở máy khác (`cho-duyet.tsx:10`), và hook
nào không nhận option sẽ giết mất tính năng đó.

### 4.2 `lib/guard-decision.ts` — hàm thuần, test được

```ts
export type LoginReason = "disabled" | "no-profile" | "password-changed";

export type EntryDecision =
  | { type: "allow"; me: Me }
  | { type: "redirect"; to: string; reason?: LoginReason }
  | { type: "signOutThenRedirect"; to: string; reason: LoginReason };

export function decideEntry(hasSession: boolean, result: MeResult | null): EntryDecision;
```

Bảy ca, theo thứ tự:

| #   | Điều kiện                              | Quyết định                                        |
| --- | -------------------------------------- | ------------------------------------------------- |
| 1   | `!hasSession`                          | `redirect /login`                                 |
| 2   | `!ok` và `code === "ACCOUNT_DISABLED"` | `signOutThenRedirect /login`, reason `disabled`   |
| 3   | `!ok` và `code === "NO_PROFILE"`       | `signOutThenRedirect /login`, reason `no-profile` |
| 4   | `!ok`, mã khác hoặc `null`             | `redirect /login`, **không** signOut              |
| 5   | `me.status === "PENDING"`              | `redirect /pending-approval`                      |
| 6   | `me.status === "DISABLED"`             | `signOutThenRedirect /login`, reason `disabled`   |
| 7   | còn lại                                | `allow`                                           |

**Ca 4 cố ý không signOut.** `code === null` gộp cả "mạng chết" — huỷ một session còn hợp lệ vì wifi
chớp một cái là hỏng theo chiều sai. Chỉ signOut khi server **nói rõ** tài khoản không dùng được nữa.

**Ca 6 hôm nay không tới được** (API chặn `DISABLED` trước ngoại lệ `/staff/me`, xem §1.1). Giữ lại
có chủ ý: nếu ngày nào đó ngoại lệ `/staff/me` đổi, đây là chỗ đúng để xử lý — và giờ nó **có test**,
nên tính không-tới-được của nó là một tính chất của API, không phải một lỗi im lặng như hôm nay.

### 4.3 Test — không thêm hạ tầng test nào

File `apps/staff/src/lib/guard-decision.test.ts`, chạy bằng `bun test` ở root (đã tự quét đệ quy).
**Không** thêm happy-dom, không thêm testing-library, không thêm vitest: đây là quyết định riêng,
không ghép vào đợt này.

Điều kiện để chạy được: `guard-decision.ts` **chỉ được `import type`**, không import giá trị. Import
`./me` ở dạng giá trị sẽ kéo theo Eden client và `@v9/api`. Cùng lý lẽ với luật "`src/domain/**`
không được import bất cứ gì" của `packages/shared` — hàm thuần thì test không cần dựng gì cả.

Đây là **lý do lỗi 1.1 sống sót qua review**: hàng rào ở `beforeLoad` — thứ chính `apps/staff/CLAUDE.md`
gọi là "toàn bộ cơ chế phân quyền của app" — chưa được chạy thử lần nào. Viết test **trước** (TDD),
vì đây là logic thuần chứ không phải UI.

### 4.4 Search param

`ly_do` → `reason`, union ba giá trị: `disabled` · `no-profile` · `password-changed`.
`validateSearch` vẫn lọc trắng danh sách — query string là dữ liệu người dùng gõ được.

---

## 5. `POST /staff/password/change` và trang `/change-password`

### 5.1 Hợp đồng

```
POST /staff/password/change      (cần session + ACTIVE)
body  { currentPassword: string(min 8), newPassword: string(min 8) }
200   { ok: true }
400   { message, code }   WRONG_CURRENT_PASSWORD · SAME_PASSWORD · WEAK_PASSWORD · NOT_FOUND
401/403                   do guard, không do route
```

**Không đụng một dòng nào trong `staff-guard.ts`.** Route mới không nằm trong danh sách công khai
nên mặc-định-chặn đã phủ nó, và nó cũng không nằm trong `SESSION_ONLY_ROUTES` nên tự động đòi
`ACTIVE`. Đó chính là điều plugin đó sinh ra để làm — thêm route mà không phải nhớ bật bảo vệ.

### 5.2 Xác minh mật khẩu cũ

Dùng `EmailPassword.verifyCredentials("public", email, password)` (supertokens-node 24.0.3,
`{ status: "OK" | "WRONG_CREDENTIALS_ERROR" }`). Chọn nó thay vì `signIn` vì nó **không tạo session**
và không kéo theo các overload account-linking — đúng nghĩa "chỉ kiểm mật khẩu".

Thêm đúng một dep vào `PasswordResetDeps`; hai dep đặt mật khẩu mới (`createResetToken` +
`resetPasswordWithToken`) **dùng lại nguyên** đường đã có. Nhờ vậy chính sách mật khẩu vẫn nằm đúng
một chỗ ở SuperTokens — không nhân bản sang tầng này, hai bản luật sẽ lệch ở lần đầu một trong hai
được sửa.

Thứ tự trong service:

1. `newPassword === currentPassword` → `SAME_PASSWORD`. Kiểm **trước** mọi thứ khác: rẻ hơn argon2
   (~115 ms) và tránh thu hồi session cho một thay đổi không có thật.
2. `verifyPassword` → `WRONG_CURRENT_PASSWORD`.
3. `createResetToken` → `NOT_FOUND` nếu không OK (hàng `staff_users` còn, user SuperTokens đã mất).
4. `resetPasswordWithToken` → `WEAK_PASSWORD` nếu không OK.
5. `revokeAndStamp` (§5.3).

⚠️ Bước 2 đọc `staff.email`, mà theo ADR ① thì cột đó là **bản sao** — nguồn sự thật ở SuperTokens.
Hai bên lệch nhau thì `verifyCredentials` trả `WRONG_CREDENTIALS_ERROR` và người dùng bị chặn đổi
mật khẩu. Hỏng theo chiều đóng, chấp nhận được, nhưng phải biết trước để không đi debug nhầm chỗ.

### 5.3 ⚠️ Chỗ thứ ba thu hồi session — biến bất biến-phải-nhớ thành bất biến-do-máy-ép

Skill `v9-auth` gọi đây là bất biến dễ vỡ nhất của repo:

> Hễ thu hồi session thì phải đóng dấu `sessions_invalid_before`. […] Hiện có đúng hai chỗ gọi cặp
> này. **Thêm chỗ thứ ba mà quên đóng dấu là thủng lại y như cũ, và không có gì báo.**

Route này là chỗ thứ ba. Nên đợt này **gộp cặp đó thành một hàm** trong `services/staff.ts`:

```ts
export async function revokeAndStamp(
  deps: SessionRevokeDeps,
  userId: string,
): Promise<Date | null> {
  await deps.revokeSessions(userId); // refresh token chết ở core
  return stampSessionRevocation(userId); // access token đang cầm chết ở request kế tiếp
}
```

`stampSessionRevocation` (tên mới của `dongDauThuHoiSession`) **thôi export** — chỉ còn nội bộ
module. Không test nào đang import nó trực tiếp, nên gỡ export là an toàn. Hai chỗ cũ (`disableStaff`,
`resetPasswordWithCode`) đổi sang gọi `revokeAndStamp`.

Sau thay đổi này, gọi được nửa nguy hiểm mà quên nửa kia là chuyện **không viết ra được nữa** —
thay vì một comment dặn người sau đừng quên. Thứ tự trong hàm (revoke trước, đóng dấu sau) giữ
nguyên và giữ nguyên comment giải thích: chết giữa hai lời gọi theo thứ tự này để lại "refresh chết,
access sống ≤1 giờ"; thứ tự ngược lại để lại "access chết, refresh sống" — refresh một lần là có
token cấp sau mốc, tức sống mãi.

### 5.4 Trang

`/change-password` treo dưới nhánh `duocBaoVe`. Đổi xong **bị đăng xuất** (hệ quả bắt buộc của
revoke) → `/login?reason=password-changed`, banner: "Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới."
Nói thẳng thay vì giả vờ giữ phiên — người dùng bị đá ra mà không hiểu vì sao là tệ hơn.

Link vào từ `AppNav`.

---

## 6. Bảng đổi tên đầy đủ

### 6.1 `apps/staff` — trang và route

| File cũ                   | File mới                          | Component                                | URL cũ           | URL mới             |
| ------------------------- | --------------------------------- | ---------------------------------------- | ---------------- | ------------------- |
| `pages/dang-nhap.tsx`     | `pages/login-page.tsx`            | `DangNhapPage` → `LoginPage`             | `/dang-nhap`     | `/login`            |
| `pages/dang-ky.tsx`       | `pages/signup-page.tsx`           | `DangKyPage` → `SignupPage`              | `/dang-ky`       | `/signup`           |
| `pages/quen-mat-khau.tsx` | `pages/forgot-password-page.tsx`  | `QuenMatKhauPage` → `ForgotPasswordPage` | `/quen-mat-khau` | `/forgot-password`  |
| `pages/cho-duyet.tsx`     | `pages/pending-approval-page.tsx` | `ChoDuyetPage` → `PendingApprovalPage`   | `/cho-duyet`     | `/pending-approval` |
| `pages/nhan-vien.tsx`     | `pages/staff-list-page.tsx`       | `NhanVienPage` → `StaffListPage`         | `/nhan-vien`     | `/staff`            |
| `pages/health.tsx`        | `pages/health-page.tsx`           | `HealthPage` (giữ)                       | `/`              | `/`                 |
| —                         | `pages/change-password-page.tsx`  | `ChangePasswordPage` (mới)               | —                | `/change-password`  |

Route object: `congKhai`→`publicLayoutRoute` · `duocBaoVe`→`protectedLayoutRoute` ·
`dangNhapRoute`→`loginRoute` · `dangKyRoute`→`signupRoute` · `quenMatKhauRoute`→`forgotPasswordRoute` ·
`choDuyetRoute`→`pendingApprovalRoute` · `trangChuRoute`→`homeRoute` · `nhanVienRoute`→`staffListRoute`.
Route `id`: `"cong-khai"`→`"public"` · `"duoc-bao-ve"`→`"protected"`.

### 6.2 `apps/staff` — lib

| Cũ                                               | Mới                                                         |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `lib/loi.ts`                                     | `lib/errors.ts`                                             |
| `LoiApi` · `docLoi` · `thongDiepLoi` · `maLoi`   | `ApiError` · `parseApiError` · `errorMessage` · `errorCode` |
| `dangNhap` · `dangKy` · `dangXuat` · `coSession` | `signIn` · `signUp` · `signOut` · `hasSession`              |
| `layMe`                                          | `ensureMe`                                                  |
| `initAuth` · `Me` · `meQuery` · `api`            | giữ nguyên (đã tiếng Anh)                                   |

Biến cục bộ trong component đổi theo cùng luật: `loi`→`error` · `dangGui`→(thay bằng
`mutation.isPending`) · `buoc`→`step` · `matKhauMoi`→`newPassword` · `ghiChu`→`notice` ·
`thoat`→`handleSignOut` · `guiYeuCau`→`requestCode` · `xacNhan`→`confirmReset` ·
`dsNhanVien`→`staffQuery` · `lamMoi`→`invalidateStaff` · `dangChay`→`isMutating` ·
`ROLE_KHI_DUYET`→`ROLE_ON_APPROVE` · `TRUONG`→`FIELDS` · `nhan`→`label` · `batBuoc`→`required`.

### 6.3 `apps/api` và `packages/shared`

| File                         | Cũ → Mới                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/password-reset.ts` | `HAN_DUNG_MS`→`CODE_TTL_MS` · `SO_LAN_TOI_DA`→`MAX_ATTEMPTS` · `sinhMaNgauNhien`→`generateRandomCode` · `sinhMa`→`generateCode` · `taoMaDatLaiMatKhau`→`createResetCode` · `KetQuaKiemTra`→`VerifyCodeResult` · `kiemTraMa`→`verifyCode` · `timStaffTheoEmail`→`findStaffByEmail` · `KetQuaDoiMatKhau`→`ResetPasswordResult` · `doiMatKhauBangMa`→`resetPasswordWithCode` |
| `PasswordResetDeps`          | `taoTokenDatLai`→`createResetToken` · `doiMatKhauBangToken`→`resetPasswordWithToken` · thêm `verifyPassword`                                                                                                                                                                                                                                                              |
| `services/staff.ts`          | `dongDauThuHoiSession`→`stampSessionRevocation` (thôi export) · thêm `revokeAndStamp`                                                                                                                                                                                                                                                                                     |
| `services/email.ts`          | `emailDaCauHinh`→`isEmailConfigured` · `guiMaDatLaiMatKhau`→`sendResetCodeEmail`                                                                                                                                                                                                                                                                                          |
| `plugins/staff-guard.ts`     | `CONG_KHAI`→`PUBLIC_ROUTES` · `CAN_SESSION_KHONG_CAN_ACTIVE`→`SESSION_ONLY_ROUTES` · `khop`→`matchesRoute` · `Phien`→`SessionInfo` · `docIat`→`readIat` · `docSession`→`readSession` · `tokenDaBiThuHoi`→`isTokenRevoked` · `iatGiay`→`iatSeconds` · `mocThuHoi`→`revokedAt`                                                                                              |
| `routes/staff.ts`            | `loiSchema`→`errorSchema` · `hoSoCongKhai`→`toPublicProfile` · `THONG_DIEP`→`MESSAGES` · `MA_HTTP`→`HTTP_STATUS` · `LyDo`→`Reason` · `LyDoQuyen`→`PermissionReason` · `LyDoMatKhau`→`PasswordReason` · `loi()`→`toError()` · `responseQuanTri`→`adminResponses` · `THIEU_QUYEN`→`FORBIDDEN_BODY`                                                                          |

### 6.4 Mã lỗi — hợp đồng API

| Cũ                   | Mới                 |     | Cũ                    | Mới                    |
| -------------------- | ------------------- | --- | --------------------- | ---------------------- |
| `CHUA_DANG_NHAP`     | `NOT_AUTHENTICATED` |     | `KHONG_PHAI_OWNER`    | `NOT_OWNER`            |
| `PHIEN_HET_HIEU_LUC` | `SESSION_EXPIRED`   |     | `TU_DUYET_MINH`       | `CANNOT_APPROVE_SELF`  |
| `DA_KHOA`            | `ACCOUNT_DISABLED`  |     | `KHONG_CHO_DUYET`     | `NOT_PENDING`          |
| `CHUA_CO_HO_SO`      | `NO_PROFILE`        |     | `TU_KHOA_MINH`        | `CANNOT_DISABLE_SELF`  |
| `CHO_DUYET`          | `PENDING_APPROVAL`  |     | `OWNER_CUOI_CUNG`     | `LAST_OWNER`           |
| `THIEU_QUYEN`        | `FORBIDDEN`         |     | `MA_SAI`              | `WRONG_CODE`           |
| `KHONG_TIM_THAY`     | `NOT_FOUND`         |     | `MA_HET_HIEU_LUC`     | `CODE_EXPIRED`         |
| `MAT_KHAU_YEU`       | `WEAK_PASSWORD`     |     | `CHUA_CAU_HINH_EMAIL` | `EMAIL_NOT_CONFIGURED` |

Thêm mới: `WRONG_CURRENT_PASSWORD` · `SAME_PASSWORD`.

Phần lớn được **compiler ép**: `satisfies Record<Reason, string>` trong `routes/staff.ts` nổ ngay
nếu domain thêm/đổi một reason mà quên dịch. Đó là lý do đổi tên loạt này an toàn hơn vẻ ngoài.

### 6.5 ⚠️ Hai chỗ đổi tên hỏng IM LẶNG — compiler không bắt

Cả hai đều là chuỗi so trần, và cả hai đều phải kiểm bằng cách chạy thật.

**(a) `maLoi(...) === "CHUA_CAU_HINH_EMAIL"`** — `quen-mat-khau.tsx:41`. Đổi mã ở API mà quên chỗ
này thì điều kiện thành **không bao giờ đúng**, người dùng mất câu hướng dẫn "nhắn chủ shop lấy mã"
đúng lúc họ cần nó nhất, và không có lỗi nào ở đâu.
_Sửa gốc_: export union mã lỗi từ `apps/api` để frontend so theo kiểu, không so chuỗi tự do.

**(b) `hoTen` / `soDienThoai` là contract wire của SuperTokens formField**, nối ba file:
`apps/staff/src/lib/auth.ts:63-64` · `apps/staff/src/pages/dang-ky.tsx:11-12` ·
`apps/api/src/plugins/auth.ts:49` (và đọc lại ở `:113-114`). Đây là chuỗi khớp lúc chạy — không có
compile check nào. Đổi lệch một đầu thì **đăng ký vẫn 200** nhưng `fullName` rơi về `"(chưa đặt tên)"`.
Đổi sang `fullName` / `phone` (khớp `staffSchema` vốn đã dùng hai tên đó), **cả ba chỗ trong cùng
một commit**, và verify bằng một lần đăng ký thật.

---

## 7. Sáu bước

> **Đọc §4–§6 như trạng thái CUỐI, không phải trạng thái tại từng bước.** Mọi tên tiếng Anh ở trên
> (`ACCOUNT_DISABLED`, `/login`, `signOut`) chỉ có mặt sau bước 4–5. Bước 2 làm cùng logic đó nhưng
> với tên còn tiếng Việt (`DA_KHOA`, `/dang-nhap`, `dangXuat`) — rồi bước 4–5 đổi tên nó cùng với
> phần còn lại. Nhầm chỗ này sẽ dẫn tới một bước 2 không biên dịch được.
>
> Đây cũng chính là minh hoạ cho §6.5(a): `decideEntry` so mã lỗi bằng chuỗi, nên nó **phải** đổi ở
> bước 5 và compiler sẽ không nhắc. Vì vậy bước 5 làm luôn việc export union mã lỗi từ `apps/api` —
> sau đó chỗ so sánh này được kiểu ép, và lần đổi tên sau không còn im lặng nữa.

| #   | Việc                                                                                          | Loại            |
| --- | --------------------------------------------------------------------------------------------- | --------------- |
| 1   | Chốt luật đặt tên: `CLAUDE.md` gốc (1 dòng) + `apps/staff/CLAUDE.md` (mục cấu trúc component) | doc             |
| 2   | Sửa 1.1 + 1.3: `MeResult`, `decideEntry` + test, đăng xuất dọn cache                          | **đổi hành vi** |
| 3   | Tách component `apps/staff` (§3)                                                              | refactor thuần  |
| 4   | Đổi tên `apps/staff` + URL (§6.1, §6.2)                                                       | rename thuần    |
| 5   | Đổi tên `apps/api` + `packages/shared` + mã lỗi (§6.3, §6.4)                                  | rename thuần    |
| 6   | `/change-password` + `revokeAndStamp` + bootstrap/`.env.example` + sửa doc                    | tính năng       |

Bước 2 giữ tên tiếng Việt **có chủ ý** — nó là bước duy nhất đổi hành vi, và diff của nó phải đọc
được mà không lẫn với 60 định danh đổi tên. Bước 6 viết mới hoàn toàn bằng quy ước mới, không phải
viết tiếng Việt rồi đổi.

Bước 4 và 5 dùng Serena `rename_symbol`, **không** dùng find-and-replace: `CLAUDE.md` gốc bắt buộc
`find_referencing_symbols` trước khi đổi tên exported symbol. Blast radius đã đo 2026-08-13 —
mỗi page component có đúng 1 caller (`router.tsx`), `dangXuat` có 5 caller trong 3 file, `Me` không
ai import ngoài `me.ts`; không có tham chiếu chéo workspace.

### Bootstrap và `.env.example` (trong bước 6)

`scripts/staff-bootstrap.ts` **ném lúc khởi động** nếu `NODE_ENV=production` mà thiếu
`STAFF_OWNER_PASSWORD`. Theo đúng tiền lệ đã có ở `apps/api/src/env.ts:33` (ném khi `AUTH_DEV_OTP`
xuất hiện ở production): cấu hình không an toàn thì app không lên, chứ không phải một comment dặn dò.
Mặc định `DoiMatKhauNgay!1` giữ lại cho dev.

`.env.example` hiện chỉ khai `STAFF_OWNER_EMAIL` (dòng 87) — thêm `STAFF_OWNER_PASSWORD` và
`STAFF_OWNER_NAME` kèm cảnh báo.

### Tài liệu phải sửa (bước 6)

- `CLAUDE.md` gốc — luật đặt tên.
- `apps/staff/CLAUDE.md` — mục xác thực (URL mới, "năm màn hình"→sáu, dòng 107 đang nói sai), mục
  cấu trúc component.
- `apps/api/CLAUDE.md` — bảng mã lỗi, seam auth, route mới.
- `.claude/skills/v9-auth/SKILL.md` — tên hàm ở mục "bất biến dễ vỡ nhất" (giờ là `revokeAndStamp`),
  lệnh curl.
- `docs/DEBT.md` — đóng dòng "tên VN/EN lẫn lộn".
- `docs/plans/2026-08-10-staff-auth-{design,plan}.md` — **KHÔNG sửa nội dung**. Chúng là bản ghi lịch
  sử của một quyết định đã ra. Thêm đúng một dòng ở đầu trỏ sang doc này.

---

## 8. Tiêu chí xong

Không tiêu chí nào được tuyên bố đạt nếu chưa chạy lệnh và đọc output.

| #   | Tiêu chí                           | Cách verify                                                                                       |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `decideEntry` đúng cả 7 ca         | `bun test apps/staff/src/lib/guard-decision.test.ts`                                              |
| 2   | Người bị khoá thấy lý do           | disable một tài khoản → đăng nhập lại → thấy banner "đã bị khoá", không phải màn đăng nhập trống  |
| 3   | Đăng xuất dọn cache                | OWNER đăng xuất → nhân viên khác đăng nhập cùng tab → không thấy tên/danh sách của người trước    |
| 4   | Đổi mật khẩu chạy                  | đổi → bị đăng xuất → đăng nhập bằng mật khẩu mới → `200`; mật khẩu cũ → `WRONG_CREDENTIALS_ERROR` |
| 5   | Đổi mật khẩu giết token cũ         | giữ cookie cũ → `/staff/me` → **401**, không phải 200                                             |
| 6   | Sai mật khẩu cũ bị chặn            | `WRONG_CURRENT_PASSWORD`, và mật khẩu **không** đổi                                               |
| 7   | Route mới được guard phủ           | `POST /staff/password/change` không cookie → **401** `NOT_AUTHENTICATED`                          |
| 8   | Đăng ký vẫn đúng tên (§6.5b)       | đăng ký thật → `staff_users.full_name` đúng tên đã gõ, không phải `"(chưa đặt tên)"`              |
| 9   | Bootstrap chặn prod thiếu mật khẩu | `NODE_ENV=production bun run staff:bootstrap` không có `STAFF_OWNER_PASSWORD` → **ném**           |
| 10  | Toàn bộ xanh                       | `bun test` · `bun run typecheck` (**cả hai nửa**) · `bun run lint`                                |
| 11  | Hàng rào kiến trúc còn hiệu lực    | bốn probe của skill `v9-fences`, **đọc tên luật** trong lỗi                                       |

Tiêu chí 5 là quan trọng nhất về mặt an toàn: nó chứng minh `revokeAndStamp` làm đủ **cả hai** vế.
Chỉ `revokeSessions` thôi thì `/staff/me` với cookie cũ vẫn trả **200** — đã đo 2026-08-11, số đo
còn nguyên trong comment ở `password-reset.ts:278-283`.

Tiêu chí 11 không phải thủ tục: đợt này thêm thư mục code mới (`components/`, `hooks/`) vào
`apps/staff`, và `CLAUDE.md` gốc ghi rõ thêm thư mục là một trong các dịp `eslint-plugin-boundaries`
suy thoái im lặng.

---

## 9. Không làm đợt này

- **Ép đổi mật khẩu lần đầu** (`must_change_password` + migration + nhánh guard). Chạm ADR `v9-auth`
  và schema — cần brainstorm nghiệp vụ riêng. Đợt này chỉ làm cho việc đổi mật khẩu **có thể làm được**;
  ép làm là bước sau.
- **Hạ tầng test frontend** (happy-dom / testing-library). Đợt này test đúng phần logic thuần.
- **`filename-case` trong ESLint** — đụng `eslint.config.js`, việc riêng (§2).
- Năm món nợ trong [`../DEBT.md`](../DEBT.md): rate limit theo IP, email phân biệt hoa thường,
  timing oracle, dọn mã hết hạn. Route `/staff/password/change` **thêm một bề mặt argon2 nữa**
  (~115 ms/lời gọi) — nhưng sau session, không phải công khai, nên nó không làm món nợ rate-limit
  xấu đi theo cách có ý nghĩa.
