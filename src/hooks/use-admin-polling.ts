import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * 관제 폴링 훅 (A-01 · S-3).
 *
 * 규약:
 *   · pollKey 는 화면 고유 키. 화면을 벗어나면 그 폴링만 멈춥니다.
 *   · 탭이 숨으면 중단하고, 다시 보이면 즉시 한 번 당겨 옵니다.
 *   · 이전 요청은 react-query 가 취소합니다.
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

export function useAdminPolling<T>({
  pollKey,
  queryFn,
  intervalMs,
  enabled = true,
}: {
  pollKey: QueryKey;
  queryFn: () => Promise<T>;
  intervalMs: PollInterval;
  enabled?: boolean;
}) {
  const visible = useTabVisible();
  const active = enabled && visible && intervalMs > 0;

  return useQuery({
    queryKey: pollKey,
    queryFn,
    enabled,
    refetchInterval: active ? intervalMs : false,
    // 백그라운드에서까지 1초로 때리지 않습니다.
    refetchIntervalInBackground: false,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
}
