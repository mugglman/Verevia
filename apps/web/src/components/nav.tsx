import Link from "next/link";

/**
 * Minimal navigation for this vertical slice only — Verein (Abteilungen)
 * as the single entry point, teams reached by drilling down through a
 * department. No nav items for features that don't exist yet (Turniere,
 * Kalender, Anwesenheit, Chat, Finanzen, Tennis, Stockschützen, Radsport).
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
      </div>
    </nav>
  );
}
