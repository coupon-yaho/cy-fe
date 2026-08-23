/**
 * 수량 게이지.
 *
 * 채워진 쪽이 남은 수량입니다. 나간 양이 아니라 남은 양이 고객의 관심사입니다.
 * 국소 구성마다 컬러 액센트는 하나. 평상시에는 잉크로 두고, 소진 임박일 때만
 * 빨강이 들어옵니다 — 빨강은 이 화면에서 "지금 없어지고 있다"는 뜻입니다.
 *
 * 막대는 알약이 아니라 각진 선입니다. 인쇄된 지면의 괘선에 가깝게 두면
 * 옆의 수치가 장식이 아니라 데이터로 읽힙니다.
 */
export function StockGauge({
  remaining,
  total,
  label = true,
  onDark = false,
}: {
  remaining: number;
  total: number;
  label?: boolean;
  onDark?: boolean;
}) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const critical = ratio > 0 && ratio <= 0.1;
  const empty = remaining <= 0;

  const bar = empty
    ? onDark
      ? "bg-white/25"
      : "bg-yh-ink-3"
    : critical
      ? onDark
        ? "bg-yh-warn-on-navy"
        : "bg-yh-warn"
      : onDark
        ? "bg-white"
        : "bg-yh-navy";

  return (
    <div>
      <div
        className={`h-2 w-full overflow-hidden rounded-full ${onDark ? "bg-white/15" : "bg-yh-rule"}`}
        role="meter"
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="남은 수량"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-700 ease-out ${bar}`}
          style={{ width: `${Math.max(empty ? 0 : 1.5, ratio * 100)}%` }}
        />
      </div>

      {label && (
        <p
          className={`yh-small mt-2.5 flex items-baseline justify-between ${
            onDark ? "text-white/55" : "text-yh-ink-3"
          }`}
        >
          <span
            className={
              critical && !empty
                ? `font-bold ${onDark ? "text-yh-warn-on-navy" : "text-yh-warn"}`
                : undefined
            }
          >
            {empty ? "품절" : critical ? "품절 임박" : "남은 수량"}
          </span>
          <span className={`yh-num font-bold ${onDark ? "text-white" : "text-yh-navy"}`}>
            {remaining.toLocaleString("ko-KR")}
            <span className={`font-normal ${onDark ? "text-white/50" : "text-yh-ink-3"}`}>
              {" / "}
              {total.toLocaleString("ko-KR")}
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
