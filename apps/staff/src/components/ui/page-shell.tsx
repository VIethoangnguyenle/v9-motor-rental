/**
 * Khung trang hẹp dùng cho mọi màn xác thực (`max-w-sm`). Nền `canvas` phủ toàn
 * màn hình (`min-h-screen`) — cột nội dung nằm trong, canh giữa bằng `mx-auto`;
 * `page-gutter` lo khoảng cách hai bên, responsive theo ba breakpoint đã khai
 * ở `index.css`.
 */
export function PageShell({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-sm page-gutter py-6">
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}
