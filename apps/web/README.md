# apps/web

Web-Frontend der Verevia-Plattform.

## Zweck

Dieses Verzeichnis enthält perspektivisch die Hauptanwendung für Vereine, Mitglieder, Trainer und Eltern. Vorgesehen ist eine Umsetzung mit Next.js und TypeScript (Mobile First, responsive, Progressive Web App).

## Status

Technisches Skeleton (Phase 1): Next.js 16 App Router, TypeScript, Tailwind CSS 4, ESLint. Minimale technische Startseite ("System operational"), keine fachlichen Verevia-Features. Siehe [DEVELOPMENT.md](../../docs/DEVELOPMENT.md) für lokale Entwicklung.

## Befehle (aus dem Repo-Root via Turborepo)

```bash
pnpm dev      # Next.js Dev-Server (Turbopack)
pnpm build    # Next.js Production-Build
pnpm lint     # ESLint
pnpm typecheck
pnpm test     # Vitest
```

## Bezug

- [Architektur](../../docs/architecture/Architecture.md)
- [Markenidentität](../../docs/branding/Brand-Identity.md)
