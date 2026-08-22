import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

interface MyChild {
  id: string;
  firstName: string;
  lastName: string;
}

interface ChildTeam {
  id: string;
  name: string;
  departmentId: string;
}

/**
 * Guardian-facing page (Phase 6, sections 17/19/28) — the only page a
 * Person with no RBAC role (just a verified PARENT/LEGAL_GUARDIAN
 * relationship) has anything to see on. Uses the SELF-scoped
 * `/api/v1/me/children` endpoint (no admin check — every authenticated
 * tenant member may call it, it only ever returns their own children) and
 * `/api/v1/persons/:id/teams` for each child (same ReBAC rule).
 */
export default async function MeineKinderPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const childrenResult = await apiFetch<MyChild[]>("/api/v1/me/children", tenantId);
  if (!childrenResult.ok) {
    if (childrenResult.status === 401) {
      redirect("/login");
    }
    if (childrenResult.status === 403) {
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
          Deine Kinder konnten nicht geladen werden.
        </main>
      </>
    );
  }

  const childrenWithTeams = await Promise.all(
    childrenResult.data.map(async (child) => {
      const teamsResult = await apiFetch<ChildTeam[]>(`/api/v1/persons/${child.id}/teams`, tenantId);
      return { ...child, teams: teamsResult.ok ? teamsResult.data : [] };
    }),
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl space-y-6 p-4 pb-16">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Meine Kinder</h1>
        {childrenWithTeams.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Für dich sind aktuell keine Kinder hinterlegt.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {childrenWithTeams.map((child) => (
              <li
                key={child.id}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <p className="font-medium text-[var(--color-dark)]">
                  {child.firstName} {child.lastName}
                </p>
                {child.teams.length === 0 ? (
                  <p className="mt-1 text-sm text-neutral-500">Noch keiner Mannschaft zugeordnet.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-sm text-neutral-600">
                    {child.teams.map((team) => (
                      <li key={team.id}>{team.name}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
