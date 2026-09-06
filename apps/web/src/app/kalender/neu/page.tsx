import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { EventCreateForm, type EventCreateFormDepartment, type EventCreateFormTeam, type EventCreateFormVenue } from "@/components/event-create-form";

export const dynamic = "force-dynamic";

interface CreatableScopesResponse {
  teams: EventCreateFormTeam[];
  departments: EventCreateFormDepartment[];
}

interface VenueListItem {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

interface VenueListResponse {
  items: VenueListItem[];
}

/**
 * Teams/departments shown here are only the ones the caller may actually
 * create an event for (`GET /events/creatable-scopes`, canOnMatch/
 * canOnSeason) — not merely everything they can read, so the form never
 * offers a choice that would 403 on submit.
 */
export default async function NeuerTerminPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const [scopesResult, venuesResult] = await Promise.all([
    apiFetch<CreatableScopesResponse>("/api/v1/events/creatable-scopes", tenantId),
    apiFetch<VenueListResponse>("/api/v1/venues?status=ACTIVE", tenantId),
  ]);

  if (!scopesResult.ok) {
    if (scopesResult.status === 401) redirect("/login");
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Das Formular konnte nicht geladen werden.</main>
      </>
    );
  }

  const venues: EventCreateFormVenue[] = venuesResult.ok ? venuesResult.data.items.map((v) => ({ id: v.id, name: v.name })) : [];

  return (
    <>
      <Nav />
      <EventCreateForm teams={scopesResult.data.teams} departments={scopesResult.data.departments} venues={venues} />
    </>
  );
}
