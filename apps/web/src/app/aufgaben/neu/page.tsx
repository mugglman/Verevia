import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { TaskCreateForm, type TaskCreateFormPerson, type TaskCreateFormTeam } from "@/components/task-create-form";

export const dynamic = "force-dynamic";

interface CreatableScopesResponse {
  teams: TaskCreateFormTeam[];
  persons: TaskCreateFormPerson[];
}

/**
 * Teams/persons shown here are only the ones the caller may actually create
 * a task for (`GET /tasks/creatable-scopes`, canOnMatch derived either
 * directly or via the target's own team memberships, see ADR 0016) — not
 * merely everything they can read, so the form never offers a choice that
 * would 403 on submit.
 */
export default async function NeueAufgabePage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const scopesResult = await apiFetch<CreatableScopesResponse>("/api/v1/tasks/creatable-scopes", tenantId);
  if (!scopesResult.ok) {
    if (scopesResult.status === 401) redirect("/login");
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Das Formular konnte nicht geladen werden.</main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <TaskCreateForm teams={scopesResult.data.teams} persons={scopesResult.data.persons} />
    </>
  );
}
