import { GRADE_LABEL, type MembershipGrade } from "@/lib/coupon";

const TONE: Record<MembershipGrade, string> = {
  WELCOME: "text-grade-welcome",
  SILVER: "text-grade-silver",
  GOLD: "text-grade-gold",
  VIP: "text-grade-vip",
};

/**
 * 등급 표시.
 *
 * 색 하나와 이름 하나. 테두리나 배경을 얹으면 등급이 액션처럼 보입니다 —
 * 등급은 상태이지 누를 수 있는 것이 아닙니다.
 *
 * 등급색은 액센트가 아니라 데이터색이라 에디토리얼 팔레트(빨강 하나) 규칙 밖에 둡니다.
 * 네 등급이 서로 구분돼야 하는데 잉크 농도만으로는 네 단계가 안 나옵니다.
 */
export function GradeChip({ grade, size = "md" }: { grade: MembershipGrade; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold ${TONE[grade]} ${
        size === "sm" ? "yh-small" : "yh-body"
      }`}
    >
      <span className="size-1.5 rounded-[1px] bg-current" aria-hidden />
      {GRADE_LABEL[grade]}
    </span>
  );
}

export function GradeList({ grades }: { grades: MembershipGrade[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-4 gap-y-1">
      {grades.map((g) => (
        <GradeChip key={g} grade={g} size="sm" />
      ))}
    </span>
  );
}
