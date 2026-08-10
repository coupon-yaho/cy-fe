import { Badge } from "@/components/ui/badge";
import { GRADE_LABEL, type Grade, type CouponStatus, type IssuanceStatus } from "@/lib/domain";

const gradeClass: Record<Grade, string> = {
  VIP: "bg-grade-vip/15 text-grade-vip border-grade-vip/30",
  GOLD: "bg-grade-gold/15 text-grade-gold border-grade-gold/40",
  SILVER: "bg-grade-silver/15 text-grade-silver border-grade-silver/40",
  WELCOME: "bg-grade-welcome/15 text-grade-welcome border-grade-welcome/30",
};

export function GradeBadge({ grade, className = "" }: { grade: Grade; className?: string }) {
  return (
    <Badge variant="outline" className={`${gradeClass[grade]} ${className}`}>
      {GRADE_LABEL[grade]}
    </Badge>
  );
}

const couponStatusClass: Record<CouponStatus, string> = {
  OPEN: "bg-success/15 text-success border-success/30",
  SCHEDULED: "bg-warning/15 text-warning border-warning/40",
  CLOSED: "bg-muted text-muted-foreground border-border",
};

const couponStatusLabel: Record<CouponStatus, string> = {
  OPEN: "진행 중",
  SCHEDULED: "오픈 예정",
  CLOSED: "마감",
};

export function CouponStatusBadge({ status }: { status: CouponStatus }) {
  return (
    <Badge variant="outline" className={couponStatusClass[status]}>
      {status === "OPEN" && (
        <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-success" />
      )}
      {couponStatusLabel[status]}
    </Badge>
  );
}

const issuanceClass: Record<IssuanceStatus, string> = {
  ISSUED: "bg-accent/15 text-accent border-accent/30",
  USED: "bg-success/15 text-success border-success/30",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  EXPIRED: "bg-destructive/10 text-destructive border-destructive/30",
};

const issuanceLabel: Record<IssuanceStatus, string> = {
  ISSUED: "보유 중",
  USED: "사용 완료",
  CANCELLED: "취소됨",
  EXPIRED: "만료됨",
};

export function IssuanceStatusBadge({ status }: { status: IssuanceStatus }) {
  return (
    <Badge variant="outline" className={issuanceClass[status]}>
      {issuanceLabel[status]}
    </Badge>
  );
}
