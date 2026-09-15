import Link from "next/link";
import { deleteTaskAction, setTaskStatusAction, updateTaskAction } from "@/app/actions";
import { TASK_STATUS_LABELS, type TaskStatus } from "./tasks-overview";

export interface TaskDetailTask {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: TaskStatus;
  teamName: string | null;
  personName: string | null;
  canEdit: boolean;
  canSetStatus: boolean;
}

export interface TaskDetailProps {
  task: TaskDetailTask;
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/** Pure presentational component — see apps/web/src/app/aufgaben/[id]/page.tsx. */
export function TaskDetail({ task }: TaskDetailProps) {
  const nextStatus: TaskStatus = task.status === "OPEN" ? "DONE" : "OPEN";

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <Link href="/aufgaben" className="hover:text-[var(--color-primary)]">
          Aufgaben
        </Link>
        <span className="mx-1">/</span>
        <span>{task.title}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">{task.title}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            task.status === "DONE" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {TASK_STATUS_LABELS[task.status]}
        </span>
      </div>
      <p className="text-sm text-neutral-500">{task.teamName ?? task.personName}</p>

      <div className="space-y-1 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        {task.dueAt && <p>Fällig am {new Date(task.dueAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}</p>}
        {task.description && <p>{task.description}</p>}
      </div>

      {task.canSetStatus && (
        <form action={setTaskStatusAction.bind(null, task.id)}>
          <input type="hidden" name="status" value={nextStatus} />
          <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            {task.status === "OPEN" ? "Als erledigt markieren" : "Wieder öffnen"}
          </button>
        </form>
      )}

      {task.canEdit && (
        <>
          <form action={updateTaskAction.bind(null, task.id)} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="title" className="text-sm text-neutral-600">
                Titel
              </label>
              <input
                id="title"
                name="title"
                defaultValue={task.title}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="dueAt" className="text-sm text-neutral-600">
                Fällig am
              </label>
              <input
                id="dueAt"
                name="dueAt"
                type="date"
                defaultValue={task.dueAt ? toDateInputValue(task.dueAt) : ""}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-sm text-neutral-600">
                Beschreibung
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={task.description ?? ""}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Speichern
            </button>
          </form>

          <form action={deleteTaskAction.bind(null, task.id)}>
            <button type="submit" className="text-sm font-medium text-red-600 hover:underline">
              Aufgabe löschen
            </button>
          </form>
        </>
      )}
    </main>
  );
}
