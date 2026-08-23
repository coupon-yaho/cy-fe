import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { GradeChip } from "@/components/coupon/grade-chip";
import { LiveStrip } from "@/components/coupon/live-strip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";

const NAV = [
  { to: "/", label: "홈" },
  { to: "/events", label: "브랜드 데이" },
  { to: "/my/coupons", label: "내 쿠폰함" },
] as const;

function timeAgo(at: number) {
  const sec = Math.floor((Date.now() - at) / 1000);
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  return `${Math.floor(sec / 3600)}시간 전`;
}

/**
 * 사이트 헤더.
 *
 * 현재 위치는 굵기만으로 알리지 않고 밑줄 규칙선을 함께 씁니다 —
 * 굵기 차이는 한글에서 스치듯 보면 잘 안 잡힙니다.
 */
export function SiteHeader() {
  const { session, logout } = useAuth();
  const { items, unread, markAllRead } = useNotifications();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-yh-rule bg-yh-paper/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] w-full max-w-6xl items-center gap-8 px-5">
          {/* 사양서 §2 — 데스크탑은 A-mark 40px, 모바일은 워드마크만 28px.
              키비주얼(B)은 이 자리에 쓰지 않습니다. */}
          <Link to="/" className="shrink-0" aria-label="쿠폰 야~호 홈">
            <BrandLogo variant="mark" className="h-11" />
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`yh-body relative py-5 font-semibold transition-colors ${
                  isActive(n.to)
                    ? "text-yh-navy after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-yh-navy"
                    : "text-yh-ink-2 hover:text-yh-navy"
                }`}
              >
                {n.label}
              </Link>
            ))}
            {session?.role === "ADMIN" && (
              <Link
                to="/admin"
                className="yh-body py-5 font-semibold text-yh-ink-2 transition-colors hover:text-yh-navy"
              >
                관리자
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <DropdownMenu onOpenChange={(o) => o && markAllRead()}>
              <DropdownMenuTrigger
                className="relative grid size-9 place-items-center rounded text-yh-ink-2 transition-colors hover:bg-yh-paper-2 hover:text-yh-navy"
                aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
              >
                <Bell className="size-[18px]" strokeWidth={1.8} aria-hidden />
                {unread > 0 && (
                  <span
                    className="absolute top-1.5 right-1.5 size-2 rounded-full bg-yh-accent"
                    aria-hidden
                  />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="yh w-80 rounded border-yh-rule bg-yh-surface p-0"
              >
                <p className="yh-label border-b border-yh-rule px-4 py-3">알림</p>
                {items.length === 0 ? (
                  <p className="yh-body px-4 py-10 text-center text-yh-ink-3">
                    쿠폰을 발급받으면 여기에 알림이 쌓입니다.
                  </p>
                ) : (
                  items.slice(0, 6).map((n) => (
                    <div key={n.id} className="border-b border-yh-rule px-4 py-3 last:border-0">
                      <p className="yh-body font-bold">{n.title}</p>
                      <p className="yh-small mt-0.5 text-yh-ink-2">{n.body}</p>
                      <p className="yh-small yh-num mt-1 text-yh-ink-3">{timeAgo(n.at)}</p>
                    </div>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="yh-body flex items-center gap-2 rounded px-2 py-2 font-semibold transition-colors hover:bg-yh-paper-2">
                  <GradeChip grade={session.grade} size="sm" />
                  <span className="hidden text-yh-navy sm:inline">{session.nickname}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="yh w-64 rounded border-yh-rule bg-yh-surface p-0"
                >
                  <div className="border-b border-yh-rule px-4 py-3">
                    <p className="yh-body font-bold">{session.nickname}</p>
                    <p className="yh-small mt-1 text-yh-ink-3">
                      회원 번호 <span className="yh-num text-yh-ink-2">{session.memberId}</span>
                    </p>
                    <p className="yh-small mt-1.5 text-yh-ink-3">
                      문의하실 때 이 번호를 알려 주세요.
                    </p>
                  </div>
                  <div className="p-1">
                    <DropdownMenuItem asChild className="yh-body rounded font-medium">
                      <Link to="/my/coupons">내 쿠폰함</Link>
                    </DropdownMenuItem>
                    {session.role === "ADMIN" && (
                      <DropdownMenuItem asChild className="yh-body rounded font-medium">
                        <Link to="/admin">관리자</Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={logout} className="yh-body rounded font-medium">
                      로그아웃
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login" className="yh-btn-sm">
                로그인
              </Link>
            )}

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                className="grid size-9 place-items-center rounded text-yh-ink-2 transition-colors hover:bg-yh-paper-2 md:hidden"
                aria-label="메뉴"
              >
                <Menu className="size-5" strokeWidth={1.8} aria-hidden />
              </SheetTrigger>
              <SheetContent side="right" className="yh w-72 bg-yh-paper">
                <SheetTitle className="sr-only">메뉴</SheetTitle>
                <nav className="mt-14 flex flex-col px-5">
                  {NAV.map((n) => (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setMenuOpen(false)}
                      className={`yh-sub border-b border-yh-rule py-5 ${
                        isActive(n.to) ? "text-yh-navy" : "text-yh-ink-2"
                      }`}
                    >
                      {n.label}
                    </Link>
                  ))}
                  {session?.role === "ADMIN" && (
                    <Link
                      to="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="yh-sub border-b border-yh-rule py-5 text-yh-ink-2"
                    >
                      관리자
                    </Link>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <LiveStrip />
    </header>
  );
}
