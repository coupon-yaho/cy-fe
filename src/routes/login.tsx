import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { GRADE_LABEL, GRADES, type Grade, type Role } from "@/lib/domain";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "로그인 — 쿠폰 야~호" },
      { name: "description", content: "쿠폰 야~호 데모 로그인. 등급과 역할을 선택해 바로 체험하세요." },
      { property: "og:title", content: "로그인 — 쿠폰 야~호" },
      { property: "og:description", content: "등급과 역할을 골라 바로 체험하는 Mock 로그인." },
      { property: "og:url", content: "/login" },
    ],
    links: [{ rel: "canonical", href: "/login" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState<Grade>("GOLD");
  const [role, setRole] = useState<Role>("USER");

  function submit(next: { nickname: string; grade: Grade; role: Role }) {
    const s = login(next);
    toast.success(`${s.nickname}님, 환영합니다`, {
      description: `등급 ${GRADE_LABEL[s.grade]} · ${s.role === "ADMIN" ? "관리자" : "일반 회원"}`,
    });
    navigate({ to: next.role === "ADMIN" ? "/admin" : "/events" });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-14">
      <div className="text-center">
        <BrandLogo className="mx-auto h-12" />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
          <CardDescription>
            인증은 Mock 처리됩니다. 비밀번호 검증 없이 목 JWT 클레임(sub · grade · role)을 발급합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nickname">닉네임</Label>
            <Input
              id="nickname"
              placeholder="아무 이름이나 입력하세요"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>멤버십 등급</Label>
              <Select value={grade} onValueChange={(v) => setGrade(v as Grade)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.slice().reverse().map((g) => (
                    <SelectItem key={g} value={g}>
                      {GRADE_LABEL[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>역할</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">일반 회원</SelectItem>
                  <SelectItem value="ADMIN">관리자</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => submit({ nickname: nickname.trim() || "게스트", grade, role })}
          >
            로그인
          </Button>

          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">데모 계정 원클릭</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => submit({ nickname: "김브이", grade: "VIP", role: "USER" })}
              >
                VIP 회원
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => submit({ nickname: "박웰컴", grade: "WELCOME", role: "USER" })}
              >
                웰컴 회원
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="col-span-2"
                onClick={() => submit({ nickname: "운영자", grade: "VIP", role: "ADMIN" })}
              >
                관리자
              </Button>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            아직 회원이 아니신가요?{" "}
            <Link to="/signup" className="font-medium text-accent hover:underline">
              회원가입
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
