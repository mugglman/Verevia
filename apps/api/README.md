# apps/api

Backend-API der Verevia-Plattform.

## Zweck

Dieses Verzeichnis enthält perspektivisch die zentrale API. Vorgesehen ist eine Umsetzung mit NestJS und TypeScript nach dem API-First-Prinzip, inklusive Mandantenfähigkeit und rollenbasierter Zugriffssteuerung.

## Status

NestJS 11, TypeScript. `GET /health` (Liveness) + `GET /health/ready` (DB-Readiness), better-auth gemountet (`/api/auth/*`), `TenantContextInterceptor` (Session- + Membership-geprüfter Tenant-Kontext, siehe `src/tenant/`) — noch nicht an einen fachlichen Controller angeschlossen, da noch keine fachliche Oberfläche existiert. Details: [PHASE_2_CORE_REPORT.md](../../docs/PHASE_2_CORE_REPORT.md).

## Befehle (aus dem Repo-Root via Turborepo)

```bash
pnpm dev        # Nest im Watch-Modus (Port 3001)
pnpm build      # Nest-Build nach dist/
pnpm lint
pnpm typecheck
pnpm test       # Unit-Tests (Vitest)
pnpm test:e2e   # E2E-Test für /health (Supertest, kein DB-Zugriff)
pnpm test:integration   # Interceptor + /health/ready gegen echtes PostgreSQL (siehe docs/DEVELOPMENT.md)
```

## Bezug

- [Architektur](../../docs/architecture/Architecture.md)
- [Mandantenfähigkeit](../../docs/architecture/Multi-Tenancy.md)
- [Datenbank-Entwurf](../../docs/database/Database.md)
