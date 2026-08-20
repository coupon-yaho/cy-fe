import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SectionHead } from "@/components/coupon/section-head";
import { RoundCard, RoundRow } from "@/components/coupon/round-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { GRADE_LABEL, couponApi, type CouponRoundStatus, type CouponRoundView } from "@/lib/coupon";

export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "브랜드 데이 일정 — 쿠폰 야~호" },
      {
        name: "description",
        content: "브랜드 데이 일정. 발급 중인 회차와 오픈 예정 회차를 한눈에 봅니다.",
      },
    ],
  }),
  component: Schedule,
});

type Filter = "ALL" | CouponRoundStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "OPEN", label: "발급 중" },
  { key: "SCHEDULED", label: "오픈 예정" },
  { key: "CLOSED", label: "마감" },
];

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000,
  );
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === 1) return `내일 · ${base}`;
  if (diff === -1) return `어제 · ${base}`;
  return base;
}

function Schedule() {
  const { session } = useAuth();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [mineOnly, setMineOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => couponApi.listRounds(),
    refetchInterval: 15_000,
  });

  const rounds = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    return rounds
      .filter((r) => filter === "ALL" || r.status === filter)
      .filter((r) => !mineOnly || !session || r.eligibleGrades.includes(session.grade));
  }, [rounds, filter, mineOnly, session]);

  const live = filtered.filter((r) => r.status === "OPEN");

  const groups = useMemo(() => {
    const byDay = new Map<string, { label: string; at: number; rows: CouponRoundView[] }>();
    for (const r of [...filtered].sort((a, b) => Date.parse(a.openAt) - Date.parse(b.openAt))) {
      const key = dayKey(r.openAt);
      if (!byDay.has(key)) {
        byDay.set(key, { label: dayLabel(r.openAt), at: Date.parse(r.openAt), rows: [] });
      }
      byDay.get(key)!.rows.push(r);
    }
    return [...byDay.values()].sort((a, b) => a.at - b.at);
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-16">
      <SectionHead
        eyebrow="전체 일정"
        title="브랜드 데이 일정"
        note="열리는 순서대로 모았습니다."
      />

      <div className="mt-10 flex flex-wrap items-center gap-2 border-y border-hairline py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`t-body-sm rounded-full px-3.5 py-1.5 transition-colors ${
              filter === f.key
                ? "bg-hig-fg font-semibold text-hig-surface"
                : "text-hig-secondary hover:bg-secondary"
            }`}
          >
            {f.label}
            <span className="num t-caption ml-1.5 opacity-60">
              {f.key === "ALL" ? rounds.length : rounds.filter((r) => r.status === f.key).length}
            </span>
          </button>
        ))}

        {session && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            aria-pressed={mineOnly}
            className={`t-body-sm ml-auto rounded-full px-3.5 py-1.5 transition-colors ${
              mineOnly
                ? "bg-accent font-semibold text-hig-link"
                : "text-hig-secondary hover:bg-secondary"
            }`}
          >
            {GRADE_LABEL[session.grade]} 참여 가능만
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          onReset={() => {
            setFilter("ALL");
            setMineOnly(false);
          }}
        />
      ) : (
        <>
          {live.length > 0 && filter === "ALL" && (
            <section className="mt-12">
              <h3 className="eyebrow">지금 발급 중</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {live.map((r) => (
                  <RoundCard key={r.id} round={r} grade={session?.grade ?? null} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-14">
            {groups.map((g) => (
              <div key={g.label} className="mb-10">
                <h3 className="t-body-sm border-b border-hig-fg pb-2 font-semibold">{g.label}</h3>
                <div className="mt-1">
                  {g.rows.map((r) => (
                    <RoundRow key={r.id} round={r} grade={session?.grade ?? null} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Empty({ onReset }: { onReset: () => void }) {
  return (
    <div className="surface-card mt-12 px-6 py-20 text-center">
      <p className="t-tile">조건에 맞는 회차가 없습니다</p>
      <p className="t-body mt-3 text-hig-secondary">필터를 지우면 전체 일정이 보입니다.</p>
      <button type="button" onClick={onReset} className="btn-primary mt-8">
        필터 지우기
      </button>
    </div>
  );
}
