import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MiniSeries } from "@/components/admin/charts";
import { LiveOverview } from "@/components/admin/live-overview";
import { Panel, TablePanel, Tile } from "@/components/admin/panel";
import { PageHead, RefreshControl, Segmented } from "@/components/admin/shell";
import { StateBadge, StatedValue } from "@/components/admin/state";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPolling, type PollInterval } from "@/hooks/use-admin-polling";
import {
  ACTION_SEVERITY_LABEL,
  CAMPAIGN_OPS_LABEL,
  QUEUE_MODE_LABEL,
  QUEUE_MODE_NOTE,
  adminApi,
  type QueueMode,
  type ActionSeverity,
  type AdminOverviewQuery,
  type AdminOverviewResponse,
  isLiveAdminOverview,
  type MemberInquiryResponse,
} from "@/lib/admin";
import { BRANDS, brandOf, couponApi } from "@/lib/coupon";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "운영 현황 — 쿠폰 야~호 관리자" }] }),
  component: OperationsOverview,
});

const FILTERS: { value: NonNullable<AdminOverviewQuery["filter"]>; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "ACTION", label: "조치 필요" },
  { value: "OPENING", label: "오픈 임박" },
  { value: "RUNNING", label: "진행 중" },
];

function OperationsOverview() {
  const [interval, setInterval] = useState<PollInterval>(1000);
  const [filter, setFilter] = useState<NonNullable<AdminOverviewQuery["filter"]>>("ALL");
  const [brandId, setBrandId] = useState<number | null>(null);
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const query = useAdminPolling({
    pollKey: ["admin", "overview", filter, brandId, retryToken],
    queryFn: (signal) => adminApi.getOverview({ filter, brandId }, signal),
    intervalMs: interval,
  });

  const data = query.data;
  const liveData = data && isLiveAdminOverview(data) ? data : null;
  const snapshotAt = data
    ? isLiveAdminOverview(data)
      ? data.snapshotAt
      : data.meta.snapshotAt
    : undefined;

  return (
    <>
      <PageHead
        title="운영 현황"
        controls={
          <>
            {liveData ? (
              <>
                <select
                  aria-label="회차 선택"
                  value={selectedCouponId ?? ""}
                  onChange={(e) =>
                    setSelectedCouponId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="t-caption max-w-72 rounded-lg border border-hairline bg-hig-surface px-2.5 py-1.5"
                >
                  <option value="">전체 회차</option>
                  {(liveData.campaigns.value ?? []).map((campaign) => (
                    <option key={campaign.couponId} value={campaign.couponId}>
                      #{campaign.couponId} {campaign.campaignName}
                    </option>
                  ))}
                </select>
                <Segmented value={filter} options={FILTERS} onChange={setFilter} />
              </>
            ) : (
              <>
                <select
                  aria-label="브랜드 필터"
                  value={brandId ?? ""}
                  onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)}
                  className="t-caption rounded-lg border border-hairline bg-hig-surface px-2.5 py-1.5"
                >
                  <option value="">전체 브랜드</option>
                  {BRANDS.map((b) => (
                    <option key={b.brandId} value={b.brandId}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <Segmented value={filter} options={FILTERS} onChange={setFilter} />
              </>
            )}
            {query.isStale && <StateBadge state="STALE" />}
            <RefreshControl
              interval={interval}
              onIntervalChange={setInterval}
              snapshotAt={snapshotAt}
            />
          </>
        }
      />

      {!data && query.error ? (
        <OverviewUnavailable onRetry={() => setRetryToken((value) => value + 1)} />
      ) : !data ? (
        <Loading />
      ) : isLiveAdminOverview(data) ? (
        <LiveOverview
          data={data}
          selectedCouponId={selectedCouponId}
          filter={filter}
          queueControl={<QueueControl />}
          inquiryPanel={<InquiryPanel />}
        />
      ) : (
        <div className="space-y-4">
          <Counts data={data} />
          <Actions data={data} />
          <CampaignTable data={data} />

          <div className="grid gap-4 2xl:grid-cols-2">
            <FlowPanel data={data} />
            <QueuePanel data={data} />
          </div>

          <QueueControl />

          <OutcomePanel data={data} />

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <StockPanel data={data} />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <StatusSummaryPanel data={data} />
              <NotificationPanel data={data} />
            </div>
          </div>

          <InquiryPanel />
        </div>
      )}
    </>
  );
}

export function OverviewUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <Panel title="운영 현황을 불러오지 못했습니다" state="UNAVAILABLE">
      <p className="t-body-sm text-hig-muted">
        백엔드 연결과 관리자 권한을 확인한 뒤 다시 시도해 주세요.
      </p>
      <button type="button" onClick={onRetry} className="btn-compact mt-4">
        다시 시도
      </button>
    </Panel>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function Counts({ data }: { data: AdminOverviewResponse }) {
  const c = data.counts;
  return (
    <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
      <Tile label="조치 필요" sub={c.actionRequiredDetail} alert={c.actionRequired > 0}>
        {c.actionRequired}
      </Tile>
      <Tile label="30분 내 오픈" sub={c.openingSoonDetail}>
        {c.openingSoon}
      </Tile>
      <Tile label="대기 기준 초과" sub={c.waitOverThresholdDetail} alert={c.waitOverThreshold > 0}>
        {c.waitOverThreshold}
      </Tile>
      <Tile label="소진 임박" sub={c.stockAtRiskDetail}>
        {c.stockAtRisk}
      </Tile>
      <Tile label="데이터" sub="누락 · 지연 없음">
        {data.dataStatus === "VALID" ? "최신" : <StateBadge state={data.dataStatus} />}
      </Tile>
    </div>
  );
}

const SEVERITY_DOT: Record<ActionSeverity, string> = {
  URGENT: "bg-viz-critical",
  WARNING: "bg-viz-serious",
  READY: "bg-hig-muted",
};

function Actions({ data }: { data: AdminOverviewResponse }) {
  if (data.actions.length === 0) {
    return (
      <Panel title="조치 필요">
        <p className="t-body-sm text-hig-muted">조치할 항목이 없습니다.</p>
      </Panel>
    );
  }

  return (
    <Panel title="조치 필요" hint="지속 시간 순" bodyClassName="px-0 pb-0">
      <ul>
        {data.actions.map((a) => (
          <li key={a.couponRoundId} className="hairline-row px-5 py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="flex w-16 shrink-0 items-center gap-2">
                <span className={`size-2 rounded-full ${SEVERITY_DOT[a.severity]}`} aria-hidden />
                <span className="t-caption font-semibold">{ACTION_SEVERITY_LABEL[a.severity]}</span>
              </span>
              <BrandPlate brandId={a.brandId} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="t-body-sm font-semibold">
                  {a.campaign}
                  <span className="t-caption ml-2 font-normal text-hig-muted">{a.phase}</span>
                </p>
                <p className="t-body-sm text-hig-secondary">{a.impact}</p>
              </div>
              <span className="num t-caption shrink-0 text-hig-muted">{a.duration}</span>
              <Link
                to={a.link === "system" ? "/admin/system" : "/admin/campaigns/$couponRoundId"}
                {...(a.link === "system"
                  ? {}
                  : { params: { couponRoundId: String(a.couponRoundId) } })}
                className="btn-compact shrink-0"
              >
                {a.linkLabel}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CampaignTable({ data }: { data: AdminOverviewResponse }) {
  return (
    <TablePanel title="캠페인" hint="조치 우선순위 순">
      {data.campaigns.length === 0 ? (
        <p className="t-body-sm py-2 text-hig-muted">조건에 맞는 캠페인이 없습니다.</p>
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
            {data.campaigns.map((c) => (
              <tr key={c.couponRoundId}>
                <td className="num text-hig-muted">{c.priority}</td>
                <td>
                  <Link
                    to="/admin/campaigns/$couponRoundId"
                    params={{ couponRoundId: String(c.couponRoundId) }}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    <BrandPlate brandId={c.brandId} size="sm" />
                    <span>
                      {c.campaign}
                      <span className="t-caption block text-hig-muted">
                        {brandOf(c.brandId).name}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="text-hig-secondary">{c.phase}</td>
                <td className="num text-hig-secondary">
                  {c.openAt}
                  <span className="block text-hig-muted">{c.closeAt ?? "종료 미지정"}</span>
                </td>
                <td className="num text-right">
                  {c.remaining.toLocaleString("ko-KR")}
                  <span className="text-hig-muted"> / {c.total.toLocaleString("ko-KR")}</span>
                </td>
                <td className={c.opsState === "ADMISSION_STALLED" ? "font-semibold text-live" : ""}>
                  {CAMPAIGN_OPS_LABEL[c.opsState]}
                </td>
                <td className="num text-right">
                  <StatedValue source={c.waiting} render={(v) => v.toLocaleString("ko-KR")} />
                </td>
                <td className="text-hig-secondary">
                  {c.customerImpact}
                  <span className="t-caption block text-hig-muted">{c.etaText ?? "계산 불가"}</span>
                </td>
                <td className="text-hig-secondary">{c.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}

function FlowPanel({ data }: { data: AdminOverviewResponse }) {
  return (
    <Panel title="발급 속도" hint="최근 10분">
      <ul className="space-y-3">
        {data.flow.map((f) => {
          const stalled = f.perMinute.value === 0;
          return (
            <li
              key={f.couponRoundId}
              className="grid grid-cols-[1fr_auto_110px] items-center gap-4"
            >
              <div className="min-w-0">
                <p className="t-body-sm truncate font-medium">{f.campaign}</p>
                <p
                  className={`t-caption ${stalled ? "font-semibold text-live" : "text-hig-muted"}`}
                >
                  {f.verdict}
                </p>
              </div>
              <p className="num t-body-sm text-right font-semibold">
                <StatedValue source={f.perMinute} render={(v) => v.toLocaleString("ko-KR")} />
                <span className="t-caption ml-1 font-normal text-hig-muted">건/분</span>
              </p>
              <MiniSeries
                data={f.series}
                color={stalled ? "var(--viz-critical)" : "var(--viz-1)"}
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function QueuePanel({ data }: { data: AdminOverviewResponse }) {
  return (
    <TablePanel title="대기 현황">
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
          {data.queues.map((q) => (
            <tr key={q.couponRoundId}>
              <td className="font-medium">{q.campaign}</td>
              <td className="num text-right">
                <StatedValue source={q.waiting} render={(v) => v.toLocaleString("ko-KR")} />
              </td>
              <td className="num text-right text-hig-secondary">
                {q.trendPerMinute === 0
                  ? "—"
                  : `${q.trendPerMinute > 0 ? "+" : "−"}${Math.abs(q.trendPerMinute)}`}
              </td>
              <td className="num text-right">
                <StatedValue
                  source={q.admittedPerMinute}
                  render={(v) => v.toLocaleString("ko-KR")}
                />
              </td>
              <td
                className={
                  q.etaSeconds === null ? "font-medium text-attention" : "text-hig-secondary"
                }
              >
                {q.etaSeconds === null
                  ? "계산 불가"
                  : q.etaSeconds === 0
                    ? "대기 없음"
                    : `약 ${q.etaSeconds}초`}
              </td>
              <td className={q.healthy ? "text-hig-secondary" : "font-semibold text-live"}>
                {q.verdict}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}

function OutcomePanel({ data }: { data: AdminOverviewResponse }) {
  return (
    <Panel
      title="고객이 받은 결과"
      hint="최근 10분"
      action={
        <Link to="/admin/system" className="t-caption text-hig-link hover:underline">
          시스템 관제
        </Link>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {data.outcomes.map((o) => (
          <li key={o.key} className={o.isFailure ? "rounded-xl bg-live/8 p-3" : "p-3 pl-0"}>
            <p
              className={`t-caption ${o.isFailure ? "font-semibold text-live" : "text-hig-muted"}`}
            >
              {o.label}
            </p>
            <p className={`t-body num mt-1 font-semibold ${o.isFailure ? "text-live" : ""}`}>
              {o.count.toLocaleString("ko-KR")}
              <span
                className={`t-caption ml-1.5 font-normal ${
                  o.isFailure ? "text-hig-secondary" : "text-hig-muted"
                }`}
              >
                {(o.ratio * 100).toFixed(1)}%
              </span>
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function StockPanel({ data }: { data: AdminOverviewResponse }) {
  return (
    <TablePanel title="재고와 소진 예상">
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
          {data.stock.map((s) => {
            const ratio = s.total > 0 ? s.remaining / s.total : 0;
            const critical = ratio <= 0.1;
            return (
              <tr key={s.couponRoundId}>
                <td className="font-medium">{s.campaign}</td>
                <td className="num text-right">
                  {s.remaining.toLocaleString("ko-KR")}
                  <span className="text-hig-muted"> / {s.total.toLocaleString("ko-KR")}</span>
                </td>
                <td>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(1.5, ratio * 100)}%`,
                        background: critical ? "var(--viz-serious)" : "var(--hig-foreground)",
                      }}
                    />
                  </div>
                  <span className="num t-caption text-hig-muted">{Math.round(ratio * 100)}%</span>
                </td>
                <td className="num text-right">
                  <StatedValue
                    source={s.ratePerMinute}
                    render={(v) => `${v.toLocaleString("ko-KR")}/분`}
                  />
                </td>
                <td className={s.exhaustEtaMinutes === null ? "text-attention" : ""}>
                  {s.exhaustEtaMinutes === null ? "계산 불가" : `약 ${s.exhaustEtaMinutes}분 후`}
                </td>
                <td className="text-hig-secondary">{s.nextAction}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TablePanel>
  );
}

function StatusSummaryPanel({ data }: { data: AdminOverviewResponse }) {
  const s = data.statusSummary;
  const rows: [string, number, boolean][] = [
    ["사용 완료", s.used, false],
    ["사용 취소", s.cancelUse, false],
    ["발급 취소", s.cancelIssue, false],
    ["만료", s.expired, false],
    ["재고 복원", s.stockRestored, false],
    ["처리 실패", s.failed, s.failed > 0],
  ];

  return (
    <Panel title="상태 변경" hint="최근 30분">
      <dl className="grid grid-cols-2 gap-x-5">
        {rows.map(([label, v, alert]) => (
          <div key={label} className="hairline-row flex items-baseline justify-between py-1.5">
            <dt className="t-body-sm text-hig-secondary">{label}</dt>
            <dd className={`num t-body-sm font-semibold ${alert ? "text-live" : ""}`}>
              {v.toLocaleString("ko-KR")}
            </dd>
          </div>
        ))}
      </dl>
      {s.batches.map((b) => (
        <p key={b.at} className="t-caption mt-3 text-hig-muted">
          <span className="num mr-1.5 font-semibold text-hig-secondary">{b.at}</span>
          {b.title} · {b.detail}
        </p>
      ))}
    </Panel>
  );
}

function NotificationPanel({ data }: { data: AdminOverviewResponse }) {
  const n = data.notifications;
  return (
    <Panel title="알림 발송" hint="최근 30분">
      <dl className="space-y-1">
        {(
          [
            ["발송 완료", n.sent, false],
            ["발송 대기", n.pending, false],
            ["발송 실패", n.failed, n.failed > 0],
          ] as [string, number, boolean][]
        ).map(([label, v, alert]) => (
          <div key={label} className="hairline-row flex items-baseline justify-between py-1.5">
            <dt className="t-body-sm text-hig-secondary">{label}</dt>
            <dd className={`num t-body-sm font-semibold ${alert ? "text-live" : ""}`}>
              {v.toLocaleString("ko-KR")}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ── 대기열 제어 ─────────────────────────────────────
   설정을 바꾸면 고객 화면의 발급 흐름이 바로 달라집니다.
   그래서 어떤 회차에 실제로 걸리는지 옆에 같이 보여 줍니다. */

const MODES: { value: QueueMode; label: string }[] = [
  { value: "OFF", label: QUEUE_MODE_LABEL.OFF },
  { value: "ADAPTIVE", label: QUEUE_MODE_LABEL.ADAPTIVE },
  { value: "ALWAYS", label: QUEUE_MODE_LABEL.ALWAYS },
];

function QueueControl() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["admin", "queue-settings"],
    queryFn: () => adminApi.getQueueSettings(),
  });
  const rounds = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
  });

  const [threshold, setThreshold] = useState("");

  // 서버 값이 바뀌면 입력칸도 따라갑니다.
  useEffect(() => {
    if (settings.data) setThreshold(String(settings.data.adaptiveThresholdPerMinute));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (input: { mode: QueueMode; adaptiveThresholdPerMinute: number }) =>
      adminApi.updateQueueSettings({
        ...input,
        expectedRevision: settings.data!.revision,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["admin", "queue-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "metrics"] });
      toast.success(`대기열을 ${QUEUE_MODE_LABEL[next.mode]}(으)로 바꿨습니다`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "설정을 저장하지 못했습니다"),
  });

  const current = settings.data;
  const queued = (rounds.data ?? []).filter((r) => r.queueActive);
  const open = (rounds.data ?? []).filter((r) => r.status === "OPEN");
  const thresholdChanged =
    !!current && Number(threshold) !== current.adaptiveThresholdPerMinute && Number(threshold) > 0;

  return (
    <Panel
      title="대기열 설정"
      hint="바꾸면 고객 화면에 바로 반영됩니다"
      action={
        current && <span className="t-caption num text-hig-muted">리비전 {current.revision}</span>
      }
    >
      {!current ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[auto_1fr]">
          <div>
            <div className="inline-flex rounded-full bg-fill p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      mode: m.value,
                      adaptiveThresholdPerMinute: current.adaptiveThresholdPerMinute,
                    })
                  }
                  aria-pressed={current.mode === m.value}
                  className={`t-body-sm rounded-full px-3.5 py-1.5 transition-colors ${
                    current.mode === m.value
                      ? "bg-hig-surface font-semibold text-hig-fg"
                      : "text-hig-secondary"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="t-caption mt-2 text-hig-muted">{QUEUE_MODE_NOTE[current.mode]}</p>

            {current.mode === "ADAPTIVE" && (
              <div className="mt-4 flex items-end gap-2">
                <label className="block">
                  <span className="eyebrow">혼잡 기준</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      className="num t-body-sm w-24 rounded-lg border border-hairline bg-hig-surface px-3 py-1.5 focus:border-hig-primary focus:outline-none"
                    />
                    <span className="t-caption text-hig-muted">건/분 이상</span>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!thresholdChanged || save.isPending}
                  onClick={() =>
                    save.mutate({
                      mode: current.mode,
                      adaptiveThresholdPerMinute: Number(threshold),
                    })
                  }
                  className="btn-compact"
                >
                  저장
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="t-caption text-hig-muted">
              지금 대기열이 걸린 회차 {queued.length} / 발급 중 {open.length}
            </p>
            {queued.length === 0 ? (
              <p className="t-body-sm mt-2 text-hig-secondary">
                대기열 없이 모든 회차가 바로 발급되고 있습니다.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {queued.map((r) => (
                  <li key={r.id} className="t-body-sm flex items-center gap-2">
                    <BrandPlate brandId={r.brandId} size="sm" />
                    <Link
                      to="/admin/campaigns/$couponRoundId"
                      params={{ couponRoundId: String(r.id) }}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function InquiryPanel() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<MemberInquiryResponse | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const memberId = Number(input);
    if (!memberId) return;
    setPending(true);
    try {
      setResult(await adminApi.inquireMember(memberId));
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel
      title="회원 조회"
      hint="회원 ID 정확 일치"
      action={
        result && (
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setInput("");
            }}
            className="t-caption text-hig-link hover:underline"
          >
            지우기
          </button>
        )
      }
    >
      <form onSubmit={submit} className="flex max-w-md items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="회원 ID"
          className="num t-body-sm min-w-0 flex-1 rounded-lg border border-hairline bg-hig-surface px-3 py-1.5 focus:border-hig-primary focus:outline-none"
        />
        <button type="submit" disabled={!input || pending} className="btn-compact">
          {pending ? "조회 중" : "조회"}
        </button>
      </form>

      {result && (
        <div className="mt-5 grid gap-6 xl:grid-cols-[220px_1fr]">
          <div>
            <p className="t-body-sm font-semibold">
              <span className="num">m_{result.member.memberId}</span>
              <span className="ml-2 text-hig-muted">{result.member.grade}</span>
            </p>
            <dl className="t-caption mt-2 space-y-1 text-hig-secondary">
              {(
                [
                  ["보유", result.totals.held],
                  ["사용", result.totals.used],
                  ["만료", result.totals.expired],
                  ["취소", result.totals.cancelled],
                  ["발급 시도", result.totals.attempts],
                  ["실패", result.totals.failures],
                ] as [string, number][]
              ).map(([label, v]) => (
                <div key={label} className="flex justify-between">
                  <dt>{label}</dt>
                  <dd className="num font-semibold text-hig-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {result.rows.length === 0 ? (
            <p className="t-body-sm self-start text-hig-secondary">
              이 회원 ID 로 남은 이력이 없습니다. ID 를 다시 확인해 주세요.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ops-table min-w-[560px]">
                <thead>
                  <tr>
                    <th>시각</th>
                    <th>캠페인</th>
                    <th>구분</th>
                    <th>결과</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={`${r.occurredAt}-${r.result}`}>
                      <td className="num whitespace-nowrap text-hig-muted">
                        {new Date(r.occurredAt).toLocaleString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      </td>
                      <td>{r.campaign}</td>
                      <td className="text-hig-secondary">
                        {r.kind === "ATTEMPT" ? "발급 시도" : "상태 변경"}
                      </td>
                      <td className="num">
                        {r.httpStatus !== null && (
                          <span className="mr-1.5 text-hig-muted">{r.httpStatus}</span>
                        )}
                        {r.result}
                      </td>
                      <td className="text-hig-muted">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
