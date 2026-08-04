# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Khách thuê — hai nhóm, cùng một sản phẩm:**

- **Dân chơi mô tô phân khối lớn người Việt tại TP.HCM.** Biết xe, biết mình muốn con nào. Thuê để đi tour, đi phượt cuối tuần, hoặc chạy thử trước khi mua. Đánh giá shop qua chất lượng và tình trạng xe.
- **Khách du lịch nước ngoài.** Thường thuê ngắn ngày, không quen địa hình và luật giao thông Việt Nam, không đọc được tiếng Việt. Cần biết thủ tục giấy tờ trước khi tới nơi.

**Nhân sự vận hành shop** (dùng `apps/admin`): vai trò `OWNER` và `STAFF`. `SALES` đã đặt chỗ trong hệ thống nhưng **chưa dùng** — chưa quyết vai trò đó làm gì.

## Product Purpose

Hệ quản lý cho một shop cho thuê mô tô phân khối lớn ở TP.HCM, gồm ba phần: API, app quản trị nội bộ, và site công khai cho khách.

Site công khai **nhận đặt xe online đầy đủ** — khách tự chọn xe, chọn ngày, xem giá, đặt và nhận xác nhận mà không cần nhắn tin cho ai. Thành công nghĩa là khách chốt được đơn ngoài giờ làm việc, và nhân viên không phải chép tay đơn từ tin nhắn sang sổ.

## Positioning

Shop nhỏ, đội xe thật, giao xe tận nơi. Khác biệt không nằm ở giá mà ở việc khách **thấy đúng con xe mình sẽ nhận** — ảnh thật của từng chiếc, không phải ảnh catalogue của hãng — và biết chắc nó còn trống trong ngày mình cần.

## Operating Context

**Cơ chế thuê đã xác nhận:**

- **Giữ giấy tờ tùy thân + đặt cọc tiền.** CCCD với khách Việt, hộ chiếu với khách nước ngoài.
- **Chụp ảnh tình trạng xe lúc giao và lúc nhận lại.** Đây là bằng chứng khi có tranh chấp xước xát — và là lý do hệ thống cần lưu trữ ảnh (MinIO, bucket `checkins`).
- **Giao xe tận nơi.** Shop mang xe tới khách sạn hoặc địa chỉ khách hẹn, không bắt khách tới cửa hàng.
- **Đơn vị thuê cơ bản là ngày**, không phải giờ.

**Bối cảnh kỹ thuật:** monorepo ba app — `apps/api` (Bun + Elysia), `apps/admin` (Vite + TanStack, SPA nội bộ), `apps/web` (Next 16, SSG/ISR vì SEO quan trọng). Chi tiết ở `CLAUDE.md`.

## Capabilities and Constraints

**Đã có (hạ tầng, chưa có nghiệp vụ):** khung ba app chạy được đầu-cuối, type an toàn xuyên suốt từ API tới frontend, cơ chế migration, lưu trữ ảnh, CI.

**Ràng buộc mang tính sống còn — chống đặt trùng.** Một chiếc xe không thể được đặt hai lần trong khoảng thời gian chồng nhau. Ràng buộc này đặt ở tầng database (exclusion constraint trên `(vehicle_id, tstzrange)`), không ở tầng ứng dụng.

Vì `apps/web` nhận đặt online, **khách cuối sẽ chạm trực tiếp vào ràng buộc này** — không chỉ nhân viên. Hai người đặt cùng chiếc xe cùng khoảng ngày là chuyện sẽ xảy ra thật. Hệ thống phải trả lỗi rõ ràng cho người đến sau, không được để lộ ra thành lỗi kỹ thuật.

**Ngôn ngữ:** tiếng Việt trước, tiếng Anh sau. Tiếng Anh **chưa** làm, nhưng khách du lịch nước ngoài là nhóm người dùng đã xác nhận — nên đây là nợ đã biết, không phải tính năng tùy chọn.

**Tiền:** VND, luôn là số nguyên đồng. Không có đơn vị phụ.

**Chưa quyết — đừng bịa:**
- Chính sách tính ngày thuê và bảng giá (thuê dài ngày có giá khác, nhưng cụ thể thế nào thì chưa chốt).
- Vai trò `SALES` làm gì.
- Có bảo hiểm hay không.
- Xử lý huỷ đơn và hoàn cọc thế nào.

## Brand Commitments

Tên: **V9 Motor Rental**.

**Đã có logo và bộ nhận diện đang dùng ngoài đời.** Đây là ràng buộc bắt buộc — thiết kế sau phải tôn trọng, **không được vẽ lại**. Cần lấy asset thật trước khi làm việc thị giác.

Người dùng đặt ràng buộc thị giác rõ khi khởi tạo dự án: hướng **moto-garage** — tối, nhiều ảnh, typography đậm. **Cấm** thẩm mỹ SaaS generic: gradient tím, Inter ở mọi nơi, card lồng card. Ghi lại nguyên văn ở đây vì nó là ràng buộc do người dùng đưa ra; việc dựng thế giới thị giác cụ thể thuộc về bước sau, không thuộc tài liệu này.

## Evidence on Hand

- **Ảnh xe thật của shop** — có, dùng được. Đây là điều khiến hướng thiên về ảnh khả thi thật chứ không phải mong muốn suông.
- **Logo và nhận diện sẵn có** — có.
- **Fanpage / Zalo đang chạy, có khách thật** — có. Web không được mâu thuẫn với nơi khách đang thực sự nhắn tin; nó là kênh thêm vào, không phải kênh thay thế.

**Chưa có, không được bịa:** testimonial, con số lượng khách, đánh giá sao, giải thưởng, số năm hoạt động, danh sách đối tác. Không có tài liệu nào trong repo chứng minh những thứ đó.

## Product Principles

1. **Chống đặt trùng là ràng buộc, không phải tính năng.** Nó nằm ở tầng dữ liệu và không được phép có đường vòng. Mọi luồng đặt xe — của khách hay của nhân viên — đều đi qua nó.
2. **Khách thấy đúng chiếc xe mình sẽ nhận.** Ảnh thật của từng xe, tình trạng thật, không phải ảnh hãng. Đây là thứ shop nhỏ làm được mà chuỗi lớn không làm.
3. **Bằng chứng bảo vệ cả hai phía.** Ảnh lúc giao và lúc nhận tồn tại để bảo vệ khách khỏi bị đổ oan, chứ không chỉ để bảo vệ shop.
4. **Khách du lịch nước ngoài là người dùng thật, không phải trường hợp biên.** Thủ tục giấy tờ và tiếng Anh là nhu cầu đã xác nhận, chỉ là chưa tới lượt làm.
5. **Web không thay thế Zalo/Fanpage.** Khách vẫn nhắn tin, và điều đó ổn. Web tồn tại để khách chốt được đơn lúc không ai trực.

## Accessibility & Inclusion

Hai nhóm khách không đọc chung một ngôn ngữ: người Việt và khách nước ngoài. Hiện chỉ có tiếng Việt. Mọi thứ phụ thuộc vào việc đọc hiểu tiếng Việt — thủ tục giấy tờ, điều khoản cọc — đều là rào cản đã biết đối với nhóm khách thứ hai.

Nội dung dùng nhiều ảnh, nên ảnh xe cần văn bản thay thế mô tả thật (loại xe, phân khối, tình trạng) chứ không phải tên file.
