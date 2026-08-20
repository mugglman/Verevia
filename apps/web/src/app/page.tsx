import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { ClubOverview, type ClubOverviewClub, type ClubOverviewDepartment } from "@/components/club-overview";

export const dynamic = "force-dynamic";

interface DepartmentListResponse {
  items: ClubOverviewDepartment[];
  canCreate: boolean;
}

export default async function VereinPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const clubResult = await apiFetch<ClubOverviewClub>("/api/v1/club", tenantId);
  if (!clubResult.ok) {
    if (clubResult.status === 401) {
      redirect("/login");
    }
    if (clubResult.status === 403) {
      return (
        <>
          <Nav />
          <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
            Du bist bei diesem Verein nicht als Mitglied hinterlegt.
          </main>
        </>
      );
    }
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Der Verein konnte nicht geladen werden.
        </main>
      </>
    );
  }

  const departmentsResult = await apiFetch<DepartmentListResponse>("/api/v1/departments", tenantId);
  const departments = departmentsResult.ok ? departmentsResult.data.items : [];
  const canCreateDepartment = departmentsResult.ok ? departmentsResult.data.canCreate : false;

  return (
    <>
      <Nav />
      <ClubOverview
        club={clubResult.data}
        departments={departments}
        canCreateDepartment={canCreateDepartment}
      />
    </>
  );
}
