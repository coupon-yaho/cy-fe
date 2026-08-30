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

const BATCH_ROOT = "/batch-api/api/v1/admin";

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
 * 규칙별 색. <b>순번으로 계산하지 않고 손으로 박는다.</b>
 *
 * <p>인덱스로 `viz-(i+1)` 을 만들면 유형이 하나 늘거나 순서가 바뀌는 날 색이 통째로
 * 밀린다 — 색은 자리가 아니라 <b>규칙 그 자체</b>를 가리켜야 어제 화면과 오늘 화면을
 * 겹쳐 볼 수 있다. 팔레트는 저장소 시각화 램프(라이트·다크 양쪽 검증됨)를 그대로 쓴다.
 */
export const FINDING_TONE: Record<FindingType, string> = {
  STOCK_MISMATCH: "var(--viz-1)",
  DUP_PER_MEMBER: "var(--viz-2)",
  REPLAY_MISMATCH: "var(--viz-3)",
  ILLEGAL_TRANSITION: "var(--viz-4)",
  USAGE_MISMATCH: "var(--viz-5)",
  GRADE_VIOLATION: "var(--viz-6)",
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

type Envelope<T> = { success: boolean; data: T | null; error: unknown };
type Page<T> = {
  items: T[];
  /** 필터에 걸린 전체 개수. `limit` 로 자르기 전 값이라 "몇 번 돌았나" 는 여기서 읽는다. */
  total: number;
  anchor?: number | null;
  nextAnchor?: number | null;
};

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BATCH_ROOT}${path}`, {
    // signal 을 undefined 로 넘기면 오버로드가 안 맞는다 — 있을 때만 싣는다.
    ...(signal ? { signal } : {}),
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    // 401 은 토큰이 안 붙은 것이다 — 개발 서버를 껐거나 `.env.local` 이 없다.
    throw new Error(`배치 API ${res.status}`);
  }
  const envelope = JSON.parse(text) as Envelope<T>;
  if (!envelope.success || envelope.data === null) throw new Error("배치 API 응답이 비었습니다.");
  return envelope.data;
}

/** 최신 확정 판정 하나. 아직 한 번도 안 돌았으면 404 라 호출부가 빈 화면을 그린다. */
export function getVerifyReport(dataset: Dataset, scope: Scope, signal?: AbortSignal) {
  return get<VerifyReport>(`/verify/reports/latest?dataset=${dataset}&scope=${scope}`, signal);
}

/**
 * 이력 행. 리포트의 {@link VerifyRun} 과 **식별자 이름이 다르다** — 이력은 `runId`,
 * 리포트는 `id` 다. 서버 계약이 그러하므로 화면에서 맞추지 않는다.
 */
export type VerifyRunRow = Omit<VerifyRun, "id" | "seedRunId"> & { runId: number };

/** 검증 실행 이력. 같은 `asOf` 가 여러 줄이면 체크섬이 같아야 한다. */
export function getVerifyRuns(limit: number, signal?: AbortSignal) {
  return get<Page<VerifyRunRow>>(`/verify/runs?limit=${limit}`, signal);
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
export function getJobStandings(signal?: AbortSignal): Promise<JobStanding[]> {
  return Promise.all(
    BATCH_JOBS.map(async (jobName) => {
      const page = await get<Page<BatchRun>>(`/batch/runs?jobName=${jobName}&limit=1`, signal);
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
export async function getLatestReport(signal?: AbortSignal): Promise<VerifyReport | null> {
  const page = await getVerifyRuns(1, signal);
  const latest = page.items[0];
  if (!latest) return null;
  return getVerifyReport(latest.dataset, latest.scope, signal);
}
