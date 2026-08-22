import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 관제 폴링 훅 (A-01 · S-3).
 *
 * 규약:
 *   · pollKey 는 화면 고유 키. 화면을 벗어나면 그 폴링만 멈춥니다.
 *   · 탭이 숨으면 중단하고, 다시 보이면 즉시 한 번 당겨 옵니다.
 *   · 다음 요청은 이전 요청이 끝난 뒤에 예약합니다(setTimeout 체이닝).
 *     고정 간격(setInterval · refetchInterval)을 쓰면 응답이 주기보다 늦을 때
 *     요청이 겹칩니다 — 부하 시험 중에 관제 화면이 스스로 부하를 만듭니다.
 *   · unmount · 키 변경 · 탭 숨김 시 AbortController.abort() 를 부릅니다.
 *     타이머만 죽이면 이미 나간 요청의 응답이 늦게 도착해 죽은 화면의 state 를
 *     건드립니다. queryFn 은 signal 을 받아 어댑터까지 넘겨야 실제로 끊깁니다.
 *   · 마지막 성공값과 현재 오류를 분리해 들고 있습니다. 오류가 나도 화면을 비우지
 *     않고 마지막 값 + STALE 배지를 띄우기 위해서입니다(표시 규칙은 state.tsx).
 *
 * D1 과 D2 는 탭이 달라 동시에 뜨지 않습니다. 화면 단위로 폴링을 나눈 이유입니다.
 */

export type PollInterval = 1000 | 5000 | 0;

export const POLL_OPTIONS: { value: PollInterval; label: string }[] = [
  { value: 1000, label: "1초" },
  { value: 5000, label: "5초" },
  { value: 0, label: "중단" },
];

function useTabVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export interface AdminPollingResult<T> {
  /** 마지막 성공값. 오류가 나도 지우지 않습니다 */
  data: T | undefined;
  /** 현재 오류. 다음 성공에서 null 로 돌아갑니다 */
  error: unknown;
  /** 요청이 나가 있는 동안 true */
  isFetching: boolean;
  /** 값은 있는데 마지막 요청이 실패한 상태 — 화면은 STALE 로 표시합니다 */
  isStale: boolean;
  /** 마지막 성공 시각(ms). 아직 한 번도 못 받았으면 null */
  lastSuccessAt: number | null;
}

export function useAdminPolling<T>({
  pollKey,
  queryFn,
  intervalMs,
  enabled = true,
}: {
  pollKey: readonly unknown[];
  /**
   * signal 을 어댑터까지 넘기면 취소가 실제로 일어납니다.
   * 안 받아도 동작하지만, 그 경우 늦게 온 응답은 훅이 버리기만 합니다.
   */
  queryFn: (signal: AbortSignal) => Promise<T>;
  intervalMs: PollInterval;
  enabled?: boolean;
}): AdminPollingResult<T> {
  const visible = useTabVisible();
  const keyId = useMemo(() => JSON.stringify(pollKey), [pollKey]);

  // 최신 queryFn 을 참조로만 씁니다 — 매 렌더 새로 만들어지는 클로저가
  // 폴링 루프를 재시작시키면 주기가 렌더 수만큼 빨라집니다.
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);

  // 키가 바뀌었을 때만 즉시 1회를 강제하기 위한 기록.
  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !visible) return;

    // 주기만 0 으로 내린 경우(중단)에는 이미 받아 둔 값을 그대로 둡니다.
    const runNow = fetchedKeyRef.current !== keyId || intervalMs > 0;
    if (!runNow) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const run = async () => {
      fetchedKeyRef.current = keyId;
      setIsFetching(true);
      try {
        const next = await queryFnRef.current(controller.signal);
        if (disposed || controller.signal.aborted) return;
        setData(next);
        setError(null);
        setLastSuccessAt(Date.now());
      } catch (e) {
        if (disposed || controller.signal.aborted) return;
        // 값은 지우지 않습니다. 관제 화면이 깜빡이면 못 씁니다.
        setError(e);
      } finally {
        if (!disposed && !controller.signal.aborted) {
          setIsFetching(false);
          // 완료 뒤에 다음을 예약합니다 — 이래야 요청이 겹치지 않습니다.
          if (intervalMs > 0) timer = setTimeout(run, intervalMs);
        }
      }
    };

    void run();

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    };
  }, [keyId, intervalMs, enabled, visible]);

  return {
    data,
    error,
    isFetching,
    isStale: data !== undefined && error !== null,
    lastSuccessAt,
  };
}
