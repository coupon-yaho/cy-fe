import { useEffect, useState } from "react";

/** 클라이언트에서만 흐르는 시계 — SSR 과 값이 갈라지지 않도록 null 로 시작합니다. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 카운트다운.
 *
 * 한 주 이상 남았으면 "22일", 하루 이상이면 "3일 04시간", 그 안쪽이면 시:분:초.
 * 방송 자막의 숫자는 자리가 흔들리지 않아야 해서 tabular-nums 로 고정합니다.
 */
export function Countdown({
  target,
  className = "",
  onZero,
}: {
  target: number;
  className?: string;
  onZero?: () => void;
}) {
  const now = useNow();
  const [fired, setFired] = useState(false);

  const remain = now === null ? null : target - now;

  useEffect(() => {
    if (remain !== null && remain <= 0 && !fired) {
      setFired(true);
      onZero?.();
    }
  }, [remain, fired, onZero]);

  if (remain === null) return <span className={`num ${className}`}>--:--:--</span>;
  if (remain <= 0) return <span className={`num ${className}`}>00:00:00</span>;

  const { d, h, m, s } = split(remain);
  // 한 주 넘게 남았으면 시간 단위는 읽는 데 도움이 되지 않습니다.
  if (d >= 7) return <span className={`num ${className}`}>{d}일</span>;
  if (d > 0) {
    return (
      <span className={`num ${className}`}>
        {d}일 {pad(h)}시간
      </span>
    );
  }
  return (
    <span className={`num ${className}`}>
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDateTime(iso: string | number) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso: string | number) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function formatClock(iso: string | number) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
