import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { formatDateTime } from "@/components/countdown";
import { CouponStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminCloseCoupon,
  adminCreateCoupon,
  adminDeleteCoupon,
  adminListBrands,
  adminListCoupons,
  adminUpdateCoupon,
  type CouponInput,
} from "@/lib/api";
import { MASK_ALL, MASK_GOLD_UP, MASK_SILVER_UP, MASK_VIP, describePolicy, maskLabel, type PolicyType } from "@/lib/domain";

export const Route = createFileRoute("/admin/coupons")({
  head: () => ({
    meta: [
      { title: "쿠폰 관리 — 쿠폰 야~호 관리자" },
      { name: "description", content: "쿠폰 생성 · 수정 · 마감 · 삭제를 관리합니다." },
      { property: "og:title", content: "쿠폰 관리 — 쿠폰 야~호 관리자" },
      { property: "og:description", content: "쿠폰 CRUD 관리 화면." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCoupons,
});

const MASKS = [
  { v: MASK_ALL, label: "전체 등급" },
  { v: MASK_SILVER_UP, label: "실버 이상" },
  { v: MASK_GOLD_UP, label: "골드 이상" },
  { v: MASK_VIP, label: "VIP 전용" },
];

function toLocalInput(ts: number) {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function AdminCoupons() {
  const qc = useQueryClient();
  const coupons = useQuery({ queryKey: ["admin-coupons"], queryFn: adminListCoupons });
  const brands = useQuery({ queryKey: ["admin-brands"], queryFn: adminListBrands });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponInput>({
    brandId: "",
    title: "",
    policyType: "RATE_CAP",
    policyValue: 20,
    policyCap: 5000,
    totalStock: 10000,
    openAt: Date.now() + 3600_000,
    closeAt: Date.now() + 4 * 3600_000,
    eligibleGradesMask: MASK_ALL,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-coupons"] });

  const save = useMutation({
    mutationFn: async () =>
      editId ? adminUpdateCoupon(editId, form) : adminCreateCoupon(form),
    onSuccess: () => {
      toast.success(editId ? "쿠폰이 수정되었습니다" : "쿠폰이 생성되었습니다");
      setOpen(false);
      invalidate();
    },
    onError: () => toast.error("저장에 실패했습니다"),
  });

  function openNew() {
    setEditId(null);
    setForm((f) => ({ ...f, brandId: brands.data?.[0]?.brandId ?? "", title: "" }));
    setOpen(true);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">쿠폰 관리</h1>
          <p className="text-sm text-muted-foreground">쿠폰 생성 · 수정 · 마감 · 삭제</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1 size-4" /> 쿠폰 생성
        </Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>쿠폰</TableHead>
                <TableHead>혜택</TableHead>
                <TableHead>대상</TableHead>
                <TableHead className="text-right">재고</TableHead>
                <TableHead>기간</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(coupons.data ?? []).map((c) => (
                <TableRow key={c.couponId}>
                  <TableCell className="font-medium">
                    {c.brand.emoji} {c.title}
                  </TableCell>
                  <TableCell className="text-sm">
                    {describePolicy(c.policyType, c.policyValue, c.policyCap)}
                  </TableCell>
                  <TableCell className="text-sm">{maskLabel(c.eligibleGradesMask)}</TableCell>
                  <TableCell className="num text-right text-sm">
                    {c.issuedCount.toLocaleString("ko-KR")} / {c.totalStock.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="num text-xs text-muted-foreground">
                    {formatDateTime(c.openAt)} ~ {formatDateTime(c.closeAt)}
                  </TableCell>
                  <TableCell><CouponStatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="수정"
                        onClick={() => {
                          setEditId(c.couponId);
                          setForm({
                            brandId: c.brandId,
                            title: c.title,
                            policyType: c.policyType,
                            policyValue: c.policyValue,
                            policyCap: c.policyCap,
                            totalStock: c.totalStock,
                            openAt: c.openAt,
                            closeAt: c.closeAt,
                            eligibleGradesMask: c.eligibleGradesMask,
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="마감"
                        onClick={async () => {
                          await adminCloseCoupon(c.couponId);
                          toast.success("수동 마감되었습니다");
                          invalidate();
                        }}
                      >
                        <XCircle className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="삭제"
                        onClick={async () => {
                          await adminDeleteCoupon(c.couponId);
                          toast.success("삭제되었습니다");
                          invalidate();
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "쿠폰 수정" : "쿠폰 생성"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>브랜드</Label>
              <Select value={form.brandId} onValueChange={(v) => setForm({ ...form, brandId: v })}>
                <SelectTrigger><SelectValue placeholder="브랜드 선택" /></SelectTrigger>
                <SelectContent>
                  {(brands.data ?? []).map((b) => (
                    <SelectItem key={b.brandId} value={b.brandId}>
                      {b.emoji} {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>쿠폰명</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>정책</Label>
                <Select
                  value={form.policyType}
                  onValueChange={(v) => setForm({ ...form, policyType: v as PolicyType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RATE_CAP">정률+상한</SelectItem>
                    <SelectItem value="FLAT">정액</SelectItem>
                    <SelectItem value="DATA">데이터</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>값</Label>
                <Input
                  type="number"
                  value={form.policyValue}
                  onChange={(e) => setForm({ ...form, policyValue: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>상한(원)</Label>
                <Input
                  type="number"
                  value={form.policyCap ?? 0}
                  disabled={form.policyType !== "RATE_CAP"}
                  onChange={(e) => setForm({ ...form, policyCap: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>총 재고</Label>
                <Input
                  type="number"
                  value={form.totalStock}
                  onChange={(e) => setForm({ ...form, totalStock: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>대상 등급</Label>
                <Select
                  value={String(form.eligibleGradesMask)}
                  onValueChange={(v) => setForm({ ...form, eligibleGradesMask: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MASKS.map((m) => (
                      <SelectItem key={m.v} value={String(m.v)}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>오픈</Label>
                <Input
                  type="datetime-local"
                  value={toLocalInput(form.openAt)}
                  onChange={(e) => setForm({ ...form, openAt: new Date(e.target.value).getTime() })}
                />
              </div>
              <div className="space-y-2">
                <Label>마감</Label>
                <Input
                  type="datetime-local"
                  value={toLocalInput(form.closeAt)}
                  onChange={(e) => setForm({ ...form, closeAt: new Date(e.target.value).getTime() })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button
              disabled={!form.brandId || !form.title || save.isPending}
              onClick={() => save.mutate()}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
