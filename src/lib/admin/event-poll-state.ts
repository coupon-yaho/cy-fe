import type { EventSlice } from "./types";

/** 커서 페이지를 이어 붙이고 화면에는 최신 이벤트만 남깁니다. */
export function mergeEventPoll(
  previous: EventSlice | undefined,
  next: EventSlice,
  limit: number,
): EventSlice {
  const byId = new Map<string, EventSlice["events"][number]>();
  for (const event of previous?.events ?? []) byId.set(event.eventId, event);
  for (const event of next.events) byId.set(event.eventId, event);

  return {
    ...next,
    events: [...byId.values()]
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, limit),
    droppedCount: (previous?.droppedCount ?? 0) + next.droppedCount,
    sampled: (previous?.sampled ?? false) || next.sampled,
  };
}
