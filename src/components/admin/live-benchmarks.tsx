import { Panel, TablePanel } from "@/components/admin/panel";
import type { LiveBenchmarkListResponse } from "@/lib/admin";

const ENGINE_LABEL = { V1: "v1 DB Lock", V2: "v2 Redis", V3: "v3 Kafka" } as const;

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function LiveBenchmarkList({ data }: { data: LiveBenchmarkListResponse }) {
  if (data.items.length === 0) {
    return (
      <Panel title="성능 측정 이력">
        <p className="t-body-sm py-6 text-center text-hig-muted">성능 측정 이력이 없습니다.</p>
      </Panel>
    );
  }

  return (
    <TablePanel title="성능 측정 이력" hint="최신 실행 순">
      <table className="ops-table min-w-[760px]">
        <thead>
          <tr>
            <th>실행 ID</th>
            <th>엔진</th>
            <th>시나리오</th>
            <th>시작 시각</th>
            <th>실행 상태</th>
            <th>보관 상태</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.benchmarkRunId}>
              <td className="num">{item.benchmarkRunId}</td>
              <td>{ENGINE_LABEL[item.engineVersion]}</td>
              <td className="num">{item.scenarioCode}</td>
              <td className="num">{dateTime(item.startedAt)}</td>
              <td>{item.runStatus}</td>
              <td>{item.archiveStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.hasOlder && <p className="t-caption mt-3 text-hig-muted">이전 실행이 더 있습니다.</p>}
    </TablePanel>
  );
}
