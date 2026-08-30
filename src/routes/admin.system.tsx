import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { SeriesChart, SeriesLegend, UtilBar, type SeriesSpec } from "@/components/admin/charts";
import { BatchVerification } from "@/components/admin/batch-verification";
import { ConsistencyStatus } from "@/components/admin/consistency-status";
import { LatencySignalPanel } from "@/components/admin/latency-signal";
import { Panel, TablePanel, Tile } from "@/components/admin/panel";
import { MetaChips, PageHead, RefreshControl, Segmented } from "@/components/admin/shell";
import { StateBadge, StatedValue, Value } from "@/components/admin/state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPolling, type PollInterval } from "@/hooks/use-admin-polling";
import { consistencySeverityTone } from "@/lib/admin/consistency-view";
import { latencySuccessP99 } from "@/lib/admin/latency-view";
import { mergeEventPoll } from "@/lib/admin/event-poll-state";
import { withTelemetryDelay } from "@/lib/admin/telemetry-delay";
import {
  ENGINE_LABEL,
  GAP_LABEL,
  KPI_TARGET,
  TRAFFIC_LABEL,
  adminApi,
  type AdminMetricsResponse,
  type EventSlice,
  type GapType,
  type GapValue,
  type MetricsWindow,
  type Percentiles,
  type SourceValue,
  type TrafficKey,
} from "@/lib/admin";

/** 범위 칩 문구 — 서버는 enum 만 줍니다 */
const SCOPE_LABEL: Record<AdminMetricsResponse["scope"]["type"], string> = {
  GLOBAL: "전체",
  COUPON: "쿠폰",
  BENCHMARK_RUN: "벤치마크",
};

export const Route = createFileRoute("/admin/system")({
  head: () => ({ meta: [{ title: "시스템 관제 — 쿠폰 야~호 관리자" }] }),
  component: SystemConsole,
});

type Signal = "C" | "L" | "T" | "S";

const SIGNALS: { key: Signal; label: string }[] = [
  { key: "C", label: "정합성" },
  { key: "L", label: "지연" },
  { key: "T", label: "처리량" },
  { key: "S", label: "포화" },
];

const WINDOWS: { value: MetricsWindow; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
];

function SystemConsole() {
  const [interval, setInterval] = useState<PollInterval>(1000);
  const [window, setWindow] = useState<MetricsWindow>("1m");
  const [signal, setSignal] = useState<Signal>("C");

  const query = useAdminPolling({
    pollKey: ["admin", "metrics", window],
    queryFn: (signal) => adminApi.getMetrics(window, signal),
    intervalMs: interval,
  });

  const eventCursor = useRef<string | null>(null);
  const [eventStream, setEventStream] = useState<EventSlice>();
  const eventQuery = useAdminPolling({
    pollKey: ["admin", "system", "telemetry-events"],
    queryFn: (signal) => adminApi.getEvents({ cursor: eventCursor.current, limit: 200 }, signal),
    intervalMs: interval,
  });

  useEffect(() => {
    const next = eventQuery.data;
    if (!next) return;
    if (next.nextCursor) eventCursor.current = next.nextCursor;
    setEventStream((previous) => mergeEventPoll(previous, next, 200));
  }, [eventQuery.data]);

  const data = useMemo(
    () =>
      query.data
        ? withTelemetryDelay(query.data, eventStream, eventQuery.lastSuccessAt ?? Date.now())
        : undefined,
    [query.data, eventStream, eventQuery.lastSuccessAt],
  );

  return (
    <>
      <PageHead
        title="시스템 관제"
        meta={
          data && (
            <MetaChips
              // 실행 메타(run·engine·instance)는 벤치마크 API 가 붙어야 옵니다.
              // 없는 칩은 접습니다 — "-" 로 채우면 실행 중인 것처럼 읽힙니다.
              items={[
                ["범위", SCOPE_LABEL[data.scope.type]],
                ...(data.scope.runId ? ([["run", data.scope.runId]] as [string, string][]) : []),
                ...(data.scope.engine
                  ? ([["engine", ENGINE_LABEL[data.scope.engine]]] as [string, string][])
                  : []),
                ...(data.scope.queueMode
                  ? ([["queue", data.scope.queueMode]] as [string, string][])
                  : []),
                ...(data.scope.instances
                  ? ([
                      [
                        "instance",
                        `${data.scope.instances}대 · ${data.scope.aggregation ?? "max"}`,
                      ],
                    ] as [string, string][])
                  : []),
                ...(data.scope.runState
                  ? ([["상태", data.scope.runState]] as [string, string][])
                  : []),
              ]}
            />
          )
        }
        controls={
          <>
            <Segmented label="범위" value={window} options={WINDOWS} onChange={setWindow} />
            {query.isStale && <StateBadge state="STALE" />}
            <RefreshControl
              interval={interval}
              onIntervalChange={setInterval}
              snapshotAt={data?.meta.snapshotAt}
            />
          </>
        }
      />

      {!data ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <KpiRow data={data} onJump={setSignal} />
          <SystemSignalNavigation data={data} signal={signal} onSelect={setSignal} />

          {signal === "C" && (
            <>
              <ConsistencySignal data={data} />
              {/* 실시간 격차 아래에 확정 판정을 붙인다 — 같은 "정합성" 질문에
                  부하 중 관측과 사후 리플레이 두 답을 나란히 두려는 배치다. */}
              <BatchVerification />
            </>
          )}
          {signal === "L" && (
            <LatencySignalPanel latency={data.latency} dependencies={data.dependencies} />
          )}
          {signal === "T" && <TrafficSignal data={data} />}
          {signal === "S" && <SaturationSignal data={data} />}
        </div>
      )}
    </>
  );
}

/* ── KPI ─────────────────────────────────────────── */

function Delta({ value, unit }: { value: number; unit: string }) {
  if (value === 0) return <span className="t-caption text-hig-muted">변화 없음</span>;
  return (
    <span className="t-caption num text-hig-secondary">
      {value > 0 ? "▲ +" : "▼ −"}
      {Math.abs(value).toLocaleString("ko-KR")}
      {unit}
    </span>
  );
}

function KpiRow({ data, onJump }: { data: AdminMetricsResponse; onJump: (s: Signal) => void }) {
  // kpi 블록은 계약에서 없앴습니다 — 같은 값을 두 자리에 두면 어긋납니다.
  // 6칸은 전부 다른 블록에서 읽습니다(백엔드 회신 2절). 화면이 다시 계산하는 건 없습니다.
  const c = data.consistency;
  const t = data.traffic;
  const p99Source = latencySuccessP99(data.latency);
  const p99 = p99Source.value ?? null;
  // 판정이 아니라 개수 세기입니다. severity 재판정(OBS-16)과 다른 이야기입니다.
  const gaps = [c.luaGap, c.activeDbGap, c.dbCounterGap, c.persistGap];
  const gapsValid = gaps.filter((g) => g.state === "VALID").length;
  const gapsPending = gaps.filter((g) => g.state === "PENDING").length;
  const lag = data.persistence;
  const drainSeconds = lag.value?.drainEtaMillis ? Math.ceil(lag.value.drainEtaMillis / 1000) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      <Tile
        label="초과 발급"
        onClick={() => onJump("C")}
        alert={(c.overIssued.value ?? 0) > 0}
        sub={`gap ${gapsValid} 확정 / ${gapsPending} 대기`}
      >
        <StatedValue source={c.overIssued} render={(v) => v.toLocaleString("ko-KR")} />
      </Tile>

      <Tile
        label="발급 시도"
        hint="RPS"
        onClick={() => onJump("T")}
        sub={
          <>
            성공 {rps(t.issueSuccessTps)} · 대기 {rps(t.queueAcceptedRps)} · 거절{" "}
            {rps(t.policyRejectRps)}
          </>
        }
      >
        <Value source={t.issueAttemptRps} render={(v) => Math.round(v).toLocaleString("ko-KR")} />
      </Tile>

      <Tile
        label="발급 p99"
        hint="성공 응답"
        onClick={() => onJump("L")}
        alert={p99 !== null && p99 > KPI_TARGET.issueP99Ms}
        sub={`목표 ${KPI_TARGET.issueP99Ms}ms`}
      >
        <Value source={p99Source} render={(v) => `${Math.round(v).toLocaleString("ko-KR")}ms`} />
      </Tile>

      <Tile
        label="persist lag"
        onClick={() => onJump("S")}
        sub={
          lag.value
            ? drainSeconds
              ? `소진 예상 ${drainSeconds}초`
              : "0에 도달해 최종 판정 가능"
            : "원천 값 없음"
        }
      >
        <Value
          source={{ ...lag, value: lag.value?.lagTotal ?? null }}
          render={(v) => v.toLocaleString("ko-KR")}
        />
      </Tile>
    </div>
  );
}

/**
 * RPS 표기 — 서버는 rate() 결과라 double 을 줍니다. 초당 건수에서 소수점은 화면에
 * 의미가 없어 반올림합니다. 값이 없으면 대시입니다(0 으로 채우지 않습니다).
 */
function rps(v: SourceValue<number>) {
  return v.value === null || v.value === undefined
    ? "—"
    : Math.round(v.value).toLocaleString("ko-KR");
}

function signalTone(data: AdminMetricsResponse, s: Signal): string {
  if (s === "C") return consistencySeverityTone(data.consistency.severity);
  if (s === "L") {
    const p99 = data.latency.success.value?.p99Millis ?? null;
    return p99 !== null && p99 > KPI_TARGET.issueP99Ms ? "bg-attention" : "bg-positive";
  }
  if (s === "T")
    return data.traffic.issueAttemptRps.state === "NO_TRAFFIC" ? "bg-hig-muted" : "bg-positive";
  // saturation 은 서버 미구현입니다. 값이 없으면 회색 — 정상(초록)으로 칠하지 않습니다.
  const sat = data.saturation;
  if (!sat) return "bg-hig-muted";
  const worst = Math.max(...sat.resources.map((r) => r.utilization.value ?? 0));
  return worst >= sat.thresholds.critical
    ? "bg-live"
    : worst >= sat.thresholds.high
      ? "bg-attention"
      : "bg-positive";
}

export function SystemSignalNavigation({
  data,
  signal,
  onSelect,
}: {
  data: AdminMetricsResponse;
  signal: Signal;
  onSelect: (s: Signal) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SIGNALS.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onSelect(s.key)}
          aria-pressed={signal === s.key}
          className={`t-body-sm flex items-center gap-2 rounded-full px-3.5 py-1.5 transition-colors ${
            signal === s.key
              ? "bg-hig-fg text-hig-surface"
              : "bg-hig-surface text-hig-secondary hover:bg-fill"
          }`}
        >
          <span className={`size-2 rounded-full ${signalTone(data, s.key)}`} aria-hidden />
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** 포화 구역 이름 — 어디가 밀리고 있는지를 우리말로 적습니다. */
const ZONE_LABEL: Record<"Admission" | "Persistence" | "Telemetry", string> = {
  Admission: "입장 대기",
  Persistence: "저장 대기",
  Telemetry: "지표 수집",
};

/* ── C ───────────────────────────────────────────── */

function ConsistencySignal({ data }: { data: AdminMetricsResponse }) {
  const c = data.consistency;
  const lag = data.persistence;
  const drainSeconds = lag.value?.drainEtaMillis ? Math.ceil(lag.value.drainEtaMillis / 1000) : 0;
  // 서버가 gap 을 평탄한 필드로 내려줍니다. 화면 루프는 이 순서 그대로 4칸입니다.
  const gaps: { type: GapType; value: GapValue }[] = [
    { type: "LUA_GAP", value: c.luaGap },
    { type: "ACTIVE_DB_GAP", value: c.activeDbGap },
    { type: "PERSIST_GAP", value: c.persistGap },
    { type: "DB_COUNTER_GAP", value: c.dbCounterGap },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1.2fr]">
      <div className="xl:col-span-3">
        <ConsistencyStatus
          phase={c.phase}
          verdict={c.verdict}
          severity={c.severity}
          gaps={gaps.map((gap) => gap.value)}
        />
      </div>

      <Panel title="초과 발급" state={c.overIssued.state}>
        <p className="t-hero num">
          <Value source={c.overIssued} render={(v) => v.toLocaleString("ko-KR")} />
        </p>
        {c.issuedPlusUsed !== undefined && c.totalQuantity !== undefined && (
          <p className="t-body-sm mt-3 text-hig-secondary">
            ISSUED + USED <span className="num">{c.issuedPlusUsed.toLocaleString("ko-KR")}</span> /{" "}
            <span className="num">{c.totalQuantity.toLocaleString("ko-KR")}</span>
          </p>
        )}
      </Panel>

      <TablePanel title="Redis ↔ DB 격차">
        <table className="ops-table">
          <thead>
            <tr>
              <th>gap</th>
              <th>측정</th>
              <th className="text-right">값</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((g) => (
              <tr key={g.type}>
                <td className="num font-medium">{GAP_LABEL[g.type]}</td>
                <td className="text-hig-secondary">
                  {g.type === "LUA_GAP" || g.type === "ACTIVE_DB_GAP"
                    ? "실시간 1초"
                    : "부하 종료 후"}
                </td>
                <td className="num text-right font-semibold">
                  <StatedValue source={g.value} render={(v) => v.toLocaleString("ko-KR")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablePanel>

      <Panel
        title="저장 대기"
        hint="0이 되어야 최종 판정"
        state={lag.state}
        action={
          <span className="num t-caption text-hig-muted">
            {lag.value ? (drainSeconds ? `${drainSeconds}초 남음` : "완료") : "원천 값 없음"}
          </span>
        }
      >
        <p className="t-tile num">
          <Value
            source={{ ...lag, value: lag.value?.lagTotal ?? null }}
            render={(v) => v.toLocaleString("ko-KR")}
          />
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <div>
            <dt className="t-caption text-hig-muted">유입/초</dt>
            <dd className="num t-body-sm font-semibold">
              <Value
                source={{ ...lag, value: lag.value?.arrivalRate ?? null }}
                render={(v) => Math.round(v).toLocaleString("ko-KR")}
              />
            </dd>
          </div>
          <div>
            <dt className="t-caption text-hig-muted">처리/초</dt>
            <dd className="num t-body-sm font-semibold">
              <Value
                source={{ ...lag, value: lag.value?.consumeRate ?? null }}
                render={(v) => Math.round(v).toLocaleString("ko-KR")}
              />
            </dd>
          </div>
          <div>
            <dt className="t-caption text-hig-muted">파티션 최대</dt>
            <dd className="num t-body-sm font-semibold">
              <Value
                source={{ ...lag, value: lag.value?.partitionMax ?? null }}
                render={(v) => v.toLocaleString("ko-KR")}
              />
            </dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}

/* ── T ───────────────────────────────────────────── */

function TrafficSignal({ data }: { data: AdminMetricsResponse }) {
  const t = data.traffic;
  const series: SeriesSpec[] = [
    { key: "issueAttemptRps", label: "발급 시도", color: "var(--viz-1)" },
  ];
  const last = t.series?.[t.series.length - 1];

  // 거절 = RPS − TPS 는 폐기됐습니다. totalRps 도 계약에서 빠졌습니다 — 폴링·조회가 섞여
  // 있어 분모로도 배경으로도 못 씁니다. 분모는 issueAttemptRps 하나뿐이라 그것만 따로 세웁니다.
  const outcomes: TrafficKey[] = ["issueSuccessTps", "queueAcceptedRps", "policyRejectRps"];
  const counterRow = (key: TrafficKey) => (
    <tr key={key}>
      <td className="font-medium">
        {TRAFFIC_LABEL[key]}
        <span className="num t-caption ml-2 text-hig-muted">{key}</span>
      </td>
      <td className="num text-right font-semibold">
        <StatedValue source={t[key]} render={(v) => Math.round(v).toLocaleString("ko-KR")} />
      </td>
    </tr>
  );
  const groupRow = (label: string, note: string) => (
    <tr>
      <td className="t-caption pt-4 text-hig-muted" colSpan={2}>
        <span className="font-semibold text-hig-secondary">{label}</span>
        <span className="ml-2">{note}</span>
      </td>
    </tr>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
      <TablePanel title="결과 분류" hint="분모는 발급 시도">
        <table className="ops-table">
          <tbody>
            {groupRow("기준 분모", "비율 계산은 전부 이 값이 분모입니다")}
            {counterRow("issueAttemptRps")}
            {groupRow("결과 분류", "합이 아니라 위의 발급 시도가 분모입니다")}
            {outcomes.map(counterRow)}
          </tbody>
        </table>
      </TablePanel>

      <Panel title="처리량 추이">
        <SeriesLegend
          series={series}
          values={
            last
              ? Object.fromEntries(series.map((s) => [s.key, Number(last[s.key] ?? 0)]))
              : undefined
          }
        />
        <div className="mt-3">
          {t.series && t.series.length > 0 ? (
            <SeriesChart
              data={t.series}
              series={series}
              {...(t.markers ? { markers: t.markers } : {})}
              height={240}
            />
          ) : (
            // 서버는 시계열을 주지 않습니다. 화면 폴링 누적은 별도 작업이라 지금은 비워 둡니다.
            <p className="t-body-sm text-hig-muted">
              추이는 폴링 누적으로 그립니다 — 누적 버퍼 작업 대기(계약 티켓).
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ── S ───────────────────────────────────────────── */

function SaturationSignal({ data }: { data: AdminMetricsResponse }) {
  // 자원 6종·in-flight·큐는 서버가 통째로 안 줍니다. 0 이나 빈 막대로 그리면
  // "여유 있음"이라는 거짓 신호가 되므로 미구현이라 적습니다.
  const s = data.saturation;
  if (!s) {
    return (
      <Panel title="자원 포화">
        <p className="t-body-sm text-hig-muted">
          서버가 자원·in-flight·큐 지표를 아직 내려주지 않습니다 — 백엔드 신규 티켓 대기.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="자원 사용률"
          hint={`경고 ${s.thresholds.high}% · 위험 ${s.thresholds.critical}%`}
        >
          <ul className="space-y-3">
            {s.resources.map((r) => (
              <li key={r.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-body-sm font-medium">
                    {r.name}
                    <span className="t-caption ml-2 font-normal text-hig-muted">{r.detail}</span>
                  </span>
                  <span className="num t-body-sm font-semibold">
                    <StatedValue source={r.utilization} render={(v) => `${v}%`} />
                  </span>
                </div>
                <div className="mt-1.5">
                  <UtilBar
                    value={r.utilization.value ?? null}
                    warnAt={r.warnAt}
                    thresholds={s.thresholds}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="in-flight"
          action={
            <span className="t-caption text-hig-muted">
              대기열 {s.inFlight.mode} · {s.inFlight.activeInstances}대
            </span>
          }
        >
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <p className="t-caption text-hig-muted">전체 합</p>
              <p className="t-tile num">
                <Value source={s.inFlight.globalSum} render={(v) => v.toLocaleString("ko-KR")} />
              </p>
            </div>
            <div>
              <p className="t-caption text-hig-muted">최대 · {s.inFlight.instanceId}</p>
              <p className="t-tile num">
                <Value source={s.inFlight.instanceMax} render={(v) => v.toLocaleString("ko-KR")} />
              </p>
            </div>
          </div>
          <div className="mt-3">
            <SeriesChart
              data={s.inFlight.series}
              series={[{ key: "global", label: "in-flight", color: "var(--viz-1)" }]}
              height={150}
              reference={{
                y: s.inFlight.admitThreshold,
                label: `진입 ${s.inFlight.admitThreshold}`,
              }}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {s.queues.map((q) => (
          <Panel key={q.zone} title={ZONE_LABEL[q.zone]}>
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              {q.metrics.map((m) => (
                <div key={m.label}>
                  <dt className="t-caption text-hig-muted">{m.label}</dt>
                  <dd className="num t-body-sm font-semibold">
                    <StatedValue source={m.value} render={(v) => v.toLocaleString("ko-KR")} />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3">
              <SeriesChart
                data={q.series}
                series={[
                  {
                    key: Object.keys(q.series[0] ?? { v: 0 }).find((k) => k !== "t") ?? "v",
                    label: q.zone,
                    color: "var(--viz-1)",
                  },
                ]}
                height={110}
              />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
