import type { ReactNode } from "react";
import { MiniSeries } from "@/components/admin/charts";
import { Panel, TablePanel, Tile } from "@/components/admin/panel";
import { StateBadge, StatedValue } from "@/components/admin/state";
import type {
  AdminOverviewQuery,
  LiveAdminOverviewResponse,
  LiveCampaignOverview,
  Point,
  SourceValue,
} from "@/lib/admin";

function select<T, U>(source: SourceValue<T>, pick: (value: T) => U): SourceValue<U> {
  return {
    state: source.state,
    ...(source.value == null ? {} : { value: pick(source.value) }),
    ...(source.observedAt ? { observedAt: source.observedAt } : {}),
  };
}

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

function empty(state: SourceValue<unknown>["state"], text: string) {
  return (
    <div className="flex items-center gap-2 py-3 text-hig-muted">
      <span className="t-body-sm">{text}</span>
      <StateBadge state={state} />
    </div>
  );
}

function visibleCampaigns(
  data: LiveAdminOverviewResponse,
  couponId: number | null,
  filter: NonNullable<AdminOverviewQuery["filter"]>,
) {
  return (data.campaigns.value ?? []).filter((campaign) => {
    if (couponId != null && campaign.couponId !== couponId) return false;
    if (filter === "ACTION") {
      return campaign.severity !== "NONE" || campaign.recommendedAction != null;
    }
    if (filter === "OPENING") return campaign.status === "SCHEDULED";
    if (filter === "RUNNING") return campaign.status === "OPEN";
    return true;
  });
}

export function LiveOverview({
  data,
  selectedCouponId = null,
  filter = "ALL",
  queueControl,
  inquiryPanel,
}: {
  data: LiveAdminOverviewResponse;
  selectedCouponId?: number | null;
  filter?: NonNullable<AdminOverviewQuery["filter"]>;
  queueControl?: ReactNode;
  inquiryPanel?: ReactNode;
}) {
  const campaigns = visibleCampaigns(data, selectedCouponId, filter);
  const actions = (data.actionItems.value?.topItems ?? []).filter(
    (action) => selectedCouponId == null || action.couponId === selectedCouponId,
  );
  const outcomes = data.customerOutcomes.value?.outcomes ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <Tile label="조치 필요" sub={<StateBadge state={data.actionRequired.state} />}>
          <StatedValue source={select(data.actionRequired, (value) => value.totalCount)} />
        </Tile>
        <Tile label="30분 내 오픈" sub={<StateBadge state={data.openingSoon.state} />}>
          <StatedValue source={select(data.openingSoon, (value) => value.totalCount)} />
        </Tile>
        <Tile label="대기 기준 초과" sub={<StateBadge state={data.queueRisk.state} />}>
          <StatedValue source={select(data.queueRisk, (value) => value.thresholdExceededCount)} />
        </Tile>
        <Tile label="소진 임박" sub={<StateBadge state={data.stockRisk.state} />}>
          <StatedValue source={select(data.stockRisk, (value) => value.depletionRiskCount)} />
        </Tile>
        <Tile label="데이터" sub={dateTime(data.snapshotAt)}>
          {data.overallStatus === "COMPLETE"
            ? "최신"
            : data.overallStatus === "PARTIAL"
              ? "일부"
              : "사용 불가"}
        </Tile>
      </div>

      <Actions actions={actions} state={data.actionItems.state} />
      <CampaignTable campaigns={campaigns} state={data.campaigns.state} />

      <div className="grid gap-4 2xl:grid-cols-2">
        <FlowPanel campaigns={campaigns} aggregate={data.aggregateIssuanceRate} />
        <QueuePanel campaigns={campaigns} aggregate={data.aggregateQueue} />
      </div>

      {queueControl ?? (
        <Panel title="대기열 설정" state="N_A">
          <p className="t-body-sm text-hig-muted">
            실제 대기열 설정 계약은 아직 이 화면과 연결되지 않았습니다.
          </p>
        </Panel>
      )}
      <OutcomePanel outcomes={outcomes} state={data.customerOutcomes.state} />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <StockPanel campaigns={campaigns} state={data.campaigns.state} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <CampaignStatusPanel data={data} />
          <Panel title="알림 발송" hint="최근 30분" state="N_A">
            <p className="t-body-sm text-hig-muted">백엔드가 알림 집계 값을 제공하지 않습니다.</p>
          </Panel>
        </div>
      </div>

      {inquiryPanel ?? (
        <Panel title="회원 조회" state="N_A">
          <p className="t-body-sm text-hig-muted">
            실제 회원 발급 문의 계약은 아직 이 화면과 연결되지 않았습니다.
          </p>
        </Panel>
      )}
    </div>
  );
}

function Actions({
  actions,
  state,
}: {
  actions: NonNullable<LiveAdminOverviewResponse["actionItems"]["value"]>["topItems"];
  state: SourceValue<unknown>["state"];
}) {
  if (actions.length === 0) {
    return (
      <Panel title="조치 필요" state={state}>
        {empty(state, "조치할 항목이 없습니다.")}
      </Panel>
    );
  }
  return (
    <Panel title="조치 필요" hint="지속 시간 순" state={state} bodyClassName="px-0 pb-0">
      <ul>
        {actions.map((action) => (
          <li
            key={`${action.couponId}-${action.detectedAt}`}
            className="hairline-row px-5 py-3 last:border-0"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="t-caption w-16 shrink-0 font-semibold">{action.severity}</span>
              <div className="min-w-0 flex-1">
                <p className="t-body-sm font-semibold">{action.campaignName}</p>
                <p className="t-body-sm text-hig-secondary">
                  {action.customerImpactText ?? action.recommendedAction?.displayText ?? "—"}
                </p>
              </div>
              <span className="num t-caption shrink-0 text-hig-muted">
                {action.duration ?? dateTime(action.detectedAt)}
              </span>
              <a href={`/admin/campaigns/${action.couponId}`} className="btn-compact shrink-0">
                회차 보기
              </a>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CampaignTable({
  campaigns,
  state,
}: {
  campaigns: LiveCampaignOverview[];
  state: SourceValue<unknown>["state"];
}) {
  return (
    <TablePanel title="캠페인" hint="조치 우선순위 순" action={<StateBadge state={state} />}>
      {campaigns.length === 0 ? (
        empty(state, "조건에 맞는 캠페인이 없습니다.")
      ) : (
        <table className="ops-table min-w-[900px]">
          <thead>
            <tr>
              <th className="w-8">
                <span className="sr-only">우선순위</span>
              </th>
              <th>캠페인</th>
              <th>상태</th>
              <th>오픈 · 종료</th>
              <th className="text-right">잔여 재고</th>
              <th>발급</th>
              <th className="text-right">대기</th>
              <th>고객 영향</th>
              <th>다음 행동</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.couponId}>
                <td className="num text-hig-muted">{campaign.priority}</td>
                <td>
                  <a
                    href={`/admin/campaigns/${campaign.couponId}`}
                    className="font-medium hover:underline"
                  >
                    {campaign.campaignName}
                    <span className="t-caption block text-hig-muted">
                      {campaign.brandName} · 회차 #{campaign.couponId}
                    </span>
                  </a>
                </td>
                <td className="text-hig-secondary">{campaign.status}</td>
                <td className="num text-hig-secondary">
                  {dateTime(campaign.opensAt)}
                  <span className="block text-hig-muted">{dateTime(campaign.closesAt)}</span>
                </td>
                <td className="text-right">
                  <StatedValue
                    source={select(
                      campaign.stockForecast,
                      (value) =>
                        `${value.remainingQuantity.toLocaleString("ko-KR")} / ${value.totalQuantity.toLocaleString("ko-KR")}`,
                    )}
                  />
                </td>
                <td>
                  <StatedValue source={select(campaign.issuanceFlow, (value) => value.state)} />
                </td>
                <td className="text-right">
                  <StatedValue
                    source={select(campaign.campaignQueueStatus, (value) => value.waitingCount)}
                    suffix="명"
                  />
                </td>
                <td className="text-hig-secondary">
                  {campaign.customerImpactText ?? campaign.customerImpact}
                  <span className="t-caption block text-hig-muted">
                    {campaign.campaignQueueStatus.value?.estimatedWait ?? "계산 불가"}
                  </span>
                </td>
                <td className="text-hig-secondary">
                  {campaign.recommendedAction?.displayText ?? "지켜보기"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}

function points(campaign: LiveCampaignOverview): Point[] {
  return (campaign.issuanceFlow.value?.points ?? []).map((point) => ({
    t: Date.parse(point.observedAt),
    perMinute: point.issuancesPerMinute,
  }));
}

function FlowPanel({
  campaigns,
  aggregate,
}: {
  campaigns: LiveCampaignOverview[];
  aggregate: LiveAdminOverviewResponse["aggregateIssuanceRate"];
}) {
  return (
    <Panel title="발급 속도" hint="최근 10분" state={aggregate.state}>
      {campaigns.length === 0 ? (
        empty(aggregate.state, "표시할 회차가 없습니다.")
      ) : (
        <ul className="space-y-3">
          {campaigns.map((campaign) => (
            <li
              key={campaign.couponId}
              className="grid grid-cols-[1fr_auto_110px] items-center gap-4"
            >
              <div className="min-w-0">
                <p className="t-body-sm truncate font-medium">{campaign.campaignName}</p>
                <p className="t-caption text-hig-muted">
                  {campaign.issuanceFlow.value?.state ?? (
                    <StateBadge state={campaign.issuanceFlow.state} />
                  )}
                </p>
              </div>
              <p className="num t-body-sm text-right font-semibold">
                <StatedValue
                  source={select(campaign.issuanceFlow, (value) => value.currentPerMinute)}
                  render={(value) => value.toLocaleString("ko-KR")}
                />
                <span className="t-caption ml-1 font-normal text-hig-muted">건/분</span>
              </p>
              <MiniSeries data={points(campaign)} color="var(--viz-1)" seriesKey="perMinute" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function QueuePanel({
  campaigns,
  aggregate,
}: {
  campaigns: LiveCampaignOverview[];
  aggregate: LiveAdminOverviewResponse["aggregateQueue"];
}) {
  return (
    <TablePanel title="대기 현황" action={<StateBadge state={aggregate.state} />}>
      {campaigns.length === 0 ? (
        empty(aggregate.state, "표시할 회차가 없습니다.")
      ) : (
        <table className="ops-table min-w-[520px]">
          <thead>
            <tr>
              <th>캠페인</th>
              <th className="text-right">대기</th>
              <th className="text-right">추세</th>
              <th className="text-right">분당 입장 수</th>
              <th>예상 대기</th>
              <th>판정</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const queue = campaign.campaignQueueStatus;
              return (
                <tr key={campaign.couponId}>
                  <td className="font-medium">{campaign.campaignName}</td>
                  <td className="num text-right">
                    <StatedValue source={select(queue, (value) => value.waitingCount)} />
                  </td>
                  <td className="num text-right text-hig-secondary">
                    <StatedValue source={select(queue, (value) => value.waitingDeltaPerMinute)} />
                  </td>
                  <td className="num text-right">
                    <StatedValue
                      source={select(queue, (value) => value.admissionsPerMinute ?? null)}
                    />
                  </td>
                  <td className="text-hig-secondary">
                    <StatedValue
                      source={select(queue, (value) => value.estimatedWait ?? "계산 불가")}
                    />
                  </td>
                  <td className="text-hig-secondary">
                    <StatedValue source={select(queue, (value) => value.assessment)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}

function OutcomePanel({
  outcomes,
  state,
}: {
  outcomes: NonNullable<LiveAdminOverviewResponse["customerOutcomes"]["value"]>["outcomes"];
  state: SourceValue<unknown>["state"];
}) {
  return (
    <Panel title="고객이 받은 결과" hint="최근 10분" state={state}>
      {outcomes.length === 0 ? (
        empty(state, "관측 구간에 고객 요청이 없습니다.")
      ) : (
        <ul className="grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {outcomes.map((outcome) => (
            <li key={outcome.type} className="p-3 pl-0">
              <p className="t-caption text-hig-muted">{outcome.displayText}</p>
              <p className="t-body num mt-1 font-semibold">
                {outcome.count.toLocaleString("ko-KR")}
                <span className="t-caption ml-1.5 font-normal text-hig-muted">
                  {(outcome.ratio * 100).toFixed(1)}%
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function StockPanel({
  campaigns,
  state,
}: {
  campaigns: LiveCampaignOverview[];
  state: SourceValue<unknown>["state"];
}) {
  return (
    <TablePanel title="재고와 소진 예상" action={<StateBadge state={state} />}>
      {campaigns.length === 0 ? (
        empty(state, "표시할 재고가 없습니다.")
      ) : (
        <table className="ops-table min-w-[600px]">
          <thead>
            <tr>
              <th>캠페인</th>
              <th className="text-right">잔여 / 전체</th>
              <th className="w-32">비율</th>
              <th className="text-right">발급 속도</th>
              <th>예상 소진</th>
              <th>다음 행동</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const ratio = campaign.stockForecast.value?.remainingRatio ?? 0;
              return (
                <tr key={campaign.couponId}>
                  <td className="font-medium">{campaign.campaignName}</td>
                  <td className="num text-right">
                    <StatedValue
                      source={select(
                        campaign.stockForecast,
                        (value) =>
                          `${value.remainingQuantity.toLocaleString("ko-KR")} / ${value.totalQuantity.toLocaleString("ko-KR")}`,
                      )}
                    />
                  </td>
                  <td>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(1.5, ratio * 100)}%`,
                          background: ratio <= 0.1 ? "var(--viz-serious)" : "var(--hig-foreground)",
                        }}
                      />
                    </div>
                    <span className="num t-caption text-hig-muted">{Math.round(ratio * 100)}%</span>
                  </td>
                  <td className="num text-right">
                    <StatedValue
                      source={select(campaign.issuanceFlow, (value) => value.currentPerMinute)}
                      suffix="/분"
                    />
                  </td>
                  <td className="text-hig-secondary">
                    <StatedValue
                      source={select(
                        campaign.stockForecast,
                        (value) => value.estimatedDepletion ?? "계산 불가",
                      )}
                    />
                  </td>
                  <td className="text-hig-secondary">
                    {campaign.recommendedAction?.displayText ?? "지켜보기"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}

function CampaignStatusPanel({ data }: { data: LiveAdminOverviewResponse }) {
  const summary = data.campaignStatusSummary;
  const rows = summary.value
    ? ([
        ["진행 중", summary.value.openCount],
        ["오픈 예정", summary.value.scheduledCount],
        ["종료", summary.value.closedCount],
      ] as const)
    : [];
  return (
    <Panel title="캠페인 상태" state={summary.state}>
      {rows.length === 0 ? (
        empty(summary.state, "캠페인 상태를 집계하지 못했습니다.")
      ) : (
        <dl className="space-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="hairline-row flex items-baseline justify-between py-1.5">
              <dt className="t-body-sm text-hig-secondary">{label}</dt>
              <dd className="num t-body-sm font-semibold">{value.toLocaleString("ko-KR")}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}
