import type { LiveCouponMetricsResponse, Point } from "./types";

const MAX_TRANSITION_POINTS = 300;

type TransitionRateValue = NonNullable<LiveCouponMetricsResponse["transitionRate"]["value"]>;

export function appendTransitionSample(
  previous: Point[],
  snapshotAt: string,
  value: TransitionRateValue,
): Point[] {
  const t = Date.parse(snapshotAt);
  if (!Number.isFinite(t)) return previous;

  const point: Point = {
    t,
    USE: value.usePerSecond,
    CANCEL_USE: value.cancelUsePerSecond,
    CANCEL: value.cancelPerSecond,
    EXPIRE: value.expirePerSecond,
  };
  const next = previous.at(-1)?.t === t ? [...previous.slice(0, -1), point] : [...previous, point];
  return next.length > MAX_TRANSITION_POINTS ? next.slice(-MAX_TRANSITION_POINTS) : next;
}
