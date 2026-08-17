# @verevia/auth

Authentifizierung der Verevia-Plattform ([better-auth](https://www.better-auth.com/), selbst gehostet in `apps/api`).

## Architekturentscheidung

better-auth läuft **innerhalb** von `apps/api` (NestJS), im selben Prozess, ohne separaten Dienst und ohne externen Identity-Provider. Kein Keycloak, kein Auth.js. Details und Begründung: [ADR 0002](../../docs/architecture/adr/0002-authentication-strategy.md) und [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../../docs/AUTH_IDENTITY_RBAC_ARCHITEKTUR.md).

## Status

**Struktur vorbereitet, noch NICHT produktiv.** `src/index.ts` enthält die better-auth-Grundkonfiguration (E-Mail/Passwort, Prisma-Adapter). Noch offen für ein eigenes Arbeitspaket:

1. better-auth-eigenes Prisma-Schema (`User`, `Session`, `Account`, `Verification`) in `packages/database/prisma/schema.prisma` generieren (`npx @better-auth/cli generate`, im Spike verifiziert) — aktuell noch **nicht** vorhanden.
2. Mounten in `apps/api/src/main.ts` gemäß dem im Spike verifizierten Muster:
   - `NestFactory.create(AppModule, { bodyParser: false })`
   - `app.getHttpAdapter().getInstance().all("/api/auth/{*splat}", toNodeHandler(auth))` **vor** dem erneuten Aktivieren des Body-Parsers für alle übrigen Routen
   - Express 5 erfordert die Wildcard-Syntax `{*splat}` (nicht `*`)
3. Produktive Secret-/Origin-Konfiguration (`BETTER_AUTH_SECRET`, `trustedOrigins`) statt der aktuellen Entwicklungs-Platzhalter.
4. `packages/auth/eslint.config.mjs`

Ausführliches Spike-Protokoll: [ARCHITEKTUR_FINALISIERUNG.md](../../docs/ARCHITEKTUR_FINALISIERUNG.md), Abschnitt 1.

## Environment

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `DATABASE_URL` (siehe `.env.example` im Repo-Root).
