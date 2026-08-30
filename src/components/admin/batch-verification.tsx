import { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Panel, TablePanel } from "@/components/admin/panel";
import {
  BATCH_JOB_LABEL,
  BatchApiError,
  FINDING_LABEL,
  FINDING_RULE,
  FINDING_TONE,
  getJobStandings,
  getLatestReport,
  getVerifyRuns,
  rerunVerify,
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
/** 폴링 간격. 오염셋이 20초 안쪽이라 이 정도면 끝나는 순간을 놓치지 않는다. */
const RERUN_POLL_MS = 2000;

/**
 * 폴링을 접는 시각. 정상셋 실측이 177초라 그 배 이상을 준다 —
 * 짧게 잡으면 <b>돌고 있는 검증을 실패로 적는다.</b>
 */
const RERUN_TIMEOUT_MS = 6 * 60 * 1000;

type RerunState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "running"; executionId: number; attempt: number; since: number }
  | { phase: "error"; message: string };

export function BatchVerification() {
  const [report, setReport] = useState<VerifyReport>();
  const [runs, setRuns] = useState<VerifyRunRow[]>([]);
  const [jobs, setJobs] = useState<JobStanding[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal: AbortSignal): Promise<JobStanding[] | null> => {
    setLoading(true);
    // 셋을 따로 잡는다 — 리포트가 404(아직 한 번도 안 돌았다)여도 이력은 보여 준다.
    const [r, v, b] = await Promise.allSettled([
      getLatestReport(signal),
      getVerifyRuns(8, signal),
      getJobStandings(signal),
    ]);
    if (signal.aborted) return null;
    // 실패했을 때 이전 판정을 지우지 않는다. 재검증이 도는 동안 리포트 조회가 한 번
    // 흔들리면 패널이 통째로 사라지는데, 확정 판정은 다음 판정이 날 때까지 여전히 참이다.
    if (r.status === "fulfilled" && r.value) setReport(r.value);
    if (v.status === "fulfilled") setRuns(v.value.items);
    const standings = b.status === "fulfilled" ? b.value : null;
    if (standings) setJobs(standings);
    const dead = [r, v, b].every((x) => x.status === "rejected");
    setError(dead ? "배치 관리 API 에 연결하지 못했습니다." : undefined);
    setLoading(false);
    return standings;
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const [rerun, setRerun] = useState<RerunState>({ phase: "idle" });
  const [now, setNow] = useState(() => Date.now());

  /** 다시 돌릴 근거가 되는 실행. 여기 값을 그대로 되돌려 보내므로 화면이 값을 안 만든다. */
  const source = report?.run;
  /**
   * CORRUPT 인데 정답 묶음을 모르면 못 누른다 — 서버가 접수 단계에서 거절한다.
   * 눌러 보고 실패하는 것보다 못 누르는 이유를 적어 두는 편이 낫다.
   */
  const blocked =
    source && source.dataset === "CORRUPT" && source.seedRunId === null
      ? "정답 묶음(seedRunId)이 없는 실행이라 다시 돌릴 수 없습니다."
      : undefined;
  const busy = rerun.phase === "requesting" || rerun.phase === "running";

  const startRerun = useCallback(async () => {
    if (!source || blocked) return;
    setRerun({ phase: "requesting" });
    try {
      const accepted = await rerunVerify(source);
      setRerun({
        phase: "running",
        executionId: accepted.executionId,
        attempt: accepted.attempt,
        since: Date.now(),
      });
      setNow(Date.now());
    } catch (e) {
      setRerun({
        phase: "error",
        // 서버 문구를 그대로 보여 준다 — 만료가 도는 중이라거나 앞 실행이 안 끝났다거나,
        // 원인이 본문에 있는데 화면이 "실패했습니다" 로 뭉개면 그것이 사라진다.
        message: e instanceof BatchApiError ? e.message : "배치 관리 API 에 연결하지 못했습니다.",
      });
    }
  }, [source, blocked]);

  /** 도는 동안 초를 센다. 17초든 3분이든 "멈춘 게 아니다" 를 화면이 말해야 한다. */
  useEffect(() => {
    if (rerun.phase !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [rerun.phase]);

  /**
   * 접수는 202 라 결과가 즉시 안 온다. 끝날 때까지 화면 전체를 다시 읽는다 —
   * 이력 표에 줄이 하나 쌓이고 같은 체크섬 칩이 붙는 것이 이 버튼의 목적이다.
   *
   * <p>완료 판정은 <b>실행 이력이 아니라 잡 실행</b>으로 한다. 실행 행({@code runId})은
   * 잡이 가드를 다 통과한 뒤에야 생겨서, 그전에 죽으면 영영 안 나타난다. 잡 실행은
   * 접수 즉시 존재하므로 실패도 같이 잡힌다.
   */
  useEffect(() => {
    if (rerun.phase !== "running") return;
    const ac = new AbortController();
    let timer = 0;
    let stopped = false;

    const step = async () => {
      const standings = await load(ac.signal);
      if (stopped || ac.signal.aborted) return;
      const latest = standings?.find((j) => j.jobName === "verifyJob")?.latest;
      if (latest && latest.executionId === rerun.executionId && latest.status !== "STARTED") {
        setRerun(
          latest.status === "COMPLETED"
            ? { phase: "idle" }
            : { phase: "error", message: `검증 잡이 ${latest.status} 로 끝났습니다.` },
        );
        return;
      }
      if (Date.now() - rerun.since > RERUN_TIMEOUT_MS) {
        setRerun({
          phase: "error",
          message: "제한 시간 안에 안 끝났습니다. 배치 로그를 확인하십시오.",
        });
        return;
      }
      timer = window.setTimeout(() => void step(), RERUN_POLL_MS);
    };

    timer = window.setTimeout(() => void step(), RERUN_POLL_MS);
    return () => {
      stopped = true;
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [rerun, load]);

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

  /**
   * 전체 검출 수. hover 로 띄우는 "전체의 몇 %" 의 분모다.
   *
   * <p>유형별 합이 아니라 실행이 적어 낸 수를 먼저 쓴다 — 둘이 어긋나면 그것 자체가
   * 서버 쪽 신호라, 화면에서 합을 다시 내 덮어 버리면 그 신호가 사라진다.
   */
  const total = useMemo(() => {
    const byType = Object.values(report?.byType ?? {}).reduce((a, v) => a + (v ?? 0), 0);
    return report?.run.findingCount ?? byType;
  }, [report]);

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="t-caption text-hig-muted">배치 검증 · 확정 판정</p>
          <h2 className="t-title mt-1">이력을 다시 접어 낸 답</h2>
        </div>
        <div className="flex items-center gap-3">
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
          {/* 값을 하나도 안 받는다 — asOf·dataset·scope·seedRunId 를 최신 실행에서
              그대로 가져오고 attempt 는 서버가 정한다. 누를 것만 남긴다. */}
          <button
            type="button"
            className="btn-compact"
            onClick={() => void startRerun()}
            disabled={!source || blocked !== undefined || busy}
            {...(blocked ? { title: blocked } : {})}
          >
            {rerun.phase === "requesting"
              ? "접수 중…"
              : rerun.phase === "running"
                ? `검증 중 · ${Math.max(0, Math.round((now - rerun.since) / 1000))}초`
                : "같은 asOf 로 다시 검증"}
          </button>
        </div>
      </header>

      {rerun.phase === "running" && (
        <p className="surface-card t-body-sm px-5 py-3 text-hig-secondary">
          attempt <span className="num font-semibold">{rerun.attempt}</span> 로 접수했습니다. 끝나면
          이력에 줄이 하나 쌓입니다 — 같은 판정이라면 체크섬이 위와 같아야 합니다.
        </p>
      )}

      {rerun.phase === "error" && (
        <p className="surface-card t-body-sm px-5 py-3 text-viz-critical">{rerun.message}</p>
      )}

      {blocked && rerun.phase !== "error" && (
        <p className="surface-card t-body-sm px-5 py-3 text-hig-secondary">{blocked}</p>
      )}

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

            {/* TablePanel 이 아니라 Panel 이다 — TablePanel 안쪽 overflow-x-auto 가
                세로까지 잘라서 조각 위에 뜨는 말풍선이 잘린다. */}
            <Panel
              title="검출 대조"
              hint={manifest?.present ? "규칙별 비중" : "여섯 규칙 전부 0이어야 한다"}
            >
              <FindingDonut byType={report.byType} total={total} />
            </Panel>

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

/** 규칙 순서. V1~V6 는 서버 계약이라 화면이 순서를 다시 정하지 않는다. */
const RULES = Object.keys(FINDING_LABEL) as FindingType[];

/**
 * 검출 대조 — 규칙별 비중을 원형(도넛)으로.
 *
 * <p><b>0건인 규칙은 조각이 안 생긴다.</b> 원형이 못 그리는 값이라 그렇다. 그런데
 * "등급 위반은 한 건도 없었다" 는 이 패널이 말하려는 <b>"정확히 그것들만 잡았다" 의
 * 일부</b>라 화면에서 사라지면 안 된다. 그래서 아래 목록은 조각이 없는 규칙까지
 * 여섯 줄을 <b>전부</b> 세운다 — 원형은 비중을 말하고, 목록이 사실을 말한다.
 *
 * <p>같은 크기 조각(200·200·200)은 각도로 안 갈리므로 정체는 색이 아니라 목록의
 * 글자가 가른다. 조각 위에 마우스를 올리면 건수와 전체 대비 비율이 뜬다.
 */
function FindingDonut({
  byType,
  total,
}: {
  byType: Partial<Record<FindingType, number>>;
  total: number;
}) {
  const slices = RULES.map((type) => ({
    type,
    label: FINDING_LABEL[type],
    rule: FINDING_RULE[type],
    color: FINDING_TONE[type],
    value: byType[type] ?? 0,
  }));
  const drawn = slices.filter((s) => s.value > 0);

  return (
    <div className="flex flex-col">
      {/* 링과 목록을 나란히 둔다 — 위아래로 쌓으면 링 좌우가 비고 두 덩어리로 읽힌다. */}
      <div className="flex items-center gap-5">
        <div className="relative size-[164px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={drawn.length > 0 ? drawn : [{ type: "EMPTY", value: 1 }]}
                dataKey="value"
                nameKey="label"
                /* 얇은 링. 두꺼우면 색 면적이 커져 값보다 색이 먼저 읽힌다. */
                innerRadius={60}
                outerRadius={78}
                /* 조각 사이를 띄운다 — 붙여 두면 같은 크기 조각의 경계가 안 보인다. */
                paddingAngle={drawn.length > 1 ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
              >
                {(drawn.length > 0 ? drawn : [{ type: "EMPTY", color: "var(--x-fill)" }]).map(
                  (s) => (
                    <Cell key={s.type} fill={s.color} />
                  ),
                )}
              </Pie>
              {drawn.length > 0 && <Tooltip content={<DonutTip total={total} />} cursor={false} />}
            </PieChart>
          </ResponsiveContainer>
          {/* 가운데는 합계다. 조각을 다 더하면 얼마인지가 원형에서 안 읽힌다. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="t-tile num font-semibold">{total.toLocaleString("ko-KR")}</span>
            <span className="t-caption -mt-0.5 text-hig-muted">건</span>
          </div>
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
          {slices.map((s) => (
            <li key={s.type} className="t-body-sm flex items-baseline gap-2">
              <span
                className="size-2 shrink-0 translate-y-[-1px] rounded-full"
                style={{ background: s.value === 0 ? "var(--x-fill)" : s.color }}
                aria-hidden
              />
              <span className="num t-caption shrink-0 text-hig-muted">{s.rule}</span>
              <span
                className={`truncate ${s.value === 0 ? "text-hig-muted" : "text-hig-secondary"}`}
              >
                {s.label}
              </span>
              <span
                className={`num ml-auto shrink-0 font-semibold ${
                  s.value === 0 ? "text-hig-muted" : ""
                }`}
              >
                {s.value.toLocaleString("ko-KR")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 조각이 없는 규칙을 이름으로 적어 준다 — 원형에서 0 은 안 보이는데,
          "그 규칙은 한 건도 없었다" 가 이 패널이 말하려는 것의 일부다.
          여섯 규칙이 전부 잡혔으면 적을 것이 없으므로 줄 자체를 안 낸다. */}
      {(drawn.length === 0 || drawn.length < slices.length) && (
        <p className="t-caption mt-4 text-hig-muted">
          {drawn.length === 0
            ? "검출이 없어 조각이 없다 — 그것이 통과다."
            : `조각이 없는 규칙 · ${slices
                .filter((s) => s.value === 0)
                .map((s) => s.label)
                .join(" · ")}`}
        </p>
      )}
    </div>
  );
}

/** 조각 위 말풍선. 저장소의 기존 차트 말풍선과 같은 모양을 쓴다. */
function DonutTip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload?: { label?: string; color?: string; value?: number } }[];
  total: number;
}) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;
  const value = slice.value ?? 0;
  return (
    <div className="surface-card border border-hairline px-3 py-2 shadow-none">
      <p className="t-caption flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: slice.color }}
          aria-hidden
        />
        <span className="text-hig-secondary">{slice.label}</span>
        <span className="num ml-auto font-semibold">{value.toLocaleString("ko-KR")}건</span>
      </p>
      <p className="t-caption mt-1 text-hig-muted">
        {total === 0
          ? "—"
          : `전체 ${total.toLocaleString("ko-KR")}건의 ${((value / total) * 100).toFixed(1)}%`}
      </p>
    </div>
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
