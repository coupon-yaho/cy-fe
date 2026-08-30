import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Panel, TablePanel } from "@/components/admin/panel";
import {
  BATCH_JOB_LABEL,
  BATCH_ROOTS,
  BatchApiError,
  FINDING_LABEL,
  FINDING_RULE,
  FINDING_TONE,
  discoverSources,
  getJobStandings,
  getLatestReport,
  getVerifyProgress,
  getVerifyRuns,
  rerunVerify,
  type BatchRoot,
  type BatchSource,
  type FindingType,
  type JobStanding,
  type VerifyProgress,
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
/**
 * 도는 중일 때 폴링 간격. 훑은 행 수가 <b>진짜로 이 주기에 맞춰 올라간다</b> —
 * 실측으로 10초 동안 0 → 24,000 → 100,000 → … → 600,200 이었다.
 */
const LIVE_POLL_MS = 1000;

/**
 * 도는 것이 없을 때 간격. 아주 끄지는 않는다 — 검증을 다른 사람이나 스케줄러가
 * 시작할 수도 있고, 그때도 이 화면이 알아서 살아나야 한다.
 */
const IDLE_POLL_MS = 5000;

/** 화면 말로 옮긴 {@code asOf} 의 뜻. 표와 패널이 같은 문장을 쓴다. */
const AS_OF_NOTE =
  "이 시각까지의 이력만 접어서 판정한다. 같은 값으로 다시 돌리면 같은 답이 나온다.";

type RerunState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "accepted"; attempt: number }
  | { phase: "error"; message: string };

/**
 * 숫자를 목표값까지 굴린다.
 *
 * <p>훑은 행 수는 1초마다 24,000 → 100,000 처럼 뛰어서 들어온다. 그대로 찍으면
 * 값이 <b>툭툭 갈아 끼워지지</b> 실시간으로 안 읽힌다. 사이를 메워야 "지금 훑고 있다" 가
 * 눈에 보인다. 움직임을 줄여 달라고 한 사용자에게는 굴리지 않고 바로 세운다.
 */
function useCountUp(target: number, resetKey?: string | number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const keyRef = useRef(resetKey);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    // 다른 실행으로 바뀌었으면 굴리지 않고 바로 세운다. 앞 실행이 60만 행이었는데
    // 새 실행이 5만 행에서 시작하면, 굴림이 **거꾸로 내려가** 되감기처럼 보인다.
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey;
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    if (from === target) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    const started = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - started) / COUNT_UP_MS);
      // 끝에서 부드럽게 선다. 선형이면 마지막 숫자가 툭 멈춰 어색하다.
      const eased = 1 - (1 - p) ** 3;
      setShown(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, resetKey]);

  return shown;
}

/** 폴링 간격보다 조금 짧게. 다음 값이 올 때 앞 굴림이 이미 서 있어야 안 밀린다. */
const COUNT_UP_MS = 800;

export function BatchVerification() {
  const [report, setReport] = useState<VerifyReport>();
  const [runs, setRuns] = useState<VerifyRunRow[]>([]);
  const [jobs, setJobs] = useState<JobStanding[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  /**
   * 이 화면이 고를 수 있는 셋들. 배치가 한 대뿐이면 한 칸이고, 그때 고르는 자리는
   * 아예 안 그린다 — 고를 것이 없는 선택지는 화면만 어지럽힌다.
   */
  const [sources, setSources] = useState<BatchSource[]>([]);
  const [activeRoot, setActiveRoot] = useState<BatchRoot>(BATCH_ROOTS[0]);
  const active = sources.find((x) => x.root === activeRoot) ?? sources[0];
  const root = active?.root ?? BATCH_ROOTS[0];

  const load = useCallback(
    async (signal: AbortSignal, full: boolean): Promise<JobStanding[] | null> => {
      setLoading(true);
      // 어떤 엔드포인트가 살아 있고 무슨 셋인지는 물어서 안다. 도는 중에는 다시 묻지
      // 않는다 — 안 고른 쪽은 그 사이에 바뀔 일이 없고, 요청만 두 배가 된다.
      const discovery = full ? discoverSources(signal) : null;
      // 셋을 따로 잡는다 — 리포트가 404(아직 한 번도 안 돌았다)여도 이력은 보여 준다.
      const [r, v, b, d] = await Promise.allSettled([
        getLatestReport(root, signal),
        getVerifyRuns(root, 8, signal),
        getJobStandings(root, signal),
        discovery ?? Promise.resolve(null),
      ]);
      if (signal.aborted) return null;
      if (d.status === "fulfilled" && d.value) setSources(d.value);

      /*
       * 판정이 안 난 최신 실행이 있으면 그 실행의 중간 상태를 따로 묻는다(CY-784).
       * <b>내 클릭이 아니라 이력에서 찾는다</b> — 스케줄러나 다른 사람이 돌린 것도 같이
       * 살아난다. 트리거가 주는 executionId 는 여기 못 쓴다(잡 실행 번호라 404 다).
       */
      const inFlight =
        v.status === "fulfilled" ? (v.value.items.find((x) => x.verdict === null) ?? null) : null;
      if (!inFlight) {
        setProgress(null);
      } else {
        try {
          const p = await getVerifyProgress(root, inFlight.runId, signal);
          if (!signal.aborted) setProgress(p.status === "DONE" ? null : p);
        } catch {
          // 진행 조회가 없는 배치(옛 판)여도 나머지 화면은 그대로 그린다.
          if (!signal.aborted) setProgress(null);
        }
      }
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
    },
    [root],
  );

  /**
   * <b>계속 되읽는다.</b> 도는 중이면 1초, 아니면 5초.
   *
   * <p>한 번만 읽고 마는 화면이면 재검증을 눌러도 다 끝난 뒤에야 결과가 바뀐다.
   * 그런데 이 배치는 <b>도는 동안 훑은 행 수가 실제로 올라간다</b>(실측). 그것을
   * 그대로 내보내면 "지금 검증하고 있다" 가 화면에서 보인다.
   *
   * <p>도는 것을 <b>내 클릭이 아니라 잡 상태로</b> 판단한다. 그래야 스케줄러가
   * 시작했거나 다른 사람이 눌렀을 때도 이 화면이 같이 살아난다.
   */
  useEffect(() => {
    const ac = new AbortController();
    let timer = 0;
    let stopped = false;

    let live = false;
    const cycle = async () => {
      // 도는 중에는 안 고른 셋을 다시 묻지 않는다 — 그 사이에 바뀔 일이 없고 요청만 는다.
      const standings = await load(ac.signal, !live);
      if (stopped || ac.signal.aborted) return;
      live = standings?.find((j) => j.jobName === "verifyJob")?.latest?.status === "STARTED";
      timer = window.setTimeout(() => void cycle(), live ? LIVE_POLL_MS : IDLE_POLL_MS);
    };

    void cycle();
    return () => {
      stopped = true;
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [load]);

  const [progress, setProgress] = useState<VerifyProgress | null>(null);
  const [rerun, setRerun] = useState<RerunState>({ phase: "idle" });
  const [now, setNow] = useState(() => Date.now());

  /**
   * 지금 도는 검증 잡. 있으면 화면 전체가 "검증 중" 으로 바뀐다.
   *
   * <p>훑은 행 수는 <b>잡 실행</b>에서만 나오므로 이 값이 따로 필요하다. 검출 수는
   * {@link progress} 가 답한다 — 둘의 출처가 다르다.
   */
  const running = useMemo(() => {
    const latest = jobs.find((j) => j.jobName === "verifyJob")?.latest;
    return latest && latest.status === "STARTED" ? latest : null;
  }, [jobs]);

  /** 판정 없이 너무 오래된 실행. 더 기다려도 안 끝나므로 폴링을 접고 그렇게 적는다. */
  const stale = progress?.status === "STALE" ? progress : null;
  /** 도는 중이거나(잡) 중간 상태가 잡히면(실행 행) 화면을 진행 중으로 본다. */
  const inProgress = running !== null || progress?.status === "RUNNING";

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
  const busy = rerun.phase === "requesting" || inProgress;

  const startRerun = useCallback(async () => {
    if (!source || blocked) return;
    setRerun({ phase: "requesting" });
    try {
      const accepted = await rerunVerify(root, source);
      // 여기서 "도는 중" 으로 바꾸지 않는다 — 그 판단은 폴링이 잡 상태로 한다.
      setRerun({ phase: "accepted", attempt: accepted.attempt });
    } catch (e) {
      setRerun({
        phase: "error",
        // 서버 문구를 그대로 보여 준다 — 만료가 도는 중이라거나 앞 실행이 안 끝났다거나,
        // 원인이 본문에 있는데 화면이 "실패했습니다" 로 뭉개면 그것이 사라진다.
        message: e instanceof BatchApiError ? e.message : "배치 관리 API 에 연결하지 못했습니다.",
      });
    }
  }, [root, source, blocked]);

  /** 도는 동안 초를 센다. 17초든 3분이든 "멈춘 게 아니다" 를 화면이 말해야 한다. */
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  /**
   * 경과 초. <b>서버의 {@code startedAt} 으로 재면 안 된다</b> — 존이 없는 문자열이라
   * 브라우저가 지역시각으로 읽는데 배치는 UTC 라 아홉 시간이 밀린다. 그래서 이 화면이
   * 그 실행을 <b>처음 본 시각</b>부터 잰다. 도중에 페이지를 연 경우 실제보다 짧게 나오지만,
   * 여기서 필요한 것은 정확한 소요가 아니라 "멈춘 게 아니다" 라는 신호다.
   * (확정 소요는 실행이 끝난 뒤 이력 표가 서버 값으로 적는다.)
   */
  const [seenAt, setSeenAt] = useState<{ executionId: number; at: number } | null>(null);
  useEffect(() => {
    if (!running) {
      setSeenAt(null);
      return;
    }
    setSeenAt((prev) =>
      prev && prev.executionId === running.executionId
        ? prev
        : { executionId: running.executionId, at: Date.now() },
    );
  }, [running]);
  const elapsedSeconds = seenAt ? Math.max(0, Math.round((now - seenAt.at) / 1000)) : 0;

  /** 접수 안내는 실제로 돌기 시작하면 치운다 — 그때부터는 진행 상황이 말해 준다. */
  useEffect(() => {
    if (running && rerun.phase === "accepted") setRerun({ phase: "idle" });
  }, [running, rerun.phase]);

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

  /**
   * 화면에 적을 행 수. <b>도는 중이면 지금 도는 실행의 값</b>이다 — 배치가 청크를
   * 커밋할 때마다 실제로 올라가므로(실측) 그대로 내보내면 진행이 눈에 보인다.
   * 도는 것이 없으면 이 판정을 만든 실행의 값이고, 못 짝지으면 안 적는다.
   */
  const scanRows = running ? (running.stepReadTotal ?? 0) : (scanJob?.stepReadTotal ?? null);
  const shownRows = useCountUp(scanRows ?? 0, (running ?? scanJob)?.executionId);

  /**
   * 진행률의 분모 — <b>지난 완료 실행이 훑은 총 행수</b>다.
   *
   * <p>서버가 "이번에 몇 행을 훑을 예정" 을 안 알려 준다. 그런데 같은 asOf·같은 데이터면
   * 훑는 양이 같으므로(그게 이 패널이 증명하는 것이다) 지난 실행 값이 좋은 어림이다.
   * 어림인 것을 화면에도 적는다 — 100% 에서 잠깐 멈춰 서는 일이 있을 수 있다.
   */
  const lastCompletedRows = useRef<number | null>(null);
  useEffect(() => {
    if (!running && scanJob?.stepReadTotal) lastCompletedRows.current = scanJob.stepReadTotal;
  }, [running, scanJob]);
  const scanProgress =
    running && lastCompletedRows.current
      ? Math.min(1, (running.stepReadTotal ?? 0) / lastCompletedRows.current)
      : null;

  /** 적중률도 굴린다 — 100.0 이 툭 나타나는 것보다 차오르는 편이 읽힌다. */
  const shownHitRate = useCountUp(hitRate ?? 0, report?.run.id);

  /** 아직 한 번도 안 돈 잡. 표 위 문구가 그것부터 말하게 한다. */
  const idleJobs = useMemo(() => jobs.filter((j) => j.runCount === 0), [jobs]);

  return (
    <section className="mt-4 flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="t-caption text-hig-muted">배치 검증 · 확정 판정</p>
          <h2 className="t-title mt-1">이력을 다시 접어 낸 답</h2>
          {/* 패널마다 붙어 있던 설명을 여기 한 줄로 모았다 — 카드마다 회색 문장이
              달려 있으면 화면이 값보다 말로 읽힌다. */}
          <p className="t-body-sm mt-1.5 text-hig-secondary">
            같은 기준 시각으로 다시 돌리면 체크섬이 같아야 한다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 셋이 둘이면 위 카드가 이미 판정을 말한다 — 여기 또 적으면 두 번이다. */}
          {report && sources.length < 2 && (
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
            className="inline-flex size-9 items-center justify-center rounded-full border border-hairline text-hig-secondary transition-colors hover:bg-fill disabled:opacity-40"
            onClick={() => void startRerun()}
            disabled={!source || blocked !== undefined || busy}
            title={blocked ?? "같은 기준 시각으로 다시 검증"}
            aria-label="같은 기준 시각으로 다시 검증"
          >
            <RefreshIcon spinning={busy} />
          </button>
        </div>
      </header>

      {/* 배치가 두 대일 때만 나온다. 오염셋은 정답을 심어 둔 시험이고, 정상셋은
          평상시 도는 것이다 — 둘을 같이 걸어야 "놓치지도 않고 헛 잡지도 않는다" 가
          한 화면에서 읽힌다. */}
      {sources.length > 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sources.map((s) => (
            <SourceCard
              key={s.root}
              source={s}
              selected={s.root === root}
              onSelect={() => setActiveRoot(s.root)}
            />
          ))}
        </div>
      )}

      {inProgress && (
        <p className="surface-card t-body-sm flex flex-wrap items-center gap-x-2 px-5 py-3 text-hig-secondary">
          <span className="font-semibold text-hig-fg">검증 중</span>
          <span className="num">{elapsedSeconds}초</span>
          {progress?.status === "RUNNING" && (
            <span className="num">· 검출 {progress.findingCount.toLocaleString("ko-KR")}건</span>
          )}
          <span>· 끝나면 이력에 줄이 하나 쌓입니다 — 재현이라면 체크섬이 위와 같습니다.</span>
        </p>
      )}

      {/* 판정 없이 임계(기본 30분)를 넘긴 실행. 얼림 가드나 역전 검사로 죽으면 그 행을
          닫아 주는 경로가 없어서, 이 값이 없으면 화면이 영원히 기다린다. */}
      {stale && (
        <p className="surface-card t-body-sm px-5 py-3 text-viz-critical">
          run <span className="num font-semibold">{stale.runId}</span> 이 판정 없이 너무 오래 열려
          있습니다. 끝나지 않을 실행으로 보고 기다리지 않습니다 — 배치 로그를 확인하십시오.
        </p>
      )}

      {!inProgress && rerun.phase === "accepted" && (
        <p className="surface-card t-body-sm px-5 py-3 text-hig-secondary">
          attempt <span className="num font-semibold">{rerun.attempt}</span> 로 접수했습니다. 곧
          시작합니다.
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
              className={inProgress ? "opacity-60 transition-opacity" : "transition-opacity"}
              title={manifest?.present ? "적중률" : "검출"}
              {...(inProgress
                ? { hint: "이전 판정" }
                : manifest?.present
                  ? {}
                  : { hint: "0이 정답" })}
            >
              {manifest?.present ? (
                <>
                  <p className={`t-hero num ${matched ? "text-hig-fg" : "text-viz-critical"}`}>
                    {shownHitRate.toFixed(1)}
                    <span className="t-title"> %</span>
                  </p>
                  <div className="mt-3">
                    <Bar
                      ratio={(hitRate ?? 0) / 100}
                      tone={matched ? "var(--viz-good)" : "var(--viz-critical)"}
                    />
                  </div>
                  <dl className="t-body-sm mt-4 grid grid-cols-[5.5rem_1fr] gap-y-1.5 text-hig-secondary">
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
                </>
              )}
            </Panel>

            {/* TablePanel 이 아니라 Panel 이다 — TablePanel 안쪽 overflow-x-auto 가
                세로까지 잘라서 조각 위에 뜨는 말풍선이 잘린다. */}
            <Panel
              className={
                progress?.status === "RUNNING"
                  ? "transition-opacity"
                  : inProgress
                    ? "opacity-60 transition-opacity"
                    : "transition-opacity"
              }
              title="검출 대조"
              {...(progress?.status === "RUNNING"
                ? { hint: "지금 잡히는 중" }
                : inProgress
                  ? { hint: "이전 판정" }
                  : {})}
            >
              {/* 도는 중이면 지금 쌓이는 검출을 그린다 — 실행 행에서 직접 센 값이라
                  규칙 Step 이 커밋할 때마다 늘어난다(실측 0 → 11 → 166 → 800). */}
              <FindingDonut
                byType={progress?.status === "RUNNING" ? progress.byType : report.byType}
                total={progress?.status === "RUNNING" ? progress.findingCount : total}
              />
            </Panel>

            <Panel title="훑은 양" {...(running ? { hint: "진행 중" } : {})}>
              <p className={`t-hero num ${running ? "text-hig-fg" : ""}`}>
                {scanRows === null ? (
                  <span className="text-hig-muted">—</span>
                ) : (
                  <>
                    {Math.round(shownRows).toLocaleString("ko-KR")}
                    <span className="t-title"> 행</span>
                  </>
                )}
              </p>
              <dl className="t-body-sm mt-4 grid grid-cols-[5.5rem_1fr] gap-y-1.5 text-hig-secondary">
                {/* "asOf" 는 서버 파라미터 이름이지 화면 말이 아니다. 뜻을 옮겨 적고,
                    그것만으로 안 통하는 사람을 위해 한 줄 설명을 마우스에 물려 둔다.
                    본문으로 내면 카드마다 회색 문장이 다시 생긴다. */}
                <dt className="cursor-help" title={AS_OF_NOTE}>
                  기준 시각
                </dt>
                <dd className="num text-hig-fg">{report.run.asOf.replace("T", " ")}</dd>
                <dt>소요</dt>
                <dd className="num text-hig-fg">
                  {running
                    ? `${elapsedSeconds}초 째`
                    : elapsed(report.run.startedAt, report.run.finishedAt)}
                </dd>
                <dt>체크섬</dt>
                <dd className="num text-hig-fg">
                  {running ? (
                    <span className="text-hig-muted">계산 중</span>
                  ) : report.run.findingsChecksum ? (
                    report.run.findingsChecksum.slice(0, 12)
                  ) : (
                    "—"
                  )}
                </dd>
              </dl>
              {scanProgress !== null && (
                <div className="mt-4">
                  <Bar ratio={scanProgress} tone="var(--hig-foreground)" />
                  <p className="t-caption mt-1.5 text-hig-muted">
                    지난 실행이 훑은 양 기준 {Math.round(scanProgress * 100)}% · 어림이다
                  </p>
                </div>
              )}
            </Panel>
          </div>

          <TablePanel
            title="실행 이력"
            hint={
              determinism.conflicting > 0
                ? `같은 기준 시각이 다른 체크섬을 냈다 — ${determinism.conflicting}건`
                : determinism.repeats > 0
                  ? `같은 체크섬이 ${determinism.repeats}회 재현됐다`
                  : "같은 기준 시각은 같은 체크섬이어야 한다"
            }
          >
            <table className="ops-table">
              <thead>
                <tr>
                  <th>run</th>
                  <th>판정</th>
                  <th>셋</th>
                  <th className="cursor-help" title={AS_OF_NOTE}>
                    기준 시각
                  </th>
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
 * 검출 대조 — 규칙별 비중을 도넛으로.
 *
 * <p><b>떠 있는 말풍선을 안 쓴다.</b> 처음엔 조각 위에 카드를 띄웠는데 가운데 합계와
 * 겹쳐 글자가 뭉개졌다. 링 안쪽은 이미 숫자가 있는 자리라 그 위에 무엇을 띄우든 겹친다.
 * 그래서 <b>읽을 곳을 하나로 모은다</b> — 조각을 짚으면 가운데 숫자가 그 규칙의 값으로
 * 바뀌고 범례의 해당 줄이 살아난다. 반대로 범례를 짚어도 조각이 살아난다.
 *
 * <p><b>0건인 규칙은 조각이 안 생긴다.</b> 원형이 못 그리는 값이라 그렇다. 그런데
 * "등급 위반은 한 건도 없었다" 는 이 패널이 말하려는 것의 일부라, 범례는 조각이 없는
 * 규칙까지 여섯 줄을 전부 세운다 — 링은 비중을 말하고 범례가 사실을 말한다.
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
  const [active, setActive] = useState<FindingType | null>(null);
  const focused = slices.find((s) => s.type === active) ?? null;

  // 가운데가 읽어 주는 값. 짚은 것이 없으면 합계다.
  const centerValue = focused ? focused.value : total;
  const shownCenter = useCountUp(centerValue, focused?.type ?? "total");

  return (
    <div className="flex items-center gap-5">
      <div className="relative size-[164px] shrink-0" onMouseLeave={() => setActive(null)}>
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
              onMouseEnter={(_, index) => setActive(drawn[index]?.type ?? null)}
            >
              {(drawn.length > 0 ? drawn : [{ type: "EMPTY", color: "var(--x-fill)" }]).map((s) => (
                <Cell
                  key={s.type}
                  fill={s.color}
                  /* 짚은 것만 남기고 나머지를 물린다. 강조를 색으로 더하는 것보다
                     빼는 편이 조용하다. */
                  fillOpacity={active && active !== s.type ? 0.28 : 1}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="t-tile num font-semibold">
            {Math.round(shownCenter).toLocaleString("ko-KR")}
          </span>
          <span className="t-caption -mt-0.5 text-hig-muted">{focused ? focused.label : "건"}</span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
        {slices.map((s) => {
          const dim = active !== null && active !== s.type;
          return (
            <li
              key={s.type}
              className={`t-body-sm flex items-baseline gap-2 transition-opacity ${
                dim ? "opacity-40" : ""
              }`}
              onMouseEnter={() => setActive(s.value > 0 ? s.type : null)}
              onMouseLeave={() => setActive(null)}
            >
              <span
                className="size-2 shrink-0 -translate-y-px rounded-full"
                style={{ background: s.value === 0 ? "var(--x-fill)" : s.color }}
                aria-hidden
              />
              <span className="num t-caption shrink-0 text-hig-muted">{s.rule}</span>
              <span className={`truncate ${s.value === 0 ? "text-hig-muted" : ""}`}>{s.label}</span>
              <span
                className={`num ml-auto shrink-0 font-semibold ${
                  s.value === 0 ? "text-hig-muted" : ""
                }`}
              >
                {/* 짚은 줄만 비율로 바뀐다. 여섯 줄에 전부 적으면 숫자가 두 배가 되고,
                    정작 비교해야 할 건수가 안 읽힌다. */}
                {active === s.type && total > 0
                  ? `${((s.value / total) * 100).toFixed(1)}%`
                  : s.value.toLocaleString("ko-KR")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 셋 하나를 고르는 카드. <b>고르기 전에 이미 답이 보인다.</b>
 *
 * <p>탭으로 두면 안 고른 쪽 결과가 안 보여서, 정작 하고 싶은 말 — 오염셋은 심은 것을
 * 다 잡았고 정상셋은 한 건도 안 잡았다 — 의 절반이 숨는다. 그래서 두 장을 항상 펴 두고,
 * 누르면 아래 상세만 바뀐다.
 */
function SourceCard({
  source,
  selected,
  onSelect,
}: {
  source: BatchSource;
  selected: boolean;
  onSelect: () => void;
}) {
  const { run, manifest } = source.report;
  const corrupt = run.dataset === "CORRUPT";
  const expected = manifest?.present ? (manifest.expectedCount ?? 0) : 0;
  const hit = expected - (manifest?.missingCount ?? 0);
  const pass = run.verdict === "PASS";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`surface-card flex items-center gap-4 px-5 py-4 text-left transition-colors ${
        selected ? "ring-2 ring-hig-fg" : "hover:bg-fill/40"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="t-caption block text-hig-muted">
          {corrupt ? "오염셋 · 정답을 심어 둔 시험" : "정상셋 · 평상시 도는 것"}
        </span>
        {/*
         * <b>"심은 800건" 이 아니다.</b> 심은 오염은 700건이고, 그중 한 종류가 두 규칙에
         * 동시에 걸려서(CANCEL_USE 이중 기록 → 불법 전이 + 재고 이중 복원) 위반이 800건이
         * 된다. 세는 단위가 "오염" 이 아니라 "위반" 이라 그렇게 부른다.
         *
         * <p>700 은 화면이 모른다 — 매니페스트가 주는 것은 기대·누락·오탐뿐이고, 그 수는
         * expected_findings 의 corrupt_type 을 세야 나온다. 그래서 관계만 적고 숫자는
         * 서버가 준 것만 쓴다.
         */}
        <span className="t-body mt-0.5 block font-semibold">
          {!corrupt
            ? `검출 ${(run.findingCount ?? 0).toLocaleString("ko-KR")}건`
            : hit === expected
              ? `심은 오염이 낳는 위반 ${expected.toLocaleString("ko-KR")}건을 전부 잡음`
              : `위반 ${expected.toLocaleString("ko-KR")}건 중 ${hit.toLocaleString("ko-KR")}건을 잡음`}
        </span>
        <span className="t-caption mt-1 block text-hig-secondary">
          {corrupt
            ? `헛 잡은 것 ${(manifest?.unexpectedCount ?? 0).toLocaleString("ko-KR")}건`
            : "헛경보 없음이 통과 조건"}
        </span>
      </span>
      <span
        className={`t-caption shrink-0 rounded-full px-3 py-1 font-semibold ${
          pass ? "bg-hig-fg text-hig-surface" : "bg-viz-critical text-hig-surface"
        }`}
      >
        {run.verdict ?? "진행 중"}
      </span>
    </button>
  );
}

/**
 * 새로고침 아이콘. 다른 서비스들이 쓰는 그 원형 화살표다 — 라벨 없이도 뜻이 통한다.
 * 도는 동안 같이 돌려서 "누른 게 먹었다" 를 즉시 알린다.
 */
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`size-4 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13.4 8a5.4 5.4 0 1 1-1.63-3.86" />
      <path d="M13.6 2.2v2.6h-2.6" />
    </svg>
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
