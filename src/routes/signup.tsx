import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/coupon/auth-layout";
import { GradeChip } from "@/components/coupon/grade-chip";
import { useAuth } from "@/hooks/use-auth";
import { memberIdFor } from "@/lib/auth-storage";
import { GRADES, type MembershipGrade } from "@/lib/coupon";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "회원가입 · 쿠폰 야~호" }] }),
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
    <AuthLayout
      eyebrow="처음 오셨나요"
      title="회원가입"
      lede="닉네임과 시작 등급만 정하면 끝입니다. 등급은 나중에 바꿀 수 있습니다."
    >
      <form onSubmit={submit} className="mt-5 border-t border-yh-rule pt-5">
        <label className="block">
          <span className="yh-label">닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 야호"
            autoFocus
            className="yh-input mt-2"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="yh-label">시작 등급</legend>
          <div className="mt-3 space-y-2">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(g)}
                aria-pressed={grade === g}
                className="yh-choice flex w-full items-center gap-3 px-4 py-2.5 text-left"
              >
                <GradeChip grade={g} size="sm" />
                <span className="yh-small ml-auto text-yh-ink-3">{GRADE_NOTE[g]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {trimmed && (
          <p className="yh-small mt-5 border-t border-yh-rule pt-4 text-yh-ink-3">
            회원 번호 <span className="yh-num font-bold text-yh-navy">{memberIdFor(trimmed)}</span>
          </p>
        )}

        <button type="submit" disabled={!trimmed} className="yh-btn mt-6 w-full">
          시작하기
        </button>

        <p className="yh-small mt-3.5 text-center text-yh-ink-3">
          이미 계정이 있으신가요?{" "}
          <Link to="/login" className="font-bold text-yh-navy underline underline-offset-4">
            로그인
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
