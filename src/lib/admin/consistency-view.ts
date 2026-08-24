import type { ConsistencyPhase, GapValue, Severity, Verdict } from "@/lib/admin/types";

export type ConsistencyVerdictTone = "pending" | "bad" | "unknown" | "ok";

export function consistencyVerdictLabel(
  phase: ConsistencyPhase,
  verdict: Verdict | undefined,
): string {
  if (phase === "LIVE") return "판정 대기";
  return verdict ?? "판정 불가";
}

export function consistencyVerdictTone(
  phase: ConsistencyPhase,
  verdict: Verdict | undefined,
  gaps: readonly GapValue[],
): ConsistencyVerdictTone {
  if (phase === "LIVE") return "pending";
  if (verdict === "FAIL") return "bad";
  if (gaps.some((gap) => gap.state === "UNAVAILABLE")) return "unknown";
  return "ok";
}

export function consistencySeverityTone(severity: Severity | null | undefined): string {
  if (severity === "CRITICAL") return "bg-viz-critical";
  if (severity === "WARN") return "bg-viz-warning";
  if (severity === "NONE") return "bg-viz-good";
  return "bg-hig-muted";
}

export function consistencySeverityLabel(severity: Severity | null | undefined): string {
  return severity ?? "판단 불가";
}
