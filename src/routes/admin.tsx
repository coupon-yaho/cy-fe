import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, LayoutDashboard, Ticket, ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "운영 현황", icon: LayoutDashboard, exact: true },
  { to: "/admin/coupons", label: "쿠폰 관리", icon: Ticket, exact: false },
  { to: "/admin/system", label: "시스템 관제", icon: Activity, exact: false },
  { to: "/admin/analytics", label: "통계 · 분석", icon: BarChart3, exact: false },
] as const;

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-secondary/30">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-background p-4 md:block">
        <Link to="/">
          <BrandLogo className="h-8" />
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">운영자 콘솔</p>
        <nav className="mt-6 space-y-1">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Button variant="ghost" size="sm" className="mt-6 w-full justify-start" asChild>
          <Link to="/">
            <ArrowLeft className="mr-2 size-4" /> 서비스로 돌아가기
          </Link>
        </Button>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-background p-2 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="shrink-0 rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              {n.label}
            </Link>
          ))}
        </div>
        <Outlet />
      </div>
    </div>
  );
}
