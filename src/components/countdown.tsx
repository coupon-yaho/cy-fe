import { useEffect, useState } from "react";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Countdown({
  target,
  className = "",
  compact = false,
}: {
  target: number;
  className?: string;
  compact?: boolean;
}) {
  const now = useNow();
  if (now === null) return <span className={`num ${className}`}>--:--:--</span>;
  const { d, h, m, s } = parts(target - now);
  if (target - now <= 0) return <span className={`num ${className}`}>00:00:00</span>;
  if (compact) {
    if (d > 0) return <span className={`num ${className}`}>{d}일 {h}시간</span>;
    return (
      <span className={`num ${className}`}>
        {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </span>
    );
  }
  return (
    <span className={`num ${className}`}>
      {d > 0 && `${d}일 `}
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

export function formatDateTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
