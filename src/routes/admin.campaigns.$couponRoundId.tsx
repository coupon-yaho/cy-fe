import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { SeriesChart, SeriesLegend, type SeriesSpec } from "@/components/admin/charts";
import { Panel, TablePanel, Tile } from "@/components/admin/panel";
import { MetaChips, PageHead, RefreshControl, Segmented } from "@/components/admin/shell";
import { StatedValue, Value } from "@/components/admin/state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPolling, type PollInterval } from "@/hooks/use-admin-polling";
import {
  ENGINE_LABEL,
  adminApi,
  type CouponMetricsResponse,
  type MetricsWindow,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/campaigns/$couponRoundId")({
  component: CampaignDetail,
});

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** 초당 수천 건이 흐르는 스트림이라 밀리초까지 찍습니다. */
function clockMs(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
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

  const metrics = useAdminPolling({
    pollKey: ["admin", "coupon-metrics", roundId, window],
    queryFn: () => adminApi.getCouponMetrics(roundId, window),
    intervalMs: interval,
  });
  const events = useAdminPolling({
    pollKey: ["admin", "events", roundId],
    queryFn: () => adminApi.getEvents({ couponRoundId: roundId, limit: 14 }),
    intervalMs: interval,
  });
  const histories = useAdminPolling({
    pollKey: ["admin", "histories", roundId],
    queryFn: () => adminApi.getHistories({ couponRoundId: roundId, limit: 12 }),
    intervalMs: interval,
  });

  const d = metrics.data;

  return (
    <>
      <nav className="t-caption mb-3 text-hig-muted">
        <Link to="/admin/campaigns" className="text-hig-link hover:underline">
          캠페인
        </Link>
        <span className="mx-1.5">/</span>
        <span>{d?.campaign ?? "상세"}</span>
      </nav>

      <PageHead
        title={d?.campaign ?? "캠페인 상세"}
        meta={
          d && (
            <MetaChips
              items={[
                ["engine", ENGINE_LABEL.v3],
                ["queue", "ADAPTIVE"],
                ["상태", d.roundStatus.value?.status ?? "—"],
              ]}
            />
          )
        }
        controls={
          <>
            <Segmented label="범위" value={window} options={WINDOWS} onChange={setWindow} />
            <RefreshControl
              interval={interval}
              onIntervalChange={setInterval}
              snapshotAt={d?.meta.snapshotAt}
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
          <Tiles data={d} />

          <div className="grid gap-4 xl:grid-cols-3">
            <StatusBreakdown data={d} />
            <NotificationPanel data={d} />
            <TransitionRate data={d} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TablePanel
              title="발급 이벤트"
              hint="샘플링"
              action={
                events.data && (
                  <span className="t-caption num text-hig-muted">
                    +{events.data.droppedCount.toLocaleString("ko-KR")} 생략
                  </span>
                )
              }
            >
              {!events.data ? (
                <Skeleton className="h-56 rounded-xl" />
              ) : (
                <table className="ops-table">
                  <tbody>
                    {events.data.events.map((e) => (
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

function Tiles({ data }: { data: CouponMetricsResponse }) {
  const stock = data.remainingStock.value;
  const progress = data.progress.value;
  const rate = data.issueRate.value;
  const queue = data.queue.value;

  return (
    <div className="grid gap-4 md:grid-cols-3 2xl:grid-cols-6">
      <Tile
        label="잔여 재고"
        sub={stock ? `전체 ${stock.total.toLocaleString("ko-KR")}` : undefined}
      >
        <Value source={data.remainingStock} render={(v) => v.remaining.toLocaleString("ko-KR")} />
      </Tile>
      <Tile
        label="발급 진행률"
        sub={progress ? `${progress.issued.toLocaleString("ko-KR")}장` : undefined}
      >
        <Value source={data.progress} render={(v) => `${(v.ratio * 100).toFixed(1)}%`} />
      </Tile>
      <Tile label="초당 발급" sub={rate ? `peak ${rate.peak.toLocaleString("ko-KR")}` : undefined}>
        <StatedValue source={data.issueRate} render={(v) => v.current.toLocaleString("ko-KR")} />
      </Tile>
      <Tile
        label="대기 인원"
        sub={
          queue
            ? queue.etaSeconds === null
              ? "예상 대기 계산 불가"
              : `예상 ${queue.etaSeconds}초`
            : undefined
        }
      >
        <Value source={data.queue} render={(v) => v.waiting.toLocaleString("ko-KR")} />
      </Tile>
      <Tile
        label="캠페인 상태"
        sub={data.roundStatus.value?.openAt ? `${data.roundStatus.value.openAt} 오픈` : undefined}
      >
        <Value source={data.roundStatus} render={(v) => v.status} />
      </Tile>
      <Tile label="사용률" sub="발급 수 대비">
        <Value source={data.usageRate} render={(v) => `${(v * 100).toFixed(1)}%`} />
      </Tile>
    </div>
  );
}

const BREAKDOWN_LABEL: Record<string, string> = {
  ISSUED: "보유",
  USED: "사용",
  CANCELLED: "취소",
  EXPIRED: "만료",
};

function StatusBreakdown({ data }: { data: CouponMetricsResponse }) {
  const b = data.statusBreakdown.value;
  const total = b ? b.ISSUED + b.USED + b.CANCELLED + b.EXPIRED : 0;
  const steps = [
    "var(--viz-seq-250)",
    "var(--viz-seq-450)",
    "var(--viz-seq-350)",
    "var(--viz-seq-650)",
  ];

  return (
    <Panel title="상태별 보유량" state={data.statusBreakdown.state}>
      {!b ? (
        <p className="t-body-sm text-hig-muted">—</p>
      ) : (
        <ul className="space-y-2.5">
          {(Object.keys(BREAKDOWN_LABEL) as (keyof typeof b)[]).map((k, i) => (
            <li key={k}>
              <div className="flex items-baseline justify-between">
                <span className="t-body-sm">{BREAKDOWN_LABEL[k]}</span>
                <span className="num t-body-sm font-semibold">{b[k].toLocaleString("ko-KR")}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-fill">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${total ? (b[k] / total) * 100 : 0}%`, background: steps[i] }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NotificationPanel({ data }: { data: CouponMetricsResponse }) {
  const n = data.notification.value;
  return (
    <Panel title="알림 발송" hint="오픈 T-5분">
      {!n ? (
        <p className="t-body-sm text-hig-muted">—</p>
      ) : (
        <>
          <p className="t-tile num">{(n.sentRate * 100).toFixed(1)}%</p>
          <p className="t-caption mt-1 text-hig-secondary">
            {n.sent.toLocaleString("ko-KR")} / {n.total.toLocaleString("ko-KR")}
          </p>
          <dl className="t-body-sm mt-4 space-y-1">
            {(
              [
                ["잔여", n.pending, false],
                ["실패", n.failed, n.failed > 0],
                ["DLQ", n.dlq, n.dlq > 0],
              ] as [string, number, boolean][]
            ).map(([label, v, alert]) => (
              <div key={label} className="hairline-row flex justify-between py-1">
                <dt className="text-hig-secondary">{label}</dt>
                <dd className={`num font-semibold ${alert ? "text-attention" : ""}`}>
                  {v.toLocaleString("ko-KR")}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Panel>
  );
}

const TRANSITION_SERIES: SeriesSpec[] = [
  { key: "USE", label: "사용", color: "var(--viz-1)" },
  { key: "CANCEL_USE", label: "사용 취소", color: "var(--viz-3)" },
  { key: "CANCEL", label: "발급 취소", color: "var(--viz-4)" },
  { key: "EXPIRE", label: "만료", color: "var(--viz-2)" },
];

function TransitionRate({ data }: { data: CouponMetricsResponse }) {
  const series = data.transitionRate.value ?? [];
  return (
    <Panel title="상태 변경 추이">
      <SeriesLegend series={TRANSITION_SERIES} />
      <div className="mt-3">
        <SeriesChart data={series} series={TRANSITION_SERIES} height={150} />
      </div>
    </Panel>
  );
}
