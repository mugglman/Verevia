# @verevia/auth

Authentifizierung der Verevia-Plattform ([better-auth](https://www.better-auth.com/), selbst gehostet in `apps/api`).

## Architekturentscheidung

better-auth läuft **innerhalb** von `apps/api` (NestJS), im selben Prozess, ohne separaten Dienst und ohne externen Identity-Provider. Kein Keycloak, kein Auth.js. Details und Begründung: [ADR 0002](../../docs/architecture/adr/0002-authentication-strategy.md) und [AUTH_IDENTITY_RBAC_ARCHITEKTUR.md](../../docs/AUTH_IDENTITY_RBAC_ARCHITEKTUR.md).

## Status

**In `apps/api` gemountet und funktionsfähig** (Phase 2): E-Mail/Passwort, Session-Cookies, `user.status`-Zusatzfeld (`UserStatus`-Enum). Siehe `apps/api/src/main.ts` für den Mounting-Code und [PHASE_2_CORE_REPORT.md](../../docs/PHASE_2_CORE_REPORT.md).

**Noch nicht enthalten** (bewusst, eigene künftige Arbeitspakete):

- Login-/Registrierungs-Oberfläche in `apps/web`
- MFA (TOTP-Plugin ist im Kernpaket vorhanden, nicht aktiviert)
- Passkeys/WebAuthn
- Social Login
- Produktive Secret-/Origin-Konfiguration (aktuell Entwicklungs-Platzhalter über `.env`)

## Bekannte Implementierungs-Gotchas (in `apps/api/src/main.ts` bereits berücksichtigt)

- NestJS-Body-Parser muss deaktiviert (`bodyParser: false`) und nach dem Mounten von better-auth manuell wieder aktiviert werden.
- Express 5 (NestJS-11-Standard) erfordert die Wildcard-Syntax `{*splat}` (nicht `*`).

Ausführliches Spike-Protokoll: [ARCHITEKTUR_FINALISIERUNG.md](../../docs/ARCHITEKTUR_FINALISIERUNG.md), Abschnitt 1.

## Environment

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `DATABASE_URL` (App-Rolle `verevia_app`, siehe `.env.example` im Repo-Root).
