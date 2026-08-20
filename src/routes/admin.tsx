import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminForbidden, AdminShell } from "@/components/admin/shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "관리자 — 쿠폰 야~호" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { session, ready } = useAuth();

  if (!ready) return <div className="min-h-screen bg-hig-canvas" />;
  if (session?.role !== "ADMIN") return <AdminForbidden />;

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
