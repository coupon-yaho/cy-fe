import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { GradeChip } from "@/components/coupon/grade-chip";
import { LiveStrip } from "@/components/coupon/live-strip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

export function SiteHeader() {
  const { session, logout } = useAuth();
  const { items, unread, markAllRead } = useNotifications();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-hairline bg-hig-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5">
          <Link to="/" className="shrink-0" aria-label="쿠폰 야~호 홈">
            <BrandLogo className="h-6" />
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`t-body-sm transition-opacity hover:opacity-60 ${
                  isActive(n.to) ? "font-semibold text-hig-fg" : "text-hig-secondary"
                }`}
              >
                {n.label}
              </Link>
            ))}
            {session?.role === "ADMIN" && (
              <Link
                to="/admin"
                className="t-body-sm text-hig-secondary transition-opacity hover:opacity-60"
              >
                관리자
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu onOpenChange={(o) => o && markAllRead()}>
              <DropdownMenuTrigger
                className="relative grid size-8 place-items-center rounded-full text-hig-secondary transition-opacity hover:opacity-60"
                aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
              >
                <BellGlyph />
                {unread > 0 && (
                  <span
                    className="absolute top-0.5 right-0.5 size-2 rounded-full bg-live"
                    aria-hidden
                  />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 rounded-2xl">
                <DropdownMenuLabel className="eyebrow">알림</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {items.length === 0 ? (
                  <p className="t-body-sm px-3 py-8 text-center text-hig-muted">
                    쿠폰을 발급받으면 여기에 알림이 쌓입니다.
                  </p>
                ) : (
                  items.slice(0, 6).map((n) => (
                    <div key={n.id} className="hairline-row px-3 py-3 last:border-0">
                      <p className="t-body-sm font-semibold">{n.title}</p>
                      <p className="t-body-sm mt-0.5 text-hig-secondary">{n.body}</p>
                      <p className="num t-caption mt-1 text-hig-muted">{timeAgo(n.at)}</p>
                    </div>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="t-body-sm flex items-center gap-2 rounded-full px-2 py-1.5 transition-opacity hover:opacity-60">
                  <GradeChip grade={session.grade} size="sm" />
                  <span className="hidden text-hig-fg sm:inline">{session.nickname}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-2xl">
                  <div className="px-3 pt-1 pb-2">
                    <p className="t-body-sm font-semibold">{session.nickname}</p>
                    <p className="t-caption mt-0.5 text-hig-muted">
                      회원 번호 <span className="num">{session.memberId}</span>
                    </p>
                    <p className="t-caption mt-1.5 text-hig-muted">
                      문의하실 때 이 번호를 알려 주세요.
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/my/coupons">내 쿠폰함</Link>
                  </DropdownMenuItem>
                  {session.role === "ADMIN" && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin">관리자</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={logout}>로그아웃</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login" className="btn-compact">
                로그인
              </Link>
            )}

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                className="grid size-8 place-items-center text-hig-secondary md:hidden"
                aria-label="메뉴"
              >
                <MenuGlyph />
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <SheetTitle className="sr-only">메뉴</SheetTitle>
                <nav className="mt-12 flex flex-col px-4">
                  {NAV.map((n) => (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setMenuOpen(false)}
                      className="hairline-row t-body py-4"
                    >
                      {n.label}
                    </Link>
                  ))}
                  {session?.role === "ADMIN" && (
                    <Link
                      to="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="hairline-row t-body py-4"
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

function BellGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 8a5 5 0 0 1 10 0c0 3 .8 4.4 1.5 5.2H3.5C4.2 12.4 5 11 5 8Z" />
      <path d="M8 16a2 2 0 0 0 4 0" />
    </svg>
  );
}

function MenuGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M3 7h14M3 13h14" />
    </svg>
  );
}
