import type { ReactNode } from "react";

/**
 * 섹션 머리.
 *
 * DESIGN.md §2·§12 — 구조 표시는 눈썹 라벨 하나로 끝냅니다.
 * 배지·번호·구분 장식을 덧붙이지 않고, 크기와 여백만으로 위계를 만듭니다.
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
  action?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {/* 제목은 자기 글자 크기 기준으로 폭을 잡습니다 — ch 는 본문 크기라 40px 제목에 쓰면 좁습니다 */}
        <h2 className="t-section mt-1.5 max-w-[16em]">{title}</h2>
        {note && <p className="t-body mt-3 max-w-[46ch] text-hig-secondary">{note}</p>}
      </div>
      {action}
    </div>
  );
}

/** 발급 중 표시 — 화면당 한 곳에서만 씁니다. */
export function LiveLabel({ className = "" }: { className?: string }) {
  return (
    <span
      className={`t-caption inline-flex items-center gap-1.5 font-semibold text-live ${className}`}
    >
      <span className="live-dot" />
      발급 중
    </span>
  );
}
