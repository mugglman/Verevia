# Lokale Entwicklung

> Für den architektonischen Hintergrund siehe [ARCHITEKTUR_BERICHT.md](./ARCHITEKTUR_BERICHT.md) und [ARCHITEKTUR_FINALISIERUNG.md](./ARCHITEKTUR_FINALISIERUNG.md). Dieses Dokument beschreibt nur das *Wie*, nicht das *Warum*.

## Voraussetzungen

- Node.js ≥ 20 (lokal verifiziert mit 22 LTS und 25; für CI/Produktion wird 22 LTS empfohlen)
- pnpm ≥ 9 (`npm install -g pnpm`, da Corepack in manchen Node-Installationen nicht mitgeliefert ist)
- Docker (für die lokale PostgreSQL-Instanz)

## Installation

```bash
pnpm install
```

Installiert alle Workspace-Pakete (`apps/*`, `packages/*`) über pnpm Workspaces (`pnpm-workspace.yaml`).

## Environment

```bash
cp .env.example .env.local
```

Wichtige Variablen (vollständige Liste in `.env.example`):

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung, muss zur lokalen Docker-Instanz passen |
| `BETTER_AUTH_SECRET` | Secret für better-auth (lokal z. B. mit `openssl rand -base64 32` erzeugen) |
| `BETTER_AUTH_URL` | Basis-URL des Auth-Endpunkts (`apps/api`) |
| `APP_URL` / `API_URL` | Basis-URLs von Web- und API-App |

Niemals echte Secrets in `.env.example` oder ins Repository committen.

## Lokale Infrastruktur

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

Startet PostgreSQL 17 auf Port 5432 (Zugangsdaten siehe `.env.example`). Redis ist bewusst noch nicht enthalten — wird erst ergänzt, wenn technisch benötigt (siehe [ARCHITEKTUR_BERICHT.md](./ARCHITEKTUR_BERICHT.md)).

`apps/web` und `apps/api` laufen **nicht** in Docker, sondern lokal über pnpm — der VPS/Traefik-Stack ist die Produktionsinfrastruktur, nicht Teil der lokalen Entwicklung.

## Datenbank

`packages/database/prisma/schema.prisma` enthält das Core-Datenmodell (Tenant, Department, Team, Person, User/Session/Account/Verification (better-auth), Membership, RoleAssignment, PlatformRoleAssignment, PersonRelationship) — noch **kein** fachliches Modell für Fußball/Turniere/Kalender (eigenes Arbeitspaket). Details: [PHASE_2_CORE_REPORT.md](./PHASE_2_CORE_REPORT.md).

**Zwei Rollen, zwei Verbindungen** (siehe `.env.example`):

```bash
# 1) Migrationen — Superuser-Rolle aus docker-compose.yml
DATABASE_URL=postgresql://verevia:change-me@localhost:5432/verevia \
  pnpm --filter @verevia/database exec prisma migrate dev

# 2) Seed — läuft über getTenantPrisma() intern, aber ebenfalls mit der
#    App-Rolle (verevia_app), sonst blockt RLS den Department-/Person-Insert
DATABASE_URL=postgresql://verevia_app:change-me@localhost:5432/verevia \
  pnpm --filter @verevia/database db:seed

# 3) App-Betrieb (apps/api) — IMMER die App-Rolle, nie die Superuser-Rolle
#    (PostgreSQL-Superuser umgehen Row Level Security grundsätzlich)
DATABASE_URL=postgresql://verevia_app:change-me@localhost:5432/verevia pnpm --filter @verevia/api dev
```

Die Rolle `verevia_app` (nicht-privilegiert, `NOSUPERUSER`) wird durch die Migration `add_non_superuser_app_role` automatisch angelegt — kein manueller Schritt nötig, nur bei der `DATABASE_URL` an die richtige Rolle denken.

```bash
pnpm --filter @verevia/database db:generate   # Prisma Client generieren
pnpm --filter @verevia/database db:push        # Schema-Änderungen ohne Migration pushen (nur Superuser-Rolle)
pnpm --filter @verevia/database db:studio       # Prisma Studio
pnpm --filter @verevia/database test:integration  # RLS-Integrationstests (siehe unten)
```

### RLS-Integrationstests

`packages/database/src/__tests__/rls.integration.spec.ts` und `apps/api/test/*.integration-spec.ts` prüfen die tatsächliche PostgreSQL-Row-Level-Security-Durchsetzung (nicht nur Prisma-`where`-Filter) gegen eine echte PostgreSQL-Instanz. Nicht Teil von `pnpm test` (kein Postgres in der Standard-CI) — Aufruf explizit mit sowohl `DATABASE_URL` (App-Rolle) als auch `ADMIN_DATABASE_URL` (Superuser, nur für Test-Fixtures) gesetzt:

```bash
DATABASE_URL=postgresql://verevia_app:change-me@localhost:5432/verevia \
ADMIN_DATABASE_URL=postgresql://verevia:change-me@localhost:5432/verevia \
BETTER_AUTH_SECRET=<lokales-secret> \
  pnpm --filter @verevia/database test:integration
```

## Entwicklung

```bash
pnpm dev
```

Startet über Turborepo parallel:

- `apps/web` — Next.js Dev-Server (Turbopack) unter `http://localhost:3000`
- `apps/api` — NestJS im Watch-Modus unter `http://localhost:3001` (`GET /health`)

Einzelne Apps gezielt starten: `pnpm --filter @verevia/web dev` bzw. `pnpm --filter @verevia/api dev`.

## Qualitätsprüfungen

```bash
pnpm lint        # ESLint (Flat Config) über alle Pakete
pnpm typecheck   # tsc --noEmit über alle Pakete
pnpm test        # Vitest (Unit-Tests) über alle Pakete
pnpm build       # Next.js-/Nest-/Package-Build über alle Pakete
```

Alle vier Befehle laufen über Turborepo (`turbo.json`) und werden auch in [CI](../.github/workflows/ci.yml) ausgeführt. Pakete ohne eigene Tests (aktuell `@verevia/database`, `@verevia/auth`) werden von Turborepo automatisch übersprungen bzw. liefern einen No-Op — der Root-Befehl bleibt in jedem Fall grün.

### E2E-Tests (Playwright)

```bash
pnpm --filter @verevia/web test:e2e
```

Benötigt einmalig installierte Browser-Binaries (`npx playwright install`, in diesem Arbeitspaket bewusst nicht ausgeführt) sowie einen vorherigen `pnpm build` (der `webServer`-Block in `playwright.config.ts` startet die Produktions-App). **Nicht Teil der verpflichtenden Quality-Gate-Kommandos** (`install`/`lint`/`typecheck`/`test`/`build`).

### API-E2E-Test (Supertest)

```bash
pnpm --filter @verevia/api test:e2e
```

## Bekannte lokale Stolpersteine

- **Inkrementelle TypeScript-Builds**: `apps/api` nutzt `"incremental": true`. Nach manuellem Löschen von `dist/` **immer auch** die zugehörige `*.tsbuildinfo`-Datei löschen (oder `pnpm build` normal laufen lassen, ohne `dist/` von Hand zu entfernen) — sonst hält `tsc` das (gelöschte) Ergebnis fälschlich für aktuell und emittiert nichts. `*.tsbuildinfo` ist über `.gitignore` ausgeschlossen und betrifft daher nie frische Checkouts/CI.
- **Portkonflikte**: `apps/web` läuft standardmäßig auf Port 3000, `apps/api` auf 3001. Bei Portkonflikten mit anderen lokal laufenden Projekten `PORT=<anderer-port>` setzen.

## Bezug

- [Architektur-Bericht](./ARCHITEKTUR_BERICHT.md)
- [Architektur-Finalisierung](./ARCHITEKTUR_FINALISIERUNG.md)
- [Phase-1-Skeleton-Bericht](./PHASE_1_SKELETON_REPORT.md)
- [Deployment](./deployment/Deployment.md)
