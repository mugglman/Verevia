import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { EventsOverview, type EventOverviewItem } from "@/components/events-overview";

export const dynamic = "force-dynamic";

interface EventListResponse {
  items: EventOverviewItem[];
  canCreate: boolean;
}

export default async function KalenderPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const eventsResult = await apiFetch<EventListResponse>("/api/v1/events", tenantId);
  if (!eventsResult.ok) {
    if (eventsResult.status === 401) redirect("/login");
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Der Kalender konnte nicht geladen werden.</main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <EventsOverview events={eventsResult.data.items} canCreate={eventsResult.data.canCreate} />
    </>
  );
}
