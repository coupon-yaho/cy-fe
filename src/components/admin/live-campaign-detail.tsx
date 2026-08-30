import { SeriesChart, SeriesLegend, type SeriesSpec } from "@/components/admin/charts";
import { Panel, Tile } from "@/components/admin/panel";
import { StatedValue, Value } from "@/components/admin/state";
import type { LiveCouponMetricsResponse, Point, SourceValue } from "@/lib/admin";

const HOLDING_LABELS = {
  unusedCount: "보유",
  usedCount: "사용",
  cancelledCount: "취소",
  expiredCount: "만료",
} as const;

const TRANSITION_SERIES: SeriesSpec[] = [
  { key: "USE", label: "사용", color: "var(--viz-1)" },
  { key: "CANCEL_USE", label: "사용 취소", color: "var(--viz-3)" },
  { key: "CANCEL", label: "발급 취소", color: "var(--viz-4)" },
  { key: "EXPIRE", label: "만료", color: "var(--viz-2)" },
];

function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function select<T, U>(source: SourceValue<T>, pick: (value: T) => U): SourceValue<U> {
  return {
    state: source.state,
    ...(source.value == null ? {} : { value: pick(source.value) }),
    ...(source.observedAt ? { observedAt: source.observedAt } : {}),
  };
}

export function LiveCampaignDetail({
  data,
  couponName,
  transitionSeries = [],
}: {
  data: LiveCouponMetricsResponse;
  couponName?: string;
  transitionSeries?: Point[];
}) {
  const holdings = data.holdingCounts.value;
  const holdingTotal = holdings
    ? Object.values(holdings).reduce((sum, value) => sum + value, 0)
    : 0;

  return (
    <div className="space-y-4" aria-label={couponName ?? `회차 #${data.couponId}`}>
      <div className="grid gap-4 md:grid-cols-3 2xl:grid-cols-6">
        <Tile
          label="잔여 재고"
          sub={
            <StatedValue
              source={data.stock.initialCount}
              render={(value) => `전체 ${value.toLocaleString("ko-KR")}`}
            />
          }
        >
          <StatedValue
            source={data.stock.remainingCount}
            render={(value) => value.toLocaleString("ko-KR")}
          />
        </Tile>
        <Tile label="발급 진행률" sub="전체 수량 대비">
          <StatedValue
            source={data.issuanceProgress}
            render={(value) => `${(value * 100).toFixed(1)}%`}
          />
        </Tile>
        <Tile
          label="초당 발급"
          sub={
            data.issuanceRate.value
              ? `구간 최고 ${data.issuanceRate.value.peakPerSecond.toLocaleString("ko-KR")}`
              : undefined
          }
        >
          <StatedValue
            source={select(data.issuanceRate, (value) => value.currentPerSecond)}
            suffix="/s"
          />
        </Tile>
        <Tile
          label="대기 인원"
          sub={
            <StatedValue
              source={data.queue.estimatedWaitMillis}
              render={(value) => `예상 ${(value / 1000).toFixed(1)}초`}
            />
          }
        >
          <StatedValue
            source={data.queue.waitingCount}
            render={(value) => value.toLocaleString("ko-KR")}
          />
        </Tile>
        <Tile label="쿠폰 회차 상태" sub={dateTime(data.couponRound?.opensAt)}>
          {data.couponRound?.status ?? "—"}
        </Tile>
        <Tile label="사용률" sub="발급 완료 수 대비">
          <StatedValue
            source={data.usageRatio}
            render={(value) => `${(value * 100).toFixed(1)}%`}
          />
        </Tile>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="상태별 보유량" state={data.holdingCounts.state}>
          {!holdings ? (
            <Value source={data.holdingCounts} />
          ) : (
            <ul className="space-y-3">
              {(Object.keys(HOLDING_LABELS) as (keyof typeof HOLDING_LABELS)[]).map((key) => (
                <li key={key}>
                  <div className="flex items-baseline justify-between">
                    <span className="t-body-sm">{HOLDING_LABELS[key]}</span>
                    <span className="num t-body-sm font-semibold">
                      {holdings[key].toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-fill">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${holdingTotal ? (holdings[key] / holdingTotal) * 100 : 0}%`,
                        background: "var(--viz-seq-450)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="알림 발송" hint="오픈 T-5분" state="N_A">
          <p className="t-body-sm text-hig-muted">
            백엔드가 회차별 알림 집계 값을 제공하지 않습니다.
          </p>
        </Panel>

        <Panel title="상태 변경 추이" hint="선택 구간 초당" state={data.transitionRate.state}>
          {!data.transitionRate.value ? (
            <Value source={data.transitionRate} />
          ) : (
            <>
              <SeriesLegend series={TRANSITION_SERIES} />
              <div className="mt-3">
                <SeriesChart data={transitionSeries} series={TRANSITION_SERIES} height={150} />
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
