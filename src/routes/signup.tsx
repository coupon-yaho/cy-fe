import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import { GRADE_LABEL, GRADES, type Grade } from "@/lib/domain";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "회원가입 — 쿠폰 야~호" },
      { name: "description", content: "쿠폰 야~호 데모 회원가입. 가상 회원 정보로 즉시 시작합니다." },
      { property: "og:title", content: "회원가입 — 쿠폰 야~호" },
      { property: "og:description", content: "가상 회원 정보로 즉시 시작하는 Mock 회원가입." },
      { property: "og:url", content: "/signup" },
    ],
    links: [{ rel: "canonical", href: "/signup" }],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [grade, setGrade] = useState<Grade>("WELCOME");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-14">
      <div className="text-center">
        <BrandLogo className="mx-auto h-12" />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>회원가입</CardTitle>
          <CardDescription>
            가상 회원 정보를 가정합니다. 입력한 연락처는 저장되지 않고 마스킹 표기만 시연합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nickname">닉네임</Label>
            <Input
              id="nickname"
              placeholder="쿠폰마스터"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">휴대폰 번호</Label>
            <Input
              id="phone"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {phone.length >= 4 && (
              <p className="num text-xs text-muted-foreground">
                마스킹 저장 예시: {phone.slice(0, 3)}-****-{phone.slice(-4)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>가입 등급 (데모용 선택)</Label>
            <RadioGroup
              value={grade}
              onValueChange={(v) => setGrade(v as Grade)}
              className="grid grid-cols-2 gap-2"
            >
              {GRADES.slice().reverse().map((g) => (
                <Label
                  key={g}
                  htmlFor={`grade-${g}`}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                >
                  <RadioGroupItem value={g} id={`grade-${g}`} />
                  {GRADE_LABEL[g]}
                </Label>
              ))}
            </RadioGroup>
          </div>

          <Button
            className="w-full"
            onClick={() => {
              const s = login({ nickname: nickname.trim() || "새회원", grade, role: "USER" });
              toast.success("가입 완료 (Mock)", { description: `${s.nickname}님, 바로 시작하세요.` });
              navigate({ to: "/events" });
            }}
          >
            가입하고 시작하기
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <Link to="/login" className="font-medium text-accent hover:underline">
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
