import type { ReactNode } from "react";

/**
 * 섹션 머리.
 *
 * 구조 표시는 라벨 하나로 끝냅니다. 배지·번호·구분 장식을 덧붙이지 않습니다.
 * 다만 라벨 위에 굵은 규칙선을 하나 얹었습니다 — 지면이 여기서 시작한다는 신호이고,
 * 이게 없으면 섹션 사이가 여백 크기로만 구분돼서 스크롤하면 다 같아 보입니다.
 */
export function SectionHead({
  eyebrow,
  title,
  note,
  action,
}: {
  eyebrow?: string | undefined;
  title: ReactNode;
  note?: ReactNode | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="yh-rule-head pt-5">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          {eyebrow && <p className="yh-label">{eyebrow}</p>}
          <h2 className="yh-title mt-3 max-w-[18em]">{title}</h2>
          {note && <p className="yh-lede mt-4 max-w-[42ch] break-keep text-yh-ink-2">{note}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

/** 발급 중 표시 — 화면당 한 곳에서만 씁니다. */
export function LiveLabel({ className = "" }: { className?: string }) {
  return (
    <span className={`yh-live ${className}`}>
      <span className="live-dot" />
      발급 중
    </span>
  );
}
