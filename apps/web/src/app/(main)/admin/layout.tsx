export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full w-full space-y-6 p-8 pb-16">
      {children}
    </div>
  );
}
