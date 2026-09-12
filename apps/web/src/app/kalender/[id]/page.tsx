import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import type { AttendanceItem } from "@/components/attendance-section";
import { AttendanceOnlyEventView, type AttendanceOnlyEvent } from "@/components/attendance-only-event-view";
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

interface AttendanceListResponse {
  event: AttendanceOnlyEvent;
  items: AttendanceItem[];
  canManageAttendance: boolean;
}

export default async function TerminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const [eventResult, attendanceResult] = await Promise.all([
    apiFetch<EventDetailEvent>(`/api/v1/events/${id}`, tenantId),
    apiFetch<AttendanceListResponse>(`/api/v1/events/${id}/attendances`, tenantId),
  ]);

  if (eventResult.ok) {
    const venuesResult = await apiFetch<VenueListResponse>("/api/v1/venues?status=ACTIVE", tenantId);
    const venues: EventDetailVenue[] = venuesResult.ok ? venuesResult.data.items.map((v) => ({ id: v.id, name: v.name })) : [];

    return (
      <>
        <Nav />
        <EventDetail
          event={eventResult.data}
          venues={venues}
          attendanceItems={attendanceResult.ok ? attendanceResult.data.items : []}
          canManageAttendance={attendanceResult.ok ? attendanceResult.data.canManageAttendance : false}
        />
      </>
    );
  }

  // Kein RBAC-Leserecht auf das Event selbst, aber ggf. Self-Service-Zugriff
  // auf die eigene bzw. eines Kindes Anwesenheit (siehe ADR 0015) — z. B. ein
  // Erziehungsberechtigter ohne eigene Rolle.
  if (attendanceResult.ok) {
    return (
      <>
        <Nav />
        <AttendanceOnlyEventView
          event={attendanceResult.data.event}
          items={attendanceResult.data.items}
          canManageAttendance={attendanceResult.data.canManageAttendance}
        />
      </>
    );
  }

  if (eventResult.status === 401) redirect("/login");
  if (eventResult.status === 404 && attendanceResult.status === 404) notFound();
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Du hast keine Berechtigung, diesen Termin zu sehen.</main>
    </>
  );
}
