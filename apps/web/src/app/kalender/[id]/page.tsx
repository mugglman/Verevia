import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { EventDetail, type EventDetailEvent, type EventDetailVenue } from "@/components/event-detail";

export const dynamic = "force-dynamic";

interface VenueListItem {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

interface VenueListResponse {
  items: VenueListItem[];
}

export default async function TerminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const eventResult = await apiFetch<EventDetailEvent>(`/api/v1/events/${id}`, tenantId);
  if (!eventResult.ok) {
    if (eventResult.status === 401) redirect("/login");
    if (eventResult.status === 404) notFound();
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Du hast keine Berechtigung, diesen Termin zu sehen.</main>
      </>
    );
  }

  const venuesResult = await apiFetch<VenueListResponse>("/api/v1/venues?status=ACTIVE", tenantId);
  const venues: EventDetailVenue[] = venuesResult.ok ? venuesResult.data.items.map((v) => ({ id: v.id, name: v.name })) : [];

  return (
    <>
      <Nav />
      <EventDetail event={eventResult.data} venues={venues} />
    </>
  );
}
