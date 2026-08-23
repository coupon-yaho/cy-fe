import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BrandPlate } from "@/components/coupon/brand-plate";
import { StockGauge } from "@/components/coupon/stock-gauge";
import { Countdown, formatClock } from "@/components/coupon/timer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BRANDS,
  GRADE_LABEL,
  brandOf,
  couponApi,
  discountDetail,
  discountHeadline,
  gradesLabel,
  isGradeEligible,
  type CalendarEntry,
  type MembershipGrade,
} from "@/lib/coupon";

/**
 * 브랜드 데이 캘린더.
 *
 * 사양서 U2 — "언제 무엇이 열리는가"를 달력으로 봅니다.
 *
 * ── 사양서와 다르게 만든 것, 그 이유 ──
 * 문서는 **월~금 5칸 · 수요일만 솟는** 2계층 구조를 그립니다. 그런데 실제 시드는
 * 주당 3개가 서로 다른 요일에 흩어져 있고(1주차 화·목·금 …) **토요일 회차가 2개**
 * 있습니다. 5칸 그리드로 만들면 브랜드 두 개가 달력에서 사라집니다.
 *
 * 그래서 7칸으로 두고, "솟는 칸"을 수요일이 아니라 **회차가 있는 날**로 바꿨습니다.
 * 문서가 노린 것(한 주가 한 행, 배경 위에 하이라이트가 뜬다)은 그대로입니다.
 * 시드를 문서에 맞춰 고치는 쪽은 택하지 않았습니다 — 화면을 위해 목 데이터를 바꾸는
 * 것이라 AGENTS.md §4 가 막는 일입니다.
 *
 * 주간 브랜드(표시 전용) 계층은 **데이터가 아직 어디에도 없습니다** —
 * 백엔드 스키마에 weekly_features 테이블이 없습니다. 그 자리는 비워 뒀습니다.
 */

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

/** 월요일 시작 인덱스 (일=0 인 getDay 를 월=0 으로) */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const sameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** 달력 격자 — 그 달을 덮는 주 단위 배열 */
function buildWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - mondayIndex(first));
  const weeks: Date[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w += 1) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      row.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
    // 다음 주 첫날이 다음 달로 넘어갔으면 더 그리지 않습니다
    if (cursor.getMonth() !== month && cursor.getDate() > 7) break;
  }
  return weeks;
}

export function BrandCalendar({ grade }: { grade: MembershipGrade | null }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [picked, setPicked] = useState<string | null>(null);
  // 사양서 U2 — 달력에도 같은 필터가 있어야 합니다. 목록에만 두면 달력을 쓰는 사람은
  // 자기가 못 받는 회차까지 계속 보게 됩니다.
  const [mineOnly, setMineOnly] = useState(false);
  const [category, setCategory] = useState<string>("ALL");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

  const from = ymd(weeks[0]![0]!);
  const to = ymd(weeks[weeks.length - 1]![6]!);

  const { data, isLoading } = useQuery({
    queryKey: ["calendar", from, to],
    queryFn: () => couponApi.listCalendar(from, to),
    refetchInterval: 30_000,
  });

  const categories = useMemo(() => [...new Set(BRANDS.map((b) => b.category))].sort(), []);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    const rows = (data ?? [])
      .filter((e) => !mineOnly || !grade || isGradeEligible(e.eligibleGradesMask, grade))
      .filter((e) => category === "ALL" || brandOf(e.brandId).category === category);
    for (const e of rows) {
      const key = ymd(new Date(e.openAt));
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [data, mineOnly, grade, category]);

  // 처음 열면 오늘. 오늘 회차가 없으면 **앞으로 다가올** 가장 가까운 날을 잡습니다.
  // 그냥 첫 키를 쓰면 지난달 마지막 주가 걸려서 이미 끝난 회차가 기본으로 열립니다.
  const selected = useMemo(() => {
    if (picked) return picked;
    const keys = [...byDay.keys()].sort();
    if (keys.length === 0) return null;
    const t = ymd(today);
    return keys.find((k) => k >= t) ?? keys[keys.length - 1]!;
  }, [picked, byDay, today]);

  const move = (delta: number) => {
    setCursor(new Date(year, month + delta, 1));
    setPicked(null);
  };

  return (
    <div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="이전 달"
            className="grid size-9 place-items-center rounded-full text-yh-ink-2 transition-colors hover:bg-yh-paper-2 hover:text-yh-navy"
          >
            <ChevronLeft className="size-4" strokeWidth={2.2} />
          </button>
          <p className="yh-sub yh-num min-w-[8.5rem] text-center">
            {year}년 {month + 1}월
          </p>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="다음 달"
            className="grid size-9 place-items-center rounded-full text-yh-ink-2 transition-colors hover:bg-yh-paper-2 hover:text-yh-navy"
          >
            <ChevronRight className="size-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!(year === today.getFullYear() && month === today.getMonth()) && (
            <button
              type="button"
              onClick={() => {
                setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
                setPicked(null);
              }}
              className="yh-small mr-1 font-bold text-yh-navy underline underline-offset-4"
            >
              이번 달로
            </button>
          )}

          <label className="sr-only" htmlFor="cal-category">
            카테고리
          </label>
          <select
            id="cal-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPicked(null);
            }}
            className="yh-body rounded-full border border-yh-rule bg-yh-surface px-3.5 py-1.5 font-semibold text-yh-navy"
          >
            <option value="ALL">전체 카테고리</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {grade && (
            <button
              type="button"
              onClick={() => {
                setMineOnly((v) => !v);
                setPicked(null);
              }}
              aria-pressed={mineOnly}
              className={`yh-body rounded-full border px-3.5 py-1.5 font-bold transition-colors ${
                mineOnly
                  ? "border-yh-navy bg-yh-navy text-white"
                  : "border-yh-rule bg-yh-surface text-yh-ink-2 hover:text-yh-navy"
              }`}
            >
              {GRADE_LABEL[grade]} 참여 가능만
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="mt-6 h-[26rem] rounded-2xl" />
      ) : (
        <>
          {/* 데스크탑 — 달력 한 장. 주마다 색 띠를 깔던 앞선 시안은 회차가 하나뿐인
              주에도 한 줄 전체가 물들어 색이 무엇을 뜻하는지 알 수 없었고, 회차가 없는
              주는 빈 색 띠만 남았습니다. 색 대신 괘선으로 주를 나눕니다. */}
          <div className="yh-card mt-6 hidden overflow-hidden sm:block">
            <div className="grid grid-cols-7 border-b border-yh-rule bg-yh-paper">
              {WEEKDAYS.map((d, i) => (
                <p
                  key={d}
                  className={`yh-label py-2.5 text-center ${i >= 5 ? "text-yh-ink-3/70" : ""}`}
                >
                  {d}
                </p>
              ))}
            </div>

            <div>
              {weeks.map((row) => (
                <WeekRow
                  key={row[0]!.getTime()}
                  row={row}
                  month={month}
                  today={today}
                  byDay={byDay}
                  selected={selected}
                  onPick={setPicked}
                />
              ))}
            </div>
          </div>

          {/* 모바일 — 5칸이 안 들어가므로 회차 있는 날만 세로로 */}
          <ul className="mt-6 space-y-2 sm:hidden">
            {[...byDay.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, list]) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setPicked(key)}
                    aria-pressed={selected === key}
                    className={`yh-card flex w-full items-center gap-3 p-4 text-left ${
                      selected === key ? "ring-2 ring-yh-navy" : ""
                    }`}
                  >
                    <span className="yh-num yh-figure-sm w-12 shrink-0 text-center text-[1.375rem]">
                      {new Date(key).getDate()}
                    </span>
                    <span className="yh-small shrink-0 text-yh-ink-3">
                      {WEEKDAYS[mondayIndex(new Date(key))]}
                    </span>
                    {/* 좁은 행이라 4개까지만. 6개를 다 그리면 카드 밖으로 넘칩니다. */}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {list.slice(0, 4).map((e) => (
                        <BrandPlate key={e.templateId} brandId={e.brandId} size="sm" />
                      ))}
                      {list.length > 4 && (
                        <span className="yh-num yh-small font-extrabold text-yh-ink-3">
                          +{list.length - 4}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
          </ul>

          {byDay.size === 0 ? (
            <p className="yh-lede mt-10 text-center text-yh-ink-3">
              이 조건에 맞는 회차가 이 달에 없습니다.
            </p>
          ) : (
            selected && (
              <DayPanel date={selected} entries={byDay.get(selected) ?? []} grade={grade} />
            )
          )}
        </>
      )}
    </div>
  );
}

/* ── 한 주 ─────────────────────────────────────────
   회차가 있는 칸만 흰 면으로 솟습니다. 배경 띠가 있어야 솟은 것이 보입니다. */

function WeekRow({
  row,
  month,
  today,
  byDay,
  selected,
  onPick,
}: {
  row: Date[];
  month: number;
  today: Date;
  byDay: Map<string, CalendarEntry[]>;
  selected: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 border-b border-yh-rule last:border-b-0">
      {row.map((d) => {
        const key = ymd(d);
        const list = byDay.get(key) ?? [];
        const outside = d.getMonth() !== month;
        const past = d < today && !sameDate(d, today);
        const isToday = sameDate(d, today);
        const live = list.some((e) => e.status === "OPEN");
        const chosen = selected === key;

        if (list.length === 0) {
          return (
            <div
              key={key}
              className={`min-h-[5.25rem] border-r border-yh-rule px-2.5 py-2 last:border-r-0 ${
                outside ? "bg-yh-paper/60" : ""
              }`}
            >
              <span
                className={`yh-num yh-small ${
                  isToday
                    ? "font-extrabold text-yh-accent"
                    : outside || past
                      ? "text-yh-ink-3/60"
                      : "text-yh-ink-3"
                }`}
              >
                {d.getDate()}
              </span>
            </div>
          );
        }

        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            aria-pressed={chosen}
            aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 회차 ${list.length}개`}
            className={`relative min-h-[5.25rem] border-r border-yh-rule px-2.5 py-2 text-left transition-colors last:border-r-0 ${
              chosen ? "bg-yh-navy/[0.06] inset-ring-2 inset-ring-yh-navy" : "hover:bg-yh-paper-2"
            } ${outside || past ? "saturate-[0.35]" : ""}`}
          >
            <span className="flex items-center justify-between">
              <span
                className={`yh-num yh-small font-extrabold ${
                  isToday ? "text-yh-accent" : "text-yh-navy"
                }`}
              >
                {d.getDate()}
              </span>
              {live && <span className="live-dot text-yh-accent" aria-hidden />}
            </span>

            <span className="mt-1.5 flex flex-wrap items-center gap-1">
              {list.slice(0, 3).map((e) => (
                <BrandPlate key={e.templateId} brandId={e.brandId} size="sm" />
              ))}
              {/* 칸이 좁아 3개까지만 보입니다 — 나머지를 숨기면 그날 회차 수를 오해합니다 */}
              {list.length > 3 && (
                <span className="yh-num yh-small font-extrabold text-yh-ink-3">
                  +{list.length - 3}
                </span>
              )}
            </span>

            {!past && !live && (
              <span className="yh-num yh-small mt-1 block text-yh-ink-3">
                D-{Math.max(0, Math.ceil((d.getTime() - today.getTime()) / 86400000))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── 날짜 상세 ───────────────────────────────────── */

function DayPanel({
  date,
  entries,
  grade,
}: {
  date: string;
  entries: CalendarEntry[];
  grade: MembershipGrade | null;
}) {
  const d = new Date(date);
  return (
    <section className="mt-8">
      <h3 className="yh-sub">
        {d.getMonth() + 1}월 {d.getDate()}일 ({WEEKDAYS[mondayIndex(d)]})
        <span className="yh-small yh-num ml-2 font-medium text-yh-ink-3">
          {entries.length}개 회차
        </span>
      </h3>

      <ul className="mt-4 grid gap-4 lg:grid-cols-2">
        {entries.map((e) => (
          <li key={e.templateId}>
            <DayCard entry={e} grade={grade} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayCard({ entry, grade }: { entry: CalendarEntry; grade: MembershipGrade | null }) {
  const brand = brandOf(entry.brandId);
  const eligible = !grade || isGradeEligible(entry.eligibleGradesMask, grade);
  const openAt = Date.parse(entry.openAt);
  const hasStock = entry.totalQuantity !== null && entry.activeCount !== null;

  const body = (
    <>
      <div className="flex items-center gap-3">
        <BrandPlate brandId={entry.brandId} size="md" />
        <div className="min-w-0">
          <p className="yh-small text-yh-ink-3">
            {brand.name} · {brand.category}
          </p>
          <p className="yh-body truncate font-bold">{entry.name}</p>
        </div>
        <span className="yh-num yh-small ml-auto shrink-0 text-yh-ink-3">
          {formatClock(entry.openAt)}
        </span>
      </div>

      <p className="yh-figure-sm mt-5 text-[1.75rem] leading-none">
        {discountHeadline(entry)}
        <span className="yh-small ml-2.5 align-middle font-normal text-yh-ink-2">
          {discountDetail(entry)}
        </span>
      </p>

      <div className="mt-4">
        {hasStock ? (
          <StockGauge
            remaining={Math.max(0, entry.totalQuantity! - entry.activeCount!)}
            total={entry.totalQuantity!}
          />
        ) : entry.status === "SCHEDULED" ? (
          <p className="yh-small text-yh-ink-3">
            오픈까지 <Countdown target={openAt} className="yh-num font-bold text-yh-navy" />
          </p>
        ) : (
          // 지난 달 회차에는 재고 기록이 없습니다. 0 으로 그리면 "품절"이라 거짓말합니다.
          <p className="yh-small text-yh-ink-3">지난 회차 — 재고 기록 없음</p>
        )}
      </div>

      <p className="yh-small mt-4 flex items-center gap-1.5 text-yh-ink-3">
        {!eligible && <Lock className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />}
        {eligible ? gradesLabel(entry.eligibleGrades) : `${gradesLabel(entry.eligibleGrades)} 전용`}
      </p>
    </>
  );

  const cls = `yh-card relative block overflow-hidden p-5 ${
    entry.status === "CLOSED" ? "saturate-[0.25]" : ""
  }`;

  // 살아 있는 회차만 상세로 갈 수 있습니다 — 지난 달 발생에는 회차 id 가 없습니다.
  return entry.couponRoundId !== null ? (
    <Link
      to="/events/$couponRoundId"
      params={{ couponRoundId: String(entry.couponRoundId) }}
      className={`${cls} yh-card-hover`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
