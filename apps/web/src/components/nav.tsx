import Link from "next/link";

/**
 * Minimal navigation for this vertical slice only — Verein (Abteilungen)
 * as the entry point (teams reached by drilling down through a
 * department), Personen (Phase 4), Meine Kinder (Phase 6, guardian
 * ReBAC access), Fußball (Phase 9, season foundation), and Kalender
 * (Phase 18, team-/department-scoped events). All links are always shown;
 * each page itself enforces its own access rule (403/empty-state message)
 * rather than hiding the link, since Nav has no access to the caller's
 * permissions. Turniere (Phase 11) is reached via the Fußball overview
 * page, not a top-level entry, same as Saisons. No nav items for features
 * that don't exist yet (Anwesenheit, Aufgaben, Push-Mitteilungen, Chat,
 * Finanzen, Tennis, Stockschützen, Radsport).
 */
export function Nav() {
  return (
    <nav className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-[var(--color-dark)] dark:text-white"
        >
          Verevia
        </Link>
        <Link
          href="/"
          className="text-sm text-neutral-600 hover:text-[var(--color-primary)] dark:text-neutral-300"
        >
          Verein
        </Link>
        <Link
          href="/personen"
          className="text-sm text-neutral-600 hover:text-[var(--color-primary)] dark:text-neutral-300"
        >
          Personen
        </Link>
        <Link
          href="/meine-kinder"
          className="text-sm text-neutral-600 hover:text-[var(--color-primary)] dark:text-neutral-300"
        >
          Meine Kinder
        </Link>
        <Link
          href="/fussball"
          className="text-sm text-neutral-600 hover:text-[var(--color-primary)] dark:text-neutral-300"
        >
          Fußball
        </Link>
        <Link
          href="/kalender"
          className="text-sm text-neutral-600 hover:text-[var(--color-primary)] dark:text-neutral-300"
        >
          Kalender
        </Link>
      </div>
    </nav>
  );
}
