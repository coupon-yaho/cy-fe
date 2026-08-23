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
    /* 이름 앞에 색 네모를 하나 찍어 두었었습니다. 그런데 그 네모의 색이 곧 글자
       색이라 같은 말을 두 번 하는 것이었고, 배지·목록·카드 어디에나 붙다 보니
       화면 전체에 정체불명의 점이 뿌려졌습니다. 색은 글자가 이미 갖고 있습니다. */
    <span
      className={`inline-flex items-center font-bold ${TONE[grade]} ${
        size === "sm" ? "yh-small" : "yh-body"
      }`}
    >
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
