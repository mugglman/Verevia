import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { TaskDetail, type TaskDetailTask } from "@/components/task-detail";

export const dynamic = "force-dynamic";

export default async function AufgabeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const taskResult = await apiFetch<TaskDetailTask>(`/api/v1/tasks/${id}`, tenantId);
  if (!taskResult.ok) {
    if (taskResult.status === 401) redirect("/login");
    if (taskResult.status === 404) notFound();
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Du hast keine Berechtigung, diese Aufgabe zu sehen.</main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <TaskDetail task={taskResult.data} />
    </>
  );
}
