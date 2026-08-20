import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Point } from "@/lib/admin";

/**
 * 관제 차트.
 *
 * 규칙 (dataviz):
 *   · 축은 하나. 단위가 다른 계열을 한 축에 겹치지 않습니다 — 나눠 그립니다.
 *   · 선은 2px, 점은 기본으로 찍지 않고 호버에서만 나타납니다.
 *   · 격자는 가로선만. 축과 격자는 후퇴색입니다.
 *   · 계열이 둘 이상이면 범례를 항상 두고, 현재 값을 함께 적습니다 —
 *     색만으로 정체를 전달하지 않습니다(라이트 모드 대비 완화 규칙).
 */

export interface SeriesSpec {
  key: string;
  label: string;
  /** var(--viz-N) 중 하나 */
  color: string;
  note?: string;
}

const AXIS = "var(--viz-axis)";
const GRID = "var(--viz-grid)";

function clock(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const AXIS_TICK = { fill: AXIS, fontSize: 11, letterSpacing: -0.12 } as const;

function ChartTooltip({
  active,
  payload,
  label,
  series,
  format,
  unit,
  labelFormat,
}: {
  active: boolean;
  payload: { dataKey?: string | number; value?: number | string }[];
  label: number | string;
  series: SeriesSpec[];
  format: (v: number) => string;
  unit: string;
  labelFormat: (v: number | string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="surface-card border border-hairline px-3 py-2 shadow-none">
      <p className="num t-caption text-hig-muted">{labelFormat(label)}</p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((p) => {
          const spec = series.find((s) => s.key === p.dataKey);
          if (!spec) return null;
          return (
            <li key={spec.key} className="t-caption flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: spec.color }}
                aria-hidden
              />
              <span className="text-hig-secondary">{spec.label}</span>
              <span className="num ml-auto font-semibold">
                {format(Number(p.value ?? 0))}
                {unit}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 범례 겸 현재값 읽기 줄. 계열 정체를 색 + 이름 + 숫자로 세 번 말합니다. */
export function SeriesLegend({
  series,
  values,
  format = (v) => v.toLocaleString("ko-KR"),
  unit,
}: {
  series: SeriesSpec[];
  values?: Record<string, number | null> | undefined;
  format?: ((v: number) => string) | undefined;
  unit?: string | undefined;
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
      {series.map((s) => {
        const v = values?.[s.key];
        return (
          <li key={s.key} className="t-caption inline-flex items-baseline gap-1.5">
            <span
              className="inline-block size-2 shrink-0 translate-y-px rounded-full"
              style={{ background: s.color }}
              aria-hidden
            />
            <span className="text-hig-secondary">{s.label}</span>
            {v !== undefined && (
              <span className="num font-semibold">
                {v === null ? "—" : format(v)}
                {v !== null && unit}
              </span>
            )}
            {s.note && <span className="text-hig-muted">{s.note}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function SeriesChart({
  data,
  series,
  height = 168,
  unit,
  format = (v) => v.toLocaleString("ko-KR"),
  yDomain,
  reference,
  markers,
  area = false,
  xKey = "t",
  xFormat = clock,
  xLabel,
  logY = false,
  logX = false,
  xDomain,
}: {
  data: Point[];
  series: SeriesSpec[];
  height?: number;
  unit?: string;
  format?: (v: number) => string;
  yDomain?: [number | "auto", number | "auto"];
  reference?: { y: number; label: string };
  markers?: { t: number; label: string }[];
  area?: boolean;
  xKey?: string;
  xFormat?: (v: number) => string;
  xLabel?: string;
  logY?: boolean;
  logX?: boolean;
  xDomain?: [number, number];
}) {
  const gradientId = useId();
  const Chart = area ? AreaChart : LineChart;

  // 관제 지표는 음수가 없습니다. recharts 의 자동 도메인은 0 아래로 여백을 만들어
  // 그래프가 위쪽 절반에만 그려지므로, 위 끝만 데이터에서 뽑아 직접 고정합니다.
  // 눈금 간격은 1·2·2.5·5·10 배수 중에서 고릅니다. 0/8/16/30 처럼 들쭉날쭉한 눈금이
  // 나오지 않게 위 끝을 간격의 배수로 맞춥니다.
  const yScale: { domain: [number, number]; ticks: number[] } | undefined = (() => {
    if (yDomain || logY) return undefined;
    let max = 0;
    for (const row of data) {
      for (const s of series) {
        const v = Number(row[s.key] ?? 0);
        if (Number.isFinite(v) && v > max) max = v;
      }
    }
    if (reference) max = Math.max(max, reference.y);
    if (max <= 0) return { domain: [0, 1] as [number, number], ticks: [0, 1] };
    const raw = max * 1.08;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step =
      [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => raw / s <= 4) ?? 10 * magnitude;
    const top = Math.ceil(raw / step) * step;
    const ticks: number[] = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
    return { domain: [0, top] as [number, number], ticks };
  })();

  return (
    <div className="w-full min-w-0">
      <div className="w-full min-w-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            <defs>
              {area &&
                series.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`${gradientId}-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="0" />
            <XAxis
              dataKey={xKey}
              type="number"
              domain={xDomain ?? ["dataMin", "dataMax"]}
              scale={logX ? "log" : "auto"}
              allowDataOverflow={logX}
              tickFormatter={(v: number) => xFormat(v)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={44}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={54}
              domain={yDomain ?? yScale?.domain ?? ["auto", "auto"]}
              {...(yScale ? { ticks: yScale.ticks } : {})}
              scale={logY ? "log" : "auto"}
              allowDataOverflow={logY || !!yScale || !!yDomain}
              tickFormatter={(v: number) => format(v)}
            />
            <Tooltip
              cursor={{ stroke: AXIS, strokeWidth: 1, strokeDasharray: "3 3" }}
              content={(props) => {
                const p = props as {
                  active?: boolean;
                  payload?: { dataKey?: string | number; value?: number | string }[];
                  label?: number | string;
                };
                return (
                  <ChartTooltip
                    active={p.active ?? false}
                    payload={p.payload ?? []}
                    label={p.label ?? 0}
                    series={series}
                    format={format}
                    unit={unit ?? ""}
                    labelFormat={(v) => xFormat(Number(v))}
                  />
                );
              }}
            />
            {reference && (
              <ReferenceLine
                y={reference.y}
                stroke={AXIS}
                strokeDasharray="4 4"
                label={{
                  value: reference.label,
                  position: "insideTopRight",
                  fill: AXIS,
                  fontSize: 11,
                }}
              />
            )}
            {markers?.map((m) => (
              <ReferenceLine
                key={m.label}
                x={m.t}
                stroke={AXIS}
                strokeDasharray="3 3"
                label={{ value: m.label, position: "insideTopLeft", fill: AXIS, fontSize: 11 }}
              />
            ))}
            {series.map((s) =>
              area ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#${gradientId}-${s.key})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  isAnimationActive={false}
                />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      {xLabel && <p className="t-caption mt-1 text-right text-hig-muted">{xLabel}</p>}
    </div>
  );
}

/** 표 안에 넣는 미니 시계열 — 축도 격자도 없이 모양만 봅니다. */
export function MiniSeries({
  data,
  color,
  height = 28,
  seriesKey = "v",
}: {
  data: Point[];
  color: string;
  height?: number;
  seriesKey?: string;
}) {
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey={seriesKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 사용률 막대 — 임계는 자원마다 다릅니다. 공통 임계는 폐기됐습니다. */
export function UtilBar({
  value,
  warnAt,
  thresholds,
}: {
  value: number | null;
  warnAt: number;
  thresholds: { warn: number; high: number; critical: number };
}) {
  if (value === null) {
    return <div className="h-1.5 w-full rounded-full bg-fill" aria-hidden />;
  }
  const tone =
    value >= thresholds.critical
      ? "var(--viz-critical)"
      : value >= Math.max(warnAt, thresholds.high)
        ? "var(--viz-serious)"
        : value >= thresholds.warn
          ? "var(--viz-warning)"
          : "var(--hig-foreground)";

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-fill">
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(100, value)}%`, background: tone }}
      />
      <span
        className="absolute inset-y-0 w-px bg-hig-muted/60"
        style={{ left: `${Math.min(100, warnAt)}%` }}
        aria-hidden
        title={`경고 임계 ${warnAt}%`}
      />
    </div>
  );
}
