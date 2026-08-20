import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { PersonManagement, type PersonManagementPerson } from "@/components/person-management";

export const dynamic = "force-dynamic";

interface PersonListResponse {
  items: PersonManagementPerson[];
  canCreate: boolean;
}

export default async function PersonenPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const personsResult = await apiFetch<PersonListResponse>("/api/v1/persons", tenantId);
  if (!personsResult.ok) {
    if (personsResult.status === 401) {
      redirect("/login");
    }
    if (personsResult.status === 403) {
      return (
        <>
          <Nav />
          <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
            Du hast keine Berechtigung, die Personenverwaltung zu sehen.
          </main>
        </>
      );
    }
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Die Personen konnten nicht geladen werden.
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <PersonManagement persons={personsResult.data.items} canCreate={personsResult.data.canCreate} />
    </>
  );
}
