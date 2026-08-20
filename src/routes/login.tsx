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
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <h1 className="t-section">로그인</h1>
      <p className="t-body mt-3 text-hig-secondary">
        닉네임과 등급만 고르면 바로 시작합니다. 비밀번호는 받지 않습니다.
      </p>

      <form onSubmit={submit} className="surface-card mt-8 p-8">
        <label className="block">
          <span className="eyebrow">닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 야호"
            autoFocus
            className="t-body mt-2 w-full rounded-xl border border-input bg-hig-surface px-3.5 py-3 focus:border-hig-primary focus:outline-none"
          />
          <span className="t-caption mt-2 block text-hig-muted">
            같은 닉네임으로 다시 들어오면 쿠폰함이 그대로 있습니다.
          </span>
        </label>

        <fieldset className="mt-7">
          <legend className="eyebrow">멤버십 등급</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(g)}
                aria-pressed={grade === g}
                className={`rounded-xl bg-hig-canvas px-2 py-3.5 text-center transition-colors ${
                  grade === g
                    ? "outline-2 -outline-offset-2 outline-hig-primary"
                    : "hover:bg-secondary"
                }`}
              >
                <GradeChip grade={g} size="sm" />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-7">
          <legend className="eyebrow">들어갈 화면</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DESTINATIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                aria-pressed={role === r.key}
                className={`rounded-xl bg-hig-canvas px-4 py-3.5 text-left transition-colors ${
                  role === r.key
                    ? "outline-2 -outline-offset-2 outline-hig-primary"
                    : "hover:bg-secondary"
                }`}
              >
                <span className="t-body-sm block font-semibold">{r.label}</span>
                <span className="t-caption block text-hig-muted">{r.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={!trimmed} className="btn-primary mt-8 w-full">
          로그인
        </button>

        <p className="t-body-sm mt-5 text-center text-hig-muted">
          처음이신가요?{" "}
          <Link to="/signup" className="text-hig-link hover:underline">
            회원가입
          </Link>
        </p>
      </form>
    </div>
  );
}
