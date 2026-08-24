import {
  consistencySeverityLabel,
  consistencySeverityTone,
  consistencyVerdictLabel,
  consistencyVerdictTone,
  type ConsistencyVerdictTone,
} from "@/lib/admin/consistency-view";
import type { ConsistencyPhase, GapValue, Severity, Verdict } from "@/lib/admin/types";

const VERDICT_TONE_CLASS: Record<ConsistencyVerdictTone, string> = {
  pending: "text-hig-muted",
  bad: "text-viz-critical",
  unknown: "text-attention",
  ok: "text-viz-good",
};

export function ConsistencyStatus({
  phase,
  verdict,
  severity,
  gaps,
}: {
  phase: ConsistencyPhase;
  verdict?: Verdict | undefined;
  severity?: Severity | null | undefined;
  gaps: readonly GapValue[];
}) {
  const verdictTone = consistencyVerdictTone(phase, verdict, gaps);

  return (
    <section className="surface-card grid gap-4 px-5 py-4 sm:grid-cols-2">
      <div>
        <p className="t-caption text-hig-muted">정합성 판정 · {phase}</p>
        <p className={`t-tile mt-1 font-semibold ${VERDICT_TONE_CLASS[verdictTone]}`}>
          {consistencyVerdictLabel(phase, verdict)}
        </p>
      </div>
      <div className="border-hairline sm:border-l sm:pl-5">
        <p className="t-caption text-hig-muted">운영 severity · 서버 판정</p>
        <p className="t-body mt-2 flex items-center gap-2 font-semibold">
          <span
            className={`size-2.5 rounded-full ${consistencySeverityTone(severity)}`}
            aria-hidden
          />
          {consistencySeverityLabel(severity)}
        </p>
      </div>
    </section>
  );
}
