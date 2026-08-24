import type { LatencyPanel, SourceValue } from "./types";

/** KPI는 uri 그룹 분해가 아니라 서버의 전체 success 집계를 계속 사용합니다. */
export function latencySuccessP99(latency: LatencyPanel): SourceValue<number> {
  return {
    state: latency.success.state,
    value: latency.success.value?.p99Millis,
    observedAt: latency.success.observedAt,
  };
}
