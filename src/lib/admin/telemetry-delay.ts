import type { AdminMetricsResponse, EventSlice, Point } from "./types";

const MAX_POINTS = 60;

/** 이벤트 발생 시각부터 브라우저가 받은 시각까지의 표시 지연을 Telemetry 영역에 합칩니다. */
export function withTelemetryDelay(
  metrics: AdminMetricsResponse,
  events: EventSlice | undefined,
  receivedAt: number,
): AdminMetricsResponse {
  if (!metrics.saturation || !events?.events.length) return metrics;

  const newestOccurredAt = Math.max(...events.events.map((event) => Date.parse(event.occurredAt)));
  if (!Number.isFinite(newestOccurredAt)) return metrics;

  const delaySeconds = Math.max(0, (receivedAt - newestOccurredAt) / 1000);
  return {
    ...metrics,
    saturation: {
      ...metrics.saturation,
      queues: metrics.saturation.queues.map((queue) => {
        if (queue.zone !== "Telemetry") return queue;
        const point: Point = { t: receivedAt, displayLagSeconds: delaySeconds };
        return {
          ...queue,
          metrics: queue.metrics.map((metric) => ({
            ...metric,
            value: {
              state: "VALID" as const,
              value: delaySeconds,
              observedAt: new Date(receivedAt).toISOString(),
            },
          })),
          series: [...queue.series, point].slice(-MAX_POINTS),
        };
      }),
    },
  };
}
