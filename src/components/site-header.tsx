import { Link, useRouterState } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Bell, Check, ChevronDown, LogOut, Menu, RotateCcw, Shield, Ticket, X } from "lucide-react";
import { ThemeChoices, ThemeToggle } from "@/components/coupon/theme-toggle";
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
import { useNotifications, type NotificationKind } from "@/hooks/use-notifications";

const NAV = [
  { to: "/", label: "홈" },
  { to: "/events", label: "브랜드 데이" },
  { to: "/my/coupons", label: "내 쿠폰함" },
] as const;

/* 알림 한 줄의 겉모습. 발급과 취소가 같은 굵은 글씨로 나란히 있으면
   좋은 소식인지 아닌지를 제목을 읽어야 압니다. 아이콘과 색으로 먼저 말합니다. */
const KIND: Record<NotificationKind, { icon: typeof Bell; tone: string; ring: string }> = {
  issued: { icon: Ticket, tone: "text-yh-accent-dark", ring: "bg-yh-accent-soft" },
  used: { icon: Check, tone: "text-yh-good", ring: "bg-yh-paper-2" },
  restored: { icon: RotateCcw, tone: "text-yh-navy", ring: "bg-yh-paper-2" },
  canceled: { icon: X, tone: "text-yh-ink-3", ring: "bg-yh-paper-2" },
};

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
  /* 열면 바로 읽음 처리되니, 연 순간의 안 읽은 수를 붙잡아 둡니다 —
     안 그러면 무엇이 새로 온 것인지 열자마자 사라집니다. */
  const [freshCount, setFreshCount] = useState(0);

  /* 알림 패널을 종 아이콘이 아니라 **헤더 오른쪽 끝**에 맞춥니다.
     종에 맞추면 패널이 종에서 왼쪽으로 매달려 뜹니다 — 오른쪽에 계정 알약이
     남아 있어서 로그아웃 때 71px, 로그인 때 157px 이 비었습니다(실측 1440px).
     비는 폭이 닉네임 길이를 따라 달라져서 고정값으로는 못 맞춥니다. 열 때 잽니다. */
  const clusterRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [bellNudge, setBellNudge] = useState(0);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-yh-rule bg-yh-paper/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] w-full max-w-6xl items-center gap-4 px-5 md:gap-8">
          {/* 사양서 §2 — 데스크탑은 A-mark 40px, 모바일은 워드마크만 28px.
              키비주얼(B)은 이 자리에 쓰지 않습니다. */}
          <Link to="/" className="shrink-0" aria-label="쿠폰 야~호 홈">
            <BrandLogo variant="mark" className="h-10 sm:h-11" />
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

          <div ref={clusterRef} className="ml-auto flex items-center gap-1.5">
            {/* 360px 에서는 이 아이콘 하나가 더 들어갈 자리가 없습니다.
                그 폭에서는 메뉴 시트 안의 ThemeChoices 가 같은 일을 합니다. */}
            <ThemeToggle className="hidden sm:grid" />

            <DropdownMenu
              onOpenChange={(o) => {
                if (!o) return;
                const cluster = clusterRef.current?.getBoundingClientRect();
                const bell = bellRef.current?.getBoundingClientRect();
                if (cluster && bell) setBellNudge(Math.round(cluster.right - bell.right));
                setFreshCount(unread);
                markAllRead();
              }}
            >
              <DropdownMenuTrigger
                ref={bellRef}
                className="relative grid size-9 place-items-center rounded-full text-yh-ink-2 transition-colors hover:bg-yh-paper-2 hover:text-yh-navy"
                aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
              >
                <Bell className="size-[18px]" strokeWidth={1.8} aria-hidden />
                {/* 점 하나로는 "뭔가 있다" 까지만 말합니다. 몇 건인지가 열어 볼지 말지를
                    정하므로 숫자를 적습니다. 두 자리를 넘으면 9+ 로 줄입니다. */}
                {unread > 0 && (
                  <span
                    className="yh-num absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-yh-accent-btn px-1 text-[10px] leading-4 font-extrabold text-white"
                    aria-hidden
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                alignOffset={-bellNudge}
                /* shadow-[var(--yh-shadow-lg)] 로 띄웁니다 — 기본 그림자는
                   0 4px 6px 라서 어두운 히어로 띠 위에서 떠 보이지 않았습니다. */
                className="yh w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-yh-rule bg-yh-surface p-0 shadow-[var(--yh-shadow-lg)]"
              >
                <div
                  className={`flex items-baseline gap-2 px-4 pt-3 pb-2.5 ${
                    items.length > 0 ? "border-b border-yh-rule" : ""
                  }`}
                >
                  <p className="yh-sub">알림</p>
                  {freshCount > 0 && (
                    <p className="yh-num yh-small font-bold text-yh-accent-dark">
                      새 소식 {freshCount}
                    </p>
                  )}
                  {items.length > 6 && (
                    <p className="yh-num yh-small ml-auto text-yh-ink-3">
                      최근 6개 · 전체 {items.length}
                    </p>
                  )}
                </div>
                {items.length === 0 ? (
                  /* 아이콘 원 + 굵은 줄 + 설명 + 버튼으로 284px 를 썼습니다. 없다는 걸
                     말하는 데 그만한 판이 필요하지 않고, 버튼은 바로 위 내비게이션의
                     "브랜드 데이" 와 같은 곳으로 갔습니다. 두 줄로 줄입니다. */
                  <div className="px-4 pt-0.5 pb-4">
                    {/* 제목은 왼쪽인데 본문만 가운데면 두 덩어리로 갈라져 보입니다 */}
                    <p className="yh-small text-yh-ink-2">아직 온 알림이 없습니다.</p>
                    <p className="yh-small mt-1 text-yh-ink-3">쿠폰을 받거나 쓰면 여기 쌓입니다.</p>
                  </div>
                ) : (
                  items.slice(0, 6).map((n, i) => {
                    const { icon: Icon, tone, ring } = KIND[n.kind];
                    return (
                      /* 줄 전체가 쿠폰함으로 갑니다 — 알림을 읽고 나면 다음에 하는 일이
                         "그래서 그 쿠폰 어디 있지" 하나뿐입니다. */
                      <DropdownMenuItem key={n.id} asChild className="p-0 focus:bg-transparent">
                        <Link
                          to="/my/coupons"
                          className="flex w-full items-start gap-3 border-b border-yh-rule px-4 py-3 last:border-0 hover:bg-yh-paper-2"
                        >
                          <span
                            className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${ring} ${tone}`}
                          >
                            <Icon className="size-4" strokeWidth={2} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            {/* 제목과 시각을 한 줄에 둡니다 — 시각이 밑에 따로 있으면
                                알림 하나가 세 줄이 되어 여섯 개가 화면을 넘깁니다. */}
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="yh-body min-w-0 truncate font-bold">{n.title}</span>
                              <span className="yh-small yh-num shrink-0 text-yh-ink-3">
                                {timeAgo(n.at)}
                              </span>
                            </span>
                            <span className="yh-small mt-0.5 block text-yh-ink-2">{n.body}</span>
                          </span>
                          {/* 이번에 열면서 처음 본 것들 */}
                          {i < freshCount && (
                            <span
                              className="mt-2 size-1.5 shrink-0 rounded-full bg-yh-accent"
                              aria-label="새 알림"
                            />
                          )}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {session ? (
              <DropdownMenu>
                {/* 테두리도 배경도 없는 맨 글자였습니다. 옆의 두 아이콘 버튼과 나란히
                    놓이면 누를 수 있는 것인지 그냥 이름표인지 알 수 없습니다.
                    로그아웃 상태의 "로그인" 알약과 같은 무게로 맞춥니다. */}
                <DropdownMenuTrigger className="yh-body flex h-9 items-center gap-2 rounded-full border border-yh-rule bg-yh-surface pr-2 pl-3 font-semibold transition-colors hover:border-yh-navy-400 hover:bg-yh-paper-2 data-[state=open]:border-yh-navy-400 data-[state=open]:bg-yh-paper-2">
                  {/* 관리자는 로그인할 때 등급을 고르지 않습니다. 그런데 여기에 "골드" 가
                      떠 있으면 고르지도 않은 값이 어딘가에서 쓰이는 줄 알게 됩니다. */}
                  {session.role === "ADMIN" ? (
                    <span className="yh-small font-bold text-yh-ink-2">관리자</span>
                  ) : (
                    <GradeChip grade={session.grade} size="sm" />
                  )}
                  <span className="hidden text-yh-navy sm:inline">{session.nickname}</span>
                  <ChevronDown
                    className="size-3.5 shrink-0 text-yh-ink-3"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="yh w-64 rounded-xl border-yh-rule bg-yh-surface p-0"
                >
                  <div className="border-b border-yh-rule px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="yh-sub truncate">{session.nickname}</p>
                      {session.role === "ADMIN" ? (
                        <span className="yh-small shrink-0 font-bold text-yh-ink-2">관리자</span>
                      ) : (
                        <GradeChip grade={session.grade} size="sm" />
                      )}
                    </div>
                    {/* "문의하실 때 이 번호를 알려 주세요" 를 매번 한 줄 더 적고 있었습니다.
                        번호가 왜 있는지는 한 번 알면 되는 것이라 라벨에 붙입니다. */}
                    <p className="yh-small mt-1.5 text-yh-ink-3">
                      문의용 회원 번호{" "}
                      <span className="yh-num font-bold text-yh-ink-2">{session.memberId}</span>
                    </p>
                  </div>
                  <div className="p-1">
                    <DropdownMenuItem asChild className="yh-body rounded-lg font-medium">
                      <Link to="/my/coupons" className="flex items-center gap-2.5">
                        <Ticket className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />내
                        쿠폰함
                      </Link>
                    </DropdownMenuItem>
                    {session.role === "ADMIN" && (
                      <DropdownMenuItem asChild className="yh-body rounded-lg font-medium">
                        <Link to="/admin" className="flex items-center gap-2.5">
                          <Shield className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
                          관리자
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </div>
                  {/* 로그아웃은 되돌리는 데 손이 가는 동작이라 이동 항목과 줄을 나눕니다 */}
                  <div className="border-t border-yh-rule p-1">
                    <DropdownMenuItem
                      onSelect={logout}
                      className="yh-body flex items-center gap-2.5 rounded-lg font-medium text-yh-ink-2"
                    >
                      <LogOut className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
                      로그아웃
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // 지금 보던 화면으로 돌아옵니다 — 로그인 때문에 자리를 잃지 않게
              <Link to="/login" search={{ redirect: pathname }} className="yh-btn-sm">
                로그인
              </Link>
            )}

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                className="grid size-9 place-items-center rounded-full text-yh-ink-2 transition-colors hover:bg-yh-paper-2 md:hidden"
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
                <div className="mt-8 px-5 sm:hidden">
                  <ThemeChoices />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <LiveStrip />
    </header>
  );
}
