import { Panel } from "@/components/admin/panel";
import { StateBadge, Value } from "@/components/admin/state";
import { KPI_TARGET, type DependencyPanel, type LatencyPanel, type SourceValue } from "@/lib/admin";

type PercentileKey = "p50Millis" | "p95Millis" | "p99Millis";

function percentileSource(
  source: LatencyPanel["success"],
  key: PercentileKey,
): SourceValue<number> {
  return {
    value: source.value?.[key],
    state: source.state,
    observedAt: source.observedAt,
  };
}

function PercentileValues({ source }: { source: LatencyPanel["success"] }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2">
      {(["p50Millis", "p95Millis", "p99Millis"] as const).map((key) => (
        <div key={key}>
          <p className="t-caption text-hig-muted">{key.replace("Millis", "")}</p>
          <p className="t-tile num">
            <Value
              source={percentileSource(source, key)}
              render={(value) =>
                `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("ko-KR")}ms`
              }
            />
          </p>
        </div>
      ))}
    </div>
  );
}

function PercentileBlock({ label, source }: { label: string; source: LatencyPanel["success"] }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex items-center gap-2">
        <p className="t-caption text-hig-muted">{label}</p>
        <StateBadge state={source.state} />
      </div>
      <PercentileValues source={source} />
    </div>
  );
}

function DependencyValues({ label, source }: { label: string; source: DependencyPanel["redis"] }) {
  return (
    <div>
      <dt className="t-caption flex items-center gap-2 text-hig-muted">
        {label}
        <StateBadge state={source.state} />
      </dt>
      <dd className="mt-1 flex gap-6">
        {(["p95Millis", "p99Millis"] as const).map((percentile) => (
          <div key={percentile}>
            <p className="t-caption text-hig-muted">
              {label} {percentile.replace("Millis", "")}
            </p>
            <p className="num t-body-sm font-semibold">
              <Value
                source={{
                  value: source.value?.[percentile],
                  state: source.state,
                  observedAt: source.observedAt,
                }}
                render={(value) =>
                  `${value < 10 ? value.toFixed(1) : value.toLocaleString("ko-KR")}ms`
                }
              />
            </p>
          </div>
        ))}
      </dd>
    </div>
  );
}

export function LatencySignalPanel({
  latency,
  dependencies,
}: {
  latency: LatencyPanel;
  dependencies: DependencyPanel;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="성공 응답시간"
          hint="발급(ISSUE) 성공 · 집계 인스턴스 최댓값"
          state={latency.success.state}
        >
          <PercentileValues source={latency.success} />
          <p className="t-caption mt-3 text-hig-muted">목표 p99 {KPI_TARGET.issueP99Ms}ms</p>
          <p className="t-caption mt-3 text-hig-muted">
            URI 그룹별 성공 지연은 현재 서버 계약에 없습니다. 전체 success 값을 다른 그룹으로
            복제하지 않습니다.
          </p>
        </Panel>

        <Panel title="실패 응답시간" hint="성공 지연과 별도 축">
          <PercentileBlock label="정책 거절" source={latency.policyReject} />
          <PercentileBlock label="시스템 실패" source={latency.systemFailure} />
          <p className="t-caption mt-3 text-hig-muted">
            원천 미배선 — OBS-4 Timer가 실패를 정책 거절과 시스템 실패로 아직 분리하지 않습니다.
            PENDING을 0이나 빈 정상 차트로 바꾸지 않습니다.
          </p>
        </Panel>
      </div>

      <Panel title="지연 해석 기준" hint="집계 인스턴스 최댓값">
        <ul className="t-caption space-y-1.5 text-hig-muted">
          <li>공식 성능 비교 p99는 부하 생성기 원본 표본입니다.</li>
          <li>화면 p99는 서버 내부 진단용이며 네트워크 구간을 제외합니다.</li>
          <li>
            1m/5m/15m window는 rate 계열에 적용됩니다. 지연 백분위 관측 창은 Micrometer expiry가
            결정하므로 window를 바꿔도 p99가 즉시 달라지지 않을 수 있습니다.
          </li>
        </ul>
      </Panel>

      <Panel title="의존성 지연" hint="통계 종류가 달라 한 절대 ms 축에 합치지 않습니다">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <DependencyValues label="Redis" source={dependencies.redis} />
          <DependencyValues label="Hikari" source={dependencies.hikari} />
          <DependencyValues label="Kafka" source={dependencies.kafka} />
        </dl>
        <p className="t-caption mt-3 text-hig-muted">
          원천 미배선 — 값이 연결되기 전에는 자체 최댓값 대비 비율이나 가짜 절대값을 만들지
          않습니다.
        </p>
      </Panel>
    </div>
  );
}
