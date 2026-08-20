import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { POLL_OPTIONS, type PollInterval } from "@/hooks/use-admin-polling";
import { isMockAdmin } from "@/lib/admin";

const NAV = [
  { to: "/admin", label: "운영 현황" },
  { to: "/admin/campaigns", label: "캠페인" },
  { to: "/admin/system", label: "시스템" },
  { to: "/admin/analysis", label: "성능 비교" },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) =>
    to === "/admin" ? pathname === "/admin" : pathname.startsWith(to);

  return (
    <div className="min-h-screen bg-hig-canvas lg:flex">
      <aside className="sticky top-0 z-40 shrink-0 border-b border-hairline bg-hig-surface lg:h-screen lg:w-52 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <Link to="/admin" aria-label="관리자 홈">
            <BrandLogo className="h-5" />
          </Link>
          <span className="t-caption font-semibold text-hig-muted">관리자</span>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`t-body-sm rounded-lg px-3 py-2 whitespace-nowrap transition-colors ${
                isActive(n.to)
                  ? "bg-fill font-semibold text-hig-fg"
                  : "text-hig-secondary hover:bg-fill/60"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden border-t border-hairline px-5 py-4 lg:block">
          <Link to="/" className="t-body-sm text-hig-link hover:underline">
            서비스 화면
          </Link>
          {isMockAdmin && <p className="t-caption mt-2 text-hig-muted">샘플 데이터</p>}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-6 pb-20">{children}</main>
    </div>
  );
}

/** 화면 머리 — 제목과 그 화면의 컨트롤. */
export function PageHead({
  title,
  meta,
  controls,
}: {
  title: string;
  meta?: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="t-tile">{title}</h1>
        {meta}
      </div>
      {controls && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{controls}</div>}
    </header>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="t-caption text-hig-muted">{label}</span>}
      <div className="inline-flex rounded-full bg-fill p-0.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`t-caption rounded-full px-2.5 py-1 transition-colors ${
              value === o.value ? "bg-hig-surface font-semibold text-hig-fg" : "text-hig-secondary"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 갱신 주기와 마지막 갱신 시각 */
export function RefreshControl({
  interval,
  onIntervalChange,
  snapshotAt,
}: {
  interval: PollInterval;
  onIntervalChange: (v: PollInterval) => void;
  snapshotAt?: string | undefined;
}) {
  const stamp = snapshotAt ? new Date(snapshotAt) : null;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center gap-3">
      <Segmented value={interval} options={POLL_OPTIONS} onChange={onIntervalChange} />
      <span className="t-caption num text-hig-muted">
        {stamp
          ? `${pad(stamp.getHours())}:${pad(stamp.getMinutes())}:${pad(stamp.getSeconds())}`
          : "—"}
      </span>
    </div>
  );
}

/** 실행 범위 같은 짧은 상태값 묶음 */
export function MetaChips({ items }: { items: [string, string][] }) {
  return (
    <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dt className="t-caption text-hig-muted">{k}</dt>
          <dd className="num t-caption font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminForbidden() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-32 text-center">
      <h1 className="t-section">관리자만 볼 수 있는 화면입니다</h1>
      <p className="t-body mt-3 text-hig-secondary">
        데모에서는 로그인할 때 관리자 화면을 고르면 됩니다.
      </p>
      <Link to="/login" className="btn-primary mt-8">
        관리자로 로그인
      </Link>
    </div>
  );
}
