import type { ReactNode } from "react";
import { StateBadge } from "@/components/admin/state";
import type { SourceState } from "@/lib/admin";

/** 패널 — 제목 한 줄과 내용. 설명은 값이 스스로 못 말할 때만 붙입니다. */
export function Panel({
  title,
  hint,
  state,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  hint?: string;
  state?: SourceState;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`surface-card flex min-w-0 flex-col ${className}`}>
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="t-body-sm flex items-baseline gap-2 font-semibold">
          {title}
          {hint && <span className="t-caption font-normal text-hig-muted">{hint}</span>}
          {state && <StateBadge state={state} />}
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={`min-w-0 flex-1 px-5 pb-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** 표를 그대로 담는 패널 — 좌우 여백 없이 폭을 다 씁니다. */
export function TablePanel({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface-card min-w-0">
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="t-body-sm flex items-baseline gap-2 font-semibold">
          {title}
          {hint && <span className="t-caption font-normal text-hig-muted">{hint}</span>}
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="overflow-x-auto px-5 pb-4">{children}</div>
    </section>
  );
}

/** 지표 타일 */
export function Tile({
  label,
  hint,
  children,
  sub,
  alert,
  onClick,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  sub?: ReactNode;
  alert?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`surface-card flex min-w-0 flex-col p-4 text-left ${
        onClick ? "transition-colors hover:bg-white/70" : ""
      }`}
    >
      <p className="t-caption flex items-baseline gap-1.5 text-hig-muted">
        {label}
        {hint && <span className="text-hig-muted">{hint}</span>}
      </p>
      <div className={`t-tile num mt-1.5 ${alert ? "text-live" : ""}`}>{children}</div>
      {sub && <div className="t-caption mt-auto pt-1.5 text-hig-secondary">{sub}</div>}
    </Tag>
  );
}
