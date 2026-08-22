import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SeriesChart, SeriesLegend, UtilBar, type SeriesSpec } from "@/components/admin/charts";
import { Panel, TablePanel, Tile } from "@/components/admin/panel";
import { MetaChips, PageHead, RefreshControl, Segmented } from "@/components/admin/shell";
import { StateBadge, StatedValue, Value } from "@/components/admin/state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPolling, type PollInterval } from "@/hooks/use-admin-polling";
import {
  ENGINE_LABEL,
  GAP_LABEL,
  adminApi,
  type AdminMetricsResponse,
  type MetricsWindow,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/system")({
  head: () => ({ meta: [{ title: "시스템 관제 — 쿠폰 야~호 관리자" }] }),
  component: SystemConsole,
});

type Signal = "C" | "L" | "T" | "E" | "S";

const SIGNALS: { key: Signal; label: string }[] = [
  { key: "C", label: "정합성" },
  { key: "L", label: "지연" },
  { key: "T", label: "처리량" },
  { key: "E", label: "실패" },
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

  const data = query.data;

  return (
    <>
      <PageHead
        title="시스템 관제"
        meta={
          data && (
            <MetaChips
              items={[
                ["run", data.scope.runId],
                ["engine", ENGINE_LABEL[data.scope.engine]],
                ["queue", data.scope.queueMode],
                ["instance", `${data.scope.instances}대 · ${data.scope.aggregation}`],
                ["상태", data.scope.runState],
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
          <SignalTabs data={data} signal={signal} onSelect={setSignal} />

          {signal === "C" && <ConsistencySignal data={data} />}
          {signal === "L" && <LatencySignal data={data} />}
          {signal === "T" && <TrafficSignal data={data} />}
          {signal === "E" && <ErrorSignal data={data} />}
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
  const k = data.kpi;
  const p99 = k.issueP99Ms.value;
  const rate = k.systemFailureRate.value;

  return (
    <div className="grid gap-4 md:grid-cols-3 2xl:grid-cols-6">
      <Tile
        label="초과 발급"
        onClick={() => onJump("C")}
        alert={(k.overIssued.value ?? 0) > 0}
        sub={`gap ${k.gapsValid} 확정 / ${k.gapsPending} 대기`}
      >
        <StatedValue source={k.overIssued} render={(v) => v.toLocaleString("ko-KR")} />
      </Tile>

      <Tile
        label="발급 시도"
        hint="RPS"
        onClick={() => onJump("T")}
        sub={
          <>
            성공 {k.attemptBreakdown.success.toLocaleString("ko-KR")} · 대기{" "}
            {k.attemptBreakdown.queued.toLocaleString("ko-KR")} · 거절{" "}
            {k.attemptBreakdown.reject.toLocaleString("ko-KR")}
          </>
        }
      >
        <Value source={k.issueAttemptRps} render={(v) => v.toLocaleString("ko-KR")} />
      </Tile>

      <Tile
        label="발급 p99"
        hint="인스턴스 최댓값"
        onClick={() => onJump("L")}
        alert={p99 !== null && p99 > k.issueP99TargetMs}
        sub={
          <>
            목표 {k.issueP99TargetMs}ms · <Delta value={k.issueP99Delta} unit="ms" />
          </>
        }
      >
        <Value source={k.issueP99Ms} render={(v) => `${v.toLocaleString("ko-KR")}ms`} />
      </Tile>

      <Tile
        label="시스템 실패율"
        onClick={() => onJump("E")}
        alert={rate !== null && rate > k.systemFailureTargetPct}
        sub={`목표 ${k.systemFailureTargetPct}% 이하`}
      >
        <StatedValue source={k.systemFailureRate} render={(v) => `${v.toFixed(3)}%`} />
      </Tile>

      <Tile
        label="persist lag"
        onClick={() => onJump("S")}
        sub={
          k.persistLagDrainSeconds
            ? `소진 예상 ${k.persistLagDrainSeconds}초`
            : "0에 도달해 최종 판정 가능"
        }
      >
        <Value source={k.persistLag} render={(v) => v.toLocaleString("ko-KR")} />
      </Tile>

      <Tile
        label="Circuit Breaker"
        hint={`임계 ${k.breakerThresholdPct}%`}
        onClick={() => onJump("E")}
      >
        <ul className="space-y-0.5">
          {k.breakers.map((b) => (
            <li key={b.name} className="t-body-sm flex items-baseline gap-2 whitespace-nowrap">
              <span className="num shrink-0 text-hig-secondary">{b.name}</span>
              <span className="num ml-auto shrink-0 font-semibold">
                <StatedValue source={b.failureRate} render={(v) => `${v}%`} />
              </span>
              <span className="t-caption w-14 shrink-0 text-right text-hig-muted">
                {b.state ?? ""}
              </span>
            </li>
          ))}
        </ul>
      </Tile>
    </div>
  );
}

/* ── 신호 탭 ─────────────────────────────────────── */

function signalTone(data: AdminMetricsResponse, s: Signal): string {
  if (s === "C") return data.consistency.verdict === null ? "bg-attention" : "bg-positive";
  if (s === "L") {
    const p99 = data.latency.success.p99.value;
    return p99 !== null && p99 > data.latency.success.targetMs ? "bg-attention" : "bg-positive";
  }
  if (s === "T")
    return data.kpi.issueAttemptRps.state === "NO_TRAFFIC" ? "bg-hig-muted" : "bg-positive";
  if (s === "E") {
    const rate = data.kpi.systemFailureRate.value;
    return rate !== null && rate > data.kpi.systemFailureTargetPct
      ? "bg-viz-critical"
      : "bg-viz-good";
  }
  const worst = Math.max(...data.saturation.resources.map((r) => r.utilization.value ?? 0));
  return worst >= data.saturation.thresholds.critical
    ? "bg-live"
    : worst >= data.saturation.thresholds.high
      ? "bg-attention"
      : "bg-positive";
}

function SignalTabs({
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
  const persistence = data.saturation.queues.find((q) => q.zone === "Persistence");

  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1.2fr]">
      <Panel
        title="초과 발급"
        hint={c.phase === "LIVE" ? "집계 진행 중" : "최종"}
        state={c.overIssued.state}
      >
        <p className="t-hero num">
          <Value source={c.overIssued} render={(v) => v.toLocaleString("ko-KR")} />
        </p>
        <p className="t-body-sm mt-3 text-hig-secondary">
          ISSUED + USED <span className="num">{c.issuedPlusUsed.toLocaleString("ko-KR")}</span> /{" "}
          <span className="num">{c.totalQuantity.toLocaleString("ko-KR")}</span>
        </p>
        <p className="t-body-sm mt-4">
          판정{" "}
          <b className={c.verdict === "PASS" ? "text-positive" : "text-attention"}>
            {c.verdict ?? "대기"}
          </b>
        </p>
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
            {c.gaps.map((g) => (
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

      {persistence && (
        <Panel
          title="저장 대기"
          hint="0이 되어야 최종 판정"
          action={
            <span className="num t-caption text-hig-muted">
              {data.kpi.persistLagDrainSeconds
                ? `${data.kpi.persistLagDrainSeconds}초 남음`
                : "완료"}
            </span>
          }
        >
          <p className="t-tile num">
            <Value source={data.kpi.persistLag} render={(v) => v.toLocaleString("ko-KR")} />
          </p>
          <div className="mt-3">
            <SeriesChart
              data={persistence.series}
              series={[{ key: "lag", label: "persist lag", color: "var(--viz-2)" }]}
              height={150}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ── L ───────────────────────────────────────────── */

const PCT_SERIES: SeriesSpec[] = [
  { key: "p50", label: "p50", color: "var(--viz-3)" },
  { key: "p95", label: "p95", color: "var(--viz-1)" },
  { key: "p99", label: "p99", color: "var(--viz-2)" },
];

function LatencySignal({ data }: { data: AdminMetricsResponse }) {
  const l = data.latency;
  const depSeries: SeriesSpec[] = [
    { key: "redis", label: "Redis p99", color: "var(--viz-1)" },
    { key: "hikari", label: "Hikari p99", color: "var(--viz-2)" },
    { key: "kafka", label: "Kafka avg", color: "var(--viz-3)" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="성공 응답시간" hint="/issue 201">
          <SeriesLegend
            series={PCT_SERIES}
            values={{
              p50: l.success.p50.value,
              p95: l.success.p95.value,
              p99: l.success.p99.value,
            }}
            unit="ms"
          />
          <div className="mt-3">
            <SeriesChart
              data={l.success.series}
              series={PCT_SERIES}
              unit="ms"
              reference={{ y: l.success.targetMs, label: `목표 ${l.success.targetMs}ms` }}
            />
          </div>
        </Panel>

        <Panel
          title="실패 응답시간"
          hint="정책 거절"
          action={
            <span className="t-caption text-hig-muted">
              시스템 실패 p99{" "}
              <b className="num font-semibold text-hig-secondary">
                <Value
                  source={l.failure.systemFailureP99Ms}
                  render={(v) => `${v.toLocaleString("ko-KR")}ms`}
                />
              </b>
            </span>
          }
        >
          <SeriesLegend
            series={PCT_SERIES}
            values={{
              p50: l.failure.p50.value,
              p95: l.failure.p95.value,
              p99: l.failure.p99.value,
            }}
            format={(v) => v.toFixed(1)}
            unit="ms"
          />
          <div className="mt-3">
            <SeriesChart
              data={l.failure.series}
              series={PCT_SERIES}
              unit="ms"
              format={(v) => v.toFixed(1)}
            />
          </div>
        </Panel>
      </div>

      <Panel title="의존성 지연" hint="계열별 최댓값 대비 %">
        <SeriesLegend
          series={depSeries}
          values={{
            redis: l.dependency.redisP99Ms.value,
            hikari: l.dependency.hikariP99Ms.value,
            kafka: l.dependency.kafkaAvgMs.value,
          }}
          format={(v) => (v < 10 ? v.toFixed(1) : v.toLocaleString("ko-KR"))}
          unit="ms"
        />
        <div className="mt-3">
          <SeriesChart
            data={l.dependency.series}
            series={depSeries}
            unit="%"
            yDomain={[0, 100]}
            height={150}
          />
        </div>
      </Panel>
    </div>
  );
}

/* ── T ───────────────────────────────────────────── */

function TrafficSignal({ data }: { data: AdminMetricsResponse }) {
  const t = data.traffic;
  const series: SeriesSpec[] = [
    { key: "issueSuccessTps", label: "발급 성공", color: "var(--viz-1)" },
    { key: "queueAcceptedRps", label: "대기 진입", color: "var(--viz-3)" },
    { key: "policyRejectRps", label: "정책 거절", color: "var(--viz-2)" },
    { key: "systemFailureRps", label: "시스템 실패", color: "var(--viz-8)" },
  ];
  const last = t.series[t.series.length - 1];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
      <TablePanel title="결과 분류">
        <table className="ops-table">
          <tbody>
            {t.counters.map((c) => (
              <tr key={c.key}>
                <td className="font-medium">
                  {c.label}
                  <span className="num t-caption ml-2 text-hig-muted">{c.key}</span>
                </td>
                <td className="num text-right font-semibold">
                  <StatedValue source={c.value} render={(v) => v.toLocaleString("ko-KR")} />
                </td>
              </tr>
            ))}
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
          <SeriesChart data={t.series} series={series} markers={t.markers} height={240} />
        </div>
      </Panel>
    </div>
  );
}

/* ── E ───────────────────────────────────────────── */

function ErrorSignal({ data }: { data: AdminMetricsResponse }) {
  const e = data.errors;
  const series: SeriesSpec[] = [
    { key: "dependencyFailure", label: "의존성", color: "var(--viz-2)" },
    { key: "applicationFailure", label: "애플리케이션", color: "var(--viz-8)" },
    { key: "clientObservedFailure", label: "클라이언트 관측", color: "var(--viz-7)" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <TablePanel title="실패 분류" hint="발급 시도 기준">
          <table className="ops-table">
            <thead>
              <tr>
                <th>분류</th>
                <th>정의</th>
                <th className="text-right">현재</th>
              </tr>
            </thead>
            <tbody>
              {e.classes.map((c) => (
                <tr key={c.key}>
                  <td className="num font-medium">
                    {c.label}
                    {c.excludedFromNumerator && (
                      <span className="t-caption block font-normal text-hig-muted">
                        비율에서 제외
                      </span>
                    )}
                  </td>
                  <td className="text-hig-secondary">{c.definition}</td>
                  <td className="num text-right font-semibold">
                    <StatedValue source={c.rate} render={(v) => `${v}%`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablePanel>

        <TablePanel title="실패 원인 Top 5">
          <table className="ops-table">
            <tbody>
              {e.topReasons.map((r) => (
                <tr key={r.reasonCode}>
                  <td className="num w-10 text-hig-muted">{r.httpStatus}</td>
                  <td className="num">{r.reasonCode}</td>
                  <td className="num text-right font-semibold">
                    {r.count.toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablePanel>
      </div>

      <Panel title="실패율 추이">
        <SeriesLegend series={series} />
        <div className="mt-3">
          <SeriesChart
            data={e.series}
            series={series}
            unit="%"
            format={(v) => v.toFixed(2)}
            height={180}
          />
        </div>
      </Panel>
    </div>
  );
}

/* ── S ───────────────────────────────────────────── */

function SaturationSignal({ data }: { data: AdminMetricsResponse }) {
  const s = data.saturation;

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
                    value={r.utilization.value}
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
