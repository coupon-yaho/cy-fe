import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-secondary/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <BrandLogo className="h-7" />
          <p className="text-xs text-muted-foreground">
            통신사 브랜드 데이 · 대규모 트래픽 선착순 쿠폰 발급 시스템 데모
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link to="/events" className="hover:text-foreground">
            브랜드 데이
          </Link>
          <Link to="/my/coupons" className="hover:text-foreground">
            내 쿠폰함
          </Link>
          <Link to="/admin" className="hover:text-foreground">
            관리자 콘솔
          </Link>
        </div>
      </div>
      <div className="border-t border-border/70 px-4 py-4 text-center text-xs text-muted-foreground">
        로그인 · 알림은 모두 Mock 처리된 데모 화면입니다.
      </div>
    </footer>
  );
}
