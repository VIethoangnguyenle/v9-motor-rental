# Eden Treaty NUỐT lỗi mạng — `isError` là nhánh chết

Đo 2026-09-01, hai đường độc lập. **Đây là tiền đề sai đã lọt vào một bản critique và một design
doc trước khi bị bắt.**

## Cơ chế

`@elysiajs/eden@1.4.9` (`treaty2`) bọc `fetch` trong try/catch. Vì repo **không** bật
`throwHttpError`, nó **return** chứ không throw:

```js
try { u = await fetch(P, i) }
catch (l) { const c = new EdenFetchError(503, l); if (throwHttpError) throw c;
            return { data: null, error: c, response: undefined, status: 503 } }
```

Probe vào cổng chết: `PROMISE RESOLVED` · `error.status = 503` · `value instanceof Error = true` ·
`value.code = "ConnectionRefused"`.

**Hệ quả:** promise **resolve**, `res.error` truthy, `queryFn` trả `ok: false` bình thường, và
`status` của TanStack **không bao giờ** thành `"error"`. Nên `isError` không bao giờ chạy.

## Hai điều bị hiểu sai vì cơ chế này

1. **"Màn hình trắng khi mạng chết" — SAI.** Nó hiện câu fallback chung chung, **không kèm đường
   thử lại**. Vẫn là lỗi thật, nhưng nhẹ hơn hẳn mô tả gốc. Bằng chứng "`isError` không xuất hiện
   ở đâu trong `apps/staff`" là **thật**, nhưng suy ra "không nhánh nào render" là sai.
2. **Dưới Bun, exception mang `.code = "ConnectionRefused"`** nên `parseApiError` **thành công** và
   `errorMessage` in *"Unable to connect. Is the computer able to access the url?"* — tiếng Anh thô
   vào mặt nhân viên người Việt. Chrome ném `TypeError` không có `.code` nên chỉ rơi về fallback,
   vì thế trình duyệt **không** lộ ra lỗi này.

## Cách phân loại đúng

`connectionFailed()` ở `apps/staff/src/lib/customers.ts` — dùng `res.error.value instanceof Error`.
**Chính xác chứ không phải heuristic**: nhánh catch của Eden lưu nguyên exception, còn lỗi API thật
luôn đi qua `JSON.parse` nên không bao giờ là `Error`.

Đã loại: `status === 503` (API thật cũng trả 503) và `response === undefined` (đúng lúc chạy nhưng
Eden khai kiểu `Response`, TS2367).

## Còn nguyên ở năm chỗ khác

`lib/rentals.ts` · `rental-calendar.tsx` · `rental-form.tsx` · `stats-page.tsx` ·
`staff-list-page.tsx`. `connectionFailed` đã export, dùng lại được.

## Việc riêng, giới hạn giá trị bản vá

**API chết thì đăng xuất.** `protectedLayoutRoute.beforeLoad` gọi `hasSession()` vốn cần API, nên
F5 đúng lúc API chớp tắt sẽ bị đá về `/login`. Nhánh lỗi chỉ cứu được ca "trang đang mở sẵn, API
chết, refetch nổ".
