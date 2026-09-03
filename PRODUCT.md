# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Khách thuê — hai nhóm, cùng một sản phẩm:**

- **Dân chơi mô tô phân khối lớn người Việt tại TP.HCM.** Biết xe, biết mình muốn con nào. Thuê để đi tour, đi phượt cuối tuần, hoặc chạy thử trước khi mua. Đánh giá shop qua chất lượng và tình trạng xe.
- **Khách du lịch nước ngoài.** Thường thuê ngắn ngày, không quen địa hình và luật giao thông Việt Nam, không đọc được tiếng Việt. Cần biết thủ tục giấy tờ trước khi tới nơi.

**Nhân sự vận hành shop** (dùng `apps/staff` cho vận hành, Directus cho dữ liệu gốc): vai trò `OWNER` và `STAFF`. `SALES` đã đặt chỗ trong hệ thống nhưng **chưa dùng** — chưa quyết vai trò đó làm gì.

**Nhân viên tự đăng ký, chủ shop duyệt.** Không ai phát tài khoản sẵn: người mới tự tạo tài khoản, rồi nằm ở trạng thái _chờ duyệt_ cho tới khi chủ shop đồng ý. Trong lúc chờ, họ đăng nhập được nhưng không xem được gì ngoài chính màn hình báo đang chờ — điều đó có chủ ý, để một người lạ đăng ký được không có nghĩa là vào được. Chủ shop cũng là người khoá tài khoản khi có người nghỉ việc, và **khoá là có hiệu lực ngay**, không đợi phiên đăng nhập cũ hết hạn.

**Chủ shop phát mã 6 số khi nhân viên không vào được email.** Đường quên-mật-khẩu bình thường gửi mã qua email, nhưng nhân viên shop ở đây dùng Zalo nhiều hơn email, và không phải lúc nào shop cũng đã có địa chỉ email gửi đi. Vì vậy chủ shop bấm một nút, đọc sáu con số cho nhân viên qua Zalo, và nhân viên nhập nó để đặt lại mật khẩu. Mã sống 10 phút, dùng được một lần, và sai quá năm lần thì chết — xin mã mới thì mã cũ mất hiệu lực ngay.

## Product Purpose

Hệ quản lý cho một shop cho thuê mô tô phân khối lớn ở TP.HCM: API, app vận hành cho chủ và nhân viên, site công khai cho khách, và Directus cho dữ liệu gốc.

Site công khai cho khách **xem mẫu xe và gửi yêu cầu thuê**. Khách **không tự chốt đơn** — yêu cầu đi vào hệ thống, nhân viên tiếp nhận và chốt thành đơn thuê thật trong `apps/staff`.

Thành công nghĩa là khách gửi được yêu cầu ngoài giờ làm việc và không bị bỏ sót, thay vì phải nhắn Zalo rồi chờ tới sáng.

## Positioning

Shop nhỏ, đội xe thật, giao xe tận nơi. Khác biệt không nằm ở giá mà ở việc khách **thấy đúng con xe mình sẽ nhận** — ảnh thật của từng chiếc, không phải ảnh catalogue của hãng.

_Lưu ý:_ web **không** hiển thị tình trạng còn trống theo thời gian thực. Khách gửi yêu cầu, nhân viên xác nhận xe và thời gian.

## Operating Context

**Cơ chế thuê đã xác nhận:**

- **Giữ giấy tờ tùy thân + đặt cọc tiền.** CCCD với khách Việt, hộ chiếu với khách nước ngoài.
- **Chụp ảnh tình trạng xe lúc giao và lúc nhận lại.** Đây là bằng chứng khi có tranh chấp xước xát — và là lý do hệ thống cần lưu trữ ảnh (MinIO, bucket `checkins`).
- **Giao xe tận nơi.** Shop mang xe tới khách sạn hoặc địa chỉ khách hẹn, không bắt khách tới cửa hàng.
- **Đơn vị thuê cơ bản là ngày**, không phải giờ.

**Phân vai công cụ nội bộ:**

- **Directus** — chỉ dữ liệu gốc: danh mục xe, ảnh, bảng giá. **Không** làm vận hành.
- **`apps/staff`** — vận hành hằng ngày: lịch đặt xe, thống kê, lên đơn và bàn giao xe (chụp ảnh giấy tờ, ký hợp đồng), quản lý khách hàng, tiếp nhận yêu cầu từ web.
- Xác thực cho `apps/staff` dùng **SuperTokens** self-host. Khách trên `apps/web` **không cần tài khoản** — bắt đăng nhập chỉ làm giảm số yêu cầu nhận được, mà yêu cầu chính là thứ web sinh ra để tạo.

**Bối cảnh kỹ thuật:** monorepo — `apps/api` (Bun + Elysia), `apps/web` (Next 16, SSG/ISR vì SEO quan trọng), `apps/staff` (Vite + TanStack, PWA). Chi tiết ở `docs/ARCHITECTURE.md`.

## Capabilities and Constraints

**Đã có — hạ tầng và phần lớn nghiệp vụ cốt lõi.** _Sửa 2026-09-03:_ bản trước ghi "chưa có nghiệp vụ", đúng ở thời điểm viết nhưng đã lạc hậu.

Hạ tầng: ba app chạy được đầu-cuối, type an toàn xuyên suốt từ API tới frontend, migration, lưu trữ ảnh, CI.

Nghiệp vụ đã chạy: danh mục xe và ảnh xe · tài khoản nhân viên, duyệt và đặt lại mật khẩu · khách hàng · đơn thuê kèm ràng buộc chống đặt trùng ở tầng database · yêu cầu thuê gửi từ web · ảnh bàn giao lúc giao và lúc nhận. `apps/staff` có lịch, thống kê, lên đơn, bàn giao, quản lý khách hàng và tiếp nhận yêu cầu; `apps/web` có trang chủ, danh sách xe, trang chi tiết xe và form gửi yêu cầu.

Chưa làm trong luồng này: chuyển một yêu cầu thành đơn thuê bằng một cú bấm (nhân viên đang gõ lại tay) và báo cho nhân viên khi có yêu cầu mới ngoài giờ. Tình trạng từng đợt ở `docs/ROADMAP.md`.

**Ràng buộc mang tính sống còn — chống đặt trùng.** Một chiếc xe không thể được đặt hai lần trong khoảng thời gian chồng nhau. Ràng buộc này đặt ở tầng database (exclusion constraint trên `(vehicle_id, tstzrange)`), không ở tầng ứng dụng.

Vì `apps/web` chỉ tạo _yêu cầu_, **nhân viên mới là người chạm vào ràng buộc này** khi chốt đơn trong `apps/staff` — không phải khách cuối. Va chạm vẫn xảy ra thật (hai yêu cầu cùng xe cùng khoảng ngày), chỉ là nó lộ ra với nhân viên chứ không với khách. Luật `23P01` → 409 vẫn bắt buộc.

> _Sửa 2026-08-05:_ bản đầu của tài liệu này ghi khách cuối chạm trực tiếp vào ràng buộc, vì lúc đó `apps/web` được thiết kế nhận đặt online đầy đủ. Người dùng đổi sang mô hình yêu cầu. Xem §1.1 của `docs/plans/2026-08-05-round2-directus-staff-design.md`.

**Ngôn ngữ:** tiếng Việt trước, tiếng Anh sau. Tiếng Anh **chưa** làm, nhưng khách du lịch nước ngoài là nhóm người dùng đã xác nhận — nên đây là nợ đã biết, không phải tính năng tùy chọn.

**Tiền:** VND, luôn là số nguyên đồng. Không có đơn vị phụ.

**Chưa quyết — đừng bịa:**

- Chính sách tính ngày thuê và bảng giá (thuê dài ngày có giá khác, nhưng cụ thể thế nào thì chưa chốt).
- Vai trò `SALES` làm gì.
- Có bảo hiểm hay không.
- Xử lý huỷ đơn và hoàn cọc thế nào.

## Brand Commitments

Tên: **V9 Motor Rental**.

**Shop CHƯA có logo và bộ nhận diện.** _Sửa 2026-09-03:_ bản trước ghi shop đã có nhận diện dùng ngoài đời và đặt "không được vẽ lại" thành ràng buộc bắt buộc. Người dùng xác nhận điều đó không đúng. Không có asset nhận diện nào để tôn trọng, nên dựng logo và hệ màu thương hiệu là việc **được phép làm** — nó thuộc bước dựng thế giới thị giác, không thuộc tài liệu này.

Người dùng đặt ràng buộc thị giác rõ khi khởi tạo dự án: hướng **moto-garage** — tối, nhiều ảnh, typography đậm. **Cấm** thẩm mỹ SaaS generic: gradient tím, Inter ở mọi nơi, card lồng card. Ghi lại nguyên văn ở đây vì nó là ràng buộc do người dùng đưa ra; việc dựng thế giới thị giác cụ thể thuộc về bước sau, không thuộc tài liệu này.

## Evidence on Hand

- **Ảnh xe thật của shop** — **chưa có.** _Sửa 2026-09-03:_ bản trước ghi "có, dùng được". Ảnh đang nằm trong Directus là ảnh giữ chỗ. Quyết định 2026-09-03: ảnh giữ chỗ phải **tự khai là ảnh giữ chỗ** — không mang tên một chiếc xe có thật, không mang alt mô tả một chiếc xe không tồn tại. Lý do nằm ở `docs/ROADMAP.md`: `honda-cb500x-01.png` từng là một bảng màu kiểm tra mang đúng tên, title và alt của một chiếc CB500X, và nó lọt tới trang render mà không hàng rào nào chặn.
- **Logo và nhận diện** — **chưa có**, xem §Brand Commitments.
- ⚠️ Hướng thị giác người dùng đặt là "tối, **nhiều ảnh**", nhưng hiện **không có ảnh thật nào** đứng sau hướng đó. Đây là khoảng cách đã biết giữa ý định và bằng chứng, không phải thứ được lấp bằng ảnh sinh ra.
- **Fanpage / Zalo đang chạy, có khách thật** — có. Web không được mâu thuẫn với nơi khách đang thực sự nhắn tin; nó là kênh thêm vào, không phải kênh thay thế.

**Chưa có, không được bịa:** testimonial, con số lượng khách, đánh giá sao, giải thưởng, số năm hoạt động, danh sách đối tác. Không có tài liệu nào trong repo chứng minh những thứ đó.

## Product Principles

1. **Chống đặt trùng là ràng buộc, không phải tính năng.** Nó nằm ở tầng dữ liệu và không được phép có đường vòng. Đơn thuê chỉ được tạo bởi nhân viên qua `apps/staff`, và luồng đó đi qua ràng buộc này.
2. **Khách thấy đúng chiếc xe mình sẽ nhận.** Ảnh thật của từng xe, tình trạng thật, không phải ảnh hãng. Đây là thứ shop nhỏ làm được mà chuỗi lớn không làm.
3. **Bằng chứng bảo vệ cả hai phía.** Ảnh lúc giao và lúc nhận tồn tại để bảo vệ khách khỏi bị đổ oan, chứ không chỉ để bảo vệ shop.
4. **Khách du lịch nước ngoài là người dùng thật, không phải trường hợp biên.** Thủ tục giấy tờ và tiếng Anh là nhu cầu đã xác nhận, chỉ là chưa tới lượt làm.
5. **Web không thay thế Zalo/Fanpage.** Khách vẫn nhắn tin, và điều đó ổn. Web tồn tại để khách **gửi được yêu cầu** lúc không ai trực, và để yêu cầu đó không bị trôi mất trong hộp tin nhắn.

## Accessibility & Inclusion

Hai nhóm khách không đọc chung một ngôn ngữ: người Việt và khách nước ngoài. Hiện chỉ có tiếng Việt. Mọi thứ phụ thuộc vào việc đọc hiểu tiếng Việt — thủ tục giấy tờ, điều khoản cọc — đều là rào cản đã biết đối với nhóm khách thứ hai.

Nội dung dùng nhiều ảnh, nên ảnh xe cần văn bản thay thế mô tả thật (loại xe, phân khối, tình trạng) chứ không phải tên file.
