import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { TasksOverview, type TaskOverviewItem } from "@/components/tasks-overview";

export const dynamic = "force-dynamic";

interface TaskListResponse {
  items: TaskOverviewItem[];
  canCreate: boolean;
}

export default async function AufgabenPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const tasksResult = await apiFetch<TaskListResponse>("/api/v1/tasks", tenantId);
  if (!tasksResult.ok) {
    if (tasksResult.status === 401) redirect("/login");
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Die Aufgaben konnten nicht geladen werden.</main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <TasksOverview tasks={tasksResult.data.items} canCreate={tasksResult.data.canCreate} />
    </>
  );
}
