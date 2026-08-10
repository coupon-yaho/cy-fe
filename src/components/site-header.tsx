import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, ShieldCheck, Ticket, Menu } from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { GradeBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";

const NAV = [
  { to: "/", label: "홈" },
  { to: "/events", label: "브랜드 데이" },
  { to: "/my/coupons", label: "내 쿠폰함" },
] as const;

export function SiteHeader() {
  const { session, logout } = useAuth();
  const { items, unread, markAllRead } = useNotifications();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="shrink-0">
          <BrandLogo className="h-8" />
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                pathname === n.to
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n.label}
            </Link>
          ))}
          {session?.role === "ADMIN" && (
            <Link
              to="/admin"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              관리자
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu onOpenChange={(o) => o && markAllRead()}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="알림">
                <Bell className="size-5" />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>알림 (Mock)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {items.length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  받은 알림이 없습니다
                </div>
              )}
              {items.slice(0, 6).map((n) => (
                <div key={n.id} className="px-2 py-2">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <span className="max-w-24 truncate">{session.nickname}</span>
                  <GradeBadge grade={session.grade} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="num text-xs text-muted-foreground">
                  {session.userId}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/my/coupons">
                    <Ticket className="mr-2 size-4" /> 내 쿠폰함
                  </Link>
                </DropdownMenuItem>
                {session.role === "ADMIN" && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">
                      <ShieldCheck className="mr-2 size-4" /> 관리자 콘솔
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 size-4" /> 로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="ghost" asChild>
                <Link to="/login">로그인</Link>
              </Button>
              <Button asChild>
                <Link to="/signup">회원가입</Link>
              </Button>
            </div>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="메뉴">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <nav className="mt-8 flex flex-col gap-1">
                {NAV.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    {n.label}
                  </Link>
                ))}
                {session?.role === "ADMIN" && (
                  <Link
                    to="/admin"
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    관리자 콘솔
                  </Link>
                )}
                {!session && (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
                    >
                      로그인
                    </Link>
                    <Link
                      to="/signup"
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
                    >
                      회원가입
                    </Link>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
