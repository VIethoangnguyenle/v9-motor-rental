# apps/admin — CLAUDE.md

Luật chung của repo ở [`../../CLAUDE.md`](../../CLAUDE.md). Đọc file đó trước.

Vite + TanStack Router + TanStack Query. **SPA tĩnh**, không có server-side runtime.

## Ưu tiên chức năng, không polish

Đây là app quản trị nội bộ. **Không có polish pass trừ khi được yêu cầu rõ.** `impeccable` chỉ
audit nhẹ ở đây; `DESIGN.md` là ràng buộc của `apps/web`, không phải của app này.

Role: `OWNER`, `STAFF`. `SALES` để dành, chưa dùng.

## Đây KHÔNG phải Next.js

`apps/web` dùng Next, app này dùng Vite. Có chủ ý: admin là dashboard nội bộ nên SEO vô nghĩa,
ràng buộc SSG/ISR không áp dụng. Đừng "thống nhất" hai app.

Hệ quả cụ thể khi chuyển qua lại giữa hai app:

| | `apps/web` | `apps/admin` |
|---|---|---|
| Mô hình | server-first (RSC, fetch trong server component) | client-first (SPA, mọi thứ qua TanStack Query) |
| Biến env | `process.env.NEXT_PUBLIC_*`, đọc lúc chạy | `import.meta.env.VITE_*`, **nướng vào bundle lúc build** |
| JSX | `jsx: "preserve"` | `jsx: "react-jsx"` |

## ⚠️ `VITE_API_URL` bị nướng vào bundle lúc build

Đặt biến đó trong `compose.prod.yaml` **không có tác dụng gì**. Đổi API URL bắt buộc phải build
lại image. Cách hỏng rất khó chịu: container lên bình thường, trang mở được, chỉ có mọi request
API bắn sai địa chỉ.

## TanStack Query bọc LÊN Eden, không thay Eden

```ts
queryFn: async () => {
  const res = await api.health.get();   // Eden client, có type
  if (res.error) throw new Error(JSON.stringify(res.error.value));
  return res.data;                       // type suy từ TypeBox schema của apps/api
}
```

Đó là thứ giữ chuỗi type liền mạch từ response schema của API tới component. Đừng thay bằng
`fetch` thô — làm vậy là đứt chuỗi type và mất luôn lý do dùng Eden.

## Route khai bằng code, chưa dùng file-based routing

`src/router.tsx`. Một route thì bộ máy sinh route là chi phí không có người trả. Khi số route
tăng, cân nhắc `@tanstack/router-plugin` — nhưng đó là quyết định riêng, không phải mặc định.

Khối `declare module "@tanstack/react-router"` trong `router.tsx` là thứ làm router type-safe
toàn cục. Xoá nó thì `Link` và `navigate` mất autocomplete và mất kiểm tra path.

## Chạy

```bash
bun run --filter @v9/admin dev      # cần apps/api đang chạy để trang health có dữ liệu
bun run --filter @v9/admin build    # tsc --noEmit rồi vite build -> dist/
```
