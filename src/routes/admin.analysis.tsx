import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SeriesChart, SeriesLegend, type SeriesSpec } from "@/components/admin/charts";
import { Panel, TablePanel, Tile } from "@/components/admin/panel";
import { PageHead } from "@/components/admin/shell";
import { StateBadge } from "@/components/admin/state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ENGINE_LABEL,
  adminApi,
  type AdminBenchmarksResponse,
  type EngineVersion,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/analysis")({
  head: () => ({ meta: [{ title: "성능 비교 — 쿠폰 야~호 관리자" }] }),
  component: AnalysisScreen,
});

const VERSIONS: EngineVersion[] = ["v1", "v2", "v3"];

const VERSION_SERIES: SeriesSpec[] = [
  { key: "v1", label: "v1 DB Lock", color: "var(--viz-1)" },
  { key: "v2", label: "v2 Redis", color: "var(--viz-2)" },
  { key: "v3", label: "v3 Kafka", color: "var(--viz-3)" },
];

function AnalysisScreen() {
  const { data } = useQuery({
    queryKey: ["admin", "benchmarks"],
    queryFn: () => adminApi.getBenchmarks(),
  });

  return (
    <>
      <PageHead
        title="성능 비교"
        controls={
          data && (
            <span
              className={`t-caption font-semibold ${
                data.conditionsMatch ? "text-positive" : "text-live"
              }`}
            >
              {data.conditionsMatch ? "실행 조건 일치" : "실행 조건이 달라 비교할 수 없습니다"}
            </span>
          )
        }
      />

      {!data ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <Verdicts data={data} />

          <div className="grid items-start gap-4 xl:grid-cols-[0.85fr_1.4fr]">
            <Conditions data={data} />
            <Comparison data={data} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <StockCurve data={data} />
            <P99Curve data={data} />
          </div>

          <Bottleneck data={data} />
          <QueueModes data={data} />
        </div>
      )}
    </>
  );
}

function Verdicts({ data }: { data: AdminBenchmarksResponse }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {data.verdicts.map((v) => (
        <Tile key={v.version} label={ENGINE_LABEL[v.version]} sub={v.note}>
          <span
            className={
              v.verdict === "PASS"
                ? "text-positive"
                : v.verdict === "FAIL"
                  ? "text-live"
                  : "text-attention"
            }
          >
            {v.verdict === "PASS" ? "합격" : v.verdict === "FAIL" ? "불합격" : "판정 대기"}
          </span>
        </Tile>
      ))}
    </div>
  );
}

function Conditions({ data }: { data: AdminBenchmarksResponse }) {
  const rows: [string, (c: AdminBenchmarksResponse["conditions"][number]) => string][] = [
    ["runId", (c) => c.runId],
    ["재고", (c) => c.stock.toLocaleString("ko-KR")],
    ["VU · 램프", (c) => `${c.vu.toLocaleString("ko-KR")} · ${c.rampSeconds}s`],
    ["인스턴스", (c) => `${c.instances}대`],
    ["대기열 모드", (c) => c.queueMode],
    ["실행 횟수", (c) => c.repeats],
    ["데이터셋", (c) => c.dataset],
  ];

  return (
    <TablePanel title="실행 조건">
      <table className="ops-table">
        <thead>
          <tr>
            <th>
              <span className="sr-only">지표</span>
            </th>
            {data.conditions.map((c) => (
              <th key={c.version}>{c.version}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, get]) => (
            <tr key={label}>
              <td className="text-hig-secondary">{label}</td>
              {data.conditions.map((c) => (
                <td key={c.version} className="num">
                  {get(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}

function Comparison({ data }: { data: AdminBenchmarksResponse }) {
  return (
    <TablePanel title="지표 비교">
      <table className="ops-table min-w-[560px]">
        <thead>
          <tr>
            <th>지표</th>
            {VERSIONS.map((v) => (
              <th key={v} className="text-right">
                {v}
              </th>
            ))}
            <th className="text-right">v1 → v3</th>
          </tr>
        </thead>
        <tbody>
          {data.comparison.map((group) => (
            <>
              <tr key={group.group}>
                <td colSpan={5} className="pt-4 pb-1">
                  <span className="t-caption font-semibold text-hig-muted">{group.group}</span>
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr key={`${group.group}-${row.metric}`}>
                  <td className="text-hig-secondary">{row.metric}</td>
                  {VERSIONS.map((v) => {
                    const cell = row.values[v];
                    return (
                      <td key={v} className="num text-right">
                        {cell.text}
                        {cell.state && cell.state !== "VALID" && (
                          <span className="ml-1.5 inline-block align-middle">
                            <StateBadge state={cell.state} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="num text-right text-hig-muted">{row.delta}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}

function StockCurve({ data }: { data: AdminBenchmarksResponse }) {
  return (
    <Panel title="재고 소진 곡선" hint="가로축 로그 초">
      <SeriesLegend
        series={VERSION_SERIES}
        values={{ v1: 142.3, v2: 18.7, v3: 11.2 }}
        format={(v) => `${v}s`}
      />
      <div className="mt-3">
        <SeriesChart
          data={data.stockCurve}
          series={VERSION_SERIES}
          height={220}
          logX
          xDomain={[0.5, 200]}
          xFormat={(v) => `${v}s`}
        />
      </div>
    </Panel>
  );
}

function P99Curve({ data }: { data: AdminBenchmarksResponse }) {
  return (
    <Panel title="p99 추이" hint="세로축 로그 ms · 가로축 진행률">
      <SeriesLegend series={VERSION_SERIES} values={{ v1: 4180, v2: 612, v3: 288 }} unit="ms" />
      <div className="mt-3">
        <SeriesChart
          data={data.p99Curve}
          series={VERSION_SERIES}
          height={220}
          logY
          yDomain={[10, 10000]}
          xFormat={(v) => `${v}%`}
          reference={{ y: 500, label: "목표 500ms" }}
        />
      </div>
    </Panel>
  );
}

function Bottleneck({ data }: { data: AdminBenchmarksResponse }) {
  return (
    <Panel title="병목 자원" hint="버전마다 병목이 다릅니다">
      <div className="grid gap-6 md:grid-cols-3">
        {data.bottleneck.map((b, i) => (
          <div key={b.version} className="min-w-0">
            <p className="t-body-sm font-semibold">
              {b.version}
              <span className="t-caption ml-2 font-normal text-hig-muted">{b.resource}</span>
            </p>
            <p className="num t-tile mt-1">{b.peak}%</p>
            <div className="mt-2">
              <SeriesChart
                data={b.series}
                series={[{ key: "v", label: b.resource, color: `var(--viz-${i + 1})` }]}
                height={120}
                yDomain={[0, 100]}
                xFormat={(v) => `${v}s`}
                format={(v) => `${v}%`}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function QueueModes({ data }: { data: AdminBenchmarksResponse }) {
  return (
    <TablePanel title="대기열 모드" hint="v3 고정">
      <table className="ops-table min-w-[560px]">
        <thead>
          <tr>
            <th>모드</th>
            <th className="text-right">소진 시간</th>
            <th className="text-right">p99</th>
            <th className="text-right">in-flight 최대</th>
            <th className="text-right">진입 거부</th>
            <th>해석</th>
          </tr>
        </thead>
        <tbody>
          {data.queueModes.map((q) => (
            <tr key={q.mode}>
              <td className="num font-medium">{q.mode}</td>
              <td className="num text-right">{q.exhaustSeconds}s</td>
              <td className="num text-right">{q.p99Ms}ms</td>
              <td className="num text-right">{q.inFlightMax.toLocaleString("ko-KR")}</td>
              <td className="num text-right">{q.rejected.toLocaleString("ko-KR")}</td>
              <td className="text-hig-secondary">{q.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}
