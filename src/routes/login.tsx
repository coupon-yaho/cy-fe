import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { GradeChip } from "@/components/coupon/grade-chip";
import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@/lib/auth-storage";
import { GRADES, type MembershipGrade } from "@/lib/coupon";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "로그인 — 쿠폰 야~호" }] }),
  component: LoginPage,
});

const DESTINATIONS: { key: Role; label: string; desc: string }[] = [
  { key: "USER", label: "고객", desc: "브랜드 데이 · 발급 · 쿠폰함" },
  { key: "ADMIN", label: "관리자", desc: "운영 현황 · 시스템" },
];

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState<MembershipGrade>("GOLD");
  const [role, setRole] = useState<Role>("USER");

  const trimmed = nickname.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    login({ nickname: trimmed, grade, role });
    toast.success(`${trimmed}님, 환영합니다`);
    navigate({ to: role === "ADMIN" ? "/admin" : "/events" });
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 py-20">
      <p className="yh-label">시작하기</p>
      <h1 className="yh-hero mt-3">로그인</h1>
      <p className="yh-lede mt-4 text-yh-ink-2">
        닉네임과 등급만 고르면 바로 시작합니다. 비밀번호는 받지 않습니다.
      </p>

      <form onSubmit={submit} className="mt-10 border-t border-yh-rule pt-9">
        <label className="block">
          <span className="yh-label">닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 야호"
            autoFocus
            className="yh-input mt-2.5"
          />
          <span className="yh-small mt-2.5 block text-yh-ink-3">
            같은 닉네임으로 다시 들어오면 쿠폰함이 그대로 있습니다.
          </span>
        </label>

        <fieldset className="mt-8">
          <legend className="yh-label">멤버십 등급</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(g)}
                aria-pressed={grade === g}
                className="yh-choice px-2 py-4 text-center"
              >
                <GradeChip grade={g} size="sm" />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-8">
          <legend className="yh-label">들어갈 화면</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DESTINATIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                aria-pressed={role === r.key}
                className="yh-choice px-4 py-3.5 text-left"
              >
                <span className="yh-body block font-bold">{r.label}</span>
                <span className="yh-small block text-yh-ink-3">{r.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={!trimmed} className="yh-btn mt-9 w-full">
          로그인
        </button>

        <p className="yh-body mt-6 text-center text-yh-ink-3">
          처음이신가요?{" "}
          <Link to="/signup" className="font-bold text-yh-navy underline underline-offset-4">
            회원가입
          </Link>
        </p>
      </form>
    </div>
  );
}
