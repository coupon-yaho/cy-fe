import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LiveBenchmarkList } from "@/components/admin/live-benchmarks";
import { PageHead } from "@/components/admin/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/admin";

export const Route = createFileRoute("/admin/analysis")({
  head: () => ({ meta: [{ title: "성능 비교 — 쿠폰 야~호 관리자" }] }),
  component: AnalysisScreen,
});

function AnalysisScreen() {
  const { data } = useQuery({
    queryKey: ["admin", "benchmarks"],
    queryFn: () => adminApi.getBenchmarks(),
  });

  return (
    <>
      <PageHead title="성능 비교" />

      {!data ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <LiveBenchmarkList data={data} />
      )}
    </>
  );
}
