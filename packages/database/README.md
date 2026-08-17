# @verevia/database

Datenbankzugriff der Verevia-Plattform (Prisma + PostgreSQL).

## Zweck

Zentrales Paket für den Datenbankzugriff, gemeinsam genutzt von `apps/api` (und ggf. serverseitigem Code in `apps/web`).

## Status

Technisches Skeleton (Phase 1). **Bewusst noch kein fachliches Datenmodell** — kein `Tenant`, `Person`, `Membership`, `RoleAssignment`, `PersonRelationship`, Turniermodell. Diese folgen in einem eigenen Arbeitspaket auf Basis von [Database.md](../../docs/database/Database.md) und [ARCHITEKTUR_FINALISIERUNG.md](../../docs/ARCHITEKTUR_FINALISIERUNG.md).

Enthält aktuell nur:

- Prisma-Grundkonfiguration (`prisma/schema.prisma`, PostgreSQL, Prisma **^6.x** — bewusst nicht 7, siehe [ADR 0002](../../docs/architecture/adr/0002-authentication-strategy.md))
- ein Platzhalter-Modell (`HealthCheck`), um die Pipeline (`generate`/`db push`/Client) technisch zu verifizieren
- einen `PrismaClient`-Singleton-Export (`src/index.ts`) — **noch ohne** die in `ARCHITEKTUR_FINALISIERUNG.md` (Abschnitt 7) spezifizierte `TenantPrismaService`-Transaktions-/RLS-Kopplung

## Befehle

```
pnpm db:generate   # Prisma Client generieren
pnpm db:push        # Schema gegen die lokale Dev-Datenbank pushen (siehe infrastructure/docker)
pnpm db:studio       # Prisma Studio
```

## Environment

Benötigt `DATABASE_URL` (siehe `.env.example` im Repo-Root).
