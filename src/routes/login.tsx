import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/coupon/auth-layout";
import { GradeChip } from "@/components/coupon/grade-chip";
import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@/lib/auth-storage";
import { GRADES, type MembershipGrade } from "@/lib/coupon";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "로그인 · 쿠폰 야~호" }] }),
  /* 어디서 로그인하러 왔는지 받습니다.
     지금까지는 어디서 눌렀든 고정된 곳으로 떨어뜨렸습니다 — 회차 상세에서
     "로그인하고 발급받기" 를 눌러도 일정 목록으로 가서, 받으려던 쿠폰을 다시
     찾아가야 했습니다. */
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined,
  }),
  component: LoginPage,
});

/** 로그인 뒤 갈 곳. 돌아갈 자리가 없으면 홈입니다 — 일정 목록이 아니라 홈이
 *  "지금 뭘 받을 수 있나" 에 답하는 첫 화면입니다. */
function landing(role: Role, redirect: string | undefined): string {
  if (role === "ADMIN") return "/admin";
  // 외부 주소로 튕겨 보내지 않도록 우리 경로만 받습니다
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;
  return "/";
}

const DESTINATIONS: { key: Role; label: string; desc: string }[] = [
  { key: "USER", label: "고객", desc: "브랜드 데이를 보고 쿠폰을 받습니다" },
  { key: "ADMIN", label: "관리자", desc: "운영 현황과 시스템 상태" },
];

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState<MembershipGrade>("GOLD");
  const [role, setRole] = useState<Role>("USER");

  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = nickname.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    /* 버튼을 비활성으로 두면 회색 버튼만 남고 **무엇이 모자란지는 말하지 않습니다.**
       누를 수 있게 두고, 빈 채로 누르면 어디에 무엇을 적어야 하는지 답합니다. */
    if (!trimmed) {
      setError("닉네임을 적어 주세요.");
      inputRef.current?.focus();
      return;
    }
    login({ nickname: trimmed, grade, role });
    toast.success(`${trimmed}님, 환영합니다`);
    void navigate({ to: landing(role, redirect), replace: true });
  };

  return (
    <AuthLayout
      eyebrow="시작하기"
      title="로그인"
      lede={
        role === "ADMIN"
          ? "닉네임만 적으면 관제 화면으로 들어갑니다. 비밀번호는 받지 않습니다."
          : "닉네임과 등급만 고르면 바로 시작합니다. 비밀번호는 받지 않습니다."
      }
    >
      <form onSubmit={submit} className="mt-5 border-t border-yh-rule pt-5">
        <label className="block">
          <span className="yh-label">닉네임</span>
          <input
            ref={inputRef}
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              if (error) setError(null);
            }}
            placeholder="예: 야호"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "nickname-error" : undefined}
            className="yh-input mt-2"
          />
          {error && (
            <span
              id="nickname-error"
              role="alert"
              className="yh-small mt-2 block font-bold text-yh-accent-dark"
            >
              {error}
            </span>
          )}
          <span className="yh-small mt-2 block text-yh-ink-3">
            같은 닉네임으로 다시 들어오면 쿠폰함이 그대로 있습니다.
          </span>
        </label>

        {/* 관리자는 등급이 없습니다. 관제 화면은 등급으로 갈리는 게 하나도 없는데
            고르라고 물으면, 답한 값이 어딘가에서 쓰이는 줄 알게 됩니다.
            역할을 관리자로 바꾸면 이 칸을 접습니다. */}
        {role === "USER" && (
          <fieldset className="mt-5">
            <legend className="yh-label">멤버십 등급</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  aria-pressed={grade === g}
                  className="yh-choice px-2 py-2.5 text-center"
                >
                  <GradeChip grade={g} size="sm" />
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="mt-5">
          <legend className="yh-label">들어갈 화면</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DESTINATIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                aria-pressed={role === r.key}
                className="yh-choice px-4 py-2.5 text-left"
              >
                <span className="yh-body block font-bold">{r.label}</span>
                <span className="yh-small block text-yh-ink-3">{r.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="yh-btn mt-6 w-full">
          로그인
        </button>

        <p className="yh-small mt-3.5 text-center text-yh-ink-3">
          처음이신가요?{" "}
          <Link to="/signup" className="font-bold text-yh-navy underline underline-offset-4">
            회원가입
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
