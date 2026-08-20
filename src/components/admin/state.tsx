import type { ReactNode } from "react";
import {
  SOURCE_STATE_LABEL,
  SOURCE_STATE_NOTE,
  type SourceState,
  type SourceValue,
} from "@/lib/admin";

/**
 * 값 상태 계약 (AB-G0 · Source Status 6종).
 *
 * 빈칸과 0을 구분하지 못하면 관제가 아닙니다.
 * VALID 는 배지를 달지 않습니다 — 정상이 기본값이라 배지를 달면 화면이 배지로 덮입니다.
 */

const STATE_TONE: Record<SourceState, string> = {
  VALID: "",
  PENDING: "text-attention",
  STALE: "text-attention",
  NO_TRAFFIC: "text-hig-muted",
  WARMING_UP: "text-hig-muted",
  N_A: "text-hig-muted",
};

export function StateBadge({ state, className = "" }: { state: SourceState; className?: string }) {
  if (state === "VALID") return null;
  return (
    <span
      title={SOURCE_STATE_NOTE[state]}
      className={`t-caption inline-flex items-center gap-1 font-semibold ${STATE_TONE[state]} ${className}`}
    >
      <StateGlyph state={state} />
      {SOURCE_STATE_LABEL[state]}
    </span>
  );
}

/** 상태는 색만으로 전달하지 않습니다 — 모양과 라벨을 함께 씁니다. */
function StateGlyph({ state }: { state: SourceState }) {
  if (state === "PENDING") {
    return (
      <svg
        viewBox="0 0 10 10"
        className="size-2.5"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <circle cx="5" cy="5" r="4" />
        <path d="M5 2.6V5l1.6 1.2" />
      </svg>
    );
  }
  if (state === "STALE") {
    return (
      <svg
        viewBox="0 0 10 10"
        className="size-2.5"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <path d="M5 1.4 9 8.6H1z" />
        <path d="M5 4.2v1.6" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 10 10"
      className="size-2.5"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M1.6 5h6.8" />
    </svg>
  );
}

/**
 * 값 렌더러.
 *
 * 값이 없으면 대시를 두고 옆에 상태를 붙입니다. 0 으로 대신 채우지 않습니다 —
 * "아직 안 센 0" 과 "정말 0" 은 판정이 갈립니다.
 */
export function Value<T>({
  source,
  render,
  className = "",
  suffix,
}: {
  source: SourceValue<T> | undefined;
  render?: ((value: T) => ReactNode) | undefined;
  className?: string | undefined;
  suffix?: ReactNode | undefined;
}) {
  if (!source || source.value === null) {
    return (
      <span
        className={`num text-hig-muted ${className}`}
        title={source ? SOURCE_STATE_NOTE[source.state] : undefined}
      >
        —
      </span>
    );
  }
  return (
    <span className={`num ${className}`}>
      {render ? render(source.value) : String(source.value)}
      {suffix}
    </span>
  );
}

/** 값 + 상태를 한 덩어리로. 대부분의 자리에서 이걸 씁니다. */
export function StatedValue<T>({
  source,
  render,
  className = "",
  suffix,
}: {
  source: SourceValue<T> | undefined;
  render?: ((value: T) => ReactNode) | undefined;
  className?: string | undefined;
  suffix?: ReactNode | undefined;
}) {
  // 값이 0 인데 "요청 없음"까지 붙이면 같은 말을 두 번 합니다.
  const redundant = source?.state === "NO_TRAFFIC" && source.value === 0;

  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <Value source={source} render={render} className={className} suffix={suffix} />
      {source && source.state !== "VALID" && !redundant && <StateBadge state={source.state} />}
      {source?.note && <span className="t-caption text-hig-muted">{source.note}</span>}
    </span>
  );
}
