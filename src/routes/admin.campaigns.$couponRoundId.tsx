import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LiveCampaignDetail } from "@/components/admin/live-campaign-detail";
import { TablePanel } from "@/components/admin/panel";
import { MetaChips, PageHead, RefreshControl, Segmented } from "@/components/admin/shell";
import { StateBadge } from "@/components/admin/state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPolling, type PollInterval } from "@/hooks/use-admin-polling";
import { adminApi, type MetricsWindow, type Point } from "@/lib/admin";
import { appendTransitionSample } from "@/lib/admin/transition-series";
import { mergeEventPoll } from "@/lib/admin/event-poll-state";

export const Route = createFileRoute("/admin/campaigns/$couponRoundId")({
  component: CampaignDetail,
});

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** 초당 수천 건이 흐르는 스트림이라 밀리초까지 찍습니다. */
function clockMs(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function EventScopeNotice() {
  return (
    <p className="t-caption mb-3 text-hig-muted">
      백엔드는 전체 회차 이벤트를 반환하고 이 화면에서 선택 회차만 표시합니다. 이벤트가 많으면 조회
      범위 밖의 일부 이벤트가 보이지 않을 수 있습니다.
    </p>
  );
}

const WINDOWS: { value: MetricsWindow; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
];

function CampaignDetail() {
  const { couponRoundId } = useParams({ from: "/admin/campaigns/$couponRoundId" });
  const roundId = Number(couponRoundId);
  const [interval, setInterval] = useState<PollInterval>(1000);
  const [window, setWindow] = useState<MetricsWindow>("1m");
  const [transitionHistory, setTransitionHistory] = useState<{
    key: string;
    points: Point[];
  }>({ key: "", points: [] });
  const eventCursor = useRef<string | null>(null);
  const [eventStream, setEventStream] = useState<ReturnType<typeof mergeEventPoll>>();

  const metrics = useAdminPolling({
    pollKey: ["admin", "coupon-metrics", roundId, window],
    queryFn: (signal) => adminApi.getCouponMetrics(roundId, window, signal),
    intervalMs: interval,
  });
  const events = useAdminPolling({
    pollKey: ["admin", "events", roundId],
    queryFn: async (signal) => {
      const page = await adminApi.getEvents(
        { couponRoundId: roundId, cursor: eventCursor.current, limit: 14 },
        signal,
      );
      eventCursor.current = page.nextCursor;
      return page;
    },
    intervalMs: interval,
  });
  const histories = useAdminPolling({
    pollKey: ["admin", "histories", roundId],
    queryFn: (signal) => adminApi.getHistories({ couponRoundId: roundId, limit: 12 }, signal),
    intervalMs: interval,
  });

  const d = metrics.data;
  useEffect(() => {
    eventCursor.current = null;
    setEventStream(undefined);
  }, [roundId]);
  useEffect(() => {
    if (events.data) setEventStream((previous) => mergeEventPoll(previous, events.data!, 14));
  }, [events.data]);
  const visibleEvents = eventStream ?? events.data;
  const transitionKey = `${roundId}:${window}`;
  useEffect(() => {
    if (!d || !d.transitionRate.value) return;
    setTransitionHistory((previous) => ({
      key: transitionKey,
      points: appendTransitionSample(
        previous.key === transitionKey ? previous.points : [],
        d.snapshotAt,
        d.transitionRate.value!,
      ),
    }));
  }, [d, transitionKey]);
  const transitionSeries = transitionHistory.key === transitionKey ? transitionHistory.points : [];
  const overview = useQuery({
    queryKey: ["admin", "overview", "detail-label", roundId],
    queryFn: ({ signal }) => adminApi.getOverview({}, signal),
    enabled: !!d,
    staleTime: 30_000,
  });
  const couponName = overview.data?.couponRounds.value?.find(
    (couponRound) => couponRound.couponId === roundId,
  )?.couponName;
  const campaignTitle = d ? (couponName ?? `회차 #${d.couponId}`) : `회차 #${roundId}`;
  // 셋 중 하나만 멈춰도 이 화면의 숫자는 서로 다른 시각의 값이 섞입니다.
  const stale = metrics.isStale || events.isStale || histories.isStale;

  return (
    <>
      <nav className="t-caption mb-3 text-hig-muted">
        <Link to="/admin/campaigns" className="text-hig-link hover:underline">
          캠페인
        </Link>
        <span className="mx-1.5">/</span>
        <span>{campaignTitle}</span>
      </nav>

      <PageHead
        title={campaignTitle}
        meta={
          d ? (
            <MetaChips
              items={[
                ["회차", `#${d.couponId}`],
                ["상태", d.couponRound?.status ?? "—"],
                ["구간", d.window],
              ]}
            />
          ) : null
        }
        controls={
          <>
            <Segmented label="범위" value={window} options={WINDOWS} onChange={setWindow} />
            {stale && <StateBadge state="STALE" />}
            <RefreshControl
              interval={interval}
              onIntervalChange={setInterval}
              snapshotAt={d?.snapshotAt}
            />
          </>
        }
      />

      {!d ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <LiveCampaignDetail
            data={d}
            {...(couponName ? { couponName } : {})}
            transitionSeries={transitionSeries}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <TablePanel
              title="발급 이벤트"
              hint="샘플링"
              action={
                visibleEvents && (
                  <span className="t-caption num text-hig-muted">
                    +{visibleEvents.droppedCount.toLocaleString("ko-KR")} 생략
                  </span>
                )
              }
            >
              <EventScopeNotice />
              {!visibleEvents ? (
                <Skeleton className="h-56 rounded-xl" />
              ) : visibleEvents.events.length === 0 ? (
                <p className="t-body-sm py-3 text-hig-muted">
                  표시할 이벤트가 없습니다. Kafka가 꺼져 있으면 이벤트 원천은 비어 있습니다.
                </p>
              ) : (
                <table className="ops-table">
                  <tbody>
                    {visibleEvents.events.map((e) => (
                      <tr key={e.eventId}>
                        <td className="num w-28 text-hig-muted">{clockMs(e.occurredAt)}</td>
                        <td className="num w-24 text-hig-secondary">m_{e.memberId}</td>
                        <td className="num">
                          {e.code ?? "—"}
                          {e.queuePosition !== null && (
                            <span className="ml-2 text-hig-muted">
                              #{e.queuePosition.toLocaleString("ko-KR")}
                            </span>
                          )}
                        </td>
                        <td
                          className={`num text-right font-semibold ${
                            e.httpStatus >= 500
                              ? "text-live"
                              : e.httpStatus === 201
                                ? "text-positive"
                                : "text-hig-muted"
                          }`}
                        >
                          {e.httpStatus} {e.reasonCode ?? "발급"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TablePanel>

            <TablePanel title="상태 변경">
              {!histories.data ? (
                <Skeleton className="h-56 rounded-xl" />
              ) : histories.data.histories.length === 0 ? (
                <p className="t-body-sm py-3 text-hig-muted">
                  이 회차의 상태 변경 이력이 없습니다.
                </p>
              ) : (
                <table className="ops-table">
                  <tbody>
                    {histories.data.histories.map((h) => (
                      <tr key={h.id}>
                        <td className="num w-28 text-hig-muted">{clockMs(h.occurredAt)}</td>
                        <td className="num">{h.code}</td>
                        <td className="num">
                          {h.from} → {h.to}
                        </td>
                        <td className="text-hig-muted">{h.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TablePanel>
          </div>
        </div>
      )}
    </>
  );
}
