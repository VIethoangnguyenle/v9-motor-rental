/** Khung trang hẹp dùng cho mọi màn xác thực (`max-w-sm`). */
export function PageShell({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </main>
  );
}
