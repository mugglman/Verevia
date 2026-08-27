import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { MatchDetail, type MatchDetailMatch, type MatchDetailVenue } from "@/components/match-detail";

export const dynamic = "force-dynamic";

interface VenueListItem {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

interface VenueListResponse {
  items: VenueListItem[];
}

export default async function SpielDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const matchResult = await apiFetch<MatchDetailMatch>(`/api/v1/football/matches/${id}`, tenantId);
  if (!matchResult.ok) {
    if (matchResult.status === 401) redirect("/login");
    if (matchResult.status === 404) notFound();
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Du hast keine Berechtigung, dieses Spiel zu sehen.
        </main>
      </>
    );
  }

  const venuesResult = await apiFetch<VenueListResponse>("/api/v1/venues?status=ACTIVE", tenantId);
  const venues: MatchDetailVenue[] = venuesResult.ok
    ? venuesResult.data.items.map((v) => ({ id: v.id, name: v.name }))
    : [];

  return (
    <>
      <Nav />
      <MatchDetail match={matchResult.data} venues={venues} />
    </>
  );
}
