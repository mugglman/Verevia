# @verevia/database

Datenbankzugriff der Verevia-Plattform (Prisma + PostgreSQL).

## Zweck

Zentrales Paket für den Datenbankzugriff, gemeinsam genutzt von `apps/api` (und ggf. serverseitigem Code in `apps/web`).

## Status

Core-Datenmodell implementiert (Phase 2): `Tenant`, `Department`, `Team`, `Person`, `User`/`Session`/`Account`/`Verification` (better-auth), `Membership`, `RoleAssignment`, `PlatformRoleAssignment`, `PersonRelationship` — inklusive PostgreSQL Row-Level-Security und CHECK-Constraints. Details: [PHASE_2_CORE_REPORT.md](../../docs/PHASE_2_CORE_REPORT.md).

**Noch nicht enthalten:** fachliche Module (Season/Event/Attendance/Task/Tournament/Match/Venue/Notification/AuditLog/JointTeam) — eigenes, künftiges Arbeitspaket.

Prisma ist bewusst auf **^6.x** gepinnt (nicht 7), siehe [ADR 0002](../../docs/architecture/adr/0002-authentication-strategy.md).

## Zwei Datenbank-Rollen (wichtig)

- **Migrationen** laufen über die Superuser-Rolle (`POSTGRES_USER` aus `docker-compose.yml`).
- **Laufende Anwendung und alle Tests** verbinden über die separate, nicht-privilegierte Rolle `verevia_app` (angelegt durch die Migration `add_non_superuser_app_role`) — PostgreSQL-Superuser umgehen Row-Level-Security grundsätzlich, siehe [Multi-Tenancy.md](../../docs/architecture/Multi-Tenancy.md).

## Exports

- `prisma` — globaler Client, nur für die nicht-tenant-gebundenen Modelle (`User`, `Session`, `Account`, `Verification`, `PlatformRoleAssignment`).
- `getTenantPrisma(tenantId)` — tenant-sicherer Client für alle tenant-gebundenen Modelle (`Department`, `Team`, `Person`, `RoleAssignment`, `PersonRelationship`), setzt `app.tenant_id` transaktional vor jeder Operation.
- `runWithTenantContext(context, fn)` / `getTenantContext()` — `AsyncLocalStorage`-basierte Tenant-Kontext-Propagation für Anwendungscode (z. B. NestJS-Interceptor).
- `createAdminPrismaForTests()` — Superuser-Client, ausschließlich für Test-Fixtures.

## Befehle

```bash
pnpm db:generate       # Prisma Client generieren
pnpm db:push            # Schema-Änderungen ohne Migration pushen (Superuser-Rolle)
pnpm db:studio           # Prisma Studio
pnpm db:seed              # Development-Seed (TSV Benediktbeuern, Abteilung Fußball, 2 fiktive Demo-Personen)
pnpm test:integration      # RLS-Integrationstests gegen echtes PostgreSQL (siehe docs/DEVELOPMENT.md)
```

## Environment

Benötigt `DATABASE_URL` (App-Rolle `verevia_app`, siehe `.env.example` im Repo-Root). Für Migrationen/Seed/Integrationstests zusätzlich die Superuser-Verbindung (`ADMIN_DATABASE_URL` bei Tests, sonst direkt beim CLI-Aufruf).
