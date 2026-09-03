# V9 Motor Rental — DESIGN.md

Hệ thiết kế cho **`apps/web`** (site công khai). **Không** áp cho `apps/staff` — app đó ưu tiên
chức năng, xem `apps/staff/CLAUDE.md`.

Ràng buộc sản phẩm ở [`PRODUCT.md`](PRODUCT.md). Khi tài liệu này và `PRODUCT.md` mâu thuẫn,
**`PRODUCT.md` thắng** — và hãy sửa file này.

---

## Nguồn gốc và bảy chỗ cố ý đi chệch

Nền là **BMW M** từ [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
(`design-md/bmw-m/DESIGN.md`). Chọn nó vì đây là bộ duy nhất trong danh sách vừa **tối tuyền**,
vừa để **ảnh xe gánh toàn bộ năng lượng**, vừa dựng quanh **lưới dòng xe** — đúng ba thứ
`apps/web` cần.

Đây **không** phải bản chép. Bảy chỗ dưới đây khác bản gốc, mỗi chỗ có lý do. Đừng "sửa lại cho
giống BMW" — đọc cột lý do trước.

| #   | BMW M gốc                                        | V9                                      | Vì sao                                                                                                                                                                 |
| --- | ------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `BMWTypeNextLatin`; nếu thiếu thì dùng **Inter** | **Archivo**                             | Font BMW không license được. Còn Inter thì `PRODUCT.md` **cấm thẳng** ("Inter ở mọi nơi").                                                                             |
| 2   | display `line-height: 1.0`                       | **1.15 tối thiểu**                      | Đo thật: ở 1.0, dấu sắc trên **Ố** đâm vào **TÔ** dòng trên. Tiếng Việt xếp chồng dấu, không phải tiếng Anh.                                                           |
| 3   | Accent = **M tricolor**                          | **`#f72b28`, rút từ mark V9**           | Tricolor là nhận diện của BMW. Shop **chưa** có nhận diện (`PRODUCT.md` sửa 2026-09-03), nên mark được dựng ở đợt này và màu rút ra từ nó. ✅ Chốt 2026-09-03, xem §9. |
| 4   | "Đừng dùng màu ngoài M tricolor"                 | **Bỏ luật này**                         | Nó giả định ta là BMW. Ta có brand riêng. Giữ nguyên luật gốc = ship nhận diện của hãng khác.                                                                          |
| 5   | Nhịp có băng **magazine grid**                   | **Bỏ**                                  | Ta không có bài viết, không có testimonial, không có con số. `PRODUCT.md` cấm bịa. Băng trống thà bỏ còn hơn độn nội dung giả.                                         |
| 6   | CTA = "Order / Configure"                        | **"Gửi yêu cầu thuê"**                  | Web **không chốt đơn**. CTA không được ngụ ý xe còn trống hay đã giữ chỗ. Đây là luật cứng nhất của app, xem §7.                                                       |
| 7   | Ảnh studio / trường đua                          | **Ảnh thật từng chiếc, kể cả vết xước** | `PRODUCT.md` nguyên tắc #2: khách thấy đúng chiếc xe mình sẽ nhận. Ảnh đẹp hơn thực tế là phản tác dụng.                                                               |

---

## 0. Hệ này được implement bằng Tailwind v4

Token nằm ở `apps/web/app/globals.css`, khai bằng `@theme` — **không có `tailwind.config.js`**,
v4 khai theme trong CSS. Mỗi biến sinh ra utility tương ứng: `--color-canvas` → `bg-canvas`,
`--spacing-section` → `py-section`.

**Luật:** JSX dùng utility, **không hard-code hex và không dùng arbitrary value** kiểu
`bg-[#1a1a1a]`. Thấy mình sắp viết arbitrary value cho màu hoặc thang cách nghĩa là token còn
thiếu — thêm vào `@theme`, đừng lách.

Thang chữ (§3) và hình dạng nút (§4) khai bằng `@utility` chứ không rắc utility rời trong JSX:
đó là hợp đồng của hệ thiết kế, phải sửa một chỗ. Viết tay
`text-[60px] font-bold uppercase leading-[1.15]` ở mỗi tiêu đề là cách chắc chắn nhất để nó trôi.

`apps/web` cắm Tailwind qua **PostCSS** (`@tailwindcss/postcss`), `apps/staff` qua **Vite plugin**
(`@tailwindcss/vite`). Hai cơ chế build khác nhau nên hai cách cắm — đúng, không phải thiếu nhất
quán. Và `apps/staff` **không** dùng file này: nó chạy theme mặc định của Tailwind.

## 1. Không khí và chủ đề

Nền đen tuyền. Chrome giao diện lùi hết về sau; **ảnh xe là toàn bộ điện áp của trang**. Không
gradient, không đổ bóng, không hoa văn, không card lồng card.

Tinh thần: **moto-garage / motorsport**, không phải showroom sang trọng và cũng không phải SaaS.
Xe của shop là xe thật đã chạy ngoài đường — hệ thiết kế phải chịu được vết xước trong ảnh, chứ
không đòi mọi thứ bóng loáng.

Chữ ký thị giác: **tương phản nặng–nhẹ**. Tiêu đề 700 hoa, thân bài 300. Khoảng cách giữa hai
trọng lượng đó chính là bản sắc — đừng làm mờ nó bằng 400/500.

## 2. Bảng màu và vai trò

```
canvas          #000000   nền trang, nav, footer
surface-card    #1a1a1a   card ảnh, input
surface-elevated #262626  lớp nổi hiếm dùng
surface-soft    #0d0d0d   ô thông số kỹ thuật
ink             #ffffff   tiêu đề, chữ chính
body-strong     #e6e6e6   chữ nhấn
body            #bbbbbb   thân bài mặc định
muted           #7e7e7e   metadata, chú thích
hairline        #3c3c3c   viền, đường chia
accent          #f72b28   nền CTA chính, v9-stripe-divider, viền active (§9)
```

**Tương phản đã đo trên `#000000`** (WCAG AA: thân bài ≥ 4.5, chữ lớn ≥ 3.0):

| Token                 | Tỉ lệ   | Kết luận                                        |
| --------------------- | ------- | ----------------------------------------------- |
| `ink` #ffffff         | 21.00:1 | ✅                                              |
| `body-strong` #e6e6e6 | 16.83:1 | ✅                                              |
| `body` #bbbbbb        | 10.94:1 | ✅                                              |
| `muted` #7e7e7e       | 5.17:1  | ✅                                              |
| `hairline` #3c3c3c    | 1.90:1  | ❌ **chỉ dùng làm viền, KHÔNG BAO GIỜ làm chữ** |

⚠️ Trên `surface-card` (#1a1a1a), `muted` tụt còn **4.29:1** — dưới ngưỡng AA cho thân bài.
Trong card, metadata phải dùng `body` (9.07:1), không dùng `muted`.

Màu accent khi có phải **đo lại** trên cả `#000000` và `#1a1a1a` trước khi dùng cho chữ.

## 3. Typography

**Một họ font duy nhất: [Archivo](https://fonts.google.com/specimen/Archivo)** — có subset
`vietnamese` (đã kiểm), dải 100–900, chất grotesque "machined" gần BMW Type Next và **không**
phải Inter.

Cỡ dùng `clamp()` — giá trị dưới là **mobile → desktop**:

```
display-xl   36 → 60px / 700 / lh 1.15 / ls 0      HOA   hero h1
display-lg   28 → 40px / 700 / lh 1.15 / ls 0      HOA   đầu mục lớn
display-md   22 → 28px / 700 / lh 1.2  / ls 0      HOA   tên xe
display-sm   20 → 24px / 700 / lh 1.2  / ls 0      HOA   giá trị ô thông số
title-lg          20px / 700 / lh 1.35              card title
title-md          18px / 400 / lh 1.5               lead
label-upper       14px / 700 / lh 1.4 / ls 1.5px  HOA   nhãn danh mục, link
body-md           16px / 300 / lh 1.6               thân bài mặc định
body-sm           14px / 300 / lh 1.6               chân trang, fine print
caption           12px / 400 / lh 1.5 / ls 0.5px    chú thích ảnh
button            14px / 700 / lh 1.2 / ls 1.5px  HOA   nhãn nút
```

**Thang này nhỏ hơn BMW M một bậc** (bản gốc: hero 80px, đầu mục 56px, tên xe 40px). Hạ sau khi
dựng thử trang chủ và nhìn thật: 80px hợp với site thương hiệu xa xỉ mỗi trang một sản phẩm, còn
đây là **catalogue** — chữ to cỡ đó đẩy lưới xe xuống quá sâu và bắt cuộn nhiều mới thấy được xe.

Chữ ký của hệ **không nằm ở cỡ chữ mà ở tương phản trọng lượng** (700 vs 300), nên hạ cỡ không
làm mất bản sắc. Hạ trọng lượng thì mất.

**Ba luật không được phá:**

1. **`line-height` display ≥ 1.15.** Bản BMW để 1.0. Với tiếng Việt hoa, dấu chồng (Ế, Ố, Ự) đâm
   vào dòng trên. Đã render kiểm chứng, không phải suy đoán.
2. **Không bold thân bài.** Thân bài ở 300. Đẩy lên 400/500 là trang lập tức thành "marketing",
   mất chất kỹ thuật.
3. **Tracking nhãn hoa giữ 1.5px.** Đó là thứ làm nút trông "gia công" thay vì "gõ ra".

Letter-spacing của display giữ **0** — bản gốc khuyên siết -0.5px khi thay font, nhưng tiếng Việt
có dấu bên cạnh chữ (Ơ, Ư) nên siết tracking làm chúng dính vào ký tự sau.

## 4. Component

**Nút** — góc **0px**, cao 48px, padding 16×32, nhãn hoa 14/700/1.5px.
`button-primary` nền trong suốt + viền trắng 1px (dùng đè lên ảnh);
`button-solid` nền trắng chữ đen (dùng trên nền đen phẳng).
**Không bo góc.** Hình chữ nhật sắc cạnh chính là ngôn ngữ thương hiệu; bo góc đọc ra
consumer-tech. Ngoại lệ duy nhất: nút icon tròn 48×48 (mũi tên carousel).

**`hero-photo-band`** — full-bleed ảnh xe, h1 `display-xl` canh trái đè lên ảnh, padding dọc 64px.
Không khung card — **ảnh chính là băng**.

**`vehicle-card`** (thay `model-card` của BMW) — nền `canvas`, góc 0px. Trên: ảnh thật của **đúng
chiếc đó**, tỉ lệ 16:10. Dưới: tên xe `display-md`, dòng thông số ngắn `body-sm`, link
`label-upper` ("XEM CHI TIẾT →"). Lưới 3-up desktop · 2-up tablet · 1-up mobile.

**`spec-cell`** — nền `surface-soft` (#0d0d0d), padding 24px. Giá trị `display-sm` ở trên, nhãn
`label-upper` ở dưới. Dùng cho phân khối, đời xe, ODO.

**`text-input`** — nền `surface-card`, viền hairline 1px, góc 0px, cao 48px. Focus làm viền dày
lên màu trắng. Dùng cho form gửi yêu cầu.

**`v9-stripe-divider`** — dải ngang 4px mang màu accent của shop. Đây là phần thay cho M stripe.
Dùng **rất dè**: đánh dấu chỗ quan trọng, không bao giờ làm nền nút. ⛔ Chờ §9.

**Bỏ khỏi bản gốc:** `chatbot-launcher`, `cookie-consent-card`, `magazine-article-card`,
`category-tab` — không có nội dung tương ứng, đừng dựng vỏ rỗng.

## 5. Layout

Base 4px. Thang: 4 · 8 · 12 · 16 · 24 · 40 · 64 · **96 (section)**.

Bề rộng nội dung tối đa **1440px** — rộng hơn SaaS thường thấy, để ảnh có chỗ thở.
Băng ảnh **tràn viền hoàn toàn**, không max-width.

**Nhịp trang** (bản gốc bỏ băng magazine): `ảnh → bảng thông số → ảnh → lưới xe → ảnh → băng CTA`.
Không đặt hai băng chỉ-có-chữ cạnh nhau — đọc ra như trang doanh nghiệp.

Khoảng trắng giữa các băng luôn đúng 96px. Chỗ trống để **đen trơn**, không độn hoa văn.

## 6. Độ sâu

Không đổ bóng. Không lớp chrome. Độ sâu đến từ **ảnh** (ánh sáng, ống kính, chủ thể) và từ chênh
lệch giữa `canvas` đen với `surface-card` hơi sáng hơn.

Bốn mức: phẳng (không viền không bóng) · viền hairline 1px · nền `surface-card` · ảnh tràn viền.

## 7. ⚠️ Luật copy — thứ dễ vi phạm nhất

Thiết kế **không được** tạo cảm giác đã chốt đơn. Web chỉ **nhận yêu cầu**; nhân viên xác nhận rồi
mới có đơn thuê thật trong `apps/staff`. Web **không đọc availability thời gian thực**.

Nút chính là **"Gửi yêu cầu thuê"**. Không phải "Đặt ngay", không phải "Book now".

| Đúng                                                            | Sai — dù nghe hay hơn                                  |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| "Đã nhận yêu cầu. Shop sẽ liên hệ để xác nhận xe và thời gian." | ~~"Đặt xe thành công! Xe đã được giữ cho ngày 12/8."~~ |

Copy đã có sẵn ở `apps/web/messages/vi.json` khoá `booking` — **dùng lại, đừng viết câu mới**.
Chi tiết ở `apps/web/AGENTS.md`.

**Cấm bịa social proof.** Không testimonial, không "1000+ khách hài lòng", không sao đánh giá,
không giải thưởng, không số năm hoạt động. `PRODUCT.md` §Evidence on Hand: repo không có gì chứng
minh mấy thứ đó. Một băng trống thì bỏ băng, không điền số giả.

## 8. Responsive, ảnh và SEO

| Breakpoint | Thay đổi                                              |
| ---------- | ----------------------------------------------------- |
| < 768px    | nav hamburger · h1 80→48px · lưới 1-up · footer 1 cột |
| 768–1024px | nav ngang thu gọn · lưới 2-up                         |
| > 1024px   | lưới 3-up · container 1440px                          |

Vùng chạm tối thiểu 48×48px.

**Ảnh là rủi ro SEO lớn nhất của hướng này.** `apps/web` dùng SSG/ISR vì SEO quan trọng, mà hệ
này đặt ảnh tràn viền ngay đầu trang — tức ảnh hero **chính là LCP**. Bắt buộc dùng `next/image`
với `priority` cho ảnh hero, và phục vụ AVIF/WebP. Một trang đen tuyền tải chậm thì màn hình đầu
tiên khách thấy là **màn hình đen trống**.

**Alt text phải mô tả thật** — loại xe, phân khối, tình trạng. Không phải tên file.
`PRODUCT.md` §Accessibility yêu cầu điều này vì nội dung dựa nhiều vào ảnh.

## 9. ✅ Nhận diện — chốt 2026-09-03

**Mark:** [`apps/web/public/brand/v9-mark.svg`](apps/web/public/brand/v9-mark.svg). Nhông xích làm
vành, số 9 âm bản khoét giữa, ba răng đỏ cách đều 120°. Dựng bằng hình học thuần — **không phụ
thuộc font nào có mặt**, và vành dùng `fill-rule="evenodd"` thay vì `<mask>` vì mask vỡ khi SVG
được inline vào nền khác.

**Đọc được ở 32px — đã đo, không phải suy:** thu về đúng 32×32 rồi phóng lại, vành vẫn ra răng cưa
và số 9 vẫn đọc được; ba răng đỏ thành ba chấm. Đây là điều kiện để nó làm favicon.

**Màu accent `#f72b28`.** Dùng rất dè, đúng ba chỗ: nền CTA quan trọng nhất, `v9-stripe-divider`,
và viền trạng thái active.

| Đo trên                       | Tỉ lệ | Ngưỡng áp dụng            | Kết luận |
| ----------------------------- | ----- | ------------------------- | -------- |
| `#000000` canvas              | 5.33  | 3.0 (đồ hoạ, WCAG 1.4.11) | ✅       |
| `#1a1a1a` card                | 4.42  | 3.0 (đồ hoạ)              | ✅       |
| `#0d0d0d` soft                | 4.93  | 3.0 (đồ hoạ)              | ✅       |
| chữ **trắng** trên accent     | 3.94  | 4.5 (chữ thường)          | ❌       |
| chữ **đen** trên accent       | 5.33  | 4.5 (chữ thường)          | ✅       |
| accent làm chữ trên `#1a1a1a` | 4.42  | 4.5                       | ❌       |

**Hai luật rút ra từ bảng trên, không phải sở thích:**

1. **Nút CTA dùng chữ ĐEN trên nền accent.** Chữ trắng trượt AA. Điều này hợp với chữ ký
   "tương phản nặng–nhẹ" của §1 chứ không chống lại nó.
2. **Không dùng accent làm chữ trên `surface-card`.** Trên `canvas` thì đạt, nhưng một token đổi
   hành vi theo nền là thứ sẽ trôi — cấm hẳn cho gọn.

Ba răng đỏ **không mang thông tin nào**: bỏ hết màu thì mark vẫn đọc đủ. Đây là điều kiện để nó
sống ở chỗ in một màu và ở chế độ tương phản cao.

### Còn treo

`apps/staff/public/icon-{192,512}.png` **chưa** đổi sang mark này. `docs/ROADMAP.md:117` ghi icon đó
đã xong 2026-09-01 bằng "logo mô tô thật" — nhưng shop không có logo thật, nên chưa rõ thứ đang nằm
trong hai file kia là gì. Không đụng vào cho tới khi biết.
