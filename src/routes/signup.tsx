import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { GradeChip } from "@/components/coupon/grade-chip";
import { useAuth } from "@/hooks/use-auth";
import { memberIdFor } from "@/lib/auth-storage";
import { GRADES, type MembershipGrade } from "@/lib/coupon";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "회원가입 — 쿠폰 야~호" }] }),
  component: SignupPage,
});

/** 등급별로 열리는 회차가 다르다는 것만 정확히 알려 주면 됩니다. */
const GRADE_NOTE: Record<MembershipGrade, string> = {
  WELCOME: "전체 공개 회차",
  SILVER: "마트 · 뷰티 회차 추가",
  GOLD: "영화 · 여행 회차 추가",
  VIP: "12개 브랜드 전 회차",
};

function SignupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState<MembershipGrade>("WELCOME");

  const trimmed = nickname.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    login({ nickname: trimmed, grade, role: "USER" });
    toast.success(`${trimmed}님, 환영합니다`);
    navigate({ to: "/events" });
  };

  return (
    <div className="mx-auto w-full max-w-lg px-5 py-16">
      <h1 className="t-section">회원가입</h1>
      <p className="t-body mt-3 text-hig-secondary">
        닉네임과 시작 등급만 정하면 끝입니다. 등급은 나중에 바꿀 수 있습니다.
      </p>

      <form onSubmit={submit} className="surface-card mt-10 p-8">
        <label className="block">
          <span className="eyebrow">닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 야호"
            autoFocus
            className="t-body mt-2 w-full rounded-xl border border-input bg-hig-surface px-3.5 py-3 focus:border-hig-primary focus:outline-none"
          />
        </label>

        <fieldset className="mt-8">
          <legend className="eyebrow">시작 등급</legend>
          <div className="mt-3 space-y-2">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(g)}
                aria-pressed={grade === g}
                className={`flex w-full items-center gap-3 rounded-xl bg-hig-canvas px-4 py-3.5 text-left transition-colors ${
                  grade === g
                    ? "outline-2 -outline-offset-2 outline-hig-primary"
                    : "hover:bg-secondary"
                }`}
              >
                <GradeChip grade={g} size="sm" />
                <span className="t-caption ml-auto text-hig-muted">{GRADE_NOTE[g]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {trimmed && (
          <p className="t-caption mt-7 border-t border-hairline pt-5 text-hig-muted">
            회원 번호{" "}
            <span className="num font-semibold text-hig-secondary">{memberIdFor(trimmed)}</span>
          </p>
        )}

        <button type="submit" disabled={!trimmed} className="btn-primary mt-7 w-full">
          시작하기
        </button>

        <p className="t-body-sm mt-5 text-center text-hig-muted">
          이미 계정이 있으신가요?{" "}
          <Link to="/login" className="text-hig-link hover:underline">
            로그인
          </Link>
        </p>
      </form>
    </div>
  );
}
