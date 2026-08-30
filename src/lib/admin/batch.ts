/**
 * 배치 검증 판정 — 관제 화면의 "정합성" 탭 아래쪽.
 *
 * 위쪽 LIVE 판정과 **성격이 다르다.** 그쪽은 부하가 도는 동안 Redis↔DB 격차를 1초마다
 * 되읽는 실시간 관측이고, 이쪽은 배치가 `asOf` 시점을 이력으로 **다시 접어서** 낸 확정
 * 판정이다. 그래서 이쪽만 `checksum` 이 있다 — 같은 `asOf` 로 다시 돌리면 같은 값이
 * 나와야 하고, 그것이 "이 판정은 재현된다" 는 증거다.
 *
 * 개발 서버에서는 Vite 프록시(`/batch-api`)가 관리 토큰을 붙여 배치 9091 포트로 보낸다.
 * 토큰을 브라우저로 내려보내지 않으려는 것이라, 운영에서는 이 경로가 그대로는 안 선다.
 */

/**
 * 배치 엔드포인트. <b>두 개인 이유가 있다.</b>
 *
 * <p>배치 한 대는 {@code DB_NAME} 으로 <b>DB 하나</b>만 본다. 그런데 오염셋(정답을 심어
 * 둔 것)과 정상셋(평상시 도는 것)은 서로 다른 DB 에 있다. 그래서 둘을 나란히 보이려면
 * 배치가 두 대여야 하고, 화면은 <b>엔드포인트로</b> 그 둘을 가른다 — 파라미터로 고르면
 * 그 배치가 안 가진 쪽을 골랐을 때 빈 화면이 나온다.
 *
 * <p>두 번째는 없을 수 있다. 개발 서버가 {@code BATCH_ALT_ORIGIN} 을 안 받으면 프록시
 * 자체가 안 생기고, 그때는 화면이 한 쪽만 그린다.
 */
export const BATCH_ROOTS = ["/batch-api", "/batch-alt-api"] as const;
export type BatchRoot = (typeof BATCH_ROOTS)[number];

const API_PATH = "/api/v1/admin";

export type Verdict = "PASS" | "FAIL";
export type Dataset = "CLEAN" | "CORRUPT";
export type Scope = "FULL" | "INCREMENTAL";

export type FindingType =
  | "STOCK_MISMATCH"
  | "DUP_PER_MEMBER"
  | "REPLAY_MISMATCH"
  | "ILLEGAL_TRANSITION"
  | "USAGE_MISMATCH"
  | "GRADE_VIOLATION";

/** 검출 유형을 화면 말로. 규칙 번호(V1~V6)를 같이 적어 설계 문서와 이어 준다. */
export const FINDING_LABEL: Record<FindingType, string> = {
  STOCK_MISMATCH: "재고 불일치",
  DUP_PER_MEMBER: "1인 1매 위반",
  REPLAY_MISMATCH: "리플레이 불일치",
  ILLEGAL_TRANSITION: "불법 전이",
  USAGE_MISMATCH: "사용 실적 불일치",
  GRADE_VIOLATION: "등급 위반",
};

/**
 * 규칙별 색. <b>한 색조의 계단이다.</b>
 *
 * <p>여섯 규칙에 여섯 색조를 주면 작은 링이 무지개가 되어, 옆의 무채색 패널들 사이에서
 * 혼자 시끄럽다. <b>정체는 색이 아니라 범례의 글자가 나른다</b> — V1·재고 불일치가 바로
 * 옆에 적혀 있으므로 색은 순서만 나르면 된다. 그래서 진한 쪽부터 연한 쪽으로 세운다.
 *
 * <p>순번으로 계산하지 않고 손으로 박는다. 인덱스로 만들면 유형이 늘거나 순서가 바뀌는
 * 날 색이 통째로 밀리는데, 색은 자리가 아니라 <b>규칙 그 자체</b>를 가리켜야 어제 화면과
 * 오늘 화면을 겹쳐 볼 수 있다. 바탕색과 섞으므로 패널 배경이 바뀌어도 같이 따라간다.
 */
export const FINDING_TONE: Record<FindingType, string> = {
  STOCK_MISMATCH: "var(--viz-1)",
  DUP_PER_MEMBER: "color-mix(in oklab, var(--viz-1) 82%, var(--hig-surface))",
  REPLAY_MISMATCH: "color-mix(in oklab, var(--viz-1) 66%, var(--hig-surface))",
  ILLEGAL_TRANSITION: "color-mix(in oklab, var(--viz-1) 50%, var(--hig-surface))",
  USAGE_MISMATCH: "color-mix(in oklab, var(--viz-1) 36%, var(--hig-surface))",
  GRADE_VIOLATION: "color-mix(in oklab, var(--viz-1) 24%, var(--hig-surface))",
};

export const FINDING_RULE: Record<FindingType, string> = {
  STOCK_MISMATCH: "V1",
  DUP_PER_MEMBER: "V2",
  REPLAY_MISMATCH: "V3",
  ILLEGAL_TRANSITION: "V4",
  USAGE_MISMATCH: "V5",
  GRADE_VIOLATION: "V6",
};

export type VerifyRun = {
  id: number;
  asOf: string;
  fromTs: string | null;
  scope: Scope;
  dataset: Dataset;
  attempt: number;
  verdict: Verdict | null;
  statsStatus: string | null;
  findingCount: number | null;
  findingsChecksum: string | null;
  datasetFingerprint: string | null;
  startedAt: string;
  finishedAt: string | null;
  seedRunId: number | null;
};

/**
 * 오염셋 정답 대조. `missingCount`(놓친 것)와 `unexpectedCount`(없는 걸 만든 것)가
 * **둘 다 0** 이어야 통과다 — 검출 수만 같고 서로 다른 것을 잡았을 수 있어서,
 * 개수 비교로는 게이트가 안 선다.
 */
export type Manifest = {
  present: boolean;
  seedRunId: number;
  expectedCount: number | null;
  expectedDigest: string | null;
  missingCount: number | null;
  unexpectedCount: number | null;
  matches: boolean;
};

export type VerifyReport = {
  run: VerifyRun;
  byType: Partial<Record<FindingType, number>>;
  manifest: Manifest;
};

export type BatchRun = {
  executionId: number;
  jobName: string;
  status: string;
  failure: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  stepReadTotal: number | null;
  stepWriteTotal: number | null;
};

type Envelope<T> = { success: boolean; data: T | null; error: ErrorBody | null };

/** 서버 오류 봉투. 문구는 서버 카탈로그 것이라 화면이 다시 쓰지 않는다. */
type ErrorBody = { status: number; code: string; message: string };

/**
 * 배치 API 오류. <b>서버가 준 문구를 그대로 들고 다닌다.</b>
 *
 * <p>이 API 의 거절은 대부분 "왜 안 되는지" 가 본문에 있다 — 만료가 도는 중이라거나,
 * 같은 파라미터가 이미 돌았다거나. 화면이 "실패했습니다" 로 뭉개면 그 이유가 사라지고,
 * 시연 중에는 그게 곧 원인 불명이 된다.
 */
export class BatchApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BatchApiError";
    this.status = status;
    this.code = code;
  }
}
type Page<T> = {
  items: T[];
  /** 필터에 걸린 전체 개수. `limit` 로 자르기 전 값이라 "몇 번 돌았나" 는 여기서 읽는다. */
  total: number;
  anchor?: number | null;
  nextAnchor?: number | null;
};

async function request<T>(
  root: string,
  path: string,
  method: "GET" | "POST",
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${root}${API_PATH}${path}`, {
    method,
    // signal 을 undefined 로 넘기면 오버로드가 안 맞는다 — 있을 때만 싣는다.
    ...(signal ? { signal } : {}),
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  let envelope: Envelope<T> | undefined;
  try {
    envelope = text ? (JSON.parse(text) as Envelope<T>) : undefined;
  } catch {
    // 이 컨트롤러가 못 잡는 4xx 는 스프링 기본 형식으로 나간다 — 봉투가 아닐 수 있다.
  }
  if (!res.ok) {
    // 401 은 토큰이 안 붙은 것이다 — 개발 서버를 껐거나 `.env.local` 이 없다.
    const body = envelope?.error;
    throw new BatchApiError(body?.message ?? `배치 API ${res.status}`, res.status, body?.code);
  }
  if (!envelope?.success || envelope.data === null) {
    throw new BatchApiError("배치 API 응답이 비었습니다.", res.status);
  }
  return envelope.data;
}

function get<T>(root: string, path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(root, path, "GET", signal);
}

/** 최신 확정 판정 하나. 아직 한 번도 안 돌았으면 404 라 호출부가 빈 화면을 그린다. */
export function getVerifyReport(
  root: string,
  dataset: Dataset,
  scope: Scope,
  signal?: AbortSignal,
) {
  return get<VerifyReport>(
    root,
    `/verify/reports/latest?dataset=${dataset}&scope=${scope}`,
    signal,
  );
}

/**
 * 이력 행. 리포트의 {@link VerifyRun} 과 **식별자 이름이 다르다** — 이력은 `runId`,
 * 리포트는 `id` 다. 서버 계약이 그러하므로 화면에서 맞추지 않는다.
 */
export type VerifyRunRow = Omit<VerifyRun, "id" | "seedRunId"> & { runId: number };

/** 검증 실행 이력. 같은 `asOf` 가 여러 줄이면 체크섬이 같아야 한다. */
export function getVerifyRuns(root: string, limit: number, signal?: AbortSignal) {
  return get<Page<VerifyRunRow>>(root, `/verify/runs?limit=${limit}`, signal);
}

/**
 * 배치가 가진 잡 전부. <b>화면에 고정으로 박는다.</b>
 *
 * <p>순서는 하루가 도는 순서다 — 만료(04:10 UTC) · 정리(04:30) · 검증. 그 순서로 두면
 * 표가 "무엇이 먼저 돌아야 하나" 를 같이 말한다.
 */
export const BATCH_JOBS = ["expireJob", "cleanupJob", "verifyJob"] as const;
export type BatchJobName = (typeof BATCH_JOBS)[number];

export const BATCH_JOB_LABEL: Record<BatchJobName, string> = {
  expireJob: "만료",
  cleanupJob: "정리",
  verifyJob: "검증",
};

/** 잡 하나의 현재 처지 — 마지막 실행과 지금까지 몇 번 돌았나. */
export type JobStanding = {
  jobName: BatchJobName;
  runCount: number;
  latest: BatchRun | null;
};

/**
 * 잡별 마지막 실행을 <b>잡 수만큼 따로</b> 묻는다.
 *
 * <p>최근 N건을 한 번에 받아서 화면에서 가르면 안 된다 — 검증을 여러 번 돌린 날에는
 * 만료·정리가 그 N건 밖으로 밀려나고, 그러면 <b>돈 잡이 안 돈 것처럼 보인다.</b>
 * 표가 답해야 하는 질문이 "돌기는 돌았나" 라서, 그 착시는 오답이다.
 * 잡별로 물으면 실행 횟수와 무관하게 세 줄이 항상 제 값으로 선다.
 */
export function getJobStandings(root: string, signal?: AbortSignal): Promise<JobStanding[]> {
  return Promise.all(
    BATCH_JOBS.map(async (jobName) => {
      const page = await get<Page<BatchRun>>(
        root,
        `/batch/runs?jobName=${jobName}&limit=1`,
        signal,
      );
      return { jobName, runCount: page.total ?? page.items.length, latest: page.items[0] ?? null };
    }),
  );
}

/**
 * 화면이 무엇을 보여 줄지 <b>서버가 가진 것으로 정한다.</b>
 *
 * <p>데이터셋을 화면에서 고르게 두면 안 된다 — 배치 컨테이너는 {@code DB_NAME} 으로
 * <b>DB 하나</b>만 보고, 오염셋과 정상셋은 서로 다른 DB 에 있다. 고르게 두면 그 배치가
 * 안 가진 쪽을 골랐을 때 빈 화면이 나오고, 시연 중이면 "고장" 으로 보인다.
 * 그래서 최신 실행이 무엇이었는지를 먼저 묻고 그 조합으로 리포트를 받는다.
 */
export async function getLatestReport(
  root: string,
  signal?: AbortSignal,
): Promise<VerifyReport | null> {
  const page = await getVerifyRuns(root, 1, signal);
  const latest = page.items[0];
  if (!latest) return null;
  return getVerifyReport(root, latest.dataset, latest.scope, signal);
}

/** 화면이 고를 수 있는 셋 하나. 이름표는 <b>서버가 말한 dataset</b> 에서 온다. */
export type BatchSource = { root: BatchRoot; report: VerifyReport };

/**
 * 어떤 엔드포인트가 살아 있고 각각 무슨 셋인지 <b>물어서</b> 정한다.
 *
 * <p>어느 포트가 오염셋이라고 화면이 미리 정해 두면 안 된다 — 배치를 어느 DB 로 세울지는
 * 띄우는 사람이 정하고, 화면은 그것을 모른다. 최신 실행을 물어 서버가 말한 {@code dataset}
 * 을 그대로 이름표로 쓴다. 안 뜬 엔드포인트는 조용히 빠진다.
 */
export async function discoverSources(signal?: AbortSignal): Promise<BatchSource[]> {
  const settled = await Promise.allSettled(
    BATCH_ROOTS.map(async (root) => ({ root, report: await getLatestReport(root, signal) })),
  );
  const found: BatchSource[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled" || !r.value.report) continue;
    // 두 배치가 같은 DB 를 보고 있으면 같은 셋이 두 번 뜬다. 먼저 온 쪽만 남긴다.
    if (found.some((f) => f.report.run.dataset === r.value.report!.run.dataset)) continue;
    found.push({ root: r.value.root, report: r.value.report });
  }
  return found;
}

/** 접수 응답. `runId` 가 아니라 `executionId` 다 — 실행 행은 가드를 다 통과한 뒤에 생긴다. */
export type TriggerAccepted = {
  executionId: number;
  asOf: string;
  dataset: Dataset;
  scope: Scope;
  attempt: number;
};

/**
 * 같은 {@code asOf} 로 검증을 다시 돌린다. <b>재현성을 눈앞에서 만드는 버튼이다.</b>
 *
 * <p><b>{@code attempt} 를 안 보낸다.</b> 선택 파라미터이고, 생략하면 서버가
 * {@code nextAttempt(asOf, dataset, scope)} 로 정한다(컨트롤러 실측). 화면이 계산하면
 * 손에 든 목록이 최근 몇 줄뿐이라 최대 attempt 를 놓칠 수 있고, 두 사람이 동시에 누르면
 * 같은 번호를 만든다 — 그 판단은 전부를 보는 쪽이 해야 한다.
 *
 * <p><b>{@code asOf} 는 서버가 준 문자열을 그대로 돌려보낸다.</b> JS 에서 만들면 안 된다 —
 * {@code toISOString()} 은 항상 {@code Z} 를 붙이는데 스키마 시각은 지역시각이라 아홉 시간이
 * 밀리고, 조용한 시각이면 가드를 다 통과해 <b>틀린 시점으로 PASS 가 남는다.</b>
 * 서버 포맷은 {@code yyyy-MM-dd'T'HH:mm[:ss]} 이고 오프셋을 아예 안 받는다.
 */
export function rerunVerify(
  root: string,
  run: VerifyRun,
  signal?: AbortSignal,
): Promise<TriggerAccepted> {
  const query = new URLSearchParams({
    asOf: run.asOf,
    dataset: run.dataset,
    scope: run.scope,
  });
  // CORRUPT 는 정답 묶음을 명시해야 한다. 안 주면 서버가 접수 단계에서 거절한다 —
  // 묶음이 둘 이상인 DB 에서 기본값을 두면 낡은 묶음과 조용히 대조하기 때문이다.
  if (run.dataset === "CORRUPT" && run.seedRunId !== null) {
    query.set("seedRunId", String(run.seedRunId));
  }
  return request<TriggerAccepted>(root, `/verify?${query.toString()}`, "POST", signal);
}
