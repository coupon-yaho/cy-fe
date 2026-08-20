/**
 * 수량 게이지.
 *
 * 채워진 쪽이 남은 수량입니다. 나간 양이 아니라 남은 양이 고객의 관심사입니다.
 * DESIGN.md §12 — 국소 구성마다 컬러 액센트는 하나. 평상시에는 중립 회색으로 두고,
 * 소진 임박일 때만 색이 들어옵니다.
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
      ? "bg-white/30"
      : "bg-hig-muted"
    : critical
      ? onDark
        ? "bg-attention-on-dark"
        : "bg-attention"
      : onDark
        ? "bg-white"
        : "bg-hig-fg";

  return (
    <div>
      <div
        className={`h-1.5 w-full overflow-hidden rounded-full ${onDark ? "bg-white/20" : "bg-fill"}`}
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
          className={`t-body-sm mt-2 flex items-baseline justify-between ${
            onDark ? "text-white/60" : "text-hig-muted"
          }`}
        >
          <span
            className={
              critical && !empty
                ? `font-semibold ${onDark ? "text-attention-on-dark" : "text-attention"}`
                : undefined
            }
          >
            {empty ? "품절" : critical ? "품절 임박" : "남은 수량"}
          </span>
          <span className={`num ${onDark ? "text-white" : "text-hig-fg"}`}>
            {remaining.toLocaleString("ko-KR")}
            <span className={onDark ? "text-white/60" : "text-hig-muted"}>
              {" / "}
              {total.toLocaleString("ko-KR")}
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
