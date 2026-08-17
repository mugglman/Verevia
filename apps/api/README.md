# apps/api

Backend-API der Verevia-Plattform.

## Zweck

Dieses Verzeichnis enthält perspektivisch die zentrale API. Vorgesehen ist eine Umsetzung mit NestJS und TypeScript nach dem API-First-Prinzip, inklusive Mandantenfähigkeit und rollenbasierter Zugriffssteuerung.

## Status

Technisches Skeleton (Phase 1): NestJS 11, TypeScript, `GET /health`. Noch keine fachlichen Controller, noch keine Datenbank- oder Auth-Anbindung — diese folgen in eigenen Arbeitspaketen (`packages/database`, `packages/auth`).

## Befehle (aus dem Repo-Root via Turborepo)

```bash
pnpm dev        # Nest im Watch-Modus (Port 3001)
pnpm build      # Nest-Build nach dist/
pnpm lint
pnpm typecheck
pnpm test       # Unit-Tests (Vitest)
pnpm test:e2e   # E2E-Test für /health (Supertest)
```

## Bezug

- [Architektur](../../docs/architecture/Architecture.md)
- [Mandantenfähigkeit](../../docs/architecture/Multi-Tenancy.md)
- [Datenbank-Entwurf](../../docs/database/Database.md)
