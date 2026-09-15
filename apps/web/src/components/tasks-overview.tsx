import Link from "next/link";

export type TaskStatus = "OPEN" | "DONE";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Offen",
  DONE: "Erledigt",
};

export interface TaskOverviewItem {
  id: string;
  title: string;
  teamName: string | null;
  personName: string | null;
  dueAt: string | null;
  status: TaskStatus;
}

export interface TasksOverviewProps {
  tasks: TaskOverviewItem[];
  canCreate: boolean;
}

function formatDueAt(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
}

/** Pure presentational component — see apps/web/src/app/aufgaben/page.tsx. */
export function TasksOverview({ tasks, canCreate }: TasksOverviewProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <span>Aufgaben</span>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Aufgaben</h1>
      </section>

      <section className="space-y-3">
        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">Noch keine Aufgaben angelegt.</p>
        ) : (
          <ul className="space-y-3">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/aufgaben/${task.id}`}
                  className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-[var(--color-dark)]">{task.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        task.status === "DONE" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {TASK_STATUS_LABELS[task.status]}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500">
                    {task.teamName ?? task.personName}
                    {task.dueAt ? ` · fällig am ${formatDueAt(task.dueAt)}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {canCreate && (
          <Link href="/aufgaben/neu" className="inline-block rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Aufgabe anlegen
          </Link>
        )}
      </section>
    </main>
  );
}
