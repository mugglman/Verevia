import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { StatisticsView, type StatisticsViewData } from "@/components/statistics-view";

export const dynamic = "force-dynamic";

export default async function StatistikDetailPage({ params }: { params: Promise<{ teamSeasonId: string }> }) {
  const { teamSeasonId } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const result = await apiFetch<StatisticsViewData>(`/api/v1/statistics/team-seasons/${teamSeasonId}`, tenantId);

  if (result.ok) {
    return (
      <>
        <Nav />
        <StatisticsView data={result.data} />
      </>
    );
  }

  if (result.status === 401) redirect("/login");
  if (result.status === 404) notFound();
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Du hast keine Berechtigung, diese Statistik zu sehen.</main>
    </>
  );
}
