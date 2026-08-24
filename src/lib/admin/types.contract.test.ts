import type { ConsistencyPanel, GapValue, SourceValue } from "@/lib/admin/types";

// 백엔드의 NON_NULL JSON 직렬화 결과를 그대로 표현할 수 있어야 합니다.
export const pendingSource = { state: "PENDING" } satisfies SourceValue<number>;
export const unavailableSource = { state: "UNAVAILABLE" } satisfies SourceValue<number>;
export const notApplicableSource = { state: "N_A" } satisfies SourceValue<number>;
export const pendingGap = { state: "PENDING" } satisfies GapValue;

export const liveConsistency = {
  phase: "LIVE",
  overIssued: pendingGap,
  luaGap: pendingGap,
  activeDbGap: pendingGap,
  dbCounterGap: pendingGap,
  persistGap: pendingGap,
} satisfies ConsistencyPanel;

const unavailableGap = { state: "UNAVAILABLE" } satisfies GapValue;

export const promDownConsistency = {
  phase: "LIVE",
  overIssued: unavailableGap,
  luaGap: unavailableGap,
  activeDbGap: unavailableGap,
  dbCounterGap: unavailableGap,
  persistGap: unavailableGap,
} satisfies ConsistencyPanel;
