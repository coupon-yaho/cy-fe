import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, TablePanel } from "@/components/admin/panel";
import {
  BATCH_JOB_LABEL,
  FINDING_LABEL,
  FINDING_RULE,
  getJobStandings,
  getLatestReport,
  getVerifyRuns,
  type FindingType,
  type JobStanding,
  type VerifyReport,
  type VerifyRunRow,
} from "@/lib/admin/batch";

/**
 * 배치 검증 판정 — 정합성 탭의 아래쪽 절반.
 *
 * <b>위쪽 LIVE 판정과 짝을 이룬다.</b> 위는 부하가 도는 <i>동안</i> 격차를 1초마다 재는
 * 실시간 관측이고, 여기는 부하가 끝난 뒤 이력을 <b>다시 접어</b> 낸 확정 판정이다.
 * 그래서 여기만 체크섬이 있다 — 같은 {@code asOf} 로 다시 돌려 같은 값이 나오는 것이
 * "이 판정을 믿어도 된다" 의 근거다.
 */
export function BatchVerification() {
  const [report, setReport] = useState<VerifyReport>();
  const [runs, setRuns] = useState<VerifyRunRow[]>([]);
  const [jobs, setJobs] = useState<JobStanding[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    // 셋을 따로 잡는다 — 리포트가 404(아직 한 번도 안 돌았다)여도 이력은 보여 준다.
    const [r, v, b] = await Promise.allSettled([
      getLatestReport(signal),
      getVerifyRuns(8, signal),
      getJobStandings(signal),
    ]);
    if (signal.aborted) return;
    setReport(r.status === "fulfilled" && r.value ? r.value : undefined);
    setRuns(v.status === "fulfilled" ? v.value.items : []);
    setJobs(b.status === "fulfilled" ? b.value : []);
    const dead = [r, v, b].every((x) => x.status === "rejected");
    setError(dead ? "배치 관리 API 에 연결하지 못했습니다." : undefined);
    setLoading(false);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  /**
   * 같은 {@code asOf} 로 두 번 이상 돌았고 체크섬이 전부 같은가.
   * 재현성은 이 화면이 보여 줄 수 있는 가장 강한 증거라 따로 계산한다.
   */
  const determinism = useMemo(() => {
    const byAsOf = new Map<string, Set<string>>();
    for (const run of runs) {
      if (!run.findingsChecksum) continue;
      const key = `${run.dataset}|${run.scope}|${run.asOf}`;
      const set = byAsOf.get(key) ?? new Set<string>();
      set.add(run.findingsChecksum);
      byAsOf.set(key, set);
    }
    const conflicting = [...byAsOf.values()].filter((set) => set.size > 1).length;
    // "몇 번 재현됐나" — 같은 체크섬을 낸 실행이 둘 이상인 묶음의 실행 수 합.
    const tally = new Map<string, number>();
    for (const run of runs) {
      if (!run.findingsChecksum) continue;
      tally.set(run.findingsChecksum, (tally.get(run.findingsChecksum) ?? 0) + 1);
    }
    const repeats = Math.max(0, ...[...tally.values()].filter((n) => n > 1));
    return { conflicting, repeats };
  }, [runs]);

  const manifest = report?.manifest;
  const matched = manifest?.present ? manifest.matches : undefined;

  /**
   * <b>적중률</b> — 정답 중 실제로 맞춘 비율.
   *
   * <p>{@code (기대 - 누락) / 기대} 다. 검출 수를 분자로 쓰면 안 된다 — 오탐이 섞여도
   * 100%가 나와서, 이 화면이 가장 말하고 싶은 "정확히 그것들을 잡았다" 를 못 말한다.
   * 정상셋은 정답 매니페스트가 없으므로(0건이 정답) 이 값을 안 쓴다.
   */
  const hitRate = useMemo(() => {
    if (!manifest?.present) return null;
    const expected = manifest.expectedCount ?? 0;
    if (expected === 0) return null;
    const hit = expected - (manifest.missingCount ?? 0);
    return (hit / expected) * 100;
  }, [manifest]);

  /** 막대의 기준. 가장 큰 유형을 꽉 찬 폭으로 두고 나머지를 그에 비례시킨다. */
  const peak = useMemo(
    () => Math.max(0, ...Object.values(report?.byType ?? {}).map((v) => v ?? 0)),
    [report],
  );

  /**
   * 이 판정을 만든 잡 실행. 몇 행을 훑었는지가 "규모" 를 말한다.
   *
   * <p><b>시작 시각이 같을 때만 쓴다.</b> 최신 검증 잡이 최신 판정을 만든 그 실행이라는
   * 보장은 계약에 없다 — 다른 실행의 읽은 행 수를 이 판정 옆에 적으면 규모를 거짓말한다.
   * 못 짝지으면 숫자를 안 적는 쪽이 맞다.
   */
  const scanJob = useMemo(() => {
    const latest = jobs.find((j) => j.jobName === "verifyJob")?.latest;
    return latest && latest.startedAt === report?.run.startedAt ? latest : null;
  }, [jobs, report]);

  /** 아직 한 번도 안 돈 잡. 표 위 문구가 그것부터 말하게 한다. */
  const idleJobs = useMemo(() => jobs.filter((j) => j.runCount === 0), [jobs]);

  return (
    <section className="mt-4 flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="t-caption text-hig-muted">배치 검증 · 확정 판정</p>
          <h2 className="t-title mt-1">이력을 다시 접어 낸 답</h2>
        </div>
        {report && (
          <span
            className={`t-caption rounded-full px-3 py-1 font-semibold ${
              report.run.verdict === "PASS"
                ? "bg-hig-fg text-hig-surface"
                : "bg-viz-critical text-hig-surface"
            }`}
          >
            {report.run.verdict ?? "진행 중"} ·{" "}
            {report.run.dataset === "CORRUPT" ? "오염셋" : "정상셋"}
          </span>
        )}
      </header>

      {error && (
        <p className="surface-card t-body-sm px-5 py-4 text-hig-secondary">
          {error} 개발 서버라면 <span className="num">cy-fe/.env.local</span> 의{" "}
          <span className="num">BATCH_ADMIN_TOKEN</span> 과 배치 기동을 확인하십시오.
        </p>
      )}

      {!error && !report && !loading && (
        <p className="surface-card t-body-sm px-5 py-4 text-hig-secondary">
          확정 판정이 아직 없습니다. 검증을 한 번 돌리면 여기에 결과가 남습니다.
        </p>
      )}

      {report && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr_1fr]">
            <Panel
              title={manifest?.present ? "적중률" : "검출"}
              hint={manifest?.present ? "심은 것을 그대로 잡았나" : "정상셋은 0이 정답"}
            >
              {manifest?.present ? (
                <>
                  <p className={`t-hero num ${matched ? "text-hig-fg" : "text-viz-critical"}`}>
                    {(hitRate ?? 0).toFixed(1)}
                    <span className="t-title"> %</span>
                  </p>
                  <div className="mt-3">
                    <Bar
                      ratio={(hitRate ?? 0) / 100}
                      tone={matched ? "var(--viz-good)" : "var(--viz-critical)"}
                    />
                  </div>
                  <dl className="t-body-sm mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-hig-secondary">
                    <dt>맞춘 것</dt>
                    <dd className="num text-hig-fg">
                      {(
                        (manifest.expectedCount ?? 0) - (manifest.missingCount ?? 0)
                      ).toLocaleString("ko-KR")}
                      <span className="text-hig-secondary">
                        {" / "}
                        {(manifest.expectedCount ?? 0).toLocaleString("ko-KR")}
                      </span>
                    </dd>
                    <dt>놓친 것</dt>
                    <dd className="num text-hig-fg">
                      {(manifest.missingCount ?? 0).toLocaleString("ko-KR")}
                    </dd>
                    <dt>헛 잡은 것</dt>
                    <dd className="num text-hig-fg">
                      {(manifest.unexpectedCount ?? 0).toLocaleString("ko-KR")}
                    </dd>
                  </dl>
                  <p className="t-caption mt-3 text-hig-muted">
                    개수만 같고 서로 다른 것을 잡았을 수 있어, 집합을 양방향으로 뺀 값이다.
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={`t-hero num ${
                      (report.run.findingCount ?? 0) === 0 ? "text-hig-fg" : "text-viz-critical"
                    }`}
                  >
                    {(report.run.findingCount ?? 0).toLocaleString("ko-KR")}
                    <span className="t-title"> 건</span>
                  </p>
                  <p className="t-body-sm mt-4 text-hig-secondary">
                    정상 데이터에서는 검출 0건이 통과 조건이다.
                  </p>
                </>
              )}
            </Panel>

            <TablePanel
              title="검출 대조"
              hint={manifest?.present ? "규칙별로 몇 건씩" : "여섯 규칙 전부 0이어야 한다"}
            >
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>규칙</th>
                    <th>유형</th>
                    <th className="text-right">검출</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(FINDING_LABEL) as FindingType[]).map((type, i) => {
                    const n = report.byType[type] ?? 0;
                    return (
                      <tr key={type}>
                        <td className="num text-hig-secondary">{FINDING_RULE[type]}</td>
                        <td className="font-medium">
                          {FINDING_LABEL[type]}
                          {/* 규칙별 색을 고정한다 — 아래 막대와 짝이라 순서가 바뀌어도 같은 색이다. */}
                          <span className="mt-1.5 block max-w-[9rem]">
                            <Bar
                              ratio={peak === 0 ? 0 : n / peak}
                              tone={n === 0 ? "var(--hig-muted)" : `var(--viz-${(i % 8) + 1})`}
                            />
                          </span>
                        </td>
                        <td className="num text-right font-semibold align-top">
                          {n === 0 ? (
                            <span className="text-hig-muted">0</span>
                          ) : (
                            n.toLocaleString("ko-KR")
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TablePanel>

            <Panel title="훑은 양" hint="이 판정이 본 범위">
              <p className="t-hero num">
                {scanJob ? (
                  <>
                    {(scanJob.stepReadTotal ?? 0).toLocaleString("ko-KR")}
                    <span className="t-title"> 행</span>
                  </>
                ) : (
                  <span className="text-hig-muted">—</span>
                )}
              </p>
              <dl className="t-body-sm mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-hig-secondary">
                <dt>asOf</dt>
                <dd className="num text-hig-fg">{report.run.asOf.replace("T", " ")}</dd>
                <dt>소요</dt>
                <dd className="num text-hig-fg">
                  {elapsed(report.run.startedAt, report.run.finishedAt)}
                </dd>
                <dt>체크섬</dt>
                <dd className="num text-hig-fg">
                  {report.run.findingsChecksum ? report.run.findingsChecksum.slice(0, 12) : "—"}
                </dd>
              </dl>
              <p className="t-caption mt-3 text-hig-muted">
                같은 asOf 로 다시 돌리면 이 체크섬이 같아야 한다.
              </p>
            </Panel>
          </div>

          <TablePanel
            title="실행 이력"
            hint={
              determinism.conflicting > 0
                ? `같은 asOf 가 다른 체크섬을 냈다 — ${determinism.conflicting}건`
                : determinism.repeats > 0
                  ? `같은 체크섬이 ${determinism.repeats}회 재현됐다`
                  : "같은 asOf 는 같은 체크섬이어야 한다"
            }
          >
            <table className="ops-table">
              <thead>
                <tr>
                  <th>run</th>
                  <th>판정</th>
                  <th>셋</th>
                  <th>asOf</th>
                  <th className="text-right">검출</th>
                  <th className="text-right">소요</th>
                  <th>체크섬</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.runId}>
                    <td className="num text-hig-secondary">{run.runId}</td>
                    <td
                      className={`font-semibold ${
                        run.verdict === "PASS"
                          ? "text-hig-fg"
                          : run.verdict === "FAIL"
                            ? "text-viz-critical"
                            : "text-hig-muted"
                      }`}
                    >
                      {run.verdict ?? "진행 중"}
                    </td>
                    <td className="text-hig-secondary">
                      {run.dataset === "CORRUPT" ? "오염" : "정상"} · {run.scope}
                    </td>
                    <td className="num text-hig-secondary">{run.asOf.replace("T", " ")}</td>
                    <td className="num text-right">
                      {run.findingCount === null ? "—" : run.findingCount.toLocaleString("ko-KR")}
                    </td>
                    <td className="num text-right text-hig-secondary">
                      {elapsed(run.startedAt, run.finishedAt)}
                    </td>
                    <td className="num text-hig-muted">
                      {run.findingsChecksum ? (
                        <span className="inline-flex items-center gap-1.5">
                          {/* 같은 체크섬이면 같은 색이다 — 하나만 다르면 그 줄이 튄다. */}
                          <span
                            className="inline-block size-2 shrink-0 rounded-[2px]"
                            style={{ background: checksumTone(run.findingsChecksum) }}
                            aria-hidden
                          />
                          {run.findingsChecksum.slice(0, 12)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="t-body-sm text-hig-muted">
                      실행 이력이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TablePanel>

          <TablePanel
            title="잡 실행"
            hint={
              idleJobs.length > 0
                ? `아직 안 돈 잡 — ${idleJobs.map((j) => BATCH_JOB_LABEL[j.jobName]).join(" · ")}`
                : "만료 · 정리 · 검증이 돌기는 돌았나"
            }
          >
            <table className="ops-table">
              <thead>
                <tr>
                  <th>잡</th>
                  <th>상태</th>
                  <th className="text-right">횟수</th>
                  <th>마지막 실행</th>
                  <th className="text-right">소요</th>
                  <th className="text-right">읽음</th>
                  <th className="text-right">씀</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(({ jobName, runCount, latest }) => (
                  <tr key={jobName}>
                    <td className="font-medium">
                      {BATCH_JOB_LABEL[jobName]}
                      <span className="num t-caption ml-2 text-hig-muted">{jobName}</span>
                    </td>
                    <td
                      className={
                        latest === null
                          ? "text-hig-muted"
                          : latest.status === "COMPLETED"
                            ? "text-hig-fg"
                            : latest.status === "FAILED"
                              ? "font-semibold text-viz-critical"
                              : "text-hig-secondary"
                      }
                    >
                      {latest?.status ?? "안 돎"}
                    </td>
                    <td className="num text-right text-hig-secondary">
                      {runCount === 0 ? <span className="text-hig-muted">0</span> : `${runCount}회`}
                    </td>
                    <td className="num text-hig-secondary">
                      {latest ? latest.startedAt.replace("T", " ").slice(0, 19) : "—"}
                    </td>
                    <td className="num text-right">
                      {latest?.durationSeconds == null ? "—" : `${latest.durationSeconds}초`}
                    </td>
                    <td className="num text-right text-hig-secondary">
                      {latest ? (latest.stepReadTotal ?? 0).toLocaleString("ko-KR") : "—"}
                    </td>
                    <td className="num text-right text-hig-secondary">
                      {latest ? (latest.stepWriteTotal ?? 0).toLocaleString("ko-KR") : "—"}
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="t-body-sm text-hig-muted">
                      잡 실행 이력을 불러오지 못했습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TablePanel>
        </>
      )}
    </section>
  );
}

/**
 * 체크섬 → 색. 값이 같으면 색이 같다는 것만 보장하면 된다 — 어떤 색인지는 뜻이 없다.
 * 재현성을 표에서 읽으려면 32자를 눈으로 대조해야 하는데, 색이면 한눈에 갈린다.
 */
function checksumTone(checksum: string): string {
  let hash = 0;
  for (let i = 0; i < checksum.length; i += 1) hash = (hash * 31 + checksum.charCodeAt(i)) >>> 0;
  return `var(--viz-${(hash % 8) + 1})`;
}

/**
 * 비율 막대. 숫자만 있으면 "200 과 100 이 두 배" 가 눈에 안 들어온다 —
 * 같은 폭을 나눠 쓰면 분포가 한눈에 읽힌다. 색은 저장소 시각화 토큰을 그대로 쓴다.
 */
function Bar({ ratio, tone = "var(--hig-foreground)" }: { ratio: number; tone?: string }) {
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-fill" aria-hidden>
      <span
        className="block h-full rounded-full"
        style={{ width: `${width}%`, background: tone }}
      />
    </span>
  );
}

/** 시작·종료로 소요를 만든다. 아직 안 끝났으면 대시 — 0초로 적으면 끝난 것처럼 보인다. */
function elapsed(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}초`;
}
