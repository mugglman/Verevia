import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { VenueManagement, type VenueManagementVenue } from "@/components/venue-management";

export const dynamic = "force-dynamic";

interface VenueListResponse {
  items: VenueManagementVenue[];
  canCreate: boolean;
}

export default async function SpielstaettenPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const venuesResult = await apiFetch<VenueListResponse>("/api/v1/venues", tenantId);
  if (!venuesResult.ok) {
    if (venuesResult.status === 401) redirect("/login");
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Die Spielstätten konnten nicht geladen werden.
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <VenueManagement venues={venuesResult.data.items} canCreate={venuesResult.data.canCreate} />
    </>
  );
}
